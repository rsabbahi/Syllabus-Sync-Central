/**
 * FILE TYPE DETECTION TESTS
 * Tests the file detection logic from the syllabus upload route.
 * Extracted into a pure function for testability.
 * Covers: magic bytes, extension fallback, MIME fallback, .doc rejection.
 */
import { describe, it, expect } from "vitest";

// Replicating the detection logic from server/routes.ts exactly as it appears there.
// This is a pure-function extraction so we can test all edge cases.
type FileKind = "pdf" | "docx" | "txt" | "unknown";

interface FileInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

function detectFileKind(file: FileInput): { kind: FileKind; rejected?: string } {
  const fileName = (file.originalname || "").toLowerCase();
  const ext = fileName.substring(fileName.lastIndexOf("."));
  const buf = file.buffer;

  let fileKind: FileKind = "unknown";

  // Magic-byte detection
  if (buf.length >= 4) {
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
      fileKind = "pdf";
    } else if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
      fileKind = "docx";
    }
  }

  // Reject .doc explicitly
  if (ext === ".doc" && fileKind !== "pdf") {
    return {
      kind: "unknown",
      rejected: "The legacy .doc format is not supported. Please save your file as .docx (Word 2007+) or PDF and upload again.",
    };
  }

  // Fallback to extension
  if (fileKind === "unknown") {
    if (ext === ".pdf") fileKind = "pdf";
    else if (ext === ".docx") fileKind = "docx";
    else if (ext === ".txt" || ext === ".text" || ext === ".md" || ext === ".rtf") fileKind = "txt";
  }

  // Final fallback: MIME
  if (fileKind === "unknown") {
    const mime = (file.mimetype || "").toLowerCase();
    if (mime.includes("pdf")) fileKind = "pdf";
    else if (mime.includes("word") || mime.includes("officedocument")) fileKind = "docx";
    else if (mime.includes("text/")) fileKind = "txt";
  }

  return { kind: fileKind };
}

// --- Tests ---

describe("Magic byte detection", () => {
  it("detects PDF by magic bytes %PDF", () => {
    const buf = Buffer.from("%PDF-1.7 rest of content", "utf8");
    const result = detectFileKind({ buffer: buf, originalname: "syllabus.pdf", mimetype: "application/pdf" });
    expect(result.kind).toBe("pdf");
  });

  it("detects DOCX by PK magic bytes", () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00]);
    const result = detectFileKind({ buffer: buf, originalname: "syllabus.docx", mimetype: "application/octet-stream" });
    expect(result.kind).toBe("docx");
  });

  it("detects PDF even with wrong extension if magic bytes say PDF", () => {
    const buf = Buffer.from("%PDF-1.4 content", "utf8");
    const result = detectFileKind({ buffer: buf, originalname: "file.txt", mimetype: "text/plain" });
    expect(result.kind).toBe("pdf");
  });

  it("detects DOCX even with wrong extension if magic bytes say PK", () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
    const result = detectFileKind({ buffer: buf, originalname: "file.txt", mimetype: "text/plain" });
    expect(result.kind).toBe("docx");
  });
});

describe("Extension fallback", () => {
  it("detects PDF by .pdf extension when no magic bytes", () => {
    const buf = Buffer.from("some random content");
    const result = detectFileKind({ buffer: buf, originalname: "syllabus.pdf", mimetype: "application/octet-stream" });
    expect(result.kind).toBe("pdf");
  });

  it("detects DOCX by .docx extension when no magic bytes", () => {
    const buf = Buffer.from("some random content");
    const result = detectFileKind({ buffer: buf, originalname: "syllabus.docx", mimetype: "application/octet-stream" });
    expect(result.kind).toBe("docx");
  });

  it("detects TXT by .txt extension", () => {
    const buf = Buffer.from("plain text syllabus content");
    const result = detectFileKind({ buffer: buf, originalname: "syllabus.txt", mimetype: "application/octet-stream" });
    expect(result.kind).toBe("txt");
  });

  it("detects TXT by .md extension", () => {
    const buf = Buffer.from("# Syllabus");
    const result = detectFileKind({ buffer: buf, originalname: "syllabus.md", mimetype: "application/octet-stream" });
    expect(result.kind).toBe("txt");
  });

  it("detects TXT by .rtf extension", () => {
    const buf = Buffer.from("rtf content");
    const result = detectFileKind({ buffer: buf, originalname: "notes.rtf", mimetype: "application/octet-stream" });
    expect(result.kind).toBe("txt");
  });
});

describe("MIME type fallback", () => {
  it("detects PDF by MIME when extension is missing", () => {
    const buf = Buffer.from("content");
    const result = detectFileKind({ buffer: buf, originalname: "file", mimetype: "application/pdf" });
    expect(result.kind).toBe("pdf");
  });

  it("detects DOCX by MIME officedocument", () => {
    const buf = Buffer.from("content");
    const result = detectFileKind({
      buffer: buf,
      originalname: "file",
      mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(result.kind).toBe("docx");
  });

  it("detects TXT by MIME text/plain", () => {
    const buf = Buffer.from("content");
    const result = detectFileKind({ buffer: buf, originalname: "file", mimetype: "text/plain" });
    expect(result.kind).toBe("txt");
  });
});

describe(".doc rejection", () => {
  it("rejects .doc file with non-PDF magic bytes", () => {
    const buf = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]); // OLE compound doc magic bytes
    const result = detectFileKind({ buffer: buf, originalname: "syllabus.doc", mimetype: "application/msword" });
    expect(result.rejected).toBeDefined();
    expect(result.rejected).toContain(".doc format is not supported");
  });

  it("rejects .doc file with no magic bytes", () => {
    const buf = Buffer.from("some content");
    const result = detectFileKind({ buffer: buf, originalname: "syllabus.doc", mimetype: "application/msword" });
    expect(result.rejected).toBeDefined();
  });

  it("does NOT reject .doc if magic bytes say it is actually a PDF", () => {
    const buf = Buffer.from("%PDF-1.4 content");
    const result = detectFileKind({ buffer: buf, originalname: "mislabeled.doc", mimetype: "application/msword" });
    expect(result.rejected).toBeUndefined();
    expect(result.kind).toBe("pdf");
  });
});

describe("Unknown / unsupported files", () => {
  it("returns unknown for .exe file", () => {
    const buf = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ header
    const result = detectFileKind({ buffer: buf, originalname: "virus.exe", mimetype: "application/x-msdownload" });
    expect(result.kind).toBe("unknown");
  });

  it("returns unknown for .jpg file", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic
    const result = detectFileKind({ buffer: buf, originalname: "photo.jpg", mimetype: "image/jpeg" });
    expect(result.kind).toBe("unknown");
  });

  it("returns unknown for empty buffer with no extension", () => {
    const buf = Buffer.alloc(0);
    const result = detectFileKind({ buffer: buf, originalname: "file", mimetype: "application/octet-stream" });
    expect(result.kind).toBe("unknown");
  });
});

describe("Edge cases", () => {
  it("handles buffer shorter than 4 bytes gracefully", () => {
    const buf = Buffer.from([0x25, 0x50]); // only 2 bytes — partial PDF header
    const result = detectFileKind({ buffer: buf, originalname: "file.pdf", mimetype: "application/pdf" });
    // Magic bytes can't match (need 4), falls through to extension
    expect(result.kind).toBe("pdf");
  });

  it("handles empty originalname", () => {
    const buf = Buffer.from("%PDF-1.4 content");
    const result = detectFileKind({ buffer: buf, originalname: "", mimetype: "application/pdf" });
    expect(result.kind).toBe("pdf"); // magic bytes still work
  });

  it("handles uppercase extension", () => {
    const buf = Buffer.from("text content");
    // Extension extraction uses toLowerCase on the whole name
    const result = detectFileKind({ buffer: buf, originalname: "FILE.TXT", mimetype: "application/octet-stream" });
    expect(result.kind).toBe("txt");
  });
});
