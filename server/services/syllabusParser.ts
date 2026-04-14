/**
 * Local syllabus parser — no external API required.
 * Uses regex and heuristics to extract assignments and course info from text.
 */

const MONTH_MAP: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
  april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

const MONTHS_PATTERN = Object.keys(MONTH_MAP).join("|");

const MONTH_DAY_RE = new RegExp(
  `\\b(${MONTHS_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,.]?\\s*(\\d{4}))?\\b`,
  "gi"
);

const SLASH_DATE_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;

const ASSIGNMENT_INDICATORS =
  /\b(due|submit|turn\s+in|deadline|homework|hw\b|h\.w\.|assignment|quiz|exam|test|midterm|final|paper|essay|project|lab\b|laboratory|report|presentation|reading|chapter|discussion|post|exercise|problem\s*set|pset|worksheet)\b/i;

const TYPE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(final\s+exam|midterm\s+exam|midterm\s+test|final\s+test)\b/i, "exam"],
  [/\b(exam|midterm|in.?class\s+(?:test|exam))\b/i, "exam"],
  [/\btest\b/i, "exam"],
  [/\bquiz\b/i, "quiz"],
  [/\b(lab|laboratory)\b/i, "lab"],
  [/\b(final\s+project|group\s+project|capstone|project)\b/i, "project"],
  [/\b(paper|essay|report|write.?up|reflection|response\s+paper)\b/i, "paper"],
  [/\b(presentation|present(?:ation)?|demo)\b/i, "presentation"],
  [/\b(discussion|forum\s+post|board\s+post)\b/i, "discussion"],
  [/\b(reading|chapter)\b/i, "reading"],
  [/\b(homework|hw\b|h\.w\.|problem\s*set|pset|worksheet|exercise|assignment)\b/i, "hw"],
];

export interface Deadline {
  item: string;
  date: string; // YYYY-MM-DD
  type: string;
}

export interface ParsedSyllabus {
  course: {
    name: string | null;
    instructor: string | null;
    term: string | null;
    meeting_times: string | null;
  };
  summary: string;
  deadlines: Deadline[];
  assignments: Array<{
    name: string;
    dueDate: string;
    type: string;
    weight: number;
    maxScore: number;
  }>;
  grade_breakdown: Array<{ category: string; weight: string }>;
  important_policies: string[];
}

function detectType(text: string): string {
  for (const [re, type] of TYPE_PATTERNS) {
    if (re.test(text)) return type;
  }
  return "hw";
}

function inferYear(month: number, day: number, baseYear: number): number {
  const now = new Date();
  const candidate = new Date(baseYear, month - 1, day);
  // If candidate is more than 4 months in the past, bump to next year
  const cutoff = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
  return candidate < cutoff ? baseYear + 1 : baseYear;
}

function toDateString(month: number, day: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractDates(
  line: string,
  baseYear: number
): Array<{ date: string; start: number; end: number }> {
  const results: Array<{ date: string; start: number; end: number }> = [];

  MONTH_DAY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MONTH_DAY_RE.exec(line)) !== null) {
    const month = MONTH_MAP[match[1].toLowerCase()];
    const day = parseInt(match[2]);
    if (!month || isNaN(day) || day < 1 || day > 31) continue;
    let year = match[3] ? parseInt(match[3]) : 0;
    if (year > 0 && year < 100) year += 2000;
    if (!year || year < 2020) year = inferYear(month, day, baseYear);
    results.push({ date: toDateString(month, day, year), start: match.index, end: match.index + match[0].length });
  }

  if (results.length === 0) {
    SLASH_DATE_RE.lastIndex = 0;
    while ((match = SLASH_DATE_RE.exec(line)) !== null) {
      const m = parseInt(match[1]);
      const d = parseInt(match[2]);
      if (m < 1 || m > 12 || d < 1 || d > 31) continue;
      let year = match[3] ? parseInt(match[3]) : 0;
      if (year > 0 && year < 100) year += 2000;
      if (!year || year < 2020) year = inferYear(m, d, baseYear);
      results.push({ date: toDateString(m, d, year), start: match.index, end: match.index + match[0].length });
    }
  }

  return results;
}

function extractNameFromLine(line: string, dateStart: number, dateEnd: number): string {
  const before = line.substring(0, dateStart).replace(/[-–—|:,\s]+(due|by|on|deadline|date|assigned)?\s*$/i, "").trim();
  const after = line.substring(dateEnd).replace(/^[\s:,\-–—|]*(due|by|on|deadline|date|assigned)?[\s:,\-–—|]*/i, "").trim();

  const strip = (s: string) => s.replace(/\(?\d+(?:\.\d+)?\s*%\)?/g, "").replace(/\s+/g, " ").trim();
  const clean = [strip(before), strip(after)].filter(
    (s) => s.length >= 3 && !/^(week|day|date|time|class|lecture|section|\d+\s*$)/i.test(s)
  );

  if (clean.length === 0) return "";
  return clean.reduce((a, b) => (a.length >= b.length ? a : b));
}

export function parseSyllabusText(rawText: string, baseYear: number = new Date().getFullYear()): ParsedSyllabus {
  const allLines = rawText.split(/\r?\n/).map((l) => l.trim());

  // ── 1. Course info (first 50 lines) ──────────────────────────────────────
  let courseName: string | null = null;
  let instructor: string | null = null;
  let term: string | null = null;
  let meetingTimes: string | null = null;

  for (const line of allLines.slice(0, 50)) {
    if (!line) continue;
    let m: RegExpMatchArray | null;

    if (!courseName && (m = line.match(/^(?:course(?:\s+title)?|class(?:\s+name)?)\s*[:\-–]\s*(.+)/i)))
      courseName = m[1].trim();

    if (!instructor && (m = line.match(/^(?:instructor|professor|prof\.?|teacher|faculty|taught\s+by)\s*[:\-–]\s*(.+)/i)))
      instructor = m[1].trim();

    if (!term) {
      if ((m = line.match(/^(?:semester|term|session|quarter)\s*[:\-–]\s*(.+)/i)))
        term = m[1].trim();
      else if ((m = line.match(/\b(fall|spring|summer|winter)\s+(\d{4})\b/i)))
        term = `${m[1]} ${m[2]}`;
    }

    if (!meetingTimes && (m = line.match(/^(?:meeting\s+times?|class\s+times?|schedule|meets?)\s*[:\-–]\s*(.+)/i)))
      meetingTimes = m[1].trim();

    // MWF/TTH pattern like "MWF 10:00am"
    if (!meetingTimes && /\b[MTWRF]{2,5}\b.*\d{1,2}:\d{2}/.test(line))
      meetingTimes = line;
  }

  // ── 2. Grade breakdown ────────────────────────────────────────────────────
  const grade_breakdown: Array<{ category: string; weight: string }> = [];
  const gradesSeen = new Set<string>();

  for (const line of allLines) {
    if (line.length > 120 || !/\d+\s*%/.test(line)) continue;
    const pctMatch = line.match(/(\d+(?:\.\d+)?)\s*%/);
    if (!pctMatch || parseFloat(pctMatch[1]) < 5) continue;

    const category = line
      .replace(/\d+(?:\.\d+)?\s*%/g, "")
      .replace(/[-–—|:,.()[\]]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (category.length < 2 || category.length > 60) continue;
    const key = category.toLowerCase();
    if (gradesSeen.has(key)) continue;
    gradesSeen.add(key);
    grade_breakdown.push({ category, weight: pctMatch[0].trim() });
  }

  // ── 3. Deadline extraction ────────────────────────────────────────────────
  const deadlines: Deadline[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    if (!line || line.length > 300) continue;

    const dates = extractDates(line, baseYear);
    if (dates.length === 0) continue;

    const context = [
      allLines[i - 2] ?? "",
      allLines[i - 1] ?? "",
      line,
      allLines[i + 1] ?? "",
      allLines[i + 2] ?? "",
    ].join(" ");

    if (!ASSIGNMENT_INDICATORS.test(context)) continue;

    for (const { date, start, end } of dates) {
      let name = extractNameFromLine(line, start, end);

      // If nothing on this line, try adjacent lines
      if (!name) {
        for (const adj of [allLines[i - 1] ?? "", allLines[i + 1] ?? ""]) {
          if (adj && ASSIGNMENT_INDICATORS.test(adj) && extractDates(adj, baseYear).length === 0) {
            name = adj.replace(/[-–—|:,]+$/, "").trim();
            break;
          }
        }
      }

      if (!name || name.length < 2 || /^\d+$/.test(name)) continue;
      name = name.replace(/^(due|deadline|by|on|submit)[:\s]+/i, "").replace(/\s+/g, " ").trim();
      if (name.length < 2) continue;

      const key = `${name.toLowerCase()}|${date}`;
      if (seen.has(key)) continue;
      seen.add(key);

      deadlines.push({ item: name, date, type: detectType(name + " " + context) });
    }
  }

  // ── 4. Build dated assignments list (for upload route) ───────────────────
  const assignments = deadlines.map((d) => ({
    name: d.item,
    dueDate: `${d.date}T23:59:59.000Z`,
    type: d.type,
    weight: 0,
    maxScore: 100,
  }));

  // ── 5. Summary (first meaningful paragraph) ──────────────────────────────
  const summaryLines: string[] = [];
  for (const line of allLines.slice(0, 80)) {
    if (!line || line.length < 25) continue;
    if (/^(course|instructor|professor|semester|term|office|email|phone|room|credits?|units?|section)[\s:]/i.test(line)) continue;
    summaryLines.push(line);
    if (summaryLines.length >= 3) break;
  }

  return {
    course: { name: courseName, instructor, term, meeting_times: meetingTimes },
    summary: summaryLines.join(" ").substring(0, 500),
    deadlines,
    assignments,
    grade_breakdown,
    important_policies: [],
  };
}
