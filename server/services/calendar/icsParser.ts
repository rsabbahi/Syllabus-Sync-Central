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
 * node-ical sometimes returns text fields as { val: string, params: {...} }
 * when the ICS property has parameters (e.g. SUMMARY;LANGUAGE=en:CS 101 Exam).
 * This helper safely extracts the plain string value in either case.
 */
function extractText(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'object' && val !== null && 'val' in val)
    return String(val.val).trim();
  return String(val).trim();
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

    const uid = String(event.uid || `${extractText(event.summary) || 'event'}:${start.toISOString()}`);

    events.push({
      externalId: uid,
      title: extractText(event.summary) || 'Untitled Event',
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
    if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.ics')) {
      try {
        events.push(...parseIcsBuffer(entry.getData()));
      } catch (e) {
        console.warn(`Skipping ${entry.entryName}:`, e);
      }
    }
  }

  return events;
}
