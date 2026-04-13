/**
 * PDF-PARSE V2 INTEGRATION TESTS
 * Tests the actual pdf-parse@2.4.5 API to verify the v2 integration works.
 * Root cause being tested: old code called pdfParse(buf) as a function,
 * but v2 exports a PDFParse class requiring new PDFParse({data}) → getText().
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParseModule = require("pdf-parse");
const { PDFParse, PasswordException, InvalidPDFException } = pdfParseModule;

describe("pdf-parse v2 module exports", () => {
  it("exports an object, not a function", () => {
    expect(typeof pdfParseModule).toBe("object");
    expect(typeof pdfParseModule).not.toBe("function");
  });

  it("exports PDFParse as a constructor", () => {
    expect(typeof PDFParse).toBe("function");
  });

  it("exports PasswordException", () => {
    expect(PasswordException).toBeDefined();
  });

  it("exports InvalidPDFException", () => {
    expect(InvalidPDFException).toBeDefined();
  });

  it("calling pdfParseModule directly as function throws TypeError", () => {
    expect(() => (pdfParseModule as any)(Buffer.from("test"))).toThrow(TypeError);
  });
});

describe("PDFParse getText() with valid PDF buffer", () => {
  // Minimal valid PDF with embedded text "Hello"
  const minimalPdf = Buffer.from(
    "%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj " +
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj " +
      "3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R/Contents 4 0 R>>endobj " +
      "4 0 obj<</Length 20>>stream\nBT /F1 1 Tf (Hello) Tj ET\nendstream\nendobj\n" +
      "xref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n" +
      "0000000115 00000 n \n0000000210 00000 n \ntrailer<</Size 5/Root 1 0 R>>\n" +
      "startxref\n282\n%%EOF"
  );

  it("extracts text from a valid PDF buffer", async () => {
    const parser = new PDFParse({ data: minimalPdf });
    try {
      const result = await parser.getText();
      expect(result).toHaveProperty("text");
      expect(typeof result.text).toBe("string");
      expect(result.text).toContain("Hello");
    } finally {
      await parser.destroy();
    }
  });

  it("result has pages array", async () => {
    const parser = new PDFParse({ data: minimalPdf });
    try {
      const result = await parser.getText();
      expect(result).toHaveProperty("pages");
      expect(Array.isArray(result.pages)).toBe(true);
    } finally {
      await parser.destroy();
    }
  });
});

describe("PDFParse error handling", () => {
  it("throws InvalidPDFException for non-PDF data", async () => {
    const parser = new PDFParse({ data: Buffer.from("this is not a pdf") });
    try {
      await parser.getText();
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e instanceof InvalidPDFException).toBe(true);
    } finally {
      try {
        await parser.destroy();
      } catch {
        /* may fail if load never completed */
      }
    }
  });

  it("throws for empty buffer", async () => {
    const parser = new PDFParse({ data: Buffer.alloc(0) });
    try {
      await parser.getText();
      expect.fail("Should have thrown");
    } catch (e: any) {
      // Could be InvalidPDFException or another error — just verify it throws
      expect(e).toBeDefined();
    } finally {
      try {
        await parser.destroy();
      } catch {
        /* ok */
      }
    }
  });
});
