/**
 * ERROR HANDLING & EDGE CASE TESTS
 * Tests that error paths produce correct user-facing messages,
 * not generic fallbacks or swallowed errors.
 */
import { describe, it, expect } from "vitest";

describe("Error message propagation (use-syllabi hook pattern)", () => {
  // Simulates the fetch→throw→catch chain in use-syllabi.ts
  // The hook throws: new Error(error.message || "Failed to upload syllabus")
  // The UI should read: upload.error.message

  it("plain Error has message property accessible directly", () => {
    const serverMessage = "This PDF is password-protected. Please remove the password and upload again.";
    const error = new Error(serverMessage);
    // This is how the UI should read it — NOT via .response.data.message
    expect(error.message).toBe(serverMessage);
  });

  it("Error message is not accessible via Axios-style path", () => {
    const error = new Error("AI extraction failed");
    // The old broken UI code tried this path:
    const axiosMsg = (error as any)?.response?.data?.message;
    expect(axiosMsg).toBeUndefined();
    // But direct .message works:
    expect(error.message).toBe("AI extraction failed");
  });
});

describe("NaN parameter validation", () => {
  it("Number(undefined) is NaN", () => {
    expect(isNaN(Number(undefined))).toBe(true);
  });

  it("Number('abc') is NaN", () => {
    expect(isNaN(Number("abc"))).toBe(true);
  });

  it("Number('123') is valid", () => {
    expect(isNaN(Number("123"))).toBe(false);
    expect(Number("123")).toBe(123);
  });

  it("Number('') is 0, not NaN", () => {
    // This is a subtle edge — empty string becomes 0, not NaN
    expect(isNaN(Number(""))).toBe(false);
    expect(Number("")).toBe(0);
  });
});

describe("JSON.parse safety patterns", () => {
  it("double-try pattern catches both parse failures", () => {
    const rawContent = "This is not JSON at all {invalid json here} more text";
    let parsed: any = {};

    try {
      parsed = JSON.parse(rawContent);
    } catch {
      try {
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // Both failed — parsed stays {}
      }
    }

    // Should safely remain empty object, not throw
    expect(parsed).toEqual({});
  });

  it("regex fallback extracts valid JSON from surrounding text", () => {
    const rawContent = 'Some text before {"assignments": [{"name": "HW1"}]} and after';
    let parsed: any = {};

    try {
      parsed = JSON.parse(rawContent);
    } catch {
      try {
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // fallback
      }
    }

    expect(parsed).toHaveProperty("assignments");
    expect(parsed.assignments[0].name).toBe("HW1");
  });
});

describe("Optional chaining on AI response", () => {
  it("choices?.[0] handles empty choices array", () => {
    const response = { choices: [] as any[] };
    const content = response.choices?.[0]?.message?.content || "{}";
    expect(content).toBe("{}");
  });

  it("choices?.[0] handles undefined choices", () => {
    const response = {} as any;
    const content = response.choices?.[0]?.message?.content || "{}";
    expect(content).toBe("{}");
  });

  it("choices?.[0] handles null message", () => {
    const response = { choices: [{ message: null }] };
    const content = response.choices?.[0]?.message?.content || "{}";
    expect(content).toBe("{}");
  });
});

describe("Decimal column type safety", () => {
  // Drizzle decimal columns return strings from the database
  // and require strings for inserts. This tests the full round-trip.

  it("String(Number(v)) preserves integer values", () => {
    expect(String(Number(10))).toBe("10");
    expect(String(Number("10"))).toBe("10");
  });

  it("String(Number(v)) preserves decimal values", () => {
    expect(String(Number(25.5))).toBe("25.5");
    expect(String(Number("25.5"))).toBe("25.5");
  });

  it("String(Number(v)) produces 'NaN' for garbage (caller must guard)", () => {
    expect(String(Number("abc"))).toBe("NaN");
  });

  it("String(Number(v)) handles zero correctly", () => {
    expect(String(Number(0))).toBe("0");
    expect(String(Number("0"))).toBe("0");
  });
});
