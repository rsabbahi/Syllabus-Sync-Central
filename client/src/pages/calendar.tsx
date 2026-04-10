import { useState } from "react";
import { useCalendarEvents, downloadIcal, getGoogleCalendarUrl, CalendarEvent } from "@/hooks/use-calendar";
import { useProfile, useUpdateProfile } from "@/hooks/use-profile";
import { LoadingSpinner } from "@/components/loading";
import { Button } from "@/components/button";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Calendar as CalIcon, Info, Check, X, Copy } from "lucide-react";

const COURSE_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-emerald-500", "bg-orange-500",
  "bg-rose-500", "bg-cyan-500", "bg-amber-500", "bg-indigo-500",
];

const TYPE_BADGE: Record<string, string> = {
  exam: "bg-red-100 text-red-700", hw: "bg-blue-100 text-blue-700",
  quiz: "bg-yellow-100 text-yellow-700", paper: "bg-purple-100 text-purple-700",
  project: "bg-orange-100 text-orange-700", lab: "bg-green-100 text-green-700",
  reading: "bg-gray-100 text-gray-700", lecture: "bg-teal-100 text-teal-700",
  discussion: "bg-pink-100 text-pink-700",
};

type CalType = "google" | "apple" | "outlook";

function detectType(url: string): CalType {
  if (url.includes("calendar.google.com")) return "google";
  if (url.includes("outlook") || url.includes("live.com") || url.includes("office365")) return "outlook";
  return "apple";
}

function extractEmbedSrc(input: string): string {
  const srcMatch = input.match(/src="([^"]+)"/);
  if (srcMatch) return srcMatch[1];
  return input.trim();
}

function isIframeable(url: string): boolean {
  const t = detectType(url);
  return t === "google" || t === "outlook";
}

const CAL_TYPES: { id: CalType; label: string; logo: string }[] = [
  { id: "google", label: "Google Calendar", logo: "https://ssl.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_31_2x.png" },
  { id: "apple",  label: "Apple Calendar",  logo: "https://www.apple.com/favicon.ico" },
  { id: "outlook", label: "Outlook",         logo: "https://outlook.live.com/favicon.ico" },
];

const INSTRUCTIONS: Record<CalType, { title: string; steps: React.ReactNode[]; placeholder: string; inputLabel: string }> = {
  google: {
    title: "How to get your Google Calendar embed URL",
    steps: [
      <>Open <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">calendar.google.com</a> → click the <strong className="text-foreground">gear icon</strong> → <strong className="text-foreground">Settings</strong>.</>,
      <>In the left panel under <strong className="text-foreground">"Settings for my calendars"</strong>, click the calendar you want (usually your name).</>,
      <>Scroll to <strong className="text-foreground">"Integrate calendar"</strong> → find the <strong className="text-foreground">"Embed code"</strong> box.</>,
      <>Copy the full <code className="bg-secondary px-1 py-0.5 rounded text-xs">&lt;iframe&gt;</code> tag or just the URL inside <code className="bg-secondary px-1 py-0.5 rounded text-xs">src="..."</code>.</>,
    ],
    placeholder: `<iframe src="https://calendar.google.com/calendar/embed?src=..." ...></iframe>\n\nor just:\nhttps://calendar.google.com/calendar/embed?src=...`,
    inputLabel: "Paste your embed code or src URL",
  },
  apple: {
    title: "How to get your iCloud Calendar link",
    steps: [
      <>Open the <strong className="text-foreground">Calendar</strong> app on your Mac or iPhone.</>,
      <>Right-click (or long-press) your calendar name in the sidebar → <strong className="text-foreground">Share Calendar</strong>.</>,
      <>Turn on <strong className="text-foreground">Public Calendar</strong> — this generates a shareable link.</>,
      <>Click <strong className="text-foreground">Copy Link</strong>. The URL starts with <code className="bg-secondary px-1 py-0.5 rounded text-xs">webcal://</code> or <code className="bg-secondary px-1 py-0.5 rounded text-xs">https://</code>.</>,
    ],
    placeholder: "webcal://p25-caldav.icloud.com/published/2/...\n\nor the https:// version",
    inputLabel: "Paste your iCloud Calendar link",
  },
  outlook: {
    title: "How to get your Outlook Calendar embed URL",
    steps: [
      <>Open <a href="https://outlook.live.com/calendar" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">outlook.live.com/calendar</a> → click the <strong className="text-foreground">Settings gear</strong>.</>,
      <>Go to <strong className="text-foreground">View all Outlook settings</strong> → <strong className="text-foreground">Calendar</strong> → <strong className="text-foreground">Shared calendars</strong>.</>,
      <>Under <strong className="text-foreground">Publish a calendar</strong>, select your calendar and choose <strong className="text-foreground">HTML</strong> from the format drop-down.</>,
      <>Click <strong className="text-foreground">Publish</strong>, then copy the <strong className="text-foreground">HTML link</strong> that appears.</>,
    ],
    placeholder: "https://outlook.live.com/calendar/published/...",
    inputLabel: "Paste your Outlook embed URL",
  },
};

export default function Calendar() {
  const { data: events = [], isLoading } = useCalendarEvents();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Import wizard state
  const [selectedType, setSelectedType] = useState<CalType>("google");
  const [embedInput, setEmbedInput] = useState("");
  const [copied, setCopied] = useState(false);

  if (isLoading || profileLoading) return <LoadingSpinner />;

  const savedUrl = profile?.googleCalendarEmbedUrl;
  const calType = savedUrl ? detectType(savedUrl) : null;
  const canEmbed = savedUrl ? isIframeable(savedUrl) : false;

  const handleSave = () => {
    const url = extractEmbedSrc(embedInput);
    if (!url) return;
    updateProfile.mutate({ googleCalendarEmbedUrl: url }, {
      onSuccess: () => setEmbedInput(""),
    });
  };

  const handleDisconnect = () => {
    updateProfile.mutate({ googleCalendarEmbedUrl: null });
  };

  const handleCopy = () => {
    if (savedUrl) {
      navigator.clipboard.writeText(savedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Apple webcal → subscribe URL
  const appleSubscribeUrl = savedUrl
    ? savedUrl.replace(/^webcal:\/\//, "https://")
    : "";

  // Build course color map
  const courseIds = [...new Set(events.map(e => e.courseId))];
  const courseColorMap: Record<number, string> = {};
  courseIds.forEach((id, i) => { courseColorMap[id] = COURSE_COLORS[i % COURSE_COLORS.length]; });

  // Calendar grid
  const monthStart = startOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(endOfMonth(currentDate));
  const days: Date[] = [];
  let d = calStart;
  while (d <= calEnd) { days.push(d); d = addDays(d, 1); }

  const getEventsForDay = (day: Date) => events.filter(e => isSameDay(new Date(e.dueDate), day));
  const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : [];
  const today = new Date();
  const upcoming = events
    .filter(e => new Date(e.dueDate) >= today)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 10);

  const inst = INSTRUCTIONS[selectedType];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-primary/5 rounded-3xl p-8 border border-primary/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground mb-2">Academic Calendar</h1>
          <p className="text-muted-foreground text-lg">All your deadlines in one place.</p>
        </div>
        <Button variant="outline" onClick={downloadIcal} data-testid="button-download-ical">
          <Download className="w-4 h-4 mr-2" />
          Export .ics
        </Button>
      </div>

      {/* ── External Calendar section (above the grid) ── */}
      {!savedUrl ? (
        /* Import wizard — shown only when no calendar is connected */
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden" data-testid="section-calendar-import">
          <div className="p-5 border-b border-border">
            <div className="flex items-center gap-3">
              <CalIcon className="w-5 h-5 text-primary" />
              <h3 className="font-display font-bold text-lg text-foreground">Connect Your External Calendar</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Embed your personal calendar so it appears right here alongside your academic deadlines.</p>
          </div>

          <div className="p-6 space-y-6">
            {/* Type selector */}
            <div className="flex gap-3 flex-wrap">
              {CAL_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedType(t.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all ${selectedType === t.id ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                  data-testid={`button-cal-type-${t.id}`}
                >
                  <img src={t.logo} alt="" className="w-4 h-4 object-contain" onError={e => (e.currentTarget.style.display = "none")} />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Instructions */}
            <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                <Info className="w-4 h-4 shrink-0" />
                {inst.title}
              </div>
              <ol className="space-y-2 text-sm text-muted-foreground list-none">
                {inst.steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary font-bold text-xs flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Input */}
            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground">{inst.inputLabel}</label>
              <textarea
                className="w-full h-24 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                placeholder={inst.placeholder}
                value={embedInput}
                onChange={e => setEmbedInput(e.target.value)}
                data-testid="input-embed-code"
              />
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={!embedInput.trim() || updateProfile.isPending}
                data-testid="button-save-embed"
              >
                <Check className="w-4 h-4 mr-2" />
                {updateProfile.isPending ? "Connecting..." : "Connect Calendar"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Connected calendar — import wizard gone, just show the calendar */
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden" data-testid="section-calendar-connected">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <CalIcon className="w-4 h-4 text-primary" />
              {calType === "google" && "Google Calendar"}
              {calType === "apple" && "Apple iCloud Calendar"}
              {calType === "outlook" && "Outlook Calendar"}
            </div>
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
              data-testid="button-disconnect-calendar"
              title="Disconnect calendar"
            >
              <X className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>

          {canEmbed ? (
            /* Google / Outlook — iframe embed */
            <div style={{ height: 600 }}>
              <iframe
                src={savedUrl}
                className="w-full h-full border-0"
                title="External Calendar"
                data-testid="google-calendar-iframe"
              />
            </div>
          ) : (
            /* Apple iCloud — can't iframe; show subscription panel */
            <div className="p-8 text-center space-y-5">
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto">
                <CalIcon className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h4 className="font-display font-bold text-lg mb-1">iCloud Calendar Connected</h4>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  Apple iCloud calendars can't be displayed as an embedded view. Use the buttons below to open or subscribe to your calendar in another app.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 justify-center">
                <a href={savedUrl} className="inline-flex">
                  <Button variant="primary" data-testid="button-open-apple-calendar">
                    Open in Calendar App
                  </Button>
                </a>
                <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(appleSubscribeUrl)}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" data-testid="button-add-to-google">
                    Add to Google Calendar
                  </Button>
                </a>
                <Button variant="outline" onClick={handleCopy} data-testid="button-copy-url">
                  <Copy className="w-4 h-4 mr-2" />
                  {copied ? "Copied!" : "Copy URL"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground font-mono break-all max-w-lg mx-auto opacity-60">{savedUrl}</p>
            </div>
          )}
        </div>
      )}

      {/* ── SyllabusSync assignment calendar grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Calendar */}
        <div className="xl:col-span-2 bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
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

          <div className="grid grid-cols-7 border-b border-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="p-3 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">{d}</div>
            ))}
          </div>

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
                  className={`min-h-[80px] p-1.5 border-b border-r border-border text-left transition-colors relative ${!inMonth ? "bg-secondary/30" : "hover:bg-secondary/50"} ${isSelected ? "bg-primary/10 ring-inset ring-2 ring-primary" : ""}`}
                  data-testid={`day-${format(day, "yyyy-MM-dd")}`}
                >
                  <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full mb-1 ${todayDay ? "bg-primary text-primary-foreground" : !inMonth ? "text-muted-foreground/40" : "text-foreground"}`}>
                    {format(day, "d")}
                  </span>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map(evt => (
                      <div key={evt.id} className={`text-[10px] font-semibold text-white rounded px-1 py-0.5 truncate ${courseColorMap[evt.courseId]}`}>
                        {evt.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[10px] font-bold text-muted-foreground pl-1">+{dayEvents.length - 2} more</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
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

          {selectedDay && (
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
              <h3 className="font-display font-bold text-lg mb-4">{format(selectedDay, "MMMM d")}</h3>
              {selectedEvents.length === 0 ? (
                <p className="text-muted-foreground text-sm">No assignments due.</p>
              ) : (
                <div className="space-y-3">
                  {selectedEvents.map(evt => <EventCard key={evt.id} event={evt} color={courseColorMap[evt.courseId]} />)}
                </div>
              )}
            </div>
          )}

          <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
            <h3 className="font-display font-bold text-lg mb-4">Upcoming Deadlines</h3>
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground text-sm">No upcoming assignments.</p>
            ) : (
              <div className="space-y-3">
                {upcoming.map(evt => <EventCard key={evt.id} event={evt} color={courseColorMap[evt.courseId]} compact />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EventCard({ event, color, compact = false }: { event: CalendarEvent; color: string; compact?: boolean }) {
  const badge = TYPE_BADGE[event.type] || "bg-gray-100 text-gray-700";
  return (
    <div className={`rounded-xl border border-border bg-background p-3 ${compact ? "space-y-1" : "space-y-2"}`} data-testid={`event-card-${event.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
          <span className={`font-semibold text-foreground ${compact ? "text-xs" : "text-sm"}`}>{event.title}</span>
        </div>
        <a href={getGoogleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors shrink-0" title="Add to Google Calendar">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badge}`}>{event.type}</span>
        <span className="text-xs text-muted-foreground">{event.courseCode}</span>
        {!compact && <span className="text-xs text-muted-foreground">Due {format(new Date(event.dueDate), "MMM d, h:mm a")}</span>}
        {compact && <span className="text-xs text-muted-foreground">{format(new Date(event.dueDate), "MMM d")}</span>}
      </div>
    </div>
  );
}
