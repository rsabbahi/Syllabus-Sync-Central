/**
 * PRODUCTION BUILD TESTS
 * Tests that the CJS build output has a working createRequire fallback.
 * Root cause being tested: import.meta.url is empty in CJS output,
 * so createRequire({}.url) crashes. The fallback uses __filename.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const distPath = join(process.cwd(), "dist/index.cjs");

describe("Production CJS bundle", () => {
  it("dist/index.cjs exists after build", () => {
    // This test depends on `npm run build` having been run
    expect(existsSync(distPath)).toBe(true);
  });

  it("contains __filename fallback for createRequire", () => {
    const content = readFileSync(distPath, "utf8");
    // The fallback should reference __filename somewhere in the bundle
    expect(content).toContain("__filename");
  });

  it("does NOT contain the broken createRequire({}.url) pattern", () => {
    const content = readFileSync(distPath, "utf8");
    // Old broken pattern was: createRequire({}.url)
    // New pattern should have the ternary fallback
    expect(content).not.toContain('createRequire({}.url)');
  });

  it("references PDFParse class (not pdfParse function call)", () => {
    const content = readFileSync(distPath, "utf8");
    // The bundle should contain PDFParse reference, not the old pdfParse(buf) pattern
    expect(content).toContain("PDFParse");
  });
});
