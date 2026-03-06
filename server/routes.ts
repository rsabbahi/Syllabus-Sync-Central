import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { assignments, tasks, userGrades } from "@shared/schema";
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
      const task = await storage.createTask(userId, input);
      res.status(201).json(task);
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
      await storage.deleteTask(id);
      res.status(204).send();
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
        console.log("Attempting PDF parse with pdftotext...");
        // pdftotext -layout preserves columns and tables better
        const { stdout } = await execAsync(`pdftotext -layout - -`, {
          input: req.file.buffer,
          encoding: "utf-8"
        } as any);
        
        text = stdout;
        console.log("pdftotext successful, extracted length:", text.length);

        if (!text || text.trim().length < 50) {
          console.log("pdftotext failed or returned little text, trying pdf-parse...");
          const data = await pdfParse(req.file.buffer);
          text = data.text;
        }
        
        if (!text || text.trim().length < 50) {
          throw new Error("Could not extract meaningful text from PDF");
        }
        
        text = text.replace(/\s+/g, " ").substring(0, 50000);
      } catch (err) {
        console.error("PDF extraction failed:", err);
        return res.status(422).json({ 
          message: "We couldn't read the text in this PDF. It might be a scanned image or encrypted. Please try a different version or add assignments manually." 
        });
      }

      const prompt = `You are a highly advanced syllabus parser. Your goal is to extract every single assignment, quiz, exam, and lecture topic from the following text.

TEXT TO ANALYZE:
---
${text.substring(0, 50000)}
---

JSON OUTPUT FORMAT:
{
  "assignments": [
    { 
      "name": "Assignment/Lecture Title", 
      "type": "exam|hw|reading|paper|lecture", 
      "dueDate": "YYYY-MM-DDTHH:mm:ssZ", 
      "weight": 0, 
      "maxScore": 100 
    }
  ]
}

STRICT EXTRACTION RULES:
1. **NO SKIPPING**: Scan every line. If a line has a date and a topic/assignment, EXTRACT IT.
2. **DATE SEARCH**: Look for patterns like "Jan 12", "1/15", "Feb 2nd", "Week 1", "M/W/F".
3. **MESSY TEXT**: The text might be garbled due to PDF extraction. Use context clues to identify dates and titles.
4. **LECTURES**: If a date lists a topic (e.g., "Intro to Calculus"), create an entry named "Lecture: Intro to Calculus" with type "lecture".
5. **RECURRING**: If it says "Quizzes every Monday", generate a quiz for every Monday from Jan 12 to May 10, 2026.
6. **YEAR**: Assume the year is 2026 for all dates.
7. **JSON ONLY**: Return only valid JSON. Do not include any commentary.

Failure to extract items when they are present in the text is a critical error. Focus on the 'Schedule' or 'Calendar' sections first.`;

      let parsedContent = null;
      try {
        const aiRes = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        });
        parsedContent = JSON.parse(aiRes.choices[0].message?.content || "{}");
        console.log("AI Parsed Content:", JSON.stringify(parsedContent, null, 2));
        
        // Handle both "assignments" and "items" keys for robustness
        const extractedAssignments = parsedContent.assignments || parsedContent.items || [];

        if (Array.isArray(extractedAssignments)) {
          // Clear existing assignments for this course to avoid duplicates on re-upload
          await storage.clearCourseAssignments(courseId);

          for (const a of extractedAssignments) {
            // Validate required fields - be more lenient with names
            const name = a.name || a.title || a.description || "Unnamed Assignment";
            if (!a.dueDate) continue;

            const newAssignment = await storage.createAssignment(courseId, {
              name: String(name),
              type: String(a.type || "assignment"),
              dueDate: new Date(a.dueDate),
              weight: Number(a.weight || 0),
              maxScore: Number(a.maxScore || 100)
            });
            await storage.generateTasksForAssignment(userId, newAssignment);
          }
        }
      } catch (err) {
        console.error("AI parsing error:", err);
      }
      
      await storage.addSyllabus(courseId, userId, "local-upload", text, parsedContent);

      let message = "Syllabus processed and assignments added.";
      res.json({ success: true, message });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to process syllabus" });
    }
  });

  return httpServer;
}
