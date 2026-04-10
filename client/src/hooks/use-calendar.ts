import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export interface CalendarEvent {
  id: number;
  title: string;
  type: string;
  dueDate: string;
  courseId: number;
  courseName: string;
  courseCode: string;
  weight: number;
}

export function useCalendarEvents() {
  return useQuery<CalendarEvent[]>({
    queryKey: [api.calendar.events.path],
  });
}

export function downloadIcal() {
  const link = document.createElement("a");
  link.href = api.calendar.ical.path;
  link.download = "syllabussync.ics";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Generate a Google Calendar "Add Event" URL for a single event
export function getGoogleCalendarUrl(event: CalendarEvent): string {
  const dt = new Date(event.dueDate);
  const format = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(".000", "") + "Z";
  const end = new Date(dt.getTime() + 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${event.title} - ${event.courseCode}`,
    dates: `${format(dt)}/${format(end)}`,
    details: `${event.type} | ${event.courseName} | Weight: ${event.weight}%`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
