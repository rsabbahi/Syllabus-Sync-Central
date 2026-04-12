import { useEffect, useState } from "react";
import { useCalendarEvents, downloadIcal, getGoogleCalendarUrl, CalendarEvent } from "@/hooks/use-calendar";
import { useProfile, useUpdateProfile } from "@/hooks/use-profile";
import { useTasks } from "@/hooks/use-tasks";
import {
  useCalendarConnections,
  useDeleteCalendarConnection,
  useSyncGoogle,
  useSyncMicrosoft,
  type CalendarConnectionSafe,
} from "@/hooks/use-calendar-connections";
import { IcsImportModal } from "@/components/ics-import-modal";
import { LoadingSpinner } from "@/components/loading";
import { Button } from "@/components/button";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday,
} from "date-fns";
import {
  ChevronLeft, ChevronRight, Download, ExternalLink,
  Calendar as CalIcon, Info, Check, X, Upload, RefreshCw,
  Trash2, Link,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const COURSE_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-emerald-500", "bg-orange-500",
  "bg-rose-500", "bg-cyan-500", "bg-amber-500", "bg-indigo-500",
];

const TASK_COLOR = "bg-slate-400";

const TYPE_BADGE: Record<string, string> = {
  exam: "bg-red-100 text-red-700", hw: "bg-blue-100 text-blue-700",
  quiz: "bg-yellow-100 text-yellow-700", paper: "bg-purple-100 text-purple-700",
  project: "bg-orange-100 text-orange-700", lab: "bg-green-100 text-green-700",
  reading: "bg-gray-100 text-gray-700", lecture: "bg-teal-100 text-teal-700",
  discussion: "bg-pink-100 text-pink-700", task: "bg-slate-100 text-slate-700",
};

// ── Embed URL wizard (legacy / advanced) ─────────────────────────────────────

type CalType = "google" | "apple" | "outlook";

const CAL_TYPES: { id: CalType; label: string }[] = [
  { id: "google", label: "Google Calendar" },
  { id: "apple", label: "Apple Calendar" },
  { id: "outlook", label: "Outlook" },
];

function toEmbedUrl(raw: string): string {
  const url = raw.trim();
  if (url.includes("calendar.google.com/calendar/embed")) return url;
  if (url.startsWith("webcal://") || url.includes(".ics")) {
    const feed = url.replace(/^webcal:\/\//, "https://");
    return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(feed)}`;
  }
  return url;
}

function extractEmbedSrc(input: string): string {
  const srcMatch = input.match(/src="([^"]+)"/);
  if (srcMatch) return srcMatch[1];
  return input.trim();
}

const INSTRUCTIONS: Record<CalType, { title: string; steps: React.ReactNode[]; placeholder: string; inputLabel: string }> = {
  google: {
    title: "How to get your Google Calendar embed URL",
    steps: [
      <>Open <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">calendar.google.com</a> → click the <strong className="text-foreground">gear icon</strong> → <strong className="text-foreground">Settings</strong>.</>,
      <>In the left panel under <strong className="text-foreground">"Settings for my calendars"</strong>, click your calendar.</>,
      <>Scroll to <strong className="text-foreground">"Integrate calendar"</strong> → find <strong className="text-foreground">"Embed code"</strong>.</>,
      <>Copy the <code className="bg-secondary px-1 py-0.5 rounded text-xs">&lt;iframe&gt;</code> tag or just the <code className="bg-secondary px-1 py-0.5 rounded text-xs">src="..."</code> URL and paste below.</>,
    ],
    placeholder: `<iframe src="https://calendar.google.com/calendar/embed?src=..." ...></iframe>\n\nor just the URL:\nhttps://calendar.google.com/calendar/embed?src=...`,
    inputLabel: "Paste your embed code or URL",
  },
  apple: {
    title: "How to get your Apple iCloud Calendar link",
    steps: [
      <>Open <strong className="text-foreground">Calendar</strong> on your Mac or iPhone.</>,
      <>Right-click your calendar → <strong className="text-foreground">Share Calendar</strong> → enable <strong className="text-foreground">Public Calendar</strong>.</>,
      <>Click <strong className="text-foreground">Copy Link</strong> — the URL starts with <code className="bg-secondary px-1 py-0.5 rounded text-xs">webcal://</code>.</>,
      <>Paste that link below.</>,
    ],
    placeholder: "webcal://p25-caldav.icloud.com/published/2/...",
    inputLabel: "Paste your iCloud Calendar link",
  },
  outlook: {
    title: "How to get your Outlook Calendar embed URL",
    steps: [
      <>Open <a href="https://outlook.live.com/calendar" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">outlook.live.com/calendar</a> → <strong className="text-foreground">Settings</strong> → <strong className="text-foreground">View all Outlook settings</strong>.</>,
      <>Go to <strong className="text-foreground">Calendar</strong> → <strong className="text-foreground">Shared calendars</strong>.</>,
      <>Under <strong className="text-foreground">Publish a calendar</strong>, pick your calendar → <strong className="text-foreground">HTML</strong> → <strong className="text-foreground">Publish</strong>.</>,
      <>Copy the <strong className="text-foreground">HTML link</strong> and paste below.</>,
    ],
    placeholder: "https://outlook.live.com/calendar/published/...",
    inputLabel: "Paste your Outlook calendar URL",
  },
};

// ── Provider card config ───────────────────────────────────────────────────

const PROVIDERS = [
  {
    id: "google",
    label: "Google Calendar",
    description: "Connect via OAuth — auto-sync events",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
    href: "/api/calendar/google/connect",
    provider: "google",
  },
  {
    id: "microsoft",
    label: "Outlook / Office 365",
    description: "Connect via OAuth — auto-sync events",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <path d="M11.5 2L2 7v10l9.5 5 9.5-5V7L11.5 2z" fill="#0078D4"/>
        <path d="M11.5 2v20M2 7l9.5 5 9.5-5" fill="none" stroke="white" strokeWidth="1"/>
      </svg>
    ),
    href: "/api/calendar/microsoft/connect",
    provider: "microsoft",
  },
  {
    id: "ics",
    label: "Upload .ics / .zip",
    description: "Works with any calendar — Google, Apple, Outlook, school LMS",
    icon: <Upload className="w-6 h-6 text-primary" />,
    href: null,
    provider: null,
  },
  {
    id: "embed",
    label: "Embed URL",
    description: "Paste an embed link to display your calendar",
    icon: <Link className="w-6 h-6 text-muted-foreground" />,
    href: null,
    provider: null,
  },
];

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google Calendar",
  microsoft: "Outlook / Office 365",
};

// ── Main Component ────────────────────────────────────────────────────────

export default function Calendar() {
  const [location] = useLocation();
  const { data: events = [], isLoading } = useCalendarEvents();
  const { data: taskList = [] } = useTasks();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: connections = [], isLoading: connectionsLoading } = useCalendarConnections();
  const updateProfile = useUpdateProfile();
  const deleteConnection = useDeleteCalendarConnection();
  const syncGoogle = useSyncGoogle();
  const syncMicrosoft = useSyncMicrosoft();
  const { toast } = useToast();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<"academic" | "my-calendar">("academic");
  const [icsModalOpen, setIcsModalOpen] = useState(false);
  const [showEmbedWizard, setShowEmbedWizard] = useState(false);
  const [selectedType, setSelectedType] = useState<CalType>("google");
  const [embedInput, setEmbedInput] = useState("");

  // Handle OAuth redirect back — show toast
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) {
      toast({ title: `${PROVIDER_LABEL[connected] || "Calendar"} connected!`, description: "Events will be synced to your tasks." });
      window.history.replaceState({}, "", "/calendar");
      setActiveTab("my-calendar");
    }
    if (error) {
      toast({ title: "Connection failed", description: decodeURIComponent(error), variant: "destructive" });
      window.history.replaceState({}, "", "/calendar");
    }
  }, []);

  if (isLoading || profileLoading) return <LoadingSpinner />;

  const savedUrl = profile?.googleCalendarEmbedUrl;
  const embedSrc = savedUrl ? toEmbedUrl(savedUrl) : null;

  const handleSaveEmbed = () => {
    const url = extractEmbedSrc(embedInput);
    if (!url) return;
    updateProfile.mutate({ googleCalendarEmbedUrl: url }, {
      onSuccess: () => {
        setEmbedInput("");
        setShowEmbedWizard(false);
      },
    });
  };

  const handleDisconnectEmbed = () => {
    updateProfile.mutate({ googleCalendarEmbedUrl: null });
  };

  function handleSync(provider: string) {
    const run = provider === "google" ? syncGoogle : syncMicrosoft;
    run.mutate(undefined, {
      onSuccess: ({ imported, skipped }) => {
        toast({
          title: "Sync complete",
          description: `${imported} new event${imported !== 1 ? "s" : ""} added${skipped > 0 ? `, ${skipped} already existed` : ""}.`,
        });
      },
      onError: (err: any) => {
        toast({ title: "Sync failed", description: err.message, variant: "destructive" });
      },
    });
  }

  function handleDeleteConnection(conn: CalendarConnectionSafe) {
    deleteConnection.mutate(conn.id, {
      onSuccess: () => {
        toast({ title: "Calendar disconnected", description: `${conn.displayName || conn.provider} has been removed.` });
      },
    });
  }

  // Build course color map
  const courseIds = [...new Set(events.map(e => e.courseId))];
  const courseColorMap: Record<number, string> = {};
  courseIds.forEach((id, i) => { courseColorMap[id] = COURSE_COLORS[i % COURSE_COLORS.length]; });

  // Merge tasks into calendar events
  const taskEvents: CalendarEvent[] = taskList
    .filter(t => t.dueDate && !t.assignmentId) // only personal/imported tasks
    .map(t => ({
      id: t.id + 100000, // avoid ID collision with assignments
      title: t.title,
      type: "task",
      dueDate: t.dueDate,
      courseId: -1,
      courseName: "Personal",
      courseCode: "",
      weight: "0",
    } as any));
  const allEvents = [...events, ...taskEvents];

  // Calendar grid
  const calStart = startOfWeek(startOfMonth(currentDate));
  const calEnd = endOfWeek(endOfMonth(currentDate));
  const days: Date[] = [];
  let d = calStart;
  while (d <= calEnd) { days.push(d); d = addDays(d, 1); }

  const getEventsForDay = (day: Date) => allEvents.filter(e => isSameDay(new Date(e.dueDate), day));
  const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : [];
  const today = new Date();
  const upcoming = allEvents
    .filter(e => new Date(e.dueDate) >= today)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 10);

  const inst = INSTRUCTIONS[selectedType];
  const isSyncing = syncGoogle.isPending || syncMicrosoft.isPending;

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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Main calendar card */}
        <div className="xl:col-span-2 bg-card rounded-2xl border border-border shadow-sm overflow-hidden">

          {/* Tab bar */}
          <div className="flex items-center border-b border-border">
            <button
              onClick={() => setActiveTab("academic")}
              className={`px-5 py-4 text-sm font-semibold transition-colors border-b-2 -mb-px ${activeTab === "academic" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              data-testid="tab-academic"
            >
              SyllabusSync
            </button>
            <button
              onClick={() => setActiveTab("my-calendar")}
              className={`px-5 py-4 text-sm font-semibold transition-colors border-b-2 -mb-px flex items-center gap-2 ${activeTab === "my-calendar" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              data-testid="tab-my-calendar"
            >
              <CalIcon className="w-3.5 h-3.5" />
              My Calendar
              {(connections.length > 0 || savedUrl) && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
            </button>

            {/* Month nav — academic tab */}
            {activeTab === "academic" && (
              <div className="flex items-center gap-1 ml-auto pr-4">
                <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground" data-testid="button-prev-month">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-foreground px-1 min-w-[110px] text-center">
                  {format(currentDate, "MMMM yyyy")}
                </span>
                <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground" data-testid="button-next-month">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* ── Academic tab ── */}
          {activeTab === "academic" && (
            <>
              <div className="grid grid-cols-7 border-b border-border">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                  <div key={day} className="p-3 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">{day}</div>
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
                      className={`min-h-[80px] p-1.5 border-b border-r border-border text-left transition-colors ${!inMonth ? "bg-secondary/30" : "hover:bg-secondary/50"} ${isSelected ? "bg-primary/10 ring-inset ring-2 ring-primary" : ""}`}
                      data-testid={`day-${format(day, "yyyy-MM-dd")}`}
                    >
                      <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full mb-1 ${todayDay ? "bg-primary text-primary-foreground" : !inMonth ? "text-muted-foreground/40" : "text-foreground"}`}>
                        {format(day, "d")}
                      </span>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 2).map(evt => (
                          <div
                            key={evt.id}
                            className={`text-[10px] font-semibold text-white rounded px-1 py-0.5 truncate ${(evt as any).courseId === -1 ? TASK_COLOR : courseColorMap[(evt as any).courseId]}`}
                          >
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
            </>
          )}

          {/* ── My Calendar tab ── */}
          {activeTab === "my-calendar" && (
            <div className="p-6 space-y-6" data-testid="section-calendar-import">
              <div>
                <h3 className="font-display font-bold text-lg text-foreground mb-1">Connect Your Calendar</h3>
                <p className="text-sm text-muted-foreground">Import events from any calendar app as tasks, or embed your calendar here.</p>
              </div>

              {/* Provider grid */}
              <div className="grid grid-cols-2 gap-3">
                {PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (p.href) window.location.href = p.href;
                      else if (p.id === "ics") setIcsModalOpen(true);
                      else if (p.id === "embed") setShowEmbedWizard(v => !v);
                    }}
                    className="flex items-start gap-3 p-4 rounded-xl border border-border bg-background hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className="shrink-0 mt-0.5">{p.icon}</div>
                    <div>
                      <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{p.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Connected calendars (OAuth) */}
              {connections.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">Connected Calendars</h4>
                  {connections.map(conn => (
                    <div key={conn.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-secondary/30">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <div>
                          <div className="text-sm font-semibold text-foreground">{conn.displayName || PROVIDER_LABEL[conn.provider] || conn.provider}</div>
                          {conn.lastSyncedAt && (
                            <div className="text-xs text-muted-foreground">
                              Last synced {format(new Date(conn.lastSyncedAt), "MMM d, h:mm a")}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSync(conn.provider)}
                          disabled={isSyncing}
                          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                          title="Sync now"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                        </button>
                        <button
                          onClick={() => handleDeleteConnection(conn)}
                          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors"
                          title="Disconnect"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Embed URL section — embedded calendar display or wizard */}
              {embedSrc && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Embedded Calendar</h4>
                    <button
                      onClick={handleDisconnectEmbed}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="w-3 h-3" /> Remove
                    </button>
                  </div>
                  <div style={{ height: 400 }} className="rounded-xl overflow-hidden border border-border">
                    <iframe src={embedSrc} className="w-full h-full border-0" title="My Calendar" data-testid="external-calendar-iframe" />
                  </div>
                </div>
              )}

              {/* Embed wizard (collapsed by default) */}
              {showEmbedWizard && !embedSrc && (
                <div className="border border-border rounded-xl p-5 space-y-4 bg-secondary/20">
                  <h4 className="font-semibold text-sm text-foreground">Embed Calendar URL</h4>

                  <div className="flex gap-3 flex-wrap">
                    {CAL_TYPES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedType(t.id)}
                        className={`px-4 py-2 rounded-xl border-2 font-semibold text-sm transition-all ${selectedType === t.id ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                        data-testid={`button-cal-type-${t.id}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

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
                      onClick={handleSaveEmbed}
                      disabled={!embedInput.trim() || updateProfile.isPending}
                      data-testid="button-save-embed"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      {updateProfile.isPending ? "Connecting..." : "Connect Calendar"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
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
                {taskEvents.length > 0 && (
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${TASK_COLOR}`} />
                    <span className="text-sm font-medium text-foreground">Personal tasks</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedDay && activeTab === "academic" && (
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
              <h3 className="font-display font-bold text-lg mb-4">{format(selectedDay, "MMMM d")}</h3>
              {selectedEvents.length === 0 ? (
                <p className="text-muted-foreground text-sm">No assignments due.</p>
              ) : (
                <div className="space-y-3">
                  {selectedEvents.map(evt => (
                    <EventCard key={evt.id} event={evt} color={(evt as any).courseId === -1 ? TASK_COLOR : courseColorMap[(evt as any).courseId]} />
                  ))}
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
                {upcoming.map(evt => (
                  <EventCard key={evt.id} event={evt} color={(evt as any).courseId === -1 ? TASK_COLOR : courseColorMap[(evt as any).courseId]} compact />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <IcsImportModal open={icsModalOpen} onOpenChange={setIcsModalOpen} />
    </div>
  );
}

function EventCard({ event, color, compact = false }: { event: CalendarEvent; color: string; compact?: boolean }) {
  const badge = TYPE_BADGE[event.type] || "bg-gray-100 text-gray-700";
  const isTask = (event as any).courseId === -1;
  return (
    <div className={`rounded-xl border border-border bg-background p-3 ${compact ? "space-y-1" : "space-y-2"}`} data-testid={`event-card-${event.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
          <span className={`font-semibold text-foreground ${compact ? "text-xs" : "text-sm"}`}>{event.title}</span>
        </div>
        {!isTask && (
          <a href={getGoogleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors shrink-0" title="Add to Google Calendar">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badge}`}>{event.type}</span>
        {!isTask && <span className="text-xs text-muted-foreground">{event.courseCode}</span>}
        {!compact && <span className="text-xs text-muted-foreground">Due {format(new Date(event.dueDate), "MMM d, h:mm a")}</span>}
        {compact && <span className="text-xs text-muted-foreground">{format(new Date(event.dueDate), "MMM d")}</span>}
      </div>
    </div>
  );
}
