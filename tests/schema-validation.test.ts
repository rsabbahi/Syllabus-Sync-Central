/**
 * SCHEMA VALIDATION TESTS
 * Tests that Zod schemas produce the correct types for Drizzle decimal columns.
 * Root cause being tested: weight/maxScore/score must be strings after transform,
 * not numbers, because Drizzle decimal() columns require string values.
 */
import { describe, it, expect } from "vitest";
import {
  insertAssignmentSchema,
  updateAssignmentSchema,
  insertUserGradeSchema,
  insertCourseSchema,
} from "@shared/schema";

describe("insertAssignmentSchema", () => {
  const validInput = {
    courseId: 1,
    name: "Homework 1",
    type: "hw",
    dueDate: "2026-05-01",
    weight: 10,
    maxScore: 100,
  };

  it("transforms weight from number to string", () => {
    const result = insertAssignmentSchema.parse(validInput);
    expect(typeof result.weight).toBe("string");
    expect(result.weight).toBe("10");
  });

  it("transforms maxScore from number to string", () => {
    const result = insertAssignmentSchema.parse(validInput);
    expect(typeof result.maxScore).toBe("string");
    expect(result.maxScore).toBe("100");
  });

  it("transforms weight from string to string", () => {
    const result = insertAssignmentSchema.parse({ ...validInput, weight: "25.5" });
    expect(typeof result.weight).toBe("string");
    expect(result.weight).toBe("25.5");
  });

  it("transforms maxScore from string to string", () => {
    const result = insertAssignmentSchema.parse({ ...validInput, maxScore: "50" });
    expect(typeof result.maxScore).toBe("string");
    expect(result.maxScore).toBe("50");
  });

  it("coerces dueDate string to Date object", () => {
    const result = insertAssignmentSchema.parse(validInput);
    expect(result.dueDate).toBeInstanceOf(Date);
    expect(result.dueDate.getFullYear()).toBe(2026);
  });

  it("rejects missing name", () => {
    const { name, ...noName } = validInput;
    expect(() => insertAssignmentSchema.parse(noName)).toThrow();
  });

  it("rejects missing dueDate", () => {
    const { dueDate, ...noDate } = validInput;
    expect(() => insertAssignmentSchema.parse(noDate)).toThrow();
  });

  it("handles NaN weight by producing 'NaN' string (caller must guard)", () => {
    const result = insertAssignmentSchema.parse({ ...validInput, weight: "abc" });
    expect(result.weight).toBe("NaN");
  });
});

describe("updateAssignmentSchema (partial)", () => {
  it("allows partial updates with only weight", () => {
    const result = updateAssignmentSchema.parse({ weight: 15 });
    expect(result.weight).toBe("15");
    expect(result.name).toBeUndefined();
  });

  it("allows empty object", () => {
    const result = updateAssignmentSchema.parse({});
    expect(result).toEqual({});
  });
});

describe("insertUserGradeSchema", () => {
  it("transforms score number to string", () => {
    const result = insertUserGradeSchema.parse({ assignmentId: 1, score: 95 });
    expect(typeof result.score).toBe("string");
    expect(result.score).toBe("95");
  });

  it("transforms score string to string", () => {
    const result = insertUserGradeSchema.parse({ assignmentId: 1, score: "87.5" });
    expect(result.score).toBe("87.5");
  });
});

describe("insertCourseSchema", () => {
  it("omits createdBy from required fields", () => {
    const result = insertCourseSchema.parse({
      code: "CS101",
      name: "Intro to CS",
      section: "01",
      term: "Fall 2026",
    });
    expect(result).toHaveProperty("code", "CS101");
    expect(result).not.toHaveProperty("createdBy");
    expect(result).not.toHaveProperty("id");
  });

  it("rejects missing code", () => {
    expect(() =>
      insertCourseSchema.parse({ name: "Test", section: "01", term: "Fall 2026" })
    ).toThrow();
  });
});
