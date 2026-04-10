import { useState } from "react";
import { useCalendarEvents, downloadIcal, getGoogleCalendarUrl, CalendarEvent } from "@/hooks/use-calendar";
import { LoadingSpinner } from "@/components/loading";
import { Button } from "@/components/button";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Calendar as CalIcon } from "lucide-react";

const COURSE_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-amber-500",
  "bg-indigo-500",
];

const TYPE_BADGE: Record<string, string> = {
  exam: "bg-red-100 text-red-700",
  hw: "bg-blue-100 text-blue-700",
  quiz: "bg-yellow-100 text-yellow-700",
  paper: "bg-purple-100 text-purple-700",
  project: "bg-orange-100 text-orange-700",
  lab: "bg-green-100 text-green-700",
  reading: "bg-gray-100 text-gray-700",
  lecture: "bg-teal-100 text-teal-700",
  discussion: "bg-pink-100 text-pink-700",
};

export default function Calendar() {
  const { data: events = [], isLoading } = useCalendarEvents();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  if (isLoading) return <LoadingSpinner />;

  // Build course color map
  const courseIds = [...new Set(events.map(e => e.courseId))];
  const courseColorMap: Record<number, string> = {};
  courseIds.forEach((id, i) => {
    courseColorMap[id] = COURSE_COLORS[i % COURSE_COLORS.length];
  });

  // Calendar grid
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);

  const days: Date[] = [];
  let d = calStart;
  while (d <= calEnd) {
    days.push(d);
    d = addDays(d, 1);
  }

  const getEventsForDay = (day: Date) =>
    events.filter(e => isSameDay(new Date(e.dueDate), day));

  const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : [];

  // Upcoming events (next 30 days)
  const today = new Date();
  const upcoming = events
    .filter(e => new Date(e.dueDate) >= today)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 10);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-primary/5 rounded-3xl p-8 border border-primary/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground mb-2">Academic Calendar</h1>
          <p className="text-muted-foreground text-lg">All your deadlines in one place.</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={downloadIcal}
            data-testid="button-download-ical"
          >
            <Download className="w-4 h-4 mr-2" />
            Export .ics
          </Button>
          <a
            href="https://calendar.google.com/calendar/r/settings/addbyurl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="primary" data-testid="button-open-google-calendar">
              <CalIcon className="w-4 h-4 mr-2" />
              Open Google Calendar
            </Button>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Calendar */}
        <div className="xl:col-span-2 bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          {/* Month Nav */}
          <div className="flex items-center justify-between p-5 border-b border-border">
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              data-testid="button-prev-month"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-display font-bold text-foreground">
              {format(currentDate, "MMMM yyyy")}
            </h2>
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              data-testid="button-next-month"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Day Labels */}
          <div className="grid grid-cols-7 border-b border-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="p-3 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const dayEvents = getEventsForDay(day);
              const inMonth = isSameMonth(day, currentDate);
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              const todayDay = isToday(day);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(isSameDay(day, selectedDay!) ? null : day)}
                  className={`
                    min-h-[80px] p-1.5 border-b border-r border-border text-left transition-colors relative
                    ${!inMonth ? "bg-secondary/30" : "hover:bg-secondary/50"}
                    ${isSelected ? "bg-primary/10 ring-inset ring-2 ring-primary" : ""}
                  `}
                  data-testid={`day-${format(day, "yyyy-MM-dd")}`}
                >
                  <span className={`
                    text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full mb-1
                    ${todayDay ? "bg-primary text-primary-foreground" : !inMonth ? "text-muted-foreground/40" : "text-foreground"}
                  `}>
                    {format(day, "d")}
                  </span>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map(evt => (
                      <div
                        key={evt.id}
                        className={`text-[10px] font-semibold text-white rounded px-1 py-0.5 truncate ${courseColorMap[evt.courseId]}`}
                      >
                        {evt.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[10px] font-bold text-muted-foreground pl-1">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Legend */}
          {courseIds.length > 0 && (
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
              <h3 className="font-display font-bold text-lg mb-4">Courses</h3>
              <div className="space-y-2">
                {courseIds.map(id => {
                  const evt = events.find(e => e.courseId === id);
                  return (
                    <div key={id} className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${courseColorMap[id]}`} />
                      <span className="text-sm font-medium text-foreground">{evt?.courseCode}</span>
                      <span className="text-xs text-muted-foreground truncate">{evt?.courseName}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected Day Events */}
          {selectedDay && (
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
              <h3 className="font-display font-bold text-lg mb-4">
                {format(selectedDay, "MMMM d")}
              </h3>
              {selectedEvents.length === 0 ? (
                <p className="text-muted-foreground text-sm">No assignments due.</p>
              ) : (
                <div className="space-y-3">
                  {selectedEvents.map(evt => (
                    <EventCard key={evt.id} event={evt} color={courseColorMap[evt.courseId]} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Upcoming */}
          <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
            <h3 className="font-display font-bold text-lg mb-4">Upcoming Deadlines</h3>
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground text-sm">No upcoming assignments.</p>
            ) : (
              <div className="space-y-3">
                {upcoming.map(evt => (
                  <EventCard key={evt.id} event={evt} color={courseColorMap[evt.courseId]} compact />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EventCard({ event, color, compact = false }: { event: CalendarEvent, color: string, compact?: boolean }) {
  const badge = TYPE_BADGE[event.type] || "bg-gray-100 text-gray-700";
  return (
    <div className={`rounded-xl border border-border bg-background p-3 ${compact ? "space-y-1" : "space-y-2"}`} data-testid={`event-card-${event.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
          <span className={`font-semibold text-foreground ${compact ? "text-xs" : "text-sm"}`}>{event.title}</span>
        </div>
        <a
          href={getGoogleCalendarUrl(event)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-primary transition-colors shrink-0"
          title="Add to Google Calendar"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badge}`}>
          {event.type}
        </span>
        <span className="text-xs text-muted-foreground">{event.courseCode}</span>
        {!compact && <span className="text-xs text-muted-foreground">Due {format(new Date(event.dueDate), "MMM d, h:mm a")}</span>}
        {compact && <span className="text-xs text-muted-foreground">{format(new Date(event.dueDate), "MMM d")}</span>}
      </div>
    </div>
  );
}
