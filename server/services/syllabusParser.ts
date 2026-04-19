/**
 * Local syllabus parser — no external API required.
 *
 * Strategy: multiple targeted regex passes over the raw text, each tuned
 * for a specific kind of information (course code, instructor, section,
 * overview paragraph, grade weights, dated tasks). No single pattern is
 * expected to match every syllabus — each pass has fallbacks and the
 * overall result is assembled from whichever passes succeed.
 */

// ── Date constants ───────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const MONTHS_PATTERN = Object.keys(MONTH_MAP).join("|");
const WEEKDAY_PATTERN =
  "mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?";

// "January 5", "Jan. 5th", "Feb 9, 2026", optionally preceded by a weekday
const MONTH_DAY_RE = new RegExp(
  `\\b(?:(?:${WEEKDAY_PATTERN})[,.]?\\s+)?(${MONTHS_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,.]?\\s*(\\d{4}))?\\b`,
  "gi"
);

// "20-Jan", "9-Feb" — common in schedule tables (PY211)
const DAY_MONTH_RE = new RegExp(
  `\\b(\\d{1,2})[\\-\\u2013](${MONTHS_PATTERN})\\b`,
  "gi"
);

// "1/26", "01/05/2026", "3/5/26"
const SLASH_DATE_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;

// ── Task / assignment vocabulary ─────────────────────────────────────────────

const ASSIGNMENT_INDICATORS =
  /\b(due|submit|turn\s+in|deadline|homework|hw\d*|h\.w\.|assignment|quiz\d*|exam\d*|test|midterm\d*|final(?:\s+exam)?|paper|essay|project|lab\d*|laboratory|report|presentation|reading|chapter|discussion|post|exercise|problem\s*set|pset|worksheet|mylab)\b/i;

const TYPE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(final\s+exam|final\s+test|cumulative\s+final)\b/i, "exam"],
  [/\b(midterm\d*|mid-?term)\b/i, "exam"],
  [/\b(exam\d*|in.?class\s+(?:test|exam))\b/i, "exam"],
  [/\btest\b/i, "exam"],
  [/\bquiz\d*\b/i, "quiz"],
  [/\b(lab\d*|laboratory|pre.?lab)\b/i, "lab"],
  [/\b(final\s+project|group\s+project|capstone|project)\b/i, "project"],
  [/\b(paper|essay|write.?up|reflection|response\s+paper)\b/i, "paper"],
  [/\b(presentation|present(?:ation)?|demo)\b/i, "presentation"],
  [/\b(discussion|forum\s+post|board\s+post)\b/i, "discussion"],
  [/\b(reading|chapter)\b/i, "reading"],
  [/\b(homework|hw\d*|h\.w\.|problem\s*set|pset|worksheet|exercise|mylab|assignment)\b/i, "hw"],
];

// ── Exported types ───────────────────────────────────────────────────────────

export interface Deadline {
  item: string;
  date: string; // YYYY-MM-DD
  type: string;
}

export interface ParsedSyllabus {
  course: {
    name: string | null;
    section: string | null;
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

// ── Utilities ────────────────────────────────────────────────────────────────

function detectType(text: string): string {
  for (const [re, type] of TYPE_PATTERNS) {
    if (re.test(text)) return type;
  }
  return "hw";
}

function inferYear(month: number, day: number, baseYear: number): number {
  const now = new Date();
  const candidate = new Date(baseYear, month - 1, day);
  // If candidate is more than 4 months in the past, assume it's next year's term.
  const cutoff = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
  return candidate < cutoff ? baseYear + 1 : baseYear;
}

function toDateString(month: number, day: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

interface DateMatch {
  date: string;
  start: number;
  end: number;
  raw: string;
}

function extractDates(line: string, baseYear: number): DateMatch[] {
  const results: DateMatch[] = [];
  const claimed: Array<[number, number]> = [];
  const overlaps = (a: number, b: number) =>
    claimed.some(([s, e]) => a < e && b > s);

  const tryPush = (m: {
    month: number;
    day: number;
    year?: number;
    start: number;
    end: number;
    raw: string;
  }) => {
    if (m.month < 1 || m.month > 12 || m.day < 1 || m.day > 31) return;
    if (overlaps(m.start, m.end)) return;
    let year = m.year ?? 0;
    if (year > 0 && year < 100) year += 2000;
    if (!year || year < 2000) year = inferYear(m.month, m.day, baseYear);
    results.push({
      date: toDateString(m.month, m.day, year),
      start: m.start,
      end: m.end,
      raw: m.raw,
    });
    claimed.push([m.start, m.end]);
  };

  let match: RegExpExecArray | null;

  MONTH_DAY_RE.lastIndex = 0;
  while ((match = MONTH_DAY_RE.exec(line)) !== null) {
    tryPush({
      month: MONTH_MAP[match[1].toLowerCase()],
      day: parseInt(match[2], 10),
      year: match[3] ? parseInt(match[3], 10) : undefined,
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
    });
  }

  DAY_MONTH_RE.lastIndex = 0;
  while ((match = DAY_MONTH_RE.exec(line)) !== null) {
    tryPush({
      month: MONTH_MAP[match[2].toLowerCase()],
      day: parseInt(match[1], 10),
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
    });
  }

  SLASH_DATE_RE.lastIndex = 0;
  while ((match = SLASH_DATE_RE.exec(line)) !== null) {
    tryPush({
      month: parseInt(match[1], 10),
      day: parseInt(match[2], 10),
      year: match[3] ? parseInt(match[3], 10) : undefined,
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
    });
  }

  return results.sort((a, b) => a.start - b.start);
}

function cleanSnippet(s: string): string {
  return s
    .replace(/\(?\s*\d+(?:\.\d+)?\s*%\s*\)?/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s•·\-–—|:,.;]+/g, "")
    .replace(/[\s•·\-–—|:,.;]+$/g, "")
    .trim();
}

// Positive-signal task words. A dated line is kept only if its extracted
// name contains one of these — this filters out schedule noise like lecture
// topics, holidays, or administrative rows that happen to have dates.
const STRONG_TASK_KEYWORDS_RE =
  /\b(quiz\d*|exam\d*|midterm\d*|final(?:\s+exam)?|homework|hw\d*|h\.w\.|assignment|project|paper|essay|report|presentation|due|deadline|submit|problem\s*set|pset|worksheet|lab\d*|pre.?lab|mylab|prelab|reading|chapter\s+\d+)\b/i;

/**
 * Given a line that contains a date, extract the likely task name by taking
 * the non-date portion (before or after, whichever is longer and meaningful).
 */
function extractNameFromLine(line: string, dateStart: number, dateEnd: number): string {
  const before = cleanSnippet(
    line.substring(0, dateStart).replace(/\b(due|by|on|deadline|date|assigned)\s*$/i, "")
  );
  const after = cleanSnippet(
    line
      .substring(dateEnd)
      .replace(/^\s*(due|by|on|deadline|date|assigned)\b/i, "")
      .replace(/\b\d{1,2}(?::\d{2})?\s*[ap]m\b.*$/i, "") // strip trailing "11:59 pm ..."
  );

  const usable = [before, after].filter(
    (s) =>
      s.length >= 2 &&
      !/^(week|day|date|time|class|lecture|section|\d+)\s*$/i.test(s)
  );

  if (usable.length === 0) return "";
  // Prefer the side that actually mentions an assignment keyword.
  const withKw = usable.find((s) => ASSIGNMENT_INDICATORS.test(s));
  if (withKw) return withKw;
  return usable.reduce((a, b) => (a.length >= b.length ? a : b));
}

// ── Course code / name ───────────────────────────────────────────────────────

// Matches patterns like "PY 211", "MA 124", "Math 124", "ENG EK 125",
// "WR 152", "CS101", "BIO-210". First token allows title-case ("Math")
// as well as all-caps abbreviations ("PY", "ENG", "WR").
const COURSE_CODE_RE =
  /\b([A-Z][A-Za-z]{1,4}(?:\s+[A-Z]{1,4})?\s*[-\s]?\s*\d{2,4}[A-Z]?)\b/;

const NON_TITLE_NOISE =
  /\b(syllabus\s+page|page\s+\d|textbook|purchasing|prerequisite|instructor|professor|office\s+hours?|email|phone|description|overview|grading|assignment|homework|midterm|final|quiz|contact|website|due|deadline)\b/i;

function extractCourseHeader(
  headerLines: string[]
): { name: string | null; code: string | null } {
  // First pass: explicit label.
  for (const line of headerLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 160) continue;
    const labeled = trimmed.match(
      /^(?:course\s*(?:title|name)?|class(?:\s+name)?)\s*[:\-–]\s*(.+)$/i
    );
    if (labeled) {
      const val = labeled[1].trim();
      const codeMatch = val.match(COURSE_CODE_RE);
      return { name: val, code: codeMatch ? codeMatch[1].trim() : null };
    }
  }

  // Second pass: a line that contains a course code and reads like a title.
  // Prefer the first one that is not obviously a footer/table-header/sentence.
  for (const line of headerLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 140) continue;
    const codeMatch = trimmed.match(COURSE_CODE_RE);
    if (!codeMatch) continue;
    if (NON_TITLE_NOISE.test(trimmed)) continue;
    // Skip footer-style "PY211 Syllabus Page 1".
    if (/^\S+\s+syllabus\s+page\s+\d+/i.test(trimmed)) continue;

    const cleaned = trimmed
      .replace(/\(all\s+subject\s+to\s+change\)/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return { name: cleaned, code: codeMatch[1].trim() };
  }

  return { name: null, code: null };
}

// ── Section ─────────────────────────────────────────────────────────────────

function extractSection(lines: string[]): string | null {
  for (const line of lines) {
    const m = line.match(
      /^\s*(?:section|sec|lec(?:ture)?)\s*[:\-–#]?\s*([A-Z]?\d{1,3}[A-Z]?)\b/i
    );
    if (m) return m[1].toUpperCase();
  }
  // Fallback: first token looking like "A1", "B2", "002" at start of a line,
  // followed by a day/time hint (MWF, TR, Mon, etc.) — common in section tables.
  for (const line of lines) {
    const m = line.match(
      /^\s*([A-Z]\d{1,2}|\d{3})\b[\s\-–]+(?:M|T|W|R|F|Th|Tu|Mon|Tue|Wed|Thu|Fri|MWF|TR|TTh)/
    );
    if (m) return m[1].toUpperCase();
  }
  return null;
}

// ── Instructor ───────────────────────────────────────────────────────────────

const INSTRUCTOR_LABEL_RE =
  /^\s*(?:instructors?|professors?|prof\.?|teachers?|faculty|taught\s+by|lecturers?|instructor\s+name(?:\s+and\s+pronouns)?)\s*[:\-–]\s*(.+)$/i;

// "Prof. Frank Golf", "Dr. Jessica Kent" — requires the name to start with a
// real given name (≥2 letters) and be followed by another capitalized word,
// which rules out "Prof. Contact Info." (Contact=word but single-token) and
// "Professor Information" (also single-token after title).
const NAME_WITH_TITLE_RE =
  /\b(Prof(?:essor)?\.?|Dr\.?|Mr\.?|Ms\.?|Mrs\.?|Mx\.?)\s+([A-Z][a-zA-Z.'\-]{1,}(?:\s+[A-Z][a-zA-Z.'\-]{1,}){1,3})/g;

// "Robert Jencks A1 lecturer jencksr at bu.edu" — the real name is somewhere
// on a line that also contains an email-like token; we find the email first,
// then scan the whole line for 2–3 Title-Case tokens (hyphens and
// parenthetical nicknames allowed).
const EMAIL_LIKE_RE = /([\w.\-]+@[\w.\-]+\.[a-z]{2,}|\b[a-z][\w.\-]*\s+at\s+[a-z][\w.\-]+\.[a-z]{2,})/i;

// [A-Z][a-z][\w'\-.]*  →  "Robert", "Wei-Lun", "McBride"
// Excludes "A1" (digit after uppercase) — requires a lowercase letter
// immediately after the leading uppercase, which is the key signal.
const TITLE_CASE_NAME_RE =
  /\b([A-Z][a-z][\w'\-.]*(?:\s+\([^)]+\))?(?:\s+[A-Z][a-z][\w'\-.]*){1,3})\b/g;

// Phrases that look like names at first glance but are actually table headers
// or generic labels. Used to filter extracted candidates.
const NAME_NOISE = /\b(contact|info(?:rmation)?|name|role|email|office|phone|hours?|number|days?|time|location|pronouns|presentation|room|building)\b/i;

function normName(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractInstructors(lines: string[]): string | null {
  const found = new Set<string>();

  for (const line of lines) {
    const labelMatch = line.match(INSTRUCTOR_LABEL_RE);
    if (!labelMatch) continue;
    const val = labelMatch[1].trim();

    // Prefer title+name inside the value.
    NAME_WITH_TITLE_RE.lastIndex = 0;
    let tm: RegExpExecArray | null;
    let titledCount = 0;
    while ((tm = NAME_WITH_TITLE_RE.exec(val)) !== null) {
      const candidate = normName(`${tm[1]} ${tm[2]}`);
      if (!NAME_NOISE.test(candidate)) {
        found.add(candidate);
        titledCount++;
      }
    }
    if (titledCount > 0) continue;

    // Otherwise keep the raw value if it looks like a plausible name.
    const cleaned = val
      .replace(/\([^)]*\)/g, "")
      .replace(/\S+@\S+/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (cleaned && cleaned.length >= 3 && cleaned.length <= 80 && !NAME_NOISE.test(cleaned)) {
      found.add(cleaned);
    }
  }

  // Pass 2 — titled names anywhere in the first 120 lines.
  for (const line of lines.slice(0, 120)) {
    NAME_WITH_TITLE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NAME_WITH_TITLE_RE.exec(line)) !== null) {
      const candidate = normName(`${m[1]} ${m[2]}`);
      if (NAME_NOISE.test(candidate)) continue;
      found.add(candidate);
    }
    if (found.size >= 6) break;
  }

  // Pass 3 — any line that contains an email-like token likely has a name
  // next to it. Extract the first Title-Case name pattern from the line.
  if (found.size === 0) {
    for (const line of lines.slice(0, 220)) {
      if (!EMAIL_LIKE_RE.test(line)) continue;
      TITLE_CASE_NAME_RE.lastIndex = 0;
      const m = TITLE_CASE_NAME_RE.exec(line);
      if (!m) continue;
      const candidate = normName(m[1]);
      if (NAME_NOISE.test(candidate)) continue;
      if (candidate.split(/\s+/).length < 2) continue;
      found.add(candidate);
      if (found.size >= 6) break;
    }
  }

  if (found.size === 0) return null;
  return Array.from(found).slice(0, 4).join(", ");
}

// ── Term ─────────────────────────────────────────────────────────────────────

function extractTerm(lines: string[]): string | null {
  for (const line of lines.slice(0, 60)) {
    const labeled = line.match(/^\s*(?:semester|term|session|quarter)\s*[:\-–]\s*(.+)/i);
    if (labeled) return labeled[1].trim();
    const seasonal = line.match(/\b(fall|spring|summer|winter)\s+(\d{4})\b/i);
    if (seasonal) return `${seasonal[1][0].toUpperCase()}${seasonal[1].slice(1).toLowerCase()} ${seasonal[2]}`;
  }
  return null;
}

// ── Meeting times ───────────────────────────────────────────────────────────

function extractMeetingTimes(lines: string[]): string | null {
  for (const line of lines) {
    const labeled = line.match(
      /^\s*(?:meeting\s+times?|class\s+times?|course\s+days?\s+and\s+times?|schedule|meets?)\s*[:\-–]\s*(.+)/i
    );
    if (labeled) return labeled[1].trim();
  }
  for (const line of lines.slice(0, 60)) {
    if (/\b(MWF|TR|TTh|MW|WF)\b.*\d{1,2}:\d{2}/i.test(line)) return line.trim();
  }
  return null;
}

// ── Overview / description paragraph ─────────────────────────────────────────

const OVERVIEW_LABEL_RE =
  /^\s*(course\s+description|course\s+overview|course\s+summary|course\s+material|description|overview|about\s+this\s+course)\s*[:\-–]?\s*(.*)$/i;

function extractOverview(lines: string[]): string {
  // 1. Labeled paragraph: collect continuation lines until blank or next label.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(OVERVIEW_LABEL_RE);
    if (!m) continue;
    const parts: string[] = [];
    if (m[2]) parts.push(m[2]);
    for (let j = i + 1; j < Math.min(lines.length, i + 20); j++) {
      const next = lines[j].trim();
      if (!next) {
        if (parts.length > 0) break;
        continue;
      }
      // Stop at what looks like another labeled section header.
      if (/^[A-Z][A-Za-z ]{2,40}:\s*$/.test(next)) break;
      if (/^(course\s+objectives|learning\s+outcomes|textbook|grading|prerequisites|instructor|professor|office\s+hours|meeting\s+times)/i.test(next)) break;
      parts.push(next);
      if (parts.join(" ").length > 800) break;
    }
    const joined = parts.join(" ").replace(/\s+/g, " ").trim();
    if (joined.length >= 30) return joined.substring(0, 1000);
  }

  // 2. Fallback: first meaningful paragraph of reasonable length.
  for (const line of lines.slice(0, 80)) {
    if (!line || line.length < 60) continue;
    if (/^(course|instructor|professor|semester|term|office|email|phone|room|credits?|units?|section)[\s:]/i.test(line)) continue;
    return line.substring(0, 1000);
  }
  return "";
}

// ── Grade breakdown ──────────────────────────────────────────────────────────

function extractGradeBreakdown(lines: string[]): Array<{ category: string; weight: string }> {
  const out: Array<{ category: string; weight: string }> = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (line.length > 140 || !/\d+\s*%/.test(line)) continue;
    // Skip what reads like prose rather than a grade-table row.
    if (/\b(grade|curve|if|because|when|will|must|may|should|can|is|are|final\s+grade)\b.*\d+\s*%/i.test(line) && line.length > 80) continue;
    const pctMatch = line.match(/(\d+(?:\.\d+)?)\s*%/);
    if (!pctMatch) continue;
    const pct = parseFloat(pctMatch[1]);
    if (pct < 1 || pct > 100) continue;

    const category = line
      .replace(/\d+(?:\.\d+)?\s*%/g, "")
      .replace(/[-–—|:,.()[\]]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (category.length < 2 || category.length > 80) continue;
    // Common noise words that indicate this line is a sentence, not a row.
    if (/\b(of\s+the\s+final|account\s+for|passing\s+average)\b/i.test(category)) continue;
    const key = category.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ category, weight: `${pctMatch[1]}%` });
  }
  return out;
}

// ── Deadline / task extraction ──────────────────────────────────────────────

function extractDeadlines(lines: string[], baseYear: number): Deadline[] {
  const deadlines: Deadline[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length > 400) continue;

    const dates = extractDates(line, baseYear);
    if (dates.length === 0) continue;

    const contextWindow = [
      lines[i - 1] ?? "",
      line,
      lines[i + 1] ?? "",
    ].join(" ");

    if (!ASSIGNMENT_INDICATORS.test(contextWindow)) continue;

    // Per-line dedupe so a date range ("1/26 - 1/30 Lab 1") only produces
    // one entry rather than duplicating the task for each endpoint.
    const emittedInThisLine = new Set<string>();

    for (const d of dates) {
      let name = extractNameFromLine(line, d.start, d.end);

      // Fallback: adjacent line with the keyword but no date of its own.
      if (!name || !STRONG_TASK_KEYWORDS_RE.test(name)) {
        for (const adj of [lines[i - 1] ?? "", lines[i + 1] ?? ""]) {
          if (
            adj &&
            STRONG_TASK_KEYWORDS_RE.test(adj) &&
            extractDates(adj, baseYear).length === 0
          ) {
            const candidate = cleanSnippet(adj);
            if (candidate.length >= 3) {
              name = candidate;
              break;
            }
          }
        }
      }

      if (!name) continue;
      // Strip any residual dates left over from date ranges like "1/26 - 1/30".
      name = name
        .replace(MONTH_DAY_RE, "")
        .replace(DAY_MONTH_RE, "")
        .replace(SLASH_DATE_RE, "");
      MONTH_DAY_RE.lastIndex = 0;
      DAY_MONTH_RE.lastIndex = 0;
      SLASH_DATE_RE.lastIndex = 0;

      name = name
        .replace(/^(due|deadline|by|on|submit)[:\s]+/i, "")
        .replace(/[()\[\]]+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/^[\s•·\-–—|:,.;]+/, "")
        .replace(/[\s•·\-–—|:,.;]+$/, "")
        .trim();

      if (name.length < 3 || name.length > 70) continue;
      if (/^\d+$/.test(name)) continue;
      // Real task names are capitalized; prose excerpts usually start lowercase.
      if (/^[a-z]/.test(name)) continue;
      // Must look like a real task, not a lecture topic or holiday row.
      if (!STRONG_TASK_KEYWORDS_RE.test(name)) continue;

      const lineKey = name.toLowerCase();
      if (emittedInThisLine.has(lineKey)) continue;
      emittedInThisLine.add(lineKey);

      const key = `${lineKey}|${d.date}`;
      if (seen.has(key)) continue;
      seen.add(key);

      deadlines.push({
        item: name,
        date: d.date,
        type: detectType(name + " " + contextWindow),
      });
    }
  }

  return deadlines;
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function parseSyllabusText(
  rawText: string,
  baseYear: number = new Date().getFullYear()
): Promise<ParsedSyllabus> {
  const allLines = rawText.split(/\r?\n/).map((l) => l.trim());
  const headerLines = allLines.slice(0, 40).filter((l) => l.length > 0);

  const { name: courseName, code: courseCode } = extractCourseHeader(headerLines);
  const section = extractSection(allLines.slice(0, 120));
  const instructor = extractInstructors(allLines);
  const term = extractTerm(allLines);
  const meetingTimes = extractMeetingTimes(allLines);
  const summary = extractOverview(allLines);
  const grade_breakdown = extractGradeBreakdown(allLines);
  const deadlines = extractDeadlines(allLines, baseYear);

  const assignments = deadlines.map((d) => ({
    name: d.item,
    dueDate: `${d.date}T23:59:59.000Z`,
    type: d.type,
    weight: 0,
    maxScore: 100,
  }));

  // Touching courseCode only to keep the variable useful for future callers
  // — fold it into the name when the name doesn't already include it.
  const finalName =
    courseName && courseCode && !courseName.includes(courseCode)
      ? `${courseCode} ${courseName}`.trim()
      : courseName;

  console.log(
    `[SyllabusParser] course="${finalName ?? ""}" section="${section ?? ""}" ` +
      `instructor="${instructor ?? ""}" deadlines=${deadlines.length} ` +
      `grades=${grade_breakdown.length}`
  );

  return {
    course: {
      name: finalName,
      section,
      instructor,
      term,
      meeting_times: meetingTimes,
    },
    summary,
    deadlines,
    assignments,
    grade_breakdown,
    important_policies: [],
  };
}
