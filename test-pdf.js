const { createRequire } = require("module");
const require = createRequire("file://" + __dirname + "/");
try {
  const pdfParse = require("pdf-parse");
  console.log("Imported pdf-parse successfully");
  console.log("Type of pdfParse:", typeof pdfParse);
  if (typeof pdfParse !== 'function') {
    console.log("Keys:", Object.keys(pdfParse));
  }
} catch (e) {
  console.error("Failed to import pdf-parse:", e.message);
}
