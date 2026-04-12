import { useEffect, useState } from "react";
import { useCalendarEvents, downloadIcal, getGoogleCalendarUrl, CalendarEvent } from "@/hooks/use-calendar";
import { useProfile, useUpdateProfile } from "@/hooks/use-profile";
import { useTasks } from "@/hooks/use-tasks";
import { useImportedCalendarEvents, type ImportedCalendarEvent } from "@/hooks/use-calendar-connections";
import { IcsImportModal } from "@/components/ics-import-modal";
import { LoadingSpinner } from "@/components/loading";
import { Button } from "@/components/button";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday,
} from "date-fns";
import {
  ChevronLeft, ChevronRight, Download, ExternalLink,
  Calendar as CalIcon, Info, Check, X, Upload, Link, CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Colors ───────────────────────────────────────────────────────────────────

const COURSE_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-emerald-500", "bg-orange-500",
  "bg-rose-500", "bg-cyan-500", "bg-amber-500", "bg-indigo-500",
];
const TASK_COLOR = "bg-slate-400";
const IMPORTED_COLOR = "bg-violet-500";

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
  task: "bg-slate-100 text-slate-700",
  event: "bg-violet-100 text-violet-700",
};

// ── Unified event shape ───────────────────────────────────────────────────────
// All three sources (assignments, tasks, imported) are normalised into this.

type EventSource = "assignment" | "task" | "imported";

interface UnifiedEvent {
  key: string;           // unique React key
  id: number;
  source: EventSource;
  title: string;
  type: string;          // badge label
  date: Date;            // the single display date used for grid/sorting
  courseId?: number;     // set for assignments
  courseCode?: string;
  courseName?: string;
  weight?: string;
  location?: string;
  description?: string;
}

// ── Embed URL helpers ─────────────────────────────────────────────────────────

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
      <>Open <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">calendar.google.com</a> → gear icon → <strong className="text-foreground">Settings</strong>.</>,
      <>In the left panel, click your calendar under <strong className="text-foreground">"Settings for my calendars"</strong>.</>,
      <>Scroll to <strong className="text-foreground">"Integrate calendar"</strong> → find <strong className="text-foreground">"Embed code"</strong>.</>,
      <>Copy the <code className="bg-secondary px-1 py-0.5 rounded text-xs">&lt;iframe&gt;</code> or the <code className="bg-secondary px-1 py-0.5 rounded text-xs">src="..."</code> URL and paste below.</>,
    ],
    placeholder: `<iframe src="https://calendar.google.com/calendar/embed?src=..." ...></iframe>\n\nor just the URL:\nhttps://calendar.google.com/calendar/embed?src=...`,
    inputLabel: "Paste your embed code or URL",
  },
  apple: {
    title: "How to get your Apple iCloud Calendar link",
    steps: [
      <>Open <strong className="text-foreground">Calendar</strong> on your Mac or iPhone.</>,
      <>Right-click your calendar → <strong className="text-foreground">Share Calendar</strong> → enable <strong className="text-foreground">Public Calendar</strong>.</>,
      <>Click <strong className="text-foreground">Copy Link</strong> — starts with <code className="bg-secondary px-1 py-0.5 rounded text-xs">webcal://</code>.</>,
      <>Paste that link below.</>,
    ],
    placeholder: "webcal://p25-caldav.icloud.com/published/2/...",
    inputLabel: "Paste your iCloud Calendar link",
  },
  outlook: {
    title: "How to get your Outlook Calendar embed URL",
    steps: [
      <>Open <a href="https://outlook.live.com/calendar" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">outlook.live.com/calendar</a> → Settings → <strong className="text-foreground">View all Outlook settings</strong>.</>,
      <>Go to <strong className="text-foreground">Calendar</strong> → <strong className="text-foreground">Shared calendars</strong>.</>,
      <>Under <strong className="text-foreground">Publish a calendar</strong>, pick your calendar → <strong className="text-foreground">HTML</strong> → <strong className="text-foreground">Publish</strong>.</>,
      <>Copy the <strong className="text-foreground">HTML link</strong> and paste below.</>,
    ],
    placeholder: "https://outlook.live.com/calendar/published/...",
    inputLabel: "Paste your Outlook calendar URL",
  },
};

const LS_CAL_KEY = "syllabussync-calendar-connected";

// ── Main component ────────────────────────────────────────────────────────────

export default function Calendar() {
  const { data: assignmentEvents = [], isLoading: eventsLoading } = useCalendarEvents();
  const { data: taskList = [] } = useTasks();
  const { data: importedEvents = [] } = useImportedCalendarEvents();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const { toast } = useToast();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [myCalDate, setMyCalDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [myCalSelectedDay, setMyCalSelectedDay] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<"academic" | "my-calendar">("academic");
  const [icsModalOpen, setIcsModalOpen] = useState(false);
  const [showEmbedWizard, setShowEmbedWizard] = useState(false);
  const [selectedType, setSelectedType] = useState<CalType>("google");
  const [embedInput, setEmbedInput] = useState("");
  const [icsConnected, setIcsConnected] = useState(
    () => localStorage.getItem(LS_CAL_KEY) === "true"
  );

  // Handle ?tab=my-calendar URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "my-calendar") {
      setActiveTab("my-calendar");
      window.history.replaceState({}, "", "/calendar");
    }
    const error = params.get("error");
    if (error) {
      toast({ title: "Connection failed", description: decodeURIComponent(error), variant: "destructive" });
      window.history.replaceState({}, "", "/calendar");
    }
  }, []);

  // If we have imported events, mark as connected (catches page refresh after import)
  useEffect(() => {
    if (importedEvents.length > 0) {
      localStorage.setItem(LS_CAL_KEY, "true");
      setIcsConnected(true);
    }
  }, [importedEvents.length]);

  if (eventsLoading || profileLoading) return <LoadingSpinner />;

  const savedUrl = profile?.googleCalendarEmbedUrl;
  const embedSrc = savedUrl ? toEmbedUrl(savedUrl) : null;
  const isCalendarConnected = icsConnected || !!savedUrl;

  // ── Build course color map ────────────────────────────────────────────────
  const courseIds = Array.from(new Set(assignmentEvents.map(e => e.courseId)));
  const courseColorMap: Record<number, string> = {};
  courseIds.forEach((id, i) => {
    courseColorMap[id] = COURSE_COLORS[i % COURSE_COLORS.length];
  });

  // ── Normalise all sources into UnifiedEvent ───────────────────────────────

  const fromAssignments: UnifiedEvent[] = assignmentEvents.map(e => ({
    key: `assignment-${e.id}`,
    id: e.id,
    source: "assignment" as EventSource,
    title: String(e.title),
    type: e.type,
    date: new Date(e.dueDate),
    courseId: e.courseId,
    courseCode: e.courseCode,
    courseName: e.courseName,
    weight: String(e.weight),
  }));

  const fromTasks: UnifiedEvent[] = taskList
    .filter(t => t.dueDate && !t.assignmentId && String(t.title) !== "[object Object]")
    .map(t => ({
      key: `task-${t.id}`,
      id: t.id,
      source: "task" as EventSource,
      title: String(t.title),
      type: "task",
      date: new Date(t.dueDate as any),
    }));

  const fromImported: UnifiedEvent[] = importedEvents
    .filter(e => e.startDate)
    .map(e => ({
      key: `imported-${e.id}`,
      id: e.id,
      source: "imported" as EventSource,
      title: String(e.title),
      type: "event",
      date: new Date(e.startDate!),
      location: e.location ?? undefined,
      description: e.description ?? undefined,
    }));

  const allEvents: UnifiedEvent[] = [...fromAssignments, ...fromTasks, ...fromImported];

  function colorFor(e: UnifiedEvent): string {
    if (e.source === "imported") return IMPORTED_COLOR;
    if (e.source === "task") return TASK_COLOR;
    return courseColorMap[e.courseId!] ?? COURSE_COLORS[0];
  }

  // ── Calendar grid ─────────────────────────────────────────────────────────
  const calStart = startOfWeek(startOfMonth(currentDate));
  const calEnd = endOfWeek(endOfMonth(currentDate));
  const days: Date[] = [];
  let d = calStart;
  while (d <= calEnd) { days.push(d); d = addDays(d, 1); }

  const getEventsForDay = (day: Date) =>
    allEvents.filter(e => !isNaN(e.date.getTime()) && isSameDay(e.date, day));

  const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : [];

  const today = new Date();
  const upcoming = allEvents
    .filter(e => !isNaN(e.date.getTime()) && e.date >= today)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 10);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSaveEmbed() {
    const url = extractEmbedSrc(embedInput);
    if (!url) return;
    updateProfile.mutate({ googleCalendarEmbedUrl: url }, {
      onSuccess: () => {
        setEmbedInput("");
        setShowEmbedWizard(false);
        localStorage.setItem(LS_CAL_KEY, "true");
        setIcsConnected(true);
      },
    });
  }

  function handleDisconnectEmbed() {
    updateProfile.mutate({ googleCalendarEmbedUrl: null }, {
      onSuccess: () => {
        if (importedEvents.length === 0) {
          localStorage.removeItem(LS_CAL_KEY);
          setIcsConnected(false);
        }
      },
    });
  }

  function handleIcsImportSuccess(firstEventDate?: Date) {
    localStorage.setItem(LS_CAL_KEY, "true");
    setIcsConnected(true);
    setIcsModalOpen(false);
    if (firstEventDate && !isNaN(firstEventDate.getTime())) {
      setMyCalDate(firstEventDate);
    }
    setActiveTab("my-calendar");
  }

  const inst = INSTRUCTIONS[selectedType];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Header */}
      <div className="bg-primary/5 rounded-3xl p-8 border border-primary/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground mb-2">Academic Calendar</h1>
          <p className="text-muted-foreground text-lg">All your deadlines in one place.</p>
        </div>
        <Button variant="outline" onClick={downloadIcal}>
          <Download className="w-4 h-4 mr-2" />
          Export .ics
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

        {/* ── Main calendar card ── */}
        <div className="xl:col-span-2 bg-card rounded-2xl border border-border shadow-sm overflow-hidden">

          {/* Tab bar */}
          <div className="flex items-center border-b border-border">
            <button
              onClick={() => setActiveTab("academic")}
              className={`px-5 py-4 text-sm font-semibold transition-colors border-b-2 -mb-px ${activeTab === "academic" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              SyllabusSync
            </button>
            <button
              onClick={() => setActiveTab("my-calendar")}
              className={`px-5 py-4 text-sm font-semibold transition-colors border-b-2 -mb-px flex items-center gap-2 ${activeTab === "my-calendar" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <CalIcon className="w-3.5 h-3.5" />
              My Calendar
              {isCalendarConnected && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
            </button>

            {activeTab === "academic" && (
              <div className="flex items-center gap-1 ml-auto pr-4">
                <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-foreground px-1 min-w-[110px] text-center">
                  {format(currentDate, "MMMM yyyy")}
                </span>
                <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* ── Academic tab — calendar grid ── */}
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
                  const isSelected = !!selectedDay && isSameDay(day, selectedDay);
                  const todayDay = isToday(day);
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDay(isSameDay(day, selectedDay!) ? null : day)}
                      className={`min-h-[80px] p-1.5 border-b border-r border-border text-left transition-colors ${!inMonth ? "bg-secondary/30" : "hover:bg-secondary/50"} ${isSelected ? "bg-primary/10 ring-inset ring-2 ring-primary" : ""}`}
                    >
                      <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full mb-1 ${todayDay ? "bg-primary text-primary-foreground" : !inMonth ? "text-muted-foreground/40" : "text-foreground"}`}>
                        {format(day, "d")}
                      </span>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 2).map(evt => (
                          <div key={evt.key} className={`text-[10px] font-semibold text-white rounded px-1 py-0.5 truncate ${colorFor(evt)}`}>
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
            <div className="p-6 space-y-6">

              {/* Always-visible connection options */}
              {!showEmbedWizard && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add your calendar</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => setIcsModalOpen(true)}
                      className={`flex items-start gap-3 p-4 rounded-xl border-2 bg-background hover:bg-primary/5 transition-all text-left group ${fromImported.length > 0 ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/50"}`}
                    >
                      <Upload className={`w-5 h-5 shrink-0 mt-0.5 ${fromImported.length > 0 ? "text-primary" : "text-primary"}`} />
                      <div>
                        <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                          Upload .ics / .zip
                          {fromImported.length > 0 && <span className="text-xs font-normal text-primary">({fromImported.length} events)</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">Google Calendar, Apple, Outlook, school LMS</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setShowEmbedWizard(true)}
                      className={`flex items-start gap-3 p-4 rounded-xl border-2 bg-background hover:bg-primary/5 transition-all text-left group ${savedUrl ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/50"}`}
                    >
                      <Link className={`w-5 h-5 shrink-0 mt-0.5 ${savedUrl ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                      <div>
                        <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                          Embed URL
                          {savedUrl && <span className="text-xs font-normal text-primary">(connected)</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">Paste an embed link to display your calendar</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Embed wizard */}
              {showEmbedWizard && (
                <div className="border border-border rounded-xl p-5 space-y-4 bg-secondary/20">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm text-foreground">Embed Calendar URL</h4>
                    <button onClick={() => setShowEmbedWizard(false)} className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    {CAL_TYPES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedType(t.id)}
                        className={`px-4 py-2 rounded-xl border-2 font-semibold text-sm transition-all ${selectedType === t.id ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
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
                    />
                    <div className="flex items-center gap-3">
                      <Button variant="primary" onClick={handleSaveEmbed} disabled={!embedInput.trim() || updateProfile.isPending}>
                        <Check className="w-4 h-4 mr-2" />
                        {updateProfile.isPending ? "Connecting..." : "Connect Calendar"}
                      </Button>
                      {savedUrl && (
                        <button onClick={handleDisconnectEmbed} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
                          <X className="w-3 h-3" /> Remove embed
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Embedded iframe calendar (from link) */}
              {embedSrc && !showEmbedWizard && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Embedded Calendar</h4>
                    <button onClick={handleDisconnectEmbed} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
                      <X className="w-3 h-3" /> Remove
                    </button>
                  </div>
                  <div style={{ height: 420 }} className="rounded-xl overflow-hidden border border-border">
                    <iframe src={embedSrc} className="w-full h-full border-0" title="My Calendar" />
                  </div>
                </div>
              )}

              {/* Imported events mini calendar */}
              {fromImported.length > 0 && !showEmbedWizard && (() => {
                const myCalStart = startOfWeek(startOfMonth(myCalDate));
                const myCalEnd = endOfWeek(endOfMonth(myCalDate));
                const myCalDays: Date[] = [];
                let md = myCalStart;
                while (md <= myCalEnd) { myCalDays.push(md); md = addDays(md, 1); }
                const getImportedForDay = (day: Date) =>
                  fromImported.filter(e => !isNaN(e.date.getTime()) && isSameDay(e.date, day));
                const myCalSelectedEvents = myCalSelectedDay ? getImportedForDay(myCalSelectedDay) : [];
                return (
                  <div className="border border-border rounded-xl overflow-hidden">
                    {/* Mini calendar header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
                      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <CalIcon className="w-4 h-4 text-violet-500" />
                        Imported Events
                        <span className="text-xs font-normal text-muted-foreground">({fromImported.length})</span>
                      </h4>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setMyCalDate(subMonths(myCalDate, 1))} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-bold text-foreground px-2 min-w-[110px] text-center">
                          {format(myCalDate, "MMMM yyyy")}
                        </span>
                        <button onClick={() => setMyCalDate(addMonths(myCalDate, 1))} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {/* Day headers */}
                    <div className="grid grid-cols-7 border-b border-border bg-secondary/20">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                        <div key={day} className="p-2 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{day}</div>
                      ))}
                    </div>
                    {/* Calendar cells */}
                    <div className="grid grid-cols-7">
                      {myCalDays.map((day, i) => {
                        const dayEvts = getImportedForDay(day);
                        const inMon = isSameMonth(day, myCalDate);
                        const isSel = !!myCalSelectedDay && isSameDay(day, myCalSelectedDay);
                        const todayDay = isToday(day);
                        return (
                          <button
                            key={i}
                            onClick={() => setMyCalSelectedDay(isSel ? null : day)}
                            className={`min-h-[64px] p-1 border-b border-r border-border text-left transition-colors ${!inMon ? "bg-secondary/20" : "hover:bg-secondary/40"} ${isSel ? "bg-violet-50 ring-inset ring-2 ring-violet-400" : ""}`}
                          >
                            <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-0.5 ${todayDay ? "bg-primary text-primary-foreground" : !inMon ? "text-muted-foreground/40" : "text-foreground"}`}>
                              {format(day, "d")}
                            </span>
                            <div className="space-y-0.5">
                              {dayEvts.slice(0, 2).map(evt => (
                                <div key={evt.key} className={`text-[9px] font-semibold text-white rounded px-1 py-px truncate ${IMPORTED_COLOR}`}>
                                  {evt.title}
                                </div>
                              ))}
                              {dayEvts.length > 2 && (
                                <div className="text-[9px] font-bold text-muted-foreground pl-1">+{dayEvts.length - 2}</div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {/* Selected day detail */}
                    {myCalSelectedDay && myCalSelectedEvents.length > 0 && (
                      <div className="border-t border-border p-4 bg-secondary/10 space-y-2">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{format(myCalSelectedDay, "MMMM d, yyyy")}</p>
                        <div className="space-y-2">
                          {myCalSelectedEvents.map(evt => (
                            <EventCard key={evt.key} event={evt} color={IMPORTED_COLOR} />
                          ))}
                        </div>
                      </div>
                    )}
                    {myCalSelectedDay && myCalSelectedEvents.length === 0 && (
                      <div className="border-t border-border p-4 bg-secondary/10">
                        <p className="text-xs text-muted-foreground">{format(myCalSelectedDay, "MMMM d")} — no imported events.</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Empty state */}
              {fromImported.length === 0 && !embedSrc && !showEmbedWizard && (
                <div className="text-center py-12 text-muted-foreground">
                  <CalIcon className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No events yet. Upload an .ics file or add an embed link above.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div className="space-y-6">

          {/* Legend */}
          {(courseIds.length > 0 || fromTasks.length > 0 || fromImported.length > 0) && (
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
              <h3 className="font-display font-bold text-lg mb-4">Legend</h3>
              <div className="space-y-2">
                {courseIds.map(id => {
                  const evt = assignmentEvents.find(e => e.courseId === id);
                  return (
                    <div key={id} className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${courseColorMap[id]}`} />
                      <span className="text-sm font-medium text-foreground">{evt?.courseCode}</span>
                      <span className="text-xs text-muted-foreground truncate">{evt?.courseName}</span>
                    </div>
                  );
                })}
                {fromTasks.length > 0 && (
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${TASK_COLOR}`} />
                    <span className="text-sm font-medium text-foreground">Personal tasks</span>
                  </div>
                )}
                {fromImported.length > 0 && (
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${IMPORTED_COLOR}`} />
                    <span className="text-sm font-medium text-foreground">Calendar events</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Selected day panel */}
          {selectedDay && activeTab === "academic" && (
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
              <h3 className="font-display font-bold text-lg mb-4">{format(selectedDay, "MMMM d")}</h3>
              {selectedEvents.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nothing due.</p>
              ) : (
                <div className="space-y-3">
                  {selectedEvents.map(evt => (
                    <EventCard key={evt.key} event={evt} color={colorFor(evt)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Upcoming deadlines */}
          <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
            <h3 className="font-display font-bold text-lg mb-4">Upcoming</h3>
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing upcoming.</p>
            ) : (
              <div className="space-y-3">
                {upcoming.map(evt => (
                  <EventCard key={evt.key} event={evt} color={colorFor(evt)} compact />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <IcsImportModal open={icsModalOpen} onOpenChange={setIcsModalOpen} onSuccess={handleIcsImportSuccess} />
    </div>
  );
}

// ── Event card (shared for grid detail + upcoming list) ───────────────────────

function EventCard({ event, color, compact = false }: { event: UnifiedEvent; color: string; compact?: boolean }) {
  const badge = TYPE_BADGE[event.type] ?? "bg-gray-100 text-gray-700";
  const isAssignment = event.source === "assignment";

  // Build a CalendarEvent shape only for assignments (needed for Google Calendar URL)
  const calEvt = isAssignment ? {
    id: event.id,
    title: event.title,
    type: event.type,
    dueDate: event.date.toISOString(),
    courseId: event.courseId!,
    courseName: event.courseName!,
    courseCode: event.courseCode!,
    weight: Number(event.weight ?? 0),
  } as CalendarEvent : null;

  return (
    <div className={`rounded-xl border border-border bg-background p-3 ${compact ? "space-y-1" : "space-y-2"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
          <span className={`font-semibold text-foreground truncate ${compact ? "text-xs" : "text-sm"}`}>
            {event.title}
          </span>
        </div>
        {calEvt && (
          <a href={getGoogleCalendarUrl(calEvt)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors shrink-0" title="Add to Google Calendar">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badge}`}>{event.type}</span>
        {isAssignment && event.courseCode && (
          <span className="text-xs text-muted-foreground">{event.courseCode}</span>
        )}
        {event.location && !compact && (
          <span className="text-xs text-muted-foreground truncate">{event.location}</span>
        )}
        {compact
          ? <span className="text-xs text-muted-foreground">{format(event.date, "MMM d")}</span>
          : <span className="text-xs text-muted-foreground">
              {event.source === "assignment" ? "Due " : ""}{format(event.date, "MMM d, h:mm a")}
            </span>
        }
      </div>
    </div>
  );
}
