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
import OpenAI from "openai";
import { registerAuthRoutes } from "./replit_integrations/auth";

import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

const upload = multer({ storage: multer.memoryStorage() });

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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
      
      let text = "";
      try {
        console.log("Using Google Gemini API to extract PDF content...");
        
        // Convert buffer to base64 for Gemini API
        const base64Pdf = req.file.buffer.toString("base64");
        
        // Call Google Gemini API with vision capabilities
        // Use Gemini Pro for intelligent document analysis with multiple passes
        const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.Syllabus_API_KEY
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  inline_data: {
                    mime_type: "application/pdf",
                    data: base64Pdf
                  }
                },
                {
                  text: `You are a world-class syllabus parser with expertise in educational documents. Your task is to extract EVERY piece of course information with perfect accuracy.

EXTRACTION INSTRUCTIONS:
1. Read the entire document page by page
2. Identify all sections: Course Info, Schedule, Assignments, Grading, Policies
3. For EVERY deadline, exam, quiz, assignment, or reading:
   - Extract exact date (day, month, year)
   - Extract assignment/activity name
   - Extract point value or percentage weight
   - Extract assignment type (homework, exam, quiz, paper, project, lab, reading, discussion, presentation)
4. Handle complex layouts:
   - Tables: Parse each row as separate item
   - Multi-column text: Merge logically by proximity
   - Scanned/image text: Use OCR interpretation
5. Resolve ambiguities:
   - Week numbers → convert to specific dates (assume 15-week semester starting Jan 13, 2026)
   - "M/W/F" + time → extract as pattern
   - Recurring items → list each occurrence
6. Extract ALL grading information:
   - Points per assignment
   - Percentage weights
   - Grade scale (A/B/C etc)
   - Curves or adjustments

Return a COMPLETE, VERBOSE reconstruction of the document's academic content.`
                }
              ]
            }]
          })
        });

        const geminiData = await geminiResponse.json();
        
        if (!geminiResponse.ok || !geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
          throw new Error("Gemini API failed to extract content");
        }
        
        text = geminiData.candidates[0].content.parts[0].text;
        console.log("Gemini extraction successful, text length:", text.length);
        
        if (!text || text.trim().length < 50) {
          throw new Error("Could not extract meaningful text from PDF");
        }
        
        text = text.substring(0, 50000);
      } catch (err) {
        console.error("PDF extraction failed:", err);
        return res.status(422).json({ 
          message: "We couldn't read the text in this PDF. It might be a scanned image or encrypted. Please try a different version or add assignments manually." 
        });
      }

      const prompt = `You are the most intelligent and thorough syllabus parser in the world. Your ONLY job is to extract EVERY academic deadline, assignment, and event from the course material. Return ONLY valid JSON.

DOCUMENT TEXT:
---
${text.substring(0, 50000)}
---

JSON FORMAT (return ONLY this, no explanation):
{
  "assignments": [
    {
      "name": "Exact assignment name",
      "type": "exam|hw|paper|project|quiz|lab|reading|discussion|presentation|lecture",
      "dueDate": "YYYY-MM-DDTHH:mm:ssZ",
      "weight": percentage_number_or_0,
      "maxScore": points_or_100
    }
  ]
}

RULES (NON-NEGOTIABLE):
1. **ZERO SKIPPING**: Extract EVERY single item. If there's a date + assignment name, extract it.
2. **AGGRESSIVE SEARCH**: Look in: schedules, calendars, assignment lists, tables, course outline, syllabus, week-by-week breakdowns, exam dates, project timelines, reading lists with dates, discussion boards, labs, quizzes, participation events.
3. **DATE INTELLIGENCE**:
   - Parse "Jan 12" → "2026-01-12T23:59:59Z"
   - Parse "1/15" → "2026-01-15T23:59:59Z"
   - Parse "Week 3" with Jan 13 start → calculate actual date
   - Parse "M/W/F" + time → extract as 3 separate weekly items
   - Parse "by Friday" in context → use nearest Friday
   - Parse ranges "Jan 10-15" → use end date (Jan 15)
4. **WEIGHT EXTRACTION**: Find "30%", "30 points", "worth 50 points", "counts as 20%" near each item. If not found, use 0.
5. **RECURRING PATTERN**: "Quiz every Monday Jan 13-Apr 25" → generate entry for EVERY Monday in that range.
6. **TABLE PARSING**: Each table row = separate item. Extract all columns (name, date, points, type).
7. **MULTI-COLUMN TEXT**: Read columns left-to-right, group by date, extract contiguous date+name pairs.
8. **INTELLIGENT NAMING**: 
   - "Chapter 5 reading due Feb 3" → name: "Chapter 5 Reading"
   - "Jan 15: Intro to Calculus (lecture)" → name: "Lecture: Intro to Calculus"
   - "Midterm Exam Wed March 5, 10-11:30am" → name: "Midterm Exam"
9. **TYPE INFERENCE**: Exam/Midterm/Final→exam, HW/Assignment→hw, Paper/Essay→paper, Project→project, Quiz→quiz, Lab→lab, Reading→reading, Discussion→discussion, Presentation→presentation, Lecture/Class→lecture.
10. **MISSING DATES**: If assignment has no date, use "2026-05-15T23:59:59Z".
11. **MISSING WEIGHTS**: Use 0 if not specified.
12. **AMBIGUITY**: When unsure, default to most recent reasonable date in 2026 (Jan-May).
13. **NO DUPLICATION**: Remove exact duplicates by name+date.
14. **RETURN ONLY JSON**: No text before/after JSON block.`;

      let parsedContent = null;
      let createdCount = 0;
      
      try {
        // Run GPT-4o and Mistral in parallel for multi-model extraction
        const [gptRes, mistralRes] = await Promise.all([
          // GPT-4o extraction
          openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
          }),
          // Mistral extraction with same prompt
          fetch("https://api.mistral.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.Mistral_API_Key}`
            },
            body: JSON.stringify({
              model: "mistral-large-latest",
              messages: [
                {
                  role: "user",
                  content: prompt
                }
              ],
              response_format: { type: "json_object" }
            })
          }).then(res => res.json())
        ]);
        
        console.log("GPT-4o and Mistral extraction started in parallel");
        
        // Parse both responses
        let gptAssignments: any[] = [];
        let mistralAssignments: any[] = [];
        
        try {
          let gptRaw = gptRes.choices[0].message?.content || "{}";
          try {
            const gptParsed = JSON.parse(gptRaw);
            gptAssignments = gptParsed.assignments || gptParsed.items || [];
          } catch (e) {
            const jsonMatch = gptRaw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const gptParsed = JSON.parse(jsonMatch[0]);
              gptAssignments = gptParsed.assignments || gptParsed.items || [];
            }
          }
          console.log("GPT-4o extracted:", gptAssignments.length, "items");
        } catch (err) {
          console.error("GPT-4o parsing error:", err);
        }
        
        try {
          let mistralRaw = mistralRes.choices?.[0]?.message?.content || "{}";
          try {
            const mistralParsed = JSON.parse(mistralRaw);
            mistralAssignments = mistralParsed.assignments || mistralParsed.items || [];
          } catch (e) {
            const jsonMatch = mistralRaw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const mistralParsed = JSON.parse(jsonMatch[0]);
              mistralAssignments = mistralParsed.assignments || mistralParsed.items || [];
            }
          }
          console.log("Mistral extracted:", mistralAssignments.length, "items");
        } catch (err) {
          console.error("Mistral parsing error:", err);
        }
        
        // Merge and deduplicate both models' results
        const mergedMap = new Map<string, any>();
        
        const addAssignments = (assignments: any[]) => {
          for (const a of assignments) {
            if (a.name && a.dueDate && a.type) {
              const key = `${a.name.trim()}|${a.dueDate}`;
              if (!mergedMap.has(key)) {
                mergedMap.set(key, a);
              }
            }
          }
        };
        
        addAssignments(gptAssignments);
        addAssignments(mistralAssignments);
        
        let extractedAssignments = Array.from(mergedMap.values());
        parsedContent = { assignments: extractedAssignments };
        
        console.log(`Merged extraction: ${gptAssignments.length} (GPT) + ${mistralAssignments.length} (Mistral) = ${extractedAssignments.length} unique items`);
        
        if (Array.isArray(extractedAssignments) && extractedAssignments.length > 0) {
          await storage.clearCourseAssignments(courseId);

          for (const a of extractedAssignments) {
            try {
              const name = String(a.name).trim();
              const type = String(a.type).toLowerCase().trim();
              const weight = Math.min(100, Math.max(0, Number(a.weight) || 0));
              const maxScore = Math.max(0, Number(a.maxScore) || 100);
              
              const dueDate = new Date(a.dueDate);
              if (isNaN(dueDate.getTime())) {
                console.warn("Invalid date for:", name, a.dueDate);
                continue;
              }

              const newAssignment = await storage.createAssignment(courseId, {
                name,
                type,
                dueDate,
                weight,
                maxScore
              });
              await storage.generateTasksForAssignment(userId, newAssignment);
              createdCount++;
            } catch (itemErr) {
              console.error("Error creating assignment:", a.name, itemErr);
            }
          }
        }
        
        console.log(`Successfully created ${createdCount} assignments from dual-model extraction.`);
      } catch (err) {
        console.error("Multi-model extraction error:", err);
      }
      
      await storage.addSyllabus(courseId, userId, "local-upload", text, parsedContent);

      let message = createdCount > 0 
        ? `Successfully extracted ${createdCount} assignments from your syllabus!`
        : "Syllabus processed. No assignments could be extracted — try adding them manually.";
      res.json({ success: true, message });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to process syllabus" });
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

  return httpServer;
}
