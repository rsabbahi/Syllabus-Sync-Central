/**
 * SYLLABUS PARSER V2 TESTS
 * Tests the new client-side PDF.js → server LLM parse flow.
 * Covers: prompt output validation, recurring assignment expansion,
 * grade breakdown structure, course info extraction, deduplication.
 */
import { describe, it, expect } from "vitest";

// --- Simulate LLM response validation (what the server does after getting AI output) ---

interface ParsedSyllabus {
  course?: {
    name?: string;
    code?: string;
    instructor?: string;
    term?: string;
    meeting_times?: string;
  };
  summary?: string;
  deadlines?: { item: string; date: string; type: string }[];
  assignments?: {
    name: string;
    dueDate: string;
    type: string;
    weight: number | null;
    maxScore: number | null;
    recurring?: boolean;
  }[];
  grade_breakdown?: { category: string; weight: string }[];
  important_policies?: string[];
}

// Replicate the deduplication logic from the route
function deduplicateAssignments(allAssignments: any[]): any[] {
  const seen = new Set<string>();
  return allAssignments.filter((a: any) => {
    if (!a?.name || !a?.dueDate) return false;
    const key = `${String(a.name).trim().toLowerCase()}|${a.dueDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Replicate the course update extraction
function extractCourseUpdates(parsed: ParsedSyllabus): Record<string, any> {
  const courseInfo = parsed.course || {};
  const updates: any = {};
  if (courseInfo.name && typeof courseInfo.name === "string") updates.name = courseInfo.name.trim();
  if (courseInfo.instructor && typeof courseInfo.instructor === "string") updates.instructor = courseInfo.instructor.trim();
  if (courseInfo.term && typeof courseInfo.term === "string") updates.term = courseInfo.term.trim();
  if (courseInfo.code && typeof courseInfo.code === "string") updates.code = courseInfo.code.trim();
  if (parsed.summary && typeof parsed.summary === "string") updates.summary = parsed.summary.trim();
  if (Array.isArray(parsed.grade_breakdown) && parsed.grade_breakdown.length > 0) {
    updates.gradeBreakdown = parsed.grade_breakdown;
  }
  if (Array.isArray(parsed.important_policies) && parsed.important_policies.length > 0) {
    updates.policies = parsed.important_policies;
  }
  return updates;
}

describe("Course info extraction from AI response", () => {
  const sampleResponse: ParsedSyllabus = {
    course: {
      name: "Introduction to Computer Science",
      code: "CS 101",
      instructor: "Dr. Jane Smith",
      term: "Fall 2026",
      meeting_times: "MWF 10:00-10:50am, Room 205",
    },
    summary: "This course covers fundamental concepts in computer science including algorithms, data structures, and programming.",
    grade_breakdown: [
      { category: "Homework", weight: "30%" },
      { category: "Midterm", weight: "25%" },
      { category: "Final Exam", weight: "35%" },
      { category: "Participation", weight: "10%" },
    ],
    important_policies: [
      "Late submissions lose 10% per day",
      "No makeup exams without prior approval",
    ],
    assignments: [],
    deadlines: [],
  };

  it("extracts course name", () => {
    const updates = extractCourseUpdates(sampleResponse);
    expect(updates.name).toBe("Introduction to Computer Science");
  });

  it("extracts instructor", () => {
    const updates = extractCourseUpdates(sampleResponse);
    expect(updates.instructor).toBe("Dr. Jane Smith");
  });

  it("extracts term", () => {
    const updates = extractCourseUpdates(sampleResponse);
    expect(updates.term).toBe("Fall 2026");
  });

  it("extracts grade breakdown as array", () => {
    const updates = extractCourseUpdates(sampleResponse);
    expect(updates.gradeBreakdown).toHaveLength(4);
    expect(updates.gradeBreakdown[0]).toEqual({ category: "Homework", weight: "30%" });
  });

  it("extracts policies as array", () => {
    const updates = extractCourseUpdates(sampleResponse);
    expect(updates.policies).toHaveLength(2);
    expect(updates.policies[0]).toContain("Late submissions");
  });

  it("extracts summary", () => {
    const updates = extractCourseUpdates(sampleResponse);
    expect(updates.summary).toContain("fundamental concepts");
  });

  it("handles missing course info gracefully", () => {
    const updates = extractCourseUpdates({});
    expect(Object.keys(updates)).toHaveLength(0);
  });

  it("ignores null/non-string fields", () => {
    const updates = extractCourseUpdates({
      course: { name: null as any, instructor: 123 as any },
    });
    expect(updates.name).toBeUndefined();
    expect(updates.instructor).toBeUndefined();
  });
});

describe("Assignment deduplication", () => {
  it("removes exact duplicates by name+date", () => {
    const input = [
      { name: "Homework 1", dueDate: "2026-01-19" },
      { name: "Homework 1", dueDate: "2026-01-19" },
      { name: "Homework 2", dueDate: "2026-01-26" },
    ];
    expect(deduplicateAssignments(input)).toHaveLength(2);
  });

  it("is case-insensitive on name", () => {
    const input = [
      { name: "HOMEWORK 1", dueDate: "2026-01-19" },
      { name: "homework 1", dueDate: "2026-01-19" },
    ];
    expect(deduplicateAssignments(input)).toHaveLength(1);
  });

  it("keeps different dates as separate entries", () => {
    const input = [
      { name: "Homework 1", dueDate: "2026-01-19" },
      { name: "Homework 1", dueDate: "2026-01-26" },
    ];
    expect(deduplicateAssignments(input)).toHaveLength(2);
  });

  it("filters out entries with no name or date", () => {
    const input = [
      { name: "", dueDate: "2026-01-19" },
      { name: "HW", dueDate: null },
      { name: null, dueDate: "2026-01-19" },
      { dueDate: "2026-01-19" },
    ];
    expect(deduplicateAssignments(input)).toHaveLength(0);
  });
});

describe("Recurring assignment expansion verification", () => {
  // The LLM is told to expand weekly assignments. These tests verify
  // that if the LLM output is correct, the system handles it.

  it("accepts multiple weekly assignments with sequential dates", () => {
    const weeklyHW = [];
    const startDate = new Date("2026-01-19");
    for (let i = 0; i < 15; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i * 7);
      weeklyHW.push({
        name: `Homework ${i + 1}`,
        dueDate: d.toISOString().split("T")[0],
        type: "hw",
        weight: 2, // 30% / 15 = 2% each
        maxScore: 100,
        recurring: true,
      });
    }

    const deduped = deduplicateAssignments(weeklyHW);
    expect(deduped).toHaveLength(15);
    // Every entry has unique name+date
    const keys = deduped.map((a: any) => `${a.name}|${a.dueDate}`);
    expect(new Set(keys).size).toBe(15);
  });

  it("merges deadline duplicates with assignment duplicates", () => {
    const assignments = [
      { name: "Midterm Exam", dueDate: "2026-03-15", type: "exam" },
    ];
    const deadlines = [
      { item: "Midterm Exam", date: "2026-03-15", type: "exam" },
    ];

    // Simulate the merge logic from the route
    const merged = [
      ...assignments,
      ...deadlines.map((d: any) => ({
        name: d.item,
        dueDate: d.date,
        type: d.type,
        weight: null,
        maxScore: 100,
      })),
    ];

    const deduped = deduplicateAssignments(merged);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].name).toBe("Midterm Exam");
  });
});

describe("Grade breakdown structure validation", () => {
  it("valid grade breakdown passes through", () => {
    const parsed: ParsedSyllabus = {
      grade_breakdown: [
        { category: "Homework", weight: "30%" },
        { category: "Final", weight: "40%" },
      ],
    };
    const updates = extractCourseUpdates(parsed);
    expect(updates.gradeBreakdown).toEqual([
      { category: "Homework", weight: "30%" },
      { category: "Final", weight: "40%" },
    ]);
  });

  it("empty grade breakdown is not included", () => {
    const updates = extractCourseUpdates({ grade_breakdown: [] });
    expect(updates.gradeBreakdown).toBeUndefined();
  });

  it("null grade breakdown is not included", () => {
    const updates = extractCourseUpdates({ grade_breakdown: null as any });
    expect(updates.gradeBreakdown).toBeUndefined();
  });
});
