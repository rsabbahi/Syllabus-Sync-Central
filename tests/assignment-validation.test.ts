/**
 * ASSIGNMENT VALIDATION TESTS
 * Tests the validateExtractedAssignments() and saveAssignment() guard logic.
 * Root causes being tested:
 * - [object Object] in assignment names from AI returning nested objects
 * - Destructive clearing when AI returns garbage
 * - Weight/maxScore must be strings for Drizzle
 */
import { describe, it, expect } from "vitest";

// Extracted pure validation logic matching server/routes.ts validateExtractedAssignments
function validateExtractedAssignments(raw: any[]): any[] {
  return raw.filter((a) => {
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

// Extracted save guard logic from saveAssignment (without the storage calls)
const VALID_TYPES = ["exam", "hw", "paper", "project", "quiz", "lab", "reading", "discussion", "presentation", "lecture"];

function prepareSaveFields(a: any): { name: string; type: string; weight: string; maxScore: string; dueDate: Date } | null {
  if (!a || typeof a !== "object") return null;
  const rawName = a.name;
  if (rawName === null || rawName === undefined || typeof rawName === "object") return null;
  const name = String(rawName).trim();
  if (!name || name === "undefined" || name === "[object Object]") return null;

  const rawType = typeof a.type === "string" ? a.type.toLowerCase().replace(/[^a-z]/g, "") : "hw";
  const type = VALID_TYPES.includes(rawType) ? rawType : "hw";

  const weightNum = Math.min(100, Math.max(0, Number(a.weight) || 0));
  const maxScoreNum = Math.max(1, Number(a.maxScore) || 100);
  const weight = String(weightNum);
  const maxScore = String(maxScoreNum);

  // Guard: null/undefined dueDate produces epoch (1970), not NaN
  if (!a.dueDate) return null;
  const dueDate = new Date(a.dueDate);
  if (isNaN(dueDate.getTime())) return null;

  return { name, type, weight, maxScore, dueDate };
}

// --- validateExtractedAssignments tests ---

describe("validateExtractedAssignments", () => {
  it("accepts valid assignments", () => {
    const input = [
      { name: "Homework 1", dueDate: "2026-05-01", type: "hw", weight: 10, maxScore: 100 },
      { name: "Final Exam", dueDate: "2026-06-15", type: "exam", weight: 40, maxScore: 200 },
    ];
    const result = validateExtractedAssignments(input);
    expect(result).toHaveLength(2);
  });

  it("rejects null entries", () => {
    expect(validateExtractedAssignments([null, undefined, false, 0, ""])).toHaveLength(0);
  });

  it("rejects entries where name is a nested object", () => {
    const input = [{ name: { val: "HW 1", params: {} }, dueDate: "2026-05-01" }];
    expect(validateExtractedAssignments(input)).toHaveLength(0);
  });

  it("rejects entries where name is null", () => {
    expect(validateExtractedAssignments([{ name: null, dueDate: "2026-05-01" }])).toHaveLength(0);
  });

  it("rejects entries where name is undefined", () => {
    expect(validateExtractedAssignments([{ name: undefined, dueDate: "2026-05-01" }])).toHaveLength(0);
  });

  it("rejects entries where name is empty string", () => {
    expect(validateExtractedAssignments([{ name: "", dueDate: "2026-05-01" }])).toHaveLength(0);
  });

  it("rejects entries where name is '[object Object]'", () => {
    expect(validateExtractedAssignments([{ name: "[object Object]", dueDate: "2026-05-01" }])).toHaveLength(0);
  });

  it("rejects entries where name is 'undefined' string", () => {
    expect(validateExtractedAssignments([{ name: "undefined", dueDate: "2026-05-01" }])).toHaveLength(0);
  });

  it("rejects entries with invalid date", () => {
    expect(validateExtractedAssignments([{ name: "HW 1", dueDate: "not-a-date" }])).toHaveLength(0);
  });

  it("rejects entries with missing dueDate", () => {
    expect(validateExtractedAssignments([{ name: "HW 1" }])).toHaveLength(0);
  });

  it("filters mixed valid and invalid entries", () => {
    const input = [
      { name: "Valid HW", dueDate: "2026-05-01" },
      { name: { nested: true }, dueDate: "2026-05-01" },
      null,
      { name: "Another Valid", dueDate: "2026-06-01" },
      { name: "Bad Date", dueDate: "nope" },
    ];
    const result = validateExtractedAssignments(input);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Valid HW");
    expect(result[1].name).toBe("Another Valid");
  });

  it("returns empty for completely garbage AI output", () => {
    const garbage = [
      { assignments: [] },
      { text: "some raw text" },
      "string item",
      42,
      { name: { val: "nested" }, dueDate: {} },
    ];
    expect(validateExtractedAssignments(garbage)).toHaveLength(0);
  });
});

// --- prepareSaveFields tests (saveAssignment guard logic) ---

describe("prepareSaveFields (saveAssignment guards)", () => {
  it("returns correct fields for valid input", () => {
    const result = prepareSaveFields({
      name: "Homework 1",
      type: "hw",
      dueDate: "2026-05-01",
      weight: 15,
      maxScore: 100,
    });
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Homework 1");
    expect(result!.type).toBe("hw");
    expect(result!.weight).toBe("15");
    expect(result!.maxScore).toBe("100");
    expect(typeof result!.weight).toBe("string");
    expect(typeof result!.maxScore).toBe("string");
    expect(result!.dueDate).toBeInstanceOf(Date);
  });

  it("rejects nested object as name", () => {
    expect(prepareSaveFields({ name: { val: "HW" }, dueDate: "2026-05-01" })).toBeNull();
  });

  it("rejects array as name", () => {
    expect(prepareSaveFields({ name: ["HW 1"], dueDate: "2026-05-01" })).toBeNull();
  });

  it("defaults type to 'hw' when type is missing", () => {
    const result = prepareSaveFields({ name: "Quiz", dueDate: "2026-05-01" });
    expect(result!.type).toBe("hw");
  });

  it("defaults type to 'hw' when type is invalid", () => {
    const result = prepareSaveFields({ name: "Task", type: "zorgle", dueDate: "2026-05-01" });
    expect(result!.type).toBe("hw");
  });

  it("normalizes type by stripping non-alpha chars", () => {
    const result = prepareSaveFields({ name: "Task", type: "  Exam! ", dueDate: "2026-05-01" });
    expect(result!.type).toBe("exam");
  });

  it("clamps weight to 0-100 range", () => {
    expect(prepareSaveFields({ name: "A", dueDate: "2026-01-01", weight: -10 })!.weight).toBe("0");
    expect(prepareSaveFields({ name: "A", dueDate: "2026-01-01", weight: 999 })!.weight).toBe("100");
    expect(prepareSaveFields({ name: "A", dueDate: "2026-01-01", weight: 50 })!.weight).toBe("50");
  });

  it("defaults weight to 0 for NaN", () => {
    expect(prepareSaveFields({ name: "A", dueDate: "2026-01-01", weight: "abc" })!.weight).toBe("0");
  });

  it("defaults maxScore to 100 for missing/NaN", () => {
    expect(prepareSaveFields({ name: "A", dueDate: "2026-01-01" })!.maxScore).toBe("100");
    expect(prepareSaveFields({ name: "A", dueDate: "2026-01-01", maxScore: "garbage" })!.maxScore).toBe("100");
  });

  it("enforces maxScore minimum of 1", () => {
    expect(prepareSaveFields({ name: "A", dueDate: "2026-01-01", maxScore: 0 })!.maxScore).toBe("100"); // Number(0) || 100
    expect(prepareSaveFields({ name: "A", dueDate: "2026-01-01", maxScore: -5 })!.maxScore).toBe("1");
  });

  it("rejects invalid dates", () => {
    expect(prepareSaveFields({ name: "A", dueDate: "not-a-date" })).toBeNull();
    expect(prepareSaveFields({ name: "A", dueDate: null })).toBeNull();
    expect(prepareSaveFields({ name: "A", dueDate: undefined })).toBeNull();
  });
});
