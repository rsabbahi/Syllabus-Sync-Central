import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated, setupAuth } from "./replit_integrations/auth";
import multer from "multer";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
import OpenAI from "openai";
import { registerAuthRoutes } from "./replit_integrations/auth";

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
        console.log("Attempting PDF parse with buffer length:", req.file.buffer.length);
        const data = await pdfParse(req.file.buffer);
        text = data.text;
        console.log("PDF parse successful, extracted text length:", text.length);
        if (!text || text.trim().length < 10) {
          throw new Error("Extracted text too short, likely failed");
        }
      } catch (err) {
        console.error("PDF parse error, trying fallback:", err);
        text = req.file.buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ");
        console.log("Fallback text length:", text.length);
      }

      const prompt = `Extract the course schedule and all assignments from this syllabus text.
Return ONLY a JSON object with this exact structure:
{
  "assignments": [
    { "name": "Topic: [Name]", "type": "reading", "dueDate": "YYYY-MM-DDTHH:mm:ssZ", "weight": 0, "maxScore": 100 }
  ]
}

CRITICAL INSTRUCTIONS:
1. Scan the entire text specifically for any section labeled "Schedule", "Course Outline", "Calendar", or "Weekly Topics".
2. Look for patterns like "Date | Topic", "Week | Date | Assignment".
3. For EVERY single date mentioned in the schedule (e.g., "Jan 15", "2/20", "March 10th"), you MUST create an assignment entry.
4. If a date is associated with a lecture topic, name it "Topic: [Topic Name]".
5. If a date is associated with a Quiz, Exam, Homework, or Project, use that name (e.g., "Quiz 1", "Homework 2").
6. Use the year 2026 for all dates.
7. If the text says "Weekly [X] on [Day]", create recurring entries for that day every week of the semester (January 12 to May 10, 2026).
8. DO NOT skip any rows in a schedule table. Every row with a date is a separate entry.
9. If you see a date range like "Jan 12-16", use the start date (Jan 12).
10. If the text is messy or binary, try to find ANY dates and associated labels.
11. Ensure the response is VALID JSON.

Text:
${text.substring(0, 30000)}
`;

      let parsedContent = null;
      try {
        const aiRes = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        });
        parsedContent = JSON.parse(aiRes.choices[0].message?.content || "{}");
        console.log("AI Parsed Content:", JSON.stringify(parsedContent, null, 2));
        
        if (parsedContent?.assignments && Array.isArray(parsedContent.assignments)) {
          for (const a of parsedContent.assignments) {
            // Validate required fields
            if (!a.name || !a.dueDate) continue;

            const newAssignment = await storage.createAssignment(courseId, {
              name: String(a.name),
              type: String(a.type || "assignment"),
              dueDate: new Date(a.dueDate),
              weight: Number(a.weight || 10),
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
