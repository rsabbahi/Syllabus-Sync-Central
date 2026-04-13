import { createRequire } from 'module';
// CJS-safe require: import.meta.url works in ESM dev, but esbuild empties it
// when bundling to CJS. Fallback to __filename (available in CJS) or cwd.
const _requireUrl = typeof import.meta?.url === "string" && import.meta.url
  ? import.meta.url
  : (typeof __filename !== "undefined" ? `file://${__filename}` : `file://${process.cwd()}/server/services/calendar/icsParser.ts`);
const require = createRequire(_requireUrl);
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
 * Map Windows/Outlook timezone IDs to IANA equivalents.
 * node-ical falls back to UTC when it can't resolve a TZID.
 * Pre-processing the ICS content fixes the timezone before parsing.
 */
const WINDOWS_TZ_MAP: Record<string, string> = {
  'Eastern Standard Time': 'America/New_York',
  'Eastern Daylight Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Central Daylight Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Mountain Daylight Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Pacific Daylight Time': 'America/Los_Angeles',
  'Alaskan Standard Time': 'America/Anchorage',
  'Hawaii-Aleutian Standard Time': 'Pacific/Honolulu',
  'Atlantic Standard Time': 'America/Halifax',
  'GMT Standard Time': 'Europe/London',
  'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest',
  'W. Europe Standard Time': 'Europe/Berlin',
  'E. Europe Standard Time': 'Europe/Nicosia',
  'Russia Time Zone 3': 'Europe/Moscow',
  'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'India Standard Time': 'Asia/Calcutta',
  'Arabian Standard Time': 'Asia/Dubai',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'New Zealand Standard Time': 'Pacific/Auckland',
};

/**
 * Replace Windows timezone IDs in ICS content with IANA equivalents
 * so node-ical can resolve them correctly.
 */
function normalizeTimezones(content: string): string {
  return content.replace(/TZID=([^\r\n:;]+)/g, (match, tzid) => {
    const trimmed = tzid.trim();
    const ianaName = WINDOWS_TZ_MAP[trimmed];
    return ianaName ? `TZID=${ianaName}` : match;
  });
}

/**
 * Safely extract a plain string from any value node-ical might return.
 * node-ical can hand back plain strings, parameterised objects, nested objects, or arrays.
 */
function extractText(val: any): string {
  if (!val && val !== 0) return '';
  if (typeof val === 'string') return val.trim();
  if (Array.isArray(val)) return extractText(val[0]);
  if (typeof val === 'object' && val !== null) {
    if ('val' in val) return extractText(val.val);
    if ('value' in val) return extractText(val.value);
    for (const k of Object.keys(val)) {
      if (k === 'params' || k === 'type') continue;
      if (typeof val[k] === 'string' && val[k].length > 0) return val[k].trim();
    }
  }
  const s = String(val);
  return s === '[object Object]' ? '' : s.trim();
}

/**
 * Expand a single VEVENT into one or more NormalizedEvents.
 * For recurring events (RRULE present), expands all occurrences across
 * a 3-year window (2 years back to 2 years forward) to cover any semester.
 * Each occurrence gets a unique externalId based on UID + occurrence start date.
 */
function expandEvent(event: any): NormalizedEvent[] {
  const title = extractText(event.summary) || 'Untitled Event';
  const baseUid = extractText(event.uid) || `${title}:${event.start}`;
  const description = extractText(event.description) || null;
  const location = extractText(event.location) || null;

  if (event.rrule) {
    // Expand recurring event across a wide window to cover any semester
    const now = new Date();
    const from = new Date(now.getFullYear() - 1, 0, 1);  // Jan 1 last year
    const to   = new Date(now.getFullYear() + 2, 11, 31); // Dec 31 two years out

    let occurrences: any[] = [];
    try {
      occurrences = ical.expandRecurringEvent(event, { from, to, includeOverrides: true, excludeExdates: true });
    } catch (e) {
      console.warn('Failed to expand recurring event:', baseUid, e);
      // Fall back to single occurrence
      occurrences = [];
    }

    if (occurrences.length === 0) {
      // Fallback: use the base DTSTART as a single event
      const start = new Date(event.start);
      if (isNaN(start.getTime())) return [];
      return [{
        externalId: baseUid,
        title,
        startDate: start,
        endDate: event.end ? new Date(event.end) : null,
        description,
        location,
      }];
    }

    return occurrences.map((occ: any) => {
      const start = new Date(occ.start);
      const end   = occ.end ? new Date(occ.end) : null;
      // Build a unique ID per occurrence using the start ISO date
      const occId = `${baseUid}_${start.toISOString().slice(0, 16)}`;
      return {
        externalId: occId,
        title: extractText(occ.summary) || title,
        startDate: start,
        endDate: end && !isNaN(end.getTime()) ? end : null,
        description: extractText(occ.description) || description,
        location:    extractText(occ.location)    || location,
      };
    }).filter(e => !isNaN(e.startDate.getTime()));
  }

  // Non-recurring event
  const rawStart = event.start;
  if (!rawStart) return [];
  const start = new Date(rawStart);
  if (isNaN(start.getTime())) return [];

  if (event.datetype === 'date') {
    start.setHours(23, 59, 59, 0);
  }

  const rawEnd = event.end;
  const end = rawEnd ? new Date(rawEnd) : null;

  return [{
    externalId: baseUid,
    title,
    startDate: start,
    endDate: end && !isNaN(end.getTime()) ? end : null,
    description,
    location,
  }];
}

export function parseIcsBuffer(buffer: Buffer): NormalizedEvent[] {
  const raw = buffer.toString('utf8');
  const content = normalizeTimezones(raw);

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
    events.push(...expandEvent(event));
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
