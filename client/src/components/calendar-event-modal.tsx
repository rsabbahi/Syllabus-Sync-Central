import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/button";
import { Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import {
  useCreateCalendarEvent,
  useUpdateCalendarEvent,
  useDeleteCalendarEventById,
  type ImportedCalendarEvent,
  type CalendarEventInput,
} from "@/hooks/use-calendar-connections";
import { useToast } from "@/hooks/use-toast";

// ── Color palette ──────────────────────────────────────────────────────────

const PALETTE = [
  { label: "Violet",  hex: "#7c3aed" },
  { label: "Blue",    hex: "#2563eb" },
  { label: "Cyan",    hex: "#0891b2" },
  { label: "Emerald", hex: "#059669" },
  { label: "Lime",    hex: "#65a30d" },
  { label: "Amber",   hex: "#d97706" },
  { label: "Orange",  hex: "#ea580c" },
  { label: "Rose",    hex: "#e11d48" },
  { label: "Pink",    hex: "#db2777" },
  { label: "Slate",   hex: "#475569" },
];

const EVENT_TYPES: { value: "class" | "exam" | "life" | "other"; label: string }[] = [
  { value: "class", label: "Class" },
  { value: "exam",  label: "Exam / Test" },
  { value: "life",  label: "Life Event" },
  { value: "other", label: "Other" },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function localDatetimeToISO(local: string): string {
  if (!local) return "";
  return new Date(local).toISOString();
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: ImportedCalendarEvent | null;
  defaultDate?: Date;
}

// ── Component ──────────────────────────────────────────────────────────────

export function CalendarEventModal({ open, onOpenChange, event, defaultDate }: Props) {
  const isEditing = !!event;
  const { toast } = useToast();
  const create = useCreateCalendarEvent();
  const update = useUpdateCalendarEvent();
  const del   = useDeleteCalendarEventById();

  const defaultStart = defaultDate
    ? format(defaultDate, "yyyy-MM-dd'T'HH:mm")
    : format(new Date(), "yyyy-MM-dd'T'HH:mm");

  const [title,       setTitle]       = useState("");
  const [startDate,   setStartDate]   = useState(defaultStart);
  const [endDate,     setEndDate]     = useState("");
  const [description, setDescription] = useState("");
  const [location,    setLocation]    = useState("");
  const [color,       setColor]       = useState(PALETTE[0].hex);
  const [eventType,   setEventType]   = useState<"class" | "exam" | "life" | "other">("class");

  useEffect(() => {
    if (open) {
      if (event) {
        setTitle(event.title ?? "");
        setStartDate(toDatetimeLocal(event.startDate));
        setEndDate(toDatetimeLocal(event.endDate));
        setDescription(event.description ?? "");
        setLocation(event.location ?? "");
        setColor(event.color ?? PALETTE[0].hex);
        setEventType((event.eventType as any) ?? "class");
      } else {
        setTitle("");
        setStartDate(defaultDate ? format(defaultDate, "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'HH:mm"));
        setEndDate("");
        setDescription("");
        setLocation("");
        setColor(PALETTE[0].hex);
        setEventType("class");
      }
    }
  }, [open, event]);

  const isPending = create.isPending || update.isPending || del.isPending;

  function buildPayload(): CalendarEventInput {
    return {
      title: title.trim() || "Untitled Event",
      startDate: localDatetimeToISO(startDate),
      endDate: endDate ? localDatetimeToISO(endDate) : null,
      description: description.trim() || null,
      location: location.trim() || null,
      color,
      eventType,
    };
  }

  function handleSave() {
    if (!startDate) return;
    const payload = buildPayload();
    if (isEditing) {
      update.mutate({ id: event!.id, ...payload }, {
        onSuccess: () => {
          toast({ title: "Event updated" });
          onOpenChange(false);
        },
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      });
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast({ title: "Event added to your calendar" });
          onOpenChange(false);
        },
        onError: () => toast({ title: "Could not create event", variant: "destructive" }),
      });
    }
  }

  function handleDelete() {
    if (!event) return;
    del.mutate(event.id, {
      onSuccess: () => {
        toast({ title: "Event deleted" });
        onOpenChange(false);
      },
      onError: () => toast({ title: "Could not delete event", variant: "destructive" }),
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!isPending) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {isEditing ? "Edit Event" : "Add Event"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Event name"
              className="w-full rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Event type */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">Type</label>
            <div className="flex gap-2 flex-wrap">
              {EVENT_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setEventType(t.value)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    eventType === t.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date / time row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Start</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">End <span className="text-muted-foreground font-normal">(optional)</span></label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">Location <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Room, building, or address"
              className="w-full rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Any extra details…"
              rows={2}
              className="w-full rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          {/* Color picker */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">Color</label>
            <div className="flex gap-2 flex-wrap">
              {PALETTE.map(p => (
                <button
                  key={p.hex}
                  type="button"
                  title={p.label}
                  onClick={() => setColor(p.hex)}
                  className={`w-7 h-7 rounded-full transition-transform ${color === p.hex ? "scale-125 ring-2 ring-offset-2 ring-foreground/30" : "hover:scale-110"}`}
                  style={{ backgroundColor: p.hex }}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors mr-auto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete event
              </button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={isPending || !startDate}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEditing ? "Save changes" : "Add event"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
