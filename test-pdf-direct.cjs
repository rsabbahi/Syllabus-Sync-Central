const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('pdf-parse type:', typeof pdf);
console.log('pdf-parse keys:', Object.keys(pdf));

// Mock buffer if possible or just check the export
if (typeof pdf === 'function') {
  console.log('pdf-parse is a function as expected');
} else if (typeof pdf === 'object' && typeof pdf.default === 'function') {
  console.log('pdf-parse has a default function');
} else {
  console.log('pdf-parse is something else:', typeof pdf);
}
