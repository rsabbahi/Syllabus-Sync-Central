import type { Express } from "express";
import type { Server } from "http";
import { storage, IStorage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { assignments, tasks, userGrades, updateUserProfileSchema } from "@shared/schema";
import { isAuthenticated, setupAuth } from "./replit_integrations/auth";
import multer from "multer";
import { createRequire } from "module";
import { fileURLToPath } from "url";
// CJS-safe require: import.meta.url works in ESM dev, but esbuild empties it
// when bundling to CJS. Fallback to __filename (available in CJS) or cwd.
const _requireUrl = typeof import.meta?.url === "string" && import.meta.url
  ? import.meta.url
  : (typeof __filename !== "undefined" ? `file://${__filename}` : `file://${process.cwd()}/server/routes.ts`);
const require = createRequire(_requireUrl);
const { PDFParse, PasswordException, InvalidPDFException } = require("pdf-parse");
const mammoth = require("mammoth");
import OpenAI from "openai";
import { registerAuthRoutes } from "./replit_integrations/auth";
import { randomBytes } from "crypto";
import { encryptToken, decryptToken } from "./lib/crypto";
import { parseIcsBuffer, parseZipBuffer } from "./services/calendar/icsParser";
import { parseSyllabusText } from "./services/syllabusParser";
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

let _openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openaiClient) {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("No OpenAI API key configured. Please set OPENAI_API_KEY.");
    _openaiClient = new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
  }
  return _openaiClient;
}
// Proxy object so existing `openai.chat.completions.create(...)` call sites work unchanged
const openai = {
  chat: {
    completions: {
      create: (...args: Parameters<OpenAI["chat"]["completions"]["create"]>) =>
        getOpenAI().chat.completions.create(...args),
    },
  },
};

// ── Syllabus assignment helpers ──────────────────────────────────────────────
const VALID_TYPES = ["exam","hw","paper","project","quiz","lab","reading","discussion","presentation","lecture"];

/**
 * Pre-validate extracted assignments BEFORE clearing existing data.
 * Returns only the items that have a valid name and parseable date.
 * This prevents wiping a course's data when the AI returns garbage.
 */
function validateExtractedAssignments(raw: any[]): any[] {
  return raw.filter(a => {
    if (!a || typeof a !== "object") return false;
    const name = a.name;
    if (name === null || name === undefined || typeof name === "object") return false;
    const nameStr = String(name).trim();
    if (!nameStr || nameStr === "undefined" || nameStr === "[object Object]") return false;
    // Guard: null/undefined dueDate produces epoch (1970), not NaN — must check explicitly
    if (!a.dueDate) return false;
    const d = new Date(a.dueDate);
    if (isNaN(d.getTime())) return false;
    return true;
  });
}

async function saveAssignment(storage: IStorage, courseId: number, userId: string, a: any): Promise<boolean> {
  // Guard: if 'a' is not an object with string-like fields, skip it
  if (!a || typeof a !== "object") return false;

  // Extract name — guard against nested objects producing [object Object]
  const rawName = a.name;
  if (rawName === null || rawName === undefined || typeof rawName === "object") return false;
  const name = String(rawName).trim();
  if (!name || name === "undefined" || name === "[object Object]") return false;

  // Extract type — same guard
  const rawType = typeof a.type === "string" ? a.type.toLowerCase().replace(/[^a-z]/g, "") : "hw";
  const type = VALID_TYPES.includes(rawType) ? rawType : "hw";

  // Weight and maxScore must be strings for Drizzle decimal columns
  const weightNum = Math.min(100, Math.max(0, Number(a.weight) || 0));
  const maxScoreNum = Math.max(1, Number(a.maxScore) || 100);
  const weight = String(weightNum);
  const maxScore = String(maxScoreNum);

  // Validate date — null/undefined dueDate produces epoch (1970), not NaN
  if (!a.dueDate) return false;
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
    try {
      const userId = req.user.claims.sub;
      const courses = await storage.getCourses();

      const fullCourses = await Promise.all(courses.map(c => storage.getCourseDetails(c.id, userId)));
      res.json(fullCourses.filter(Boolean));
    } catch (err) {
      console.error("List courses error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.courses.get.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const courseId = Number(req.params.id);
      if (isNaN(courseId)) return res.status(400).json({ message: "Invalid course ID" });

      const course = await storage.getCourseDetails(courseId, userId);

      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      res.json(course);
    } catch (err) {
      console.error("Get course error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
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
      if (isNaN(courseId)) return res.status(400).json({ message: "Invalid course ID" });

      const course = await storage.getCourse(courseId);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      await storage.joinCourse(courseId, userId);
      res.json({ success: true });
    } catch (err) {
      console.error("Join course error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Leave (and optionally delete) a course
  app.delete('/api/courses/:id/enroll', async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const courseId = Number(req.params.id);
      if (isNaN(courseId)) return res.status(400).json({ message: "Invalid course ID" });
      await storage.leaveCourse(courseId, userId);
      res.status(204).send();
    } catch (err) {
      console.error("Leave course error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.assignments.list.path, async (req: any, res) => {
    try {
      const courseId = Number(req.params.courseId);
      if (isNaN(courseId)) return res.status(400).json({ message: "Invalid course ID" });
      const assignments = await storage.getAssignmentsByCourse(courseId);
      res.json(assignments);
    } catch (err) {
      console.error("List assignments error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.assignments.create.path, async (req: any, res) => {
    try {
      const courseId = Number(req.params.courseId);
      if (isNaN(courseId)) return res.status(400).json({ message: "Invalid course ID" });
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

      // Reject .doc explicitly — mammoth only supports .docx, not legacy .doc format
      if (ext === ".doc" && fileKind !== "pdf") {
        return res.status(400).json({
          message: 'The legacy .doc format is not supported. Please save your file as .docx (Word 2007+) or PDF and upload again.',
        });
      }

      // Fallback to extension if magic bytes inconclusive
      if (fileKind === "unknown") {
        if (ext === ".pdf") fileKind = "pdf";
        else if (ext === ".docx") fileKind = "docx";
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

      let parsedContent: any = null;
      let createdCount = 0;
      let rawTextForStorage = "";

      // ── Extract text from the uploaded file ───────────────────────────────
      let text = "";

      if (fileKind === "pdf") {
        let parser: any = null;
        try {
          parser = new PDFParse({ data: buf });
          const result = await parser.getText();
          text = result.text || "";
          console.log(`[Syllabus] pdf-parse v2: ${text.length} characters`);
        } catch (pdfErr: any) {
          if (pdfErr instanceof PasswordException) {
            return res.status(422).json({
              message: "This PDF is password-protected. Please remove the password and upload again, or add assignments manually.",
            });
          }
          if (pdfErr instanceof InvalidPDFException) {
            return res.status(422).json({
              message: "This file does not appear to be a valid PDF. Please check the file and try again.",
            });
          }
          console.error("[Syllabus] pdf-parse failed:", pdfErr);
        } finally {
          if (parser) {
            try { await parser.destroy(); } catch { /* ignore cleanup errors */ }
          }
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
        const hint = fileKind === "pdf"
          ? "This PDF appears to contain no readable text (it may be a scanned image). Try a text-based PDF, or upload a DOCX/TXT file instead."
          : `Could not extract enough text from this ${fileKind.toUpperCase()} file.`;
        return res.status(422).json({
          message: `${hint} You can also add assignments manually using the '+ Add Assignment' button.`,
        });
      }

      // ── Parse locally — no API key required ───────────────────────────────
      console.log(`[Syllabus] Running local parser on ${text.length} chars...`);
      const localParsed = await parseSyllabusText(text, new Date().getFullYear());
      parsedContent = localParsed;

      const extractedAssignments = localParsed.assignments;
      console.log(`[Syllabus] Local parser found ${extractedAssignments.length} dated items`);

      if (extractedAssignments.length > 0) {
        const validated = validateExtractedAssignments(extractedAssignments);
        if (validated.length > 0) {
          await storage.clearCourseAssignments(courseId);
          for (const a of validated) {
            try {
              const saved = await saveAssignment(storage, courseId, userId, a);
              if (saved) createdCount++;
            } catch (itemErr) {
              console.error(`[Syllabus] Failed to save: ${a.name}`, itemErr);
            }
          }
        }
      }

      // ── Save syllabus record & respond ──────────────────────────────────────
      await storage.addSyllabus(courseId, userId, "local-upload", rawTextForStorage, parsedContent);

      if (createdCount > 0) {
        res.json({
          success: true,
          message: `✓ Extracted ${createdCount} assignment${createdCount !== 1 ? "s" : ""} from your syllabus. Check the Assignments tab to review them.`,
        });
      } else {
        res.json({
          success: true,
          message: "Syllabus saved, but no assignments with specific due dates could be found automatically. You can add assignments manually using the '+ Add Assignment' button.",
        });
      }

    } catch (err) {
      console.error("[Syllabus] Fatal upload error:", err);
      res.status(500).json({ message: "Failed to process syllabus. Please try again." });
    }
  });

  // ── Client-side PDF.js text → local parse route ──────────────────────────
  app.post(api.syllabi.parseText.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const courseId = Number(req.params.courseId);
      if (isNaN(courseId)) return res.status(400).json({ message: "Invalid course ID" });

      // Verify user is enrolled in this course
      const courseDetails = await storage.getCourseDetails(courseId, userId);
      if (!courseDetails) return res.status(404).json({ message: "Course not found" });
      if (!courseDetails.isEnrolled) return res.status(403).json({ message: "You must be enrolled in this course to upload a syllabus" });

      const { text: syllabusText } = api.syllabi.parseText.input.parse(req.body);
      if (syllabusText.trim().length < 50) {
        return res.status(422).json({ message: "Not enough text extracted from the PDF. Try a different file." });
      }

      console.log(`[Syllabus-Parse] Course ${courseId}: received ${syllabusText.length} chars — running local parser`);

      // Parse locally — no API key required
      const parsed = await parseSyllabusText(syllabusText, new Date().getFullYear());

      // ── 1. Update course info ──────────────────────────────────────────────
      const courseInfo = parsed.course || {};
      const courseUpdates: any = {};
      if (courseInfo.name && typeof courseInfo.name === "string") courseUpdates.name = courseInfo.name.trim();
      if (courseInfo.instructor && typeof courseInfo.instructor === "string") courseUpdates.instructor = courseInfo.instructor.trim();
      if (courseInfo.term && typeof courseInfo.term === "string") courseUpdates.term = courseInfo.term.trim();
      if (parsed.summary && typeof parsed.summary === "string") courseUpdates.summary = parsed.summary.trim();
      if (Array.isArray(parsed.grade_breakdown) && parsed.grade_breakdown.length > 0) {
        courseUpdates.gradeBreakdown = parsed.grade_breakdown;
      }
      if (Array.isArray(parsed.important_policies) && parsed.important_policies.length > 0) {
        courseUpdates.policies = parsed.important_policies;
      }

      if (Object.keys(courseUpdates).length > 0) {
        await storage.updateCourse(courseId, courseUpdates);
        console.log(`[Syllabus-Parse] Updated course ${courseId}:`, Object.keys(courseUpdates));
      }

      // ── 2. Create meeting time calendar events ─────────────────────────────
      if (courseInfo.meeting_times && typeof courseInfo.meeting_times === "string") {
        try {
          const course = await storage.getCourse(courseId);
          const meetingStr = courseInfo.meeting_times.trim();
          await storage.createCalendarEvent(userId, {
            title: `${course?.name || "Class"} — ${meetingStr}`,
            startDate: new Date(),
            endDate: null,
            description: `Meeting times: ${meetingStr}`,
            location: null,
            color: "#6366f1",
            eventType: "class",
          });
          console.log(`[Syllabus-Parse] Created meeting time event: ${meetingStr}`);
        } catch (calErr) {
          console.warn("[Syllabus-Parse] Failed to create meeting time event:", calErr);
        }
      }

      // ── 3. Save deadlines as assignments (they have dates) ─────────────────
      let createdCount = 0;
      const deadlines = (parsed.deadlines || []).filter((d: any) => d?.item && d?.date);

      // Deduplicate by item+date
      const seen = new Set<string>();
      const uniqueDeadlines = deadlines.filter((d: any) => {
        const key = `${String(d.item).trim().toLowerCase()}|${d.date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Map deadlines to assignment format for validation
      const assignmentCandidates = uniqueDeadlines.map((d: any) => ({
        name: d.item,
        dueDate: d.date,
        type: d.type === "other" ? "hw" : (d.type || "hw"),
        weight: null,
        maxScore: 100,
      }));

      const validated = validateExtractedAssignments(assignmentCandidates);
      console.log(`[Syllabus-Parse] ${deadlines.length} deadlines → ${uniqueDeadlines.length} deduped → ${validated.length} validated`);

      if (validated.length > 0) {
        await storage.clearCourseAssignments(courseId);
        for (const a of validated) {
          try {
            const saved = await saveAssignment(storage, courseId, userId, a);
            if (saved) createdCount++;
          } catch (itemErr) {
            console.error(`[Syllabus-Parse] Failed to save: ${a.name}`, itemErr);
          }
        }
      }

      // ── 4. Save syllabus record ────────────────────────────────────────────
      await storage.addSyllabus(courseId, userId, "client-extracted", syllabusText.substring(0, 50000), parsed);

      // Return full parsed data so the client can display it
      const message = createdCount > 0
        ? `Extracted ${createdCount} deadline${createdCount !== 1 ? "s" : ""}, updated course info, and saved grade breakdown.`
        : "Syllabus parsed and course info updated, but no deadlines with dates were found. You can add assignments manually.";

      res.json({ success: true, message, parsed });
    } catch (err) {
      console.error("[Syllabus-Parse] Fatal error:", err);
      res.status(500).json({ message: "Failed to parse syllabus. Please try again." });
    }
  });

  // ── Python LLM-powered syllabus parser (proxy to local service) ──────────────
  app.post("/api/parse-syllabus", upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (!req.file.originalname?.toLowerCase().endsWith(".pdf")) {
        return res.status(400).json({ error: "File must be a PDF" });
      }

      console.log("[Python-Parser] Proxying to LLM backend:", req.file.originalname);

      // Create FormData to send to Python backend
      const formData = new FormData();
      const blob = new Blob([req.file.buffer], { type: "application/pdf" });
      formData.append("file", blob, req.file.originalname);

      // Proxy to Python backend
      const pythonUrl = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
      const response = await fetch(`${pythonUrl}/parse`, {
        method: "POST",
        body: formData,
        timeout: 300000, // 5 minute timeout for LLM processing
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("[Python-Parser] Backend error:", data);
        return res.status(response.status).json(data);
      }

      console.log("[Python-Parser] Received", data.todos?.length || 0, "todos from LLM");
      res.json(data);
    } catch (err) {
      console.error("[Python-Parser] Proxy error:", err);
      res.status(503).json({
        error: "LLM parsing service unavailable. Ensure Python backend is running.",
        detail: String(err)
      });
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
        stream: false,
      }) as any;

      const raw = completion.choices?.[0]?.message?.content || "{}";
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch (parseErr) {
        console.error("Prep generation: failed to parse AI JSON:", parseErr);
        return res.status(500).json({ message: "AI returned invalid response. Please try again." });
      }
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
        stream: false,
      }) as any;

      const raw = completion.choices?.[0]?.message?.content || "{}";
      let resources: any[] = [];
      try {
        const parsed = JSON.parse(raw);
        resources = Array.isArray(parsed) ? parsed : (parsed.resources || parsed.links || []);
      } catch (parseErr) {
        console.error("Resource generation: failed to parse AI JSON:", parseErr);
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
