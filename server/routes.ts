import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { assignments, tasks, userGrades, updateUserProfileSchema } from "@shared/schema";
import { isAuthenticated, setupAuth } from "./replit_integrations/auth";
import multer from "multer";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
import OpenAI from "openai";
import { registerAuthRoutes } from "./replit_integrations/auth";
import { randomBytes } from "crypto";
import { encryptToken, decryptToken } from "./lib/crypto";
import { parseIcsBuffer, parseZipBuffer } from "./services/calendar/icsParser";
import {
  getGoogleAuthUrl,
  exchangeGoogleCode,
  refreshGoogleToken,
  fetchGoogleEvents,
} from "./services/calendar/googleCalendar";
import {
  getMicrosoftAuthUrl,
  exchangeMicrosoftCode,
  refreshMicrosoftToken,
  fetchMicrosoftEvents,
} from "./services/calendar/microsoftCalendar";

import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20 MB

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ── Syllabus assignment save helper ──────────────────────────────────────────
// Validates and persists a single extracted assignment. Returns true on success.
const VALID_TYPES = ["exam","hw","paper","project","quiz","lab","reading","discussion","presentation","lecture"];

async function saveAssignment(storage: any, courseId: number, userId: string, a: any): Promise<boolean> {
  const name = String(a.name || "").trim();
  if (!name || name === "undefined") return false;

  const rawType = String(a.type || "hw").toLowerCase().replace(/[^a-z]/g, "");
  const type = VALID_TYPES.includes(rawType) ? rawType : "hw";

  const weight = Math.min(100, Math.max(0, Number(a.weight) || 0));
  const maxScore = Math.max(1, Number(a.maxScore) || 100);

  const dueDate = new Date(a.dueDate);
  if (isNaN(dueDate.getTime())) {
    console.warn(`[Syllabus] Invalid date for "${name}": ${a.dueDate}`);
    return false;
  }

  const newAssignment = await storage.createAssignment(courseId, { name, type, dueDate, weight, maxScore });
  await storage.generateTasksForAssignment(userId, newAssignment);
  return true;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Set up Replit Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // Apply auth middleware to App API routes
  app.use('/api/courses', isAuthenticated);
  app.use('/api/assignments', isAuthenticated);
  app.use('/api/grades', isAuthenticated);
  app.use('/api/tasks', isAuthenticated);
  app.use('/api/profile', isAuthenticated);
  app.use('/api/calendar', isAuthenticated);
  app.use('/api/syllabi', isAuthenticated);

  app.get(api.courses.list.path, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const courses = await storage.getCourses();
    
    const fullCourses = await Promise.all(courses.map(c => storage.getCourseDetails(c.id, userId)));
    res.json(fullCourses.filter(Boolean));
  });

  app.get(api.courses.get.path, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const courseId = Number(req.params.id);
    const course = await storage.getCourseDetails(courseId, userId);
    
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }
    
    res.json(course);
  });

  app.post(api.courses.create.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const input = api.courses.create.input.parse(req.body);
      const course = await storage.createCourse(input, userId);
      res.status(201).json(course);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.courses.join.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const courseId = Number(req.params.id);

      const course = await storage.getCourse(courseId);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      await storage.joinCourse(courseId, userId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Leave (and optionally delete) a course
  app.delete('/api/courses/:id/enroll', async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const courseId = Number(req.params.id);
      await storage.leaveCourse(courseId, userId);
      res.status(204).send();
    } catch (err) {
      console.error("Leave course error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.assignments.list.path, async (req: any, res) => {
    const courseId = Number(req.params.courseId);
    const assignments = await storage.getAssignmentsByCourse(courseId);
    res.json(assignments);
  });

  app.post(api.assignments.create.path, async (req: any, res) => {
    try {
      const courseId = Number(req.params.courseId);
      const input = api.assignments.create.input.parse(req.body);
      const assignment = await storage.createAssignment(courseId, input);
      
      await storage.generateTasksForAssignment(req.user.claims.sub, assignment);
      
      res.status(201).json(assignment);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.assignments.update.path, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.assignments.update.input.parse(req.body);
      const assignment = await storage.updateAssignment(id, input);
      res.json(assignment);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.assignments.delete.path, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteAssignment(id);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.grades.tracker.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const tracker = await storage.getGradeTracker(userId);
      res.json(tracker);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.grades.upsert.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const input = api.grades.upsert.input.parse(req.body);
      const grade = await storage.upsertUserGrade(userId, input);
      res.json(grade);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.tasks.list.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const tasks = await storage.getTasksByUser(userId);
      res.json(tasks);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.tasks.create.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const input = api.tasks.create.input.parse(req.body);
      if (input.recurrenceRule) {
        const allTasks = await storage.createTaskWithRecurrence(userId, input);
        res.status(201).json(allTasks[0]); // return the parent task
      } else {
        const task = await storage.createTask(userId, input);
        res.status(201).json(task);
      }
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.tasks.update.path, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.tasks.update.input.parse(req.body);
      const task = await storage.updateTask(id, input);
      res.json(task);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.tasks.delete.path, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const deleteAll = req.query.deleteAll === "true";
      if (deleteAll) {
        await storage.deleteTaskAndRecurrences(id);
      } else {
        await storage.deleteTask(id);
      }
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // === PROFILE ROUTES ===
  app.get(api.profile.get.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.profile.update.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = updateUserProfileSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data" });
      const updated = await storage.updateUserProfile(userId, parsed.data);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Avatar upload: base64 data URL stored directly
  app.post(api.profile.uploadAvatar.path, upload.single("avatar"), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
      const updated = await storage.updateUserProfile(userId, { profileImageUrl: base64 });
      res.json({ url: updated.profileImageUrl });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // === CALENDAR ROUTES ===
  app.get(api.calendar.events.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const enrolledCourses = await storage.getEnrolledCourses(userId);
      const events = [];
      for (const course of enrolledCourses) {
        const courseAssignments = await storage.getAssignmentsByCourse(course.id);
        for (const assignment of courseAssignments) {
          events.push({
            id: assignment.id,
            title: assignment.name,
            type: assignment.type,
            dueDate: assignment.dueDate,
            courseId: course.id,
            courseName: course.name,
            courseCode: course.code,
            weight: assignment.weight,
          });
        }
      }
      res.json(events);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.calendar.ical.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const enrolledCourses = await storage.getEnrolledCourses(userId);
      const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//SyllabusSync//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
      ];
      for (const course of enrolledCourses) {
        const courseAssignments = await storage.getAssignmentsByCourse(course.id);
        for (const a of courseAssignments) {
          const dt = new Date(a.dueDate);
          const dtStr = dt.toISOString().replace(/[-:]/g, "").replace(".000", "");
          lines.push("BEGIN:VEVENT");
          lines.push(`UID:syllabus-${a.id}@syllabussync`);
          lines.push(`DTSTART:${dtStr}`);
          lines.push(`DTEND:${dtStr}`);
          lines.push(`SUMMARY:${a.name} - ${course.code}`);
          lines.push(`DESCRIPTION:${a.type} for ${course.name} | Weight: ${a.weight}%`);
          lines.push("END:VEVENT");
        }
      }
      lines.push("END:VCALENDAR");
      res.setHeader("Content-Type", "text/calendar");
      res.setHeader("Content-Disposition", 'attachment; filename="syllabussync.ics"');
      res.send(lines.join("\r\n"));
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.syllabi.upload.path, upload.single("file"), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const courseId = Number(req.params.courseId);

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // ── STEP 0: Detect file type ────────────────────────────────────────────
      // Use BOTH the file extension AND magic bytes (buffer header) because
      // browsers often send incorrect MIME types.
      const fileName = (req.file.originalname || "").toLowerCase();
      const ext = fileName.substring(fileName.lastIndexOf("."));
      const buf = req.file.buffer;

      type FileKind = "pdf" | "docx" | "txt" | "unknown";
      let fileKind: FileKind = "unknown";

      // Magic-byte detection
      if (buf.length >= 4) {
        if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
          fileKind = "pdf"; // %PDF
        } else if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) {
          fileKind = "docx"; // PK.. (ZIP-based — DOCX, PPTX, etc.)
        }
      }

      // Fallback to extension if magic bytes inconclusive
      if (fileKind === "unknown") {
        if (ext === ".pdf") fileKind = "pdf";
        else if (ext === ".docx" || ext === ".doc") fileKind = "docx";
        else if (ext === ".txt" || ext === ".text" || ext === ".md" || ext === ".rtf") fileKind = "txt";
      }

      // Final fallback: check MIME type
      if (fileKind === "unknown") {
        const mime = (req.file.mimetype || "").toLowerCase();
        if (mime.includes("pdf")) fileKind = "pdf";
        else if (mime.includes("word") || mime.includes("officedocument")) fileKind = "docx";
        else if (mime.includes("text/")) fileKind = "txt";
      }

      if (fileKind === "unknown") {
        return res.status(400).json({
          message: `Unsupported file type "${ext || req.file.mimetype}". Please upload a PDF, DOCX, or TXT file.`,
        });
      }

      console.log(`[Syllabus] File detected: ${fileKind} (ext=${ext}, mime=${req.file.mimetype}, size=${buf.length})`);

      const today = new Date();
      const currentYear = today.getFullYear();

      // ── Shared extraction prompt ────────────────────────────────────────────

      const EXTRACTION_PROMPT = `You are an expert academic syllabus parser with 20 years of experience reading every type of university syllabus. Your task: extract EVERY assignment, deadline, exam, quiz, homework, project, lab, reading, and due date from this syllabus — including anything that repeats on a schedule.

TODAY: ${today.toISOString().split("T")[0]}
ACADEMIC YEAR: ${currentYear}–${currentYear + 1}

═══════════════════════════════════════════════
PHASE 1 — UNDERSTAND THE DOCUMENT STRUCTURE
═══════════════════════════════════════════════
Before extracting, identify:
1. Semester start and end dates
2. Days the class meets (e.g. Mon/Wed/Fri, Tues/Thurs)
3. Any grading breakdown table (e.g. "Homework 30%, Exams 40%")
4. Total number of each assignment type mentioned

═══════════════════════════════════════════════
PHASE 2 — EXTRACT ALL ASSIGNMENTS
═══════════════════════════════════════════════

RECURRING PATTERNS — these must be FULLY EXPANDED:

Pattern → What to generate:
"HW due every Sunday" → one HW entry for every Sunday in the semester
"Weekly quiz on Monday" → one quiz for every Monday class
"Reading before each class" → one reading per class meeting day
"10 problem sets, due Fridays" → 10 separate entries, one per Friday
"Lab report every other week" → one entry every 2 weeks
"Participation grade (weekly)" → one entry per week
"Discussion post each Wednesday" → one per Wednesday
"Chapter reading before Tuesday lecture" → one per Tuesday
"Daily warm-up exercise" → one per class day

Rules for recurring:
- Count actual occurrences based on the semester length
- Name them "Homework 1", "Homework 2" ... or "Week 1 Reading", "Week 2 Reading" etc.
- If the syllabus says "10 homeworks due Sundays", generate exactly 10 entries on consecutive Sundays
- If it says "weekly" with no specific day, use Sunday as the due date

ONE-OFF ASSIGNMENTS — find every item with a specific date:
- Exams with dates and times
- Project deadlines
- Paper due dates
- Lab reports on specific dates
- Presentations
- Any item in a week-by-week schedule table

TABLE PARSING — for schedule tables:
- Each row is typically one week
- Columns may include: Week, Date, Topic, Assignment Due, Points
- Extract every "Assignment Due" cell as a separate item
- If a row has multiple assignments, create one entry per assignment

═══════════════════════════════════════════════
PHASE 3 — ASSIGN WEIGHTS
═══════════════════════════════════════════════
- If individual weights are listed: use them
- If only category weights are listed (e.g. "Homework = 30%"):
  Count how many homeworks there are, divide: 30% ÷ 10 homeworks = 3% each
- If no weight info: use 0
- Weights should be percentages (0-100)

═══════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════
Return ONLY valid JSON. No explanation. No markdown. No text before or after.

{
  "semesterStart": "YYYY-MM-DD",
  "semesterEnd": "YYYY-MM-DD",
  "assignments": [
    {
      "name": "Descriptive assignment name",
      "type": "hw|exam|paper|project|quiz|lab|reading|discussion|presentation",
      "dueDate": "YYYY-MM-DDTHH:mm:ssZ",
      "weight": 3,
      "maxScore": 100
    }
  ]
}

TYPE GUIDE:
exam → midterm, final, test, in-class exam
hw → homework, problem set, assignment, worksheet, exercise
paper → essay, report, write-up, response paper, reflection
project → project, final project, group project, capstone
quiz → quiz, pop quiz, weekly quiz
lab → lab, laboratory report, lab write-up
reading → reading, chapter, textbook section
discussion → discussion post, forum post, response post, Blackboard post
presentation → presentation, talk, demo, show-and-tell

ABSOLUTE RULES:
1. EXPAND every recurring pattern — never use "recurring" as a single entry
2. Use 23:59:59Z for homework/papers. Use actual exam time if stated (e.g. 14:00:00Z)
3. If only month+day given, use the year that makes sense in the semester
4. Include EVERYTHING — even small participation assignments
5. No duplicates (same name + same date)
6. If a date is unclear, make a reasonable estimate based on semester context
7. Return ONLY the JSON object`;

      let parsedContent: any = null;
      let createdCount = 0;
      let extractionError = "";
      let rawTextForStorage = "";

      // ── PATH A: Gemini 1.5 Pro — sees the raw PDF directly ─────────────────
      // For PDFs: Gemini receives the actual bytes so it can see tables, columns,
      // scanned content, and complex formatting. For DOCX/TXT: we extract text
      // first and send it as part of the prompt (Gemini doesn't support DOCX natively).
      let geminiSucceeded = false;

      if (process.env.Syllabus_API_KEY) {
        try {
          console.log(`[Syllabus] PATH A: Gemini extraction (fileKind=${fileKind})...`);

          // For non-PDF files, extract text first so Gemini gets clean content
          let preExtractedText = "";
          if (fileKind === "docx") {
            try {
              const docResult = await mammoth.extractRawText({ buffer: buf });
              preExtractedText = docResult.value || "";
              console.log(`[Syllabus] mammoth extracted ${preExtractedText.length} chars from DOCX`);
            } catch (docErr) {
              console.warn("[Syllabus] mammoth failed:", docErr);
            }
          } else if (fileKind === "txt") {
            preExtractedText = buf.toString("utf-8");
            console.log(`[Syllabus] Read ${preExtractedText.length} chars from TXT`);
          }

          // Build Gemini request parts
          const geminiParts: any[] = [];

          if (fileKind === "pdf") {
            // Send raw PDF — Gemini can see tables, layouts, even scanned content
            geminiParts.push({
              inline_data: {
                mime_type: "application/pdf",
                data: buf.toString("base64"),
              },
            });
            geminiParts.push({ text: EXTRACTION_PROMPT });
          } else {
            // For DOCX/TXT: send extracted text with prompt
            const textForGemini = preExtractedText.substring(0, 60000);
            geminiParts.push({
              text: EXTRACTION_PROMPT +
                `\n\n═══════════════════════════════════════════════\nSYLLABUS TEXT:\n═══════════════════════════════════════════════\n${textForGemini}`,
            });
          }

          const geminiModels = ["gemini-2.0-flash", "gemini-1.5-pro"];
          let geminiResult: string | null = null;

          for (const model of geminiModels) {
            try {
              const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-goog-api-key": process.env.Syllabus_API_KEY,
                },
                body: JSON.stringify({
                  contents: [{ parts: geminiParts }],
                  generationConfig: {
                    temperature: 0.1,
                    responseMimeType: "application/json",
                  },
                }),
              });

              const geminiData = await geminiRes.json();

              if (!geminiRes.ok) {
                console.warn(`[Syllabus] Gemini ${model} returned ${geminiRes.status}:`, geminiData.error?.message);
                continue;
              }

              const candidate = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
              if (candidate && candidate.length > 50) {
                geminiResult = candidate;
                console.log(`[Syllabus] Gemini ${model} responded (${candidate.length} chars)`);
                break;
              }
            } catch (modelErr) {
              console.warn(`[Syllabus] Gemini ${model} failed:`, modelErr);
            }
          }

          if (geminiResult) {
            // Parse Gemini's JSON response
            let parsed: any = {};
            try {
              parsed = JSON.parse(geminiResult);
            } catch {
              const jsonMatch = geminiResult.match(/\{[\s\S]*\}/);
              if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
            }

            const extractedAssignments: any[] = parsed.assignments || parsed.items || [];
            parsedContent = parsed;
            rawTextForStorage = preExtractedText
              ? preExtractedText.substring(0, 50000)
              : `[Extracted via Gemini Vision — ${extractedAssignments.length} assignments found]`;

            console.log(`[Syllabus] Gemini extracted ${extractedAssignments.length} assignments`);

            if (extractedAssignments.length > 0) {
              await storage.clearCourseAssignments(courseId);
              for (const a of extractedAssignments) {
                try {
                  const saved = await saveAssignment(storage, courseId, userId, a);
                  if (saved) createdCount++;
                } catch (itemErr) {
                  console.error(`[Syllabus] Failed to save: ${a.name}`, itemErr);
                }
              }
              geminiSucceeded = true;
            }
          }
        } catch (geminiErr) {
          console.error("[Syllabus] Gemini PATH A failed entirely:", geminiErr);
        }
      }

      // ── PATH B: text extraction → GPT-4o ──────────────────────────────────
      // Used when Gemini key is absent, or Gemini returned 0 assignments.
      if (!geminiSucceeded) {
        console.log(`[Syllabus] PATH B: text extraction + GPT-4o (fileKind=${fileKind})...`);

        // Extract text based on file type
        let text = "";

        if (fileKind === "pdf") {
          try {
            const pdfData = await pdfParse(buf);
            text = pdfData.text || "";
            console.log(`[Syllabus] pdf-parse: ${text.length} characters`);
          } catch (pdfErr) {
            console.error("[Syllabus] pdf-parse failed:", pdfErr);
          }
        } else if (fileKind === "docx") {
          try {
            const docResult = await mammoth.extractRawText({ buffer: buf });
            text = docResult.value || "";
            console.log(`[Syllabus] mammoth: ${text.length} characters from DOCX`);
          } catch (docErr) {
            console.error("[Syllabus] mammoth DOCX extraction failed:", docErr);
          }
        } else if (fileKind === "txt") {
          text = buf.toString("utf-8");
          console.log(`[Syllabus] Plain text: ${text.length} characters`);
        }

        rawTextForStorage = text.substring(0, 50000);

        if (text.trim().length < 100) {
          await storage.addSyllabus(courseId, userId, "local-upload", rawTextForStorage || "no-text", null);
          const hint = fileKind === "pdf"
            ? "This PDF may be a scanned image with no readable text. Try a text-based PDF, or add a Google AI key (Syllabus_API_KEY) in Replit Secrets to enable OCR."
            : `Could not extract enough text from this ${fileKind.toUpperCase()} file.`;
          return res.status(422).json({
            message: `${hint} You can also add assignments manually using the '+ Add Assignment' button.`,
          });
        }

        // Inject the extracted text into the prompt for GPT-4o
        const gptPrompt = EXTRACTION_PROMPT + `\n\n═══════════════════════════════════════════════\nSYLLABUS TEXT:\n═══════════════════════════════════════════════\n${text.substring(0, 60000)}`;

        try {
          console.log("[Syllabus] Calling GPT-4o...");
          const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: gptPrompt }],
            response_format: { type: "json_object" },
            temperature: 0.1,
          });

          const rawContent = aiResponse.choices[0].message?.content || "{}";
          let parsed: any = {};
          try {
            parsed = JSON.parse(rawContent);
          } catch {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
          }

          const extractedAssignments: any[] = parsed.assignments || parsed.items || [];
          parsedContent = parsed;
          console.log(`[Syllabus] GPT-4o extracted ${extractedAssignments.length} assignments`);

          if (extractedAssignments.length > 0) {
            await storage.clearCourseAssignments(courseId);
            for (const a of extractedAssignments) {
              try {
                const saved = await saveAssignment(storage, courseId, userId, a);
                if (saved) createdCount++;
              } catch (itemErr) {
                console.error(`[Syllabus] Failed to save: ${a.name}`, itemErr);
              }
            }
          }
        } catch (aiErr: any) {
          extractionError = aiErr?.message || "Unknown AI error";
          console.error("[Syllabus] GPT-4o failed:", aiErr);
        }
      }

      // ── Save syllabus record & respond ──────────────────────────────────────
      await storage.addSyllabus(courseId, userId, "local-upload", rawTextForStorage, parsedContent);

      if (createdCount > 0) {
        res.json({
          success: true,
          message: `✓ Extracted ${createdCount} assignment${createdCount !== 1 ? "s" : ""} from your syllabus. Check the Assignments tab to review them.`,
        });
      } else if (extractionError) {
        res.status(500).json({
          message: `AI extraction failed: ${extractionError}. Please try uploading again, or add assignments manually.`,
        });
      } else {
        res.json({
          success: true,
          message: "Syllabus saved, but no assignments with due dates could be found. Your professor may not have listed specific dates yet — you can add assignments manually.",
        });
      }

    } catch (err) {
      console.error("[Syllabus] Fatal upload error:", err);
      res.status(500).json({ message: "Failed to process syllabus. Please try again." });
    }
  });

  app.delete(api.syllabi.delete.path, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteSyllabus(id);
      res.status(204).send();
    } catch (err) {
      console.error("Delete syllabus error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // === PRE-LECTURE PREP ROUTES (T002) ===
  app.get(api.prep.get.path, async (req: any, res) => {
    try {
      const courseId = Number(req.params.courseId);
      const cached = await storage.getPrepCache(courseId);
      if (!cached) return res.status(404).json({ message: "No prep content yet" });
      res.json(cached.content);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.prep.generate.path, async (req: any, res) => {
    try {
      const courseId = Number(req.params.courseId);
      const syllabi = await storage.getSyllabiForCourse(courseId);
      if (syllabi.length === 0) return res.status(404).json({ message: "No syllabus uploaded for this course" });

      const syllabus = syllabi[0];
      const rawText = syllabus.rawText || "";
      const parsedContent = syllabus.parsedContent as any;

      const systemPrompt = `You are an expert academic tutor helping college students prepare for their courses.
Given a course syllabus, generate structured pre-lecture prep content.
Respond ONLY with valid JSON matching this exact schema:
{
  "summary": "2-3 paragraph overview of the course's key themes and learning objectives",
  "topics": ["topic 1", "topic 2", ...],  // up to 10 key topics from the syllabus
  "readingPrompts": [
    "Reflective reading prompt 1",
    ...
  ],  // exactly 5 deep reading prompts to guide active reading
  "practiceQuestions": [
    "Practice question 1",
    ...
  ]  // exactly 5 practice questions mixing conceptual and applied
}`;

      const userPrompt = `Course syllabus content:\n\n${rawText.slice(0, 6000)}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      });

      const raw = completion.choices[0].message.content || "{}";
      const parsed = JSON.parse(raw);
      const content = {
        summary: parsed.summary || "",
        topics: parsed.topics || [],
        readingPrompts: parsed.readingPrompts || [],
        practiceQuestions: parsed.practiceQuestions || [],
        generatedAt: new Date().toISOString(),
      };

      const cached = await storage.upsertPrepCache(courseId, content);
      res.json(cached.content);
    } catch (err) {
      console.error("Prep generation error:", err);
      res.status(500).json({ message: "Failed to generate prep content" });
    }
  });

  // === STUDY RESOURCE ROUTES (T004) ===
  app.get(api.resources.get.path, async (req: any, res) => {
    try {
      const assignmentId = Number(req.params.assignmentId);
      const cached = await storage.getAssignmentResources(assignmentId);
      if (!cached) return res.status(404).json({ message: "No resources yet" });
      res.json(cached.resources);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.resources.generate.path, async (req: any, res) => {
    try {
      const assignmentId = Number(req.params.assignmentId);
      const assignment = await storage.getAssignment(assignmentId);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });

      const systemPrompt = `You are an academic resource curator. Given an assignment name and type, return a JSON array of 6 highly relevant study resource links.
Each link must be real and follow known URL patterns. Use these platforms:
- YouTube: https://www.youtube.com/results?search_query=ENCODED_QUERY
- Khan Academy: https://www.khanacademy.org/search?page_search_query=ENCODED_QUERY
- MIT OpenCourseWare: https://ocw.mit.edu/search/?q=ENCODED_QUERY
- Google Scholar: https://scholar.google.com/scholar?q=ENCODED_QUERY
- Wikipedia: https://en.wikipedia.org/w/index.php?search=ENCODED_QUERY
- Coursera: https://www.coursera.org/search?query=ENCODED_QUERY

Return ONLY a JSON array with objects: { "title": string, "url": string, "platform": string }
Make the search queries specific to the assignment topic. URL-encode the query in the URLs.`;

      const userPrompt = `Assignment: "${assignment.name}" (type: ${assignment.type})
Provide 6 study resources that would help a student complete this assignment.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const raw = completion.choices[0].message.content || "{}";
      let resources = [];
      try {
        const parsed = JSON.parse(raw);
        resources = Array.isArray(parsed) ? parsed : (parsed.resources || parsed.links || []);
      } catch {
        resources = [];
      }

      const saved = await storage.upsertAssignmentResources(assignmentId, resources);
      res.json(saved.resources);
    } catch (err) {
      console.error("Resource generation error:", err);
      res.status(500).json({ message: "Failed to generate resources" });
    }
  });

  // ── CALENDAR CONNECTIONS ─────────────────────────────────────────────────

  app.get(api.calendar.connections.list.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connections = await storage.getCalendarConnections(userId);
      // Strip tokens before returning to client
      const safe = connections.map(({ accessToken, refreshToken, ...c }) => c);
      res.json(safe);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete('/api/calendar/connections/:id', async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = Number(req.params.id);
      const conn = await storage.getCalendarConnection(id);
      if (!conn || conn.userId !== userId) return res.status(404).json({ message: "Not found" });
      await storage.deleteCalendarConnection(id);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── GOOGLE CALENDAR OAUTH ────────────────────────────────────────────────

  app.get(api.calendar.google.connect.path, async (req: any, res) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REDIRECT_URI) {
      return res.redirect('/calendar?error=google_not_configured');
    }
    const state = randomBytes(16).toString('hex');
    (req.session as any).calendarOAuthState = state;
    // Explicitly persist session before redirecting so state is available on callback
    req.session.save((err: any) => {
      if (err) {
        console.error('Session save error (Google connect):', err);
        return res.redirect('/calendar?error=session_error');
      }
      res.redirect(getGoogleAuthUrl(state));
    });
  });

  app.get(api.calendar.google.callback.path, async (req: any, res) => {
    try {
      const { code, state, error } = req.query as Record<string, string>;
      if (error) return res.redirect('/calendar?error=' + encodeURIComponent(error));

      const storedState = (req.session as any).calendarOAuthState;
      if (!storedState || state !== storedState) {
        return res.redirect('/calendar?error=invalid_state');
      }
      delete (req.session as any).calendarOAuthState;

      const userId = req.user.claims.sub;
      const tokens = await exchangeGoogleCode(code);

      await storage.upsertCalendarConnection({
        userId,
        provider: 'google',
        accessToken: encryptToken(tokens.accessToken),
        refreshToken: encryptToken(tokens.refreshToken),
        tokenExpiresAt: tokens.expiresAt,
        displayName: 'Google Calendar',
      });

      res.redirect('/calendar?connected=google');
    } catch (err) {
      console.error('Google OAuth callback error:', err);
      res.redirect('/calendar?error=google_auth_failed');
    }
  });

  app.post(api.calendar.google.sync.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connections = await storage.getCalendarConnections(userId);
      const conn = connections.find(c => c.provider === 'google');
      if (!conn || !conn.accessToken) {
        return res.status(404).json({ message: "Google Calendar not connected" });
      }

      // Refresh token if expired or within 5 minutes of expiry
      let accessToken = decryptToken(conn.accessToken);
      if (conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
        if (!conn.refreshToken) return res.status(401).json({ message: "Token expired, please reconnect" });
        const refreshed = await refreshGoogleToken(decryptToken(conn.refreshToken));
        accessToken = refreshed.accessToken;
        await storage.updateCalendarConnectionTokens(conn.id, {
          accessToken: encryptToken(refreshed.accessToken),
          tokenExpiresAt: refreshed.expiresAt,
        });
      }

      const events = await fetchGoogleEvents(accessToken);
      const result = await storage.importCalendarEvents(userId, conn.id, events);
      await storage.touchCalendarConnection(conn.id);
      res.json(result);
    } catch (err) {
      console.error('Google sync error:', err);
      res.status(500).json({ message: "Failed to sync Google Calendar" });
    }
  });

  // ── MICROSOFT CALENDAR OAUTH ─────────────────────────────────────────────

  app.get(api.calendar.microsoft.connect.path, async (req: any, res) => {
    if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_REDIRECT_URI) {
      return res.redirect('/calendar?error=microsoft_not_configured');
    }
    const state = randomBytes(16).toString('hex');
    (req.session as any).calendarOAuthState = state;
    // Explicitly persist session before redirecting so state is available on callback
    req.session.save((err: any) => {
      if (err) {
        console.error('Session save error (Microsoft connect):', err);
        return res.redirect('/calendar?error=session_error');
      }
      res.redirect(getMicrosoftAuthUrl(state));
    });
  });

  app.get(api.calendar.microsoft.callback.path, async (req: any, res) => {
    try {
      const { code, state, error } = req.query as Record<string, string>;
      if (error) return res.redirect('/calendar?error=' + encodeURIComponent(error));

      const storedState = (req.session as any).calendarOAuthState;
      if (!storedState || state !== storedState) {
        return res.redirect('/calendar?error=invalid_state');
      }
      delete (req.session as any).calendarOAuthState;

      const userId = req.user.claims.sub;
      const tokens = await exchangeMicrosoftCode(code);

      await storage.upsertCalendarConnection({
        userId,
        provider: 'microsoft',
        accessToken: encryptToken(tokens.accessToken),
        refreshToken: encryptToken(tokens.refreshToken),
        tokenExpiresAt: tokens.expiresAt,
        displayName: 'Outlook Calendar',
      });

      res.redirect('/calendar?connected=microsoft');
    } catch (err) {
      console.error('Microsoft OAuth callback error:', err);
      res.redirect('/calendar?error=microsoft_auth_failed');
    }
  });

  app.post(api.calendar.microsoft.sync.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connections = await storage.getCalendarConnections(userId);
      const conn = connections.find(c => c.provider === 'microsoft');
      if (!conn || !conn.accessToken) {
        return res.status(404).json({ message: "Microsoft Calendar not connected" });
      }

      let accessToken = decryptToken(conn.accessToken);
      if (conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
        if (!conn.refreshToken) return res.status(401).json({ message: "Token expired, please reconnect" });
        const refreshed = await refreshMicrosoftToken(decryptToken(conn.refreshToken));
        accessToken = refreshed.accessToken;
        await storage.updateCalendarConnectionTokens(conn.id, {
          accessToken: encryptToken(refreshed.accessToken),
          tokenExpiresAt: refreshed.expiresAt,
        });
      }

      const events = await fetchMicrosoftEvents(accessToken);
      const result = await storage.importCalendarEvents(userId, conn.id, events);
      await storage.touchCalendarConnection(conn.id);
      res.json(result);
    } catch (err) {
      console.error('Microsoft sync error:', err);
      res.status(500).json({ message: "Failed to sync Microsoft Calendar" });
    }
  });

  // ── ICS / ZIP UPLOAD ─────────────────────────────────────────────────────

  // Fetch all imported calendar events for the current user
  app.get('/api/calendar/imported', async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const events = await storage.getCalendarImportedEvents(userId);
      res.json(events);
    } catch (err) {
      console.error('Fetch imported events error:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Step 1: parse file and return event list for preview
  app.post(api.calendar.ics.upload.path, upload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const filename = req.file.originalname.toLowerCase();
      let events;
      try {
        if (filename.endsWith('.zip')) {
          events = parseZipBuffer(req.file.buffer);
        } else if (filename.endsWith('.ics') || filename.endsWith('.ical')) {
          events = parseIcsBuffer(req.file.buffer);
        } else {
          return res.status(400).json({ message: "File must be .ics, .ical, or .zip" });
        }
      } catch (e: any) {
        return res.status(422).json({ message: e.message || "Failed to parse calendar file" });
      }

      // Mark duplicates based on already-imported externalIds
      const existingIds = new Set(await storage.getImportedExternalIds(userId));
      const preview = events.map(e => ({
        externalId: e.externalId,
        title: e.title,
        startDate: e.startDate.toISOString(),
        endDate: e.endDate ? e.endDate.toISOString() : null,
        description: e.description,
        location: e.location,
        isDuplicate: existingIds.has(e.externalId),
      }));

      res.json({ events: preview });
    } catch (err) {
      console.error('ICS upload error:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Step 2: confirm import — events stored directly, NOT as tasks
  app.post(api.calendar.ics.confirm.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { events } = req.body as {
        events: Array<{
          externalId: string;
          title: string;
          startDate: string;
          endDate: string | null;
          description: string | null;
          location: string | null;
        }>;
      };

      if (!Array.isArray(events)) return res.status(400).json({ message: "events must be an array" });

      // Clean up any old corrupt tasks created by the previous architecture
      await storage.cleanupOldCalendarTasks(userId);

      const normalized = events.map(e => ({
        externalId: e.externalId,
        title: e.title,
        startDate: new Date(e.startDate),
        endDate: e.endDate ? new Date(e.endDate) : null,
        description: e.description ?? null,
        location: e.location ?? null,
      }));

      const result = await storage.importCalendarEvents(userId, null, normalized);
      res.json(result);
    } catch (err) {
      console.error('ICS confirm error:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}
