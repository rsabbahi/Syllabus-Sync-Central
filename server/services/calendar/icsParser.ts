import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ical = require('node-ical');
const AdmZip = require('adm-zip');

export interface NormalizedEvent {
  externalId: string;
  title: string;
  startDate: Date;
  endDate: Date | null;
  description: string | null;
  location: string | null;
}

/**
 * Safely extract a plain string from any value node-ical might hand back.
 *
 * node-ical can return text properties in several forms:
 *   - plain string  →  "CS 101 Lecture"
 *   - parameterised object  →  { val: "CS 101 Lecture", params: { LANGUAGE: "en" } }
 *   - nested object  →  { params: {...}, val: { val: "..." } }
 *   - array  →  ["CS 101 Lecture", { params: {...} }]
 *
 * String() on an object yields "[object Object]", which is the bug we're fixing.
 */
function extractText(val: any): string {
  if (!val && val !== 0) return '';

  // Plain string — most common case
  if (typeof val === 'string') return val.trim();

  // Array — take first element
  if (Array.isArray(val)) return extractText(val[0]);

  if (typeof val === 'object' && val !== null) {
    // node-ical parameterised form: { val: "...", params: {...} }
    if ('val' in val) return extractText(val.val);

    // Some parsers use 'value'
    if ('value' in val) return extractText(val.value);

    // Fallback: find the first own string-valued key that isn't 'type'/'params'
    for (const k of Object.keys(val)) {
      if (k === 'params' || k === 'type') continue;
      if (typeof val[k] === 'string' && val[k].length > 0) return val[k].trim();
    }
  }

  // Last resort — convert but guard against the useless "[object Object]"
  const s = String(val);
  return s === '[object Object]' ? '' : s.trim();
}

export function parseIcsBuffer(buffer: Buffer): NormalizedEvent[] {
  const content = buffer.toString('utf8');
  let parsed: Record<string, any>;
  try {
    parsed = ical.sync.parseICS(content);
  } catch (e) {
    console.warn('ICS parse error:', e);
    return [];
  }

  const events: NormalizedEvent[] = [];

  for (const key of Object.keys(parsed)) {
    const event = parsed[key];
    if (event.type !== 'VEVENT') continue;

    const rawStart = event.start;
    if (!rawStart) continue;
    const start = new Date(rawStart);
    if (isNaN(start.getTime())) continue;

    // All-day events (DATE type, no time component) → map to end of that day
    if (event.datetype === 'date') {
      start.setHours(23, 59, 59, 0);
    }

    const rawEnd = event.end;
    const end = rawEnd ? new Date(rawEnd) : null;

    const titleText = extractText(event.summary) || 'Untitled Event';
    const uid = extractText(event.uid) || `${titleText}:${start.toISOString()}`;

    events.push({
      externalId: uid,
      title: titleText,
      startDate: start,
      endDate: end && !isNaN(end.getTime()) ? end : null,
      description: extractText(event.description) || null,
      location: extractText(event.location) || null,
    });
  }

  return events;
}

export function parseZipBuffer(buffer: Buffer): NormalizedEvent[] {
  let zip: any;
  try {
    zip = new AdmZip(buffer);
  } catch (e) {
    throw new Error('Invalid ZIP file');
  }

  const events: NormalizedEvent[] = [];

  for (const entry of zip.getEntries()) {
    const name = entry.entryName.toLowerCase();
    if (!entry.isDirectory && (name.endsWith('.ics') || name.endsWith('.ical'))) {
      try {
        events.push(...parseIcsBuffer(entry.getData()));
      } catch (e) {
        console.warn(`Skipping ${entry.entryName}:`, e);
      }
    }
  }

  return events;
}
