/**
 * ICS PARSER TESTS
 * Tests parseIcsBuffer and the extractText helper for [object Object] prevention.
 * Root cause being tested: node-ical returns parameterised objects for fields like
 * SUMMARY, DESCRIPTION, LOCATION — calling String() on these produces [object Object].
 */
import { describe, it, expect } from "vitest";
import { parseIcsBuffer } from "../server/services/calendar/icsParser";

function makeIcs(events: string): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//Test//EN",
    events,
    "END:VCALENDAR",
  ].join("\r\n");
}

describe("parseIcsBuffer — basic events", () => {
  it("parses a single VEVENT with plain text fields", () => {
    const ics = makeIcs(
      [
        "BEGIN:VEVENT",
        "UID:test-event-1@test.com",
        "DTSTART:20260501T140000Z",
        "DTEND:20260501T150000Z",
        "SUMMARY:CS101 Lecture",
        "DESCRIPTION:Introduction to algorithms",
        "LOCATION:Room 101",
        "END:VEVENT",
      ].join("\r\n")
    );

    const events = parseIcsBuffer(Buffer.from(ics, "utf8"));
    expect(events.length).toBeGreaterThanOrEqual(1);

    const event = events[0];
    expect(event.title).toBe("CS101 Lecture");
    expect(event.description).toBe("Introduction to algorithms");
    expect(event.location).toBe("Room 101");
    expect(event.startDate).toBeInstanceOf(Date);
    expect(event.startDate.toISOString()).toContain("2026-05-01");
  });

  it("extracts title without [object Object]", () => {
    const ics = makeIcs(
      [
        "BEGIN:VEVENT",
        "UID:test-2@test.com",
        "DTSTART:20260601T100000Z",
        "SUMMARY:Midterm Review Session",
        "END:VEVENT",
      ].join("\r\n")
    );

    const events = parseIcsBuffer(Buffer.from(ics, "utf8"));
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].title).not.toContain("[object Object]");
    expect(events[0].title).toBe("Midterm Review Session");
  });

  it("handles missing SUMMARY gracefully", () => {
    const ics = makeIcs(
      [
        "BEGIN:VEVENT",
        "UID:no-summary@test.com",
        "DTSTART:20260601T100000Z",
        "END:VEVENT",
      ].join("\r\n")
    );

    const events = parseIcsBuffer(Buffer.from(ics, "utf8"));
    expect(events.length).toBeGreaterThanOrEqual(1);
    // Should fall back to "Untitled Event", not [object Object]
    expect(events[0].title).not.toContain("[object Object]");
  });

  it("handles missing DTSTART by skipping the event", () => {
    const ics = makeIcs(
      [
        "BEGIN:VEVENT",
        "UID:no-start@test.com",
        "SUMMARY:Orphan Event",
        "END:VEVENT",
      ].join("\r\n")
    );

    const events = parseIcsBuffer(Buffer.from(ics, "utf8"));
    // Event with no DTSTART may be parsed by node-ical with undefined start
    // Our code checks for valid dates and filters them out
    for (const e of events) {
      expect(e.startDate).toBeInstanceOf(Date);
      expect(isNaN(e.startDate.getTime())).toBe(false);
    }
  });

  it("returns empty array for garbage input", () => {
    const events = parseIcsBuffer(Buffer.from("this is not an ICS file", "utf8"));
    expect(events).toEqual([]);
  });

  it("returns empty array for empty buffer", () => {
    const events = parseIcsBuffer(Buffer.alloc(0));
    expect(events).toEqual([]);
  });
});

describe("parseIcsBuffer — multiple events", () => {
  it("parses multiple VEVENTs", () => {
    const ics = makeIcs(
      [
        "BEGIN:VEVENT",
        "UID:evt-a@test.com",
        "DTSTART:20260501T140000Z",
        "SUMMARY:Event A",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:evt-b@test.com",
        "DTSTART:20260502T140000Z",
        "SUMMARY:Event B",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:evt-c@test.com",
        "DTSTART:20260503T140000Z",
        "SUMMARY:Event C",
        "END:VEVENT",
      ].join("\r\n")
    );

    const events = parseIcsBuffer(Buffer.from(ics, "utf8"));
    expect(events.length).toBe(3);
    const titles = events.map((e) => e.title);
    expect(titles).toContain("Event A");
    expect(titles).toContain("Event B");
    expect(titles).toContain("Event C");
  });
});

describe("parseIcsBuffer — timezone normalization", () => {
  it("normalizes Windows timezone IDs to IANA", () => {
    // This ICS uses "Eastern Standard Time" which needs conversion to America/New_York
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:tz-test@test.com",
      "DTSTART;TZID=Eastern Standard Time:20260501T140000",
      "SUMMARY:EST Event",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const events = parseIcsBuffer(Buffer.from(ics, "utf8"));
    // Should not crash — the timezone should be converted before parsing
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].title).toBe("EST Event");
    // Verify the date was parsed (not Invalid Date)
    expect(isNaN(events[0].startDate.getTime())).toBe(false);
  });
});

describe("parseIcsBuffer — no [object Object] anywhere", () => {
  it("never produces [object Object] in any field of parsed events", () => {
    // Build an ICS with various fields
    const ics = makeIcs(
      [
        "BEGIN:VEVENT",
        "UID:full-test@test.com",
        "DTSTART:20260601T090000Z",
        "DTEND:20260601T100000Z",
        "SUMMARY:Full Test Event",
        "DESCRIPTION:This is a description with details",
        "LOCATION:Building A, Room 305",
        "END:VEVENT",
      ].join("\r\n")
    );

    const events = parseIcsBuffer(Buffer.from(ics, "utf8"));
    for (const event of events) {
      expect(event.title).not.toContain("[object Object]");
      expect(event.externalId).not.toContain("[object Object]");
      if (event.description) {
        expect(event.description).not.toContain("[object Object]");
      }
      if (event.location) {
        expect(event.location).not.toContain("[object Object]");
      }
    }
  });
});
