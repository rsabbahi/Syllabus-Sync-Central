import { useState } from "react";
import { useCalendarEvents, downloadIcal, getGoogleCalendarUrl, CalendarEvent } from "@/hooks/use-calendar";
import { useProfile, useUpdateProfile } from "@/hooks/use-profile";
import { LoadingSpinner } from "@/components/loading";
import { Button } from "@/components/button";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Calendar as CalIcon, Info, Check, Pencil } from "lucide-react";

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

function extractEmbedSrc(input: string): string {
  const srcMatch = input.match(/src="([^"]+)"/);
  if (srcMatch) return srcMatch[1];
  if (input.startsWith("http")) return input.trim();
  return input.trim();
}

export default function Calendar() {
  const { data: events = [], isLoading } = useCalendarEvents();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [embedInput, setEmbedInput] = useState("");
  const [editingEmbed, setEditingEmbed] = useState(false);

  if (isLoading || profileLoading) return <LoadingSpinner />;

  const embedUrl = profile?.googleCalendarEmbedUrl;

  const handleSaveEmbed = () => {
    const url = extractEmbedSrc(embedInput);
    if (!url) return;
    updateProfile.mutate({ googleCalendarEmbedUrl: url }, {
      onSuccess: () => {
        setEditingEmbed(false);
        setEmbedInput("");
      },
    });
  };

  const handleRemoveEmbed = () => {
    updateProfile.mutate({ googleCalendarEmbedUrl: null }, {
      onSuccess: () => setEditingEmbed(false),
    });
  };

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

      {/* Google Calendar Embed Section */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <CalIcon className="w-5 h-5 text-primary" />
            <h3 className="font-display font-bold text-lg text-foreground">Google Calendar</h3>
          </div>
          {embedUrl && !editingEmbed && (
            <button
              onClick={() => { setEditingEmbed(true); setEmbedInput(embedUrl); }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-edit-embed"
            >
              <Pencil className="w-3.5 h-3.5" />
              Change
            </button>
          )}
        </div>

        {embedUrl && !editingEmbed ? (
          <div className="w-full" style={{ height: 600 }}>
            <iframe
              src={embedUrl}
              className="w-full h-full border-0"
              title="Google Calendar"
              data-testid="google-calendar-iframe"
            />
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* How-to guide */}
            <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                <Info className="w-4 h-4 shrink-0" />
                How to find your Google Calendar Embed URL
              </div>
              <ol className="space-y-2 text-sm text-muted-foreground list-none">
                {[
                  <>Open <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">calendar.google.com</a> and click the <strong className="text-foreground">gear icon</strong> (top-right) → <strong className="text-foreground">Settings</strong>.</>,
                  <>In the left panel under <strong className="text-foreground">"Settings for my calendars"</strong>, click the calendar you want to embed (usually your name).</>,
                  <>Scroll down to the <strong className="text-foreground">"Integrate calendar"</strong> section.</>,
                  <>Find the <strong className="text-foreground">"Embed code"</strong> box — it contains a full <code className="bg-secondary px-1 py-0.5 rounded text-xs">&lt;iframe&gt;</code> tag.</>,
                  <>Copy the entire embed code (or just the URL inside <code className="bg-secondary px-1 py-0.5 rounded text-xs">src="..."</code>) and paste it below.</>,
                ].map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary font-bold text-xs flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Input */}
            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground">Paste your embed code or src URL</label>
              <textarea
                className="w-full h-24 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                placeholder={`<iframe src="https://calendar.google.com/calendar/embed?src=..." ...></iframe>\n\nor just the URL:\n\nhttps://calendar.google.com/calendar/embed?src=...`}
                value={embedInput}
                onChange={e => setEmbedInput(e.target.value)}
                data-testid="input-embed-code"
              />
              <div className="flex gap-3">
                <Button
                  variant="primary"
                  onClick={handleSaveEmbed}
                  disabled={!embedInput.trim() || updateProfile.isPending}
                  data-testid="button-save-embed"
                >
                  <Check className="w-4 h-4 mr-2" />
                  {updateProfile.isPending ? "Saving..." : "Embed Calendar"}
                </Button>
                {editingEmbed && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => { setEditingEmbed(false); setEmbedInput(""); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleRemoveEmbed}
                      className="text-destructive border-destructive/30 hover:bg-destructive/5"
                    >
                      Remove
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
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
