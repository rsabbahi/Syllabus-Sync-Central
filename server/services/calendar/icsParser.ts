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

    const uid = String(event.uid || `${event.summary || 'event'}:${start.toISOString()}`);

    events.push({
      externalId: uid,
      title: String(event.summary || 'Untitled Event').trim(),
      startDate: start,
      endDate: end && !isNaN(end.getTime()) ? end : null,
      description: event.description ? String(event.description).trim() : null,
      location: event.location ? String(event.location).trim() : null,
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
