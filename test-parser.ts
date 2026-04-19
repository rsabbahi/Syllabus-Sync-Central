import { parseSyllabusText } from "/Users/retalsabbahi/Startup/Syllabus-Sync-Central/server/services/syllabusParser.ts";
import { readFile } from "node:fs/promises";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

async function run() {
  const pdfs = [
    "/Users/retalsabbahi/Downloads/PY211_Syllabus_Spring_2026_v3.pdf",
    "/Users/retalsabbahi/Downloads/MA124 syllabus 2026.04.07.pdf",
    "/Users/retalsabbahi/Downloads/Syllabus(1) (3).pdf",
  ];
  const docx = "/Users/retalsabbahi/Downloads/3.15 revised SP26 Syllabus(1) (1).docx";

  for (const f of pdfs) {
    const buf = await readFile(f);
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const { text } = await parser.getText();
    console.log("\n================", f);
    const r = await parseSyllabusText(text, 2026);
    console.log(JSON.stringify({
      course: r.course,
      summary: r.summary.slice(0, 160),
      grades: r.grade_breakdown.slice(0, 6),
      deadlineCount: r.deadlines.length,
      first6: r.deadlines.slice(0, 6),
      last4: r.deadlines.slice(-4),
    }, null, 2));
  }

  const docxBuf = await readFile(docx);
  const { value } = await mammoth.extractRawText({ buffer: docxBuf });
  console.log("\n================", docx);
  const r = await parseSyllabusText(value, 2026);
  console.log(JSON.stringify({
    course: r.course,
    summary: r.summary.slice(0, 240),
    grades: r.grade_breakdown.slice(0, 6),
    deadlineCount: r.deadlines.length,
    first6: r.deadlines.slice(0, 6),
  }, null, 2));
}

run().catch((e) => { console.error(e); process.exit(1); });
