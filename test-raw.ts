import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

async function dump(path: string, label: string) {
  const buf = await readFile(path);
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const { text } = await parser.getText();
  console.log("============", label);
  text.split(/\r?\n/).slice(0, 40).forEach((l, i) => console.log(`${i}:`, JSON.stringify(l)));
  console.log("---- lines containing '/' or dates ----");
  text.split(/\r?\n/).forEach((l, i) => {
    if (/\b\d{1,2}\/\d{1,2}\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(l)) {
      console.log(`${i}:`, JSON.stringify(l.slice(0, 200)));
    }
  });
}

async function main() {
  await dump("/Users/retalsabbahi/Downloads/MA124 syllabus 2026.04.07.pdf", "MA124");
  console.log();
  await dump("/Users/retalsabbahi/Downloads/Syllabus(1) (3).pdf", "EK125");
}
main();
