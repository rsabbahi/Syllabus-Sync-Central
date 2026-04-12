import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/button";
import { format } from "date-fns";
import { Upload, FileText, Check, AlertCircle, Loader2, X } from "lucide-react";
import {
  useUploadIcs,
  useConfirmIcsImport,
  type ParsedCalendarEvent,
} from "@/hooks/use-calendar-connections";
import { useToast } from "@/hooks/use-toast";

type Step = "idle" | "file-selected" | "parsing" | "preview" | "importing" | "done";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function IcsImportModal({ open, onOpenChange, onSuccess }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("idle");
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [events, setEvents] = useState<ParsedCalendarEvent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const uploadIcs = useUploadIcs();
  const confirmImport = useConfirmIcsImport();
  const { toast } = useToast();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".ics") && !ext.endsWith(".ical") && !ext.endsWith(".zip")) {
      toast({ title: "Invalid file", description: "Please select a .ics, .ical, or .zip file.", variant: "destructive" });
      return;
    }
    setFileName(file.name);
    setSelectedFile(file);
    setStep("file-selected");
    // Reset input so same file can be re-selected later
    e.target.value = "";
  }

  function handleUpload() {
    if (!selectedFile) return;
    setStep("parsing");
    uploadIcs.mutate(selectedFile, {
      onSuccess: ({ events: parsed }) => {
        setEvents(parsed);
        // Pre-select non-duplicates
        const sel = new Set(parsed.filter(e => !e.isDuplicate).map(e => e.externalId));
        setSelected(sel);
        setStep("preview");
      },
      onError: (err: any) => {
        toast({ title: "Parse failed", description: err.message ?? "Could not parse file.", variant: "destructive" });
        setStep("file-selected");
      },
    });
  }

  function toggleEvent(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll(select: boolean) {
    setSelected(select ? new Set(events.map(e => e.externalId)) : new Set());
  }

  function handleConfirm() {
    const toImport = events.filter(e => selected.has(e.externalId));
    if (toImport.length === 0) return;
    setStep("importing");
    confirmImport.mutate(toImport, {
      onSuccess: ({ imported, skipped }) => {
        setStep("done");
        toast({
          title: "Calendar imported",
          description: `${imported} event${imported !== 1 ? "s" : ""} added as tasks${skipped > 0 ? `, ${skipped} already existed` : ""}.`,
        });
        onSuccess?.();
        setTimeout(() => {
          onOpenChange(false);
          reset();
        }, 1500);
      },
      onError: (err: any) => {
        toast({ title: "Import failed", description: err.message, variant: "destructive" });
        setStep("preview");
      },
    });
  }

  function reset() {
    setStep("idle");
    setFileName("");
    setSelectedFile(null);
    setEvents([]);
    setSelected(new Set());
  }

  const selectedCount = selected.size;
  const duplicateCount = events.filter(e => e.isDuplicate).length;

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Import Calendar File</DialogTitle>
        </DialogHeader>

        {/* ── Step: idle ── */}
        {step === "idle" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a <strong>.ics</strong> or <strong>.zip</strong> file from any calendar app — Google Calendar, Apple Calendar, Outlook, Yahoo, or your school's LMS.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-32 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary"
            >
              <Upload className="w-8 h-8" />
              <span className="text-sm font-semibold">Click to choose file</span>
              <span className="text-xs">.ics, .ical, or .zip accepted</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ics,.ical,.zip"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}

        {/* ── Step: file selected — show name + upload button ── */}
        {step === "file-selected" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-secondary/30">
              <FileText className="w-5 h-5 text-primary shrink-0" />
              <span className="text-sm font-semibold text-foreground truncate flex-1">{fileName}</span>
              <button
                onClick={reset}
                className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                title="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Click <strong>Preview Events</strong> to see what's in this file before importing.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { reset(); setTimeout(() => fileInputRef.current?.click(), 50); }}>
                Choose different file
              </Button>
              <Button variant="primary" onClick={handleUpload}>
                <Upload className="w-4 h-4 mr-2" />
                Preview Events
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ics,.ical,.zip"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}

        {/* ── Step: parsing ── */}
        {step === "parsing" && (
          <div className="py-8 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">Parsing <span className="font-semibold text-foreground">{fileName}</span>…</p>
          </div>
        )}

        {/* ── Step: preview ── */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{events.length}</span> events found
                {duplicateCount > 0 && <span className="ml-1 text-amber-600">({duplicateCount} already imported)</span>}
              </span>
              <div className="flex gap-3">
                <button onClick={() => toggleAll(true)} className="text-primary hover:underline text-xs font-semibold">All</button>
                <button onClick={() => toggleAll(false)} className="text-muted-foreground hover:underline text-xs">None</button>
              </div>
            </div>

            {events.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <AlertCircle className="w-6 h-6" />
                No events found in this file.
              </div>
            ) : (
              <ScrollArea className="h-64 rounded-xl border border-border">
                <div className="divide-y divide-border">
                  {events.map(evt => (
                    <label
                      key={evt.externalId}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-secondary/40 ${evt.isDuplicate ? "opacity-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(evt.externalId)}
                        onChange={() => toggleEvent(evt.externalId)}
                        className="mt-0.5 accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground truncate">{evt.title}</span>
                          {evt.isDuplicate && (
                            <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Already imported</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(evt.startDate), "MMM d, yyyy")}
                          {evt.location && ` · ${evt.location}`}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            )}

            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => { reset(); setTimeout(() => fileInputRef.current?.click(), 50); }}>
                Choose different file
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={selectedCount === 0}
              >
                <FileText className="w-4 h-4 mr-2" />
                Import {selectedCount > 0 ? `${selectedCount} event${selectedCount !== 1 ? "s" : ""}` : ""}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: importing ── */}
        {step === "importing" && (
          <div className="py-8 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">Importing events as tasks…</p>
          </div>
        )}

        {/* ── Step: done ── */}
        {step === "done" && (
          <div className="py-8 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">Import complete!</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
