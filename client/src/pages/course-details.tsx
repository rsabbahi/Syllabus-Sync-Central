import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useCourse } from "@/hooks/use-courses";
import { useAssignments, useCreateAssignment, useDeleteAssignment } from "@/hooks/use-assignments";
import { useParseSyllabus, useUploadSyllabus, useDeleteSyllabus } from "@/hooks/use-syllabi";
import { useLeaveCourse } from "@/hooks/use-courses";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { LoadingSpinner } from "@/components/loading";
import { format } from "date-fns";
import { FileText, Plus, Trash2, Upload, AlertCircle, X, BookOpen, Sparkles, ExternalLink, RefreshCw, ChevronDown, ChevronUp, LogOut } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { buildUrl } from "@shared/routes";

const PLATFORM_COLORS: Record<string, string> = {
  "YouTube": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "Khan Academy": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "MIT OpenCourseWare": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "Google Scholar": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "Wikipedia": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  "Coursera": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

export default function CourseDetails() {
  const [, params] = useRoute("/courses/:id");
  const courseId = parseInt(params?.id || "0");

  const { data: course, isLoading: courseLoading } = useCourse(courseId);
  const { data: assignments, isLoading: assignmentsLoading } = useAssignments(courseId);
  const leaveCourse = useLeaveCourse();

  const [activeTab, setActiveTab] = useState<"syllabus" | "assignments" | "prep">("assignments");
  const [isAdding, setIsAdding] = useState(false);

  if (courseLoading || assignmentsLoading) return <LoadingSpinner />;
  if (!course) return <div className="p-8 text-center text-xl font-bold">Course not found.</div>;

  const hasSyllabus = (course.syllabi || []).length > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-primary/5 rounded-3xl p-8 border border-primary/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-block bg-primary/10 text-primary px-4 py-1.5 rounded-xl text-sm font-bold font-display mb-4">
              {course.code}
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-2">{course.name}</h1>
            <p className="text-lg text-muted-foreground font-medium">
              Section {course.section} • {course.term}
              {course.instructor && <> • Prof. {course.instructor}</>}
              {" "}• {course.studentCount} Students Enrolled
            </p>
            {course.summary && (
              <p className="mt-3 text-sm text-muted-foreground/80 leading-relaxed max-w-3xl">
                {course.summary}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              if (window.confirm(`Leave "${course.name}"? If you created it and no other students are enrolled, it will be deleted.`)) {
                leaveCourse.mutate(courseId, { onSuccess: () => window.location.href = "/courses" });
              }
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-destructive border border-border hover:border-destructive/50 rounded-xl transition-colors shrink-0"
            title="Leave course"
            data-testid="button-leave-course"
          >
            <LogOut className="w-4 h-4" />
            Leave
          </button>
        </div>
      </div>

      <div className="flex border-b border-border">
        <TabButton active={activeTab === "assignments"} onClick={() => setActiveTab("assignments")}>
          Assignments & Timeline
        </TabButton>
        <TabButton active={activeTab === "syllabus"} onClick={() => setActiveTab("syllabus")}>
          Syllabus Extraction
        </TabButton>
        <TabButton active={activeTab === "prep"} onClick={() => setActiveTab("prep")}>
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Study Prep
            {!hasSyllabus && <span className="text-xs bg-muted text-muted-foreground px-1.5 rounded">needs syllabus</span>}
          </span>
        </TabButton>
      </div>

      <div className="pt-4">
        {activeTab === "assignments" && <AssignmentsTab courseId={courseId} assignments={assignments || []} forceAdd={isAdding} />}
        {activeTab === "syllabus" && <SyllabusTab courseId={courseId} syllabi={course.syllabi || []} onManualAdd={() => {
          setIsAdding(true);
          setActiveTab("assignments");
        }} onSuccess={() => setActiveTab("assignments")} />}
        {activeTab === "prep" && <PrepTab courseId={courseId} hasSyllabus={hasSyllabus} />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-4 font-semibold text-lg border-b-2 transition-colors ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

// ─── STUDY PREP TAB (T002) ────────────────────────────────────────────────────

function PrepTab({ courseId, hasSyllabus }: { courseId: number; hasSyllabus: boolean }) {
  const queryClient = useQueryClient();
  const prepKey = [`/api/courses/${courseId}/prep`];

  const { data: prep, isLoading, error } = useQuery<any>({
    queryKey: prepKey,
    retry: false,
    enabled: hasSyllabus,
  });

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/courses/${courseId}/prep`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: prepKey }),
  });

  if (!hasSyllabus) {
    return (
      <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border">
        <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
        <p className="text-lg font-semibold text-foreground mb-2">Upload a syllabus first</p>
        <p className="text-muted-foreground">AI-generated study prep requires a parsed syllabus.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">Pre-Lecture Study Prep</h2>
          <p className="text-muted-foreground mt-1">AI-generated summaries, reading prompts, and practice questions from your syllabus.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => generate.mutate()}
          isLoading={generate.isPending}
          data-testid="button-generate-prep"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          {prep ? "Regenerate" : "Generate Prep Content"}
        </Button>
      </div>

      {isLoading && <LoadingSpinner />}

      {!prep && !isLoading && !generate.isPending && (
        <div className="text-center py-16 bg-card rounded-2xl border border-dashed border-border">
          <Sparkles className="w-12 h-12 text-primary/40 mx-auto mb-4" />
          <p className="text-lg font-semibold mb-2">No prep content yet</p>
          <p className="text-muted-foreground mb-6">Click "Generate Prep Content" to create AI-powered study materials from your syllabus.</p>
        </div>
      )}

      {generate.isPending && (
        <div className="bg-primary/5 border border-primary/15 rounded-2xl p-8 text-center animate-pulse">
          <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
          <p className="font-semibold text-foreground">Generating your study prep...</p>
          <p className="text-muted-foreground text-sm mt-1">This may take 15-20 seconds.</p>
        </div>
      )}

      {prep && !generate.isPending && (
        <div className="space-y-6">
          {/* Generated at */}
          {prep.generatedAt && (
            <p className="text-xs text-muted-foreground">
              Generated {format(new Date(prep.generatedAt), "MMM d, yyyy 'at' h:mm a")}
            </p>
          )}

          {/* Course Summary */}
          {prep.summary && (
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
              <h3 className="font-display font-bold text-lg mb-3 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Course Overview
              </h3>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{prep.summary}</p>
            </div>
          )}

          {/* Key Topics */}
          {prep.topics?.length > 0 && (
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
              <h3 className="font-display font-bold text-lg mb-4">Key Topics</h3>
              <div className="flex flex-wrap gap-2">
                {prep.topics.map((t: any, i: number) => (
                  <span key={i} className="bg-primary/10 text-primary px-3 py-1.5 rounded-xl text-sm font-semibold" data-testid={`topic-${i}`}>
                    {typeof t === "string" ? t : t?.name ?? t?.title ?? String(t)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Reading Prompts */}
            {prep.readingPrompts?.length > 0 && (
              <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                <h3 className="font-display font-bold text-lg mb-4">Reading Prompts</h3>
                <ol className="space-y-3">
                  {prep.readingPrompts.map((p: any, i: number) => (
                    <li key={i} className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                      <p className="text-sm text-muted-foreground leading-relaxed">{typeof p === "string" ? p : p?.text ?? p?.prompt ?? String(p)}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Practice Questions */}
            {prep.practiceQuestions?.length > 0 && (
              <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                <h3 className="font-display font-bold text-lg mb-4">Practice Questions</h3>
                <ol className="space-y-3">
                  {prep.practiceQuestions.map((q: any, i: number) => (
                    <li key={i} className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-bold flex items-center justify-center mt-0.5">Q{i + 1}</span>
                      <p className="text-sm text-foreground font-medium leading-relaxed">{typeof q === "string" ? q : q?.question ?? q?.text ?? String(q)}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ASSIGNMENTS TAB (with T004 Resources) ────────────────────────────────────

function AssignmentsTab({ courseId, assignments, forceAdd }: { courseId: number, assignments: any[], forceAdd?: boolean }) {
  const createAssignment = useCreateAssignment(courseId);
  const deleteAssignment = useDeleteAssignment(courseId);
  const [isAdding, setIsAdding] = useState(forceAdd || false);
  
  useEffect(() => {
    if (forceAdd) setIsAdding(true);
  }, [forceAdd]);
  
  const [formData, setFormData] = useState({
    name: "",
    type: "hw",
    dueDate: "",
    weight: "",
    maxScore: "100"
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createAssignment.mutate({
      ...formData,
      dueDate: new Date(formData.dueDate),
      weight: formData.weight,
      maxScore: formData.maxScore
    }, {
      onSuccess: () => {
        setIsAdding(false);
        setFormData({ name: "", type: "hw", dueDate: "", weight: "", maxScore: "100" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold">Crowdsourced Timeline</h2>
        <Button onClick={() => setIsAdding(!isAdding)} variant={isAdding ? "outline" : "primary"}>
          {isAdding ? "Cancel" : <><Plus className="w-4 h-4 mr-2" /> Add Assignment</>}
        </Button>
      </div>

      {isAdding && (
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm mb-6 animate-in slide-in-from-top-4">
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-2">
              <Input label="Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
            </div>
            <div className="md:col-span-1">
              <Input label="Type (exam, hw, paper)" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} required />
            </div>
            <div className="md:col-span-2">
              <Input type="date" label="Due Date" value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} required />
            </div>
            <div className="md:col-span-2">
              <Input type="number" step="0.1" label="Weight % (e.g. 15)" value={formData.weight} onChange={e => setFormData({...formData, weight: e.target.value})} required />
            </div>
            <div className="md:col-span-2">
              <Input type="number" label="Max Score" value={formData.maxScore} onChange={e => setFormData({...formData, maxScore: e.target.value})} required />
            </div>
            <div className="md:col-span-1 flex items-end">
              <Button type="submit" className="w-full" isLoading={createAssignment.isPending}>Save</Button>
            </div>
          </form>
        </div>
      )}

      {assignments.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border border-dashed">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium">No assignments yet</p>
          <p className="text-muted-foreground">Upload a syllabus to auto-extract, or add one manually.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).map(a => (
            <AssignmentRow key={a.id} assignment={a} onDelete={() => deleteAssignment.mutate(a.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentRow({ assignment, onDelete }: { assignment: any; onDelete: () => void }) {
  const [showResources, setShowResources] = useState(false);
  const resourceKey = [`/api/assignments/${assignment.id}/resources`];

  const { data: resources, isLoading: resourcesLoading } = useQuery<any[]>({
    queryKey: resourceKey,
    enabled: showResources,
    retry: false,
  });

  const queryClient = useQueryClient();
  const generateResources = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/assignments/${assignment.id}/resources`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: resourceKey }),
  });

  const hasResources = resources && resources.length > 0;

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden" data-testid={`assignment-row-${assignment.id}`}>
      <div className="flex items-center gap-4 p-4">
        <div className="flex-1 grid grid-cols-4 gap-4 items-center">
          <div className="col-span-2">
            <p className="font-semibold text-foreground">{assignment.name}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mt-0.5">{assignment.type}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{format(new Date(assignment.dueDate), "MMM d, yyyy")}</p>
          </div>
          <div>
            <span className="bg-primary/10 text-primary px-2 py-1 rounded font-bold text-sm">{assignment.weight}%</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowResources(!showResources)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${showResources ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            data-testid={`button-resources-${assignment.id}`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Resources
            {showResources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <button 
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive p-2 transition-colors"
            data-testid={`button-delete-assignment-${assignment.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Resources Panel */}
      {showResources && (
        <div className="border-t border-border bg-secondary/30 p-5 animate-in slide-in-from-top-2" data-testid={`resources-panel-${assignment.id}`}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              Study Resources for "{assignment.name}"
            </h4>
            <button
              onClick={() => generateResources.mutate()}
              disabled={generateResources.isPending}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
              data-testid={`button-generate-resources-${assignment.id}`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${generateResources.isPending ? "animate-spin" : ""}`} />
              {hasResources ? "Refresh" : "Generate Links"}
            </button>
          </div>

          {(resourcesLoading || generateResources.isPending) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Finding study resources...
            </div>
          )}

          {!hasResources && !resourcesLoading && !generateResources.isPending && (
            <p className="text-sm text-muted-foreground py-2">
              Click "Generate Links" to get AI-curated study links for this assignment.
            </p>
          )}

          {hasResources && !generateResources.isPending && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {resources!.map((r: any, i: number) => (
                <a
                  key={i}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-background rounded-xl border border-border hover:border-primary/40 hover:shadow-sm transition-all group"
                  data-testid={`resource-link-${assignment.id}-${i}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{r.title}</p>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${PLATFORM_COLORS[r.platform] || "bg-gray-100 text-gray-700"}`}>
                      {r.platform}
                    </span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SYLLABUS TAB ────────────────────────────────────────────────────────────

const DEADLINE_BADGE_COLORS: Record<string, string> = {
  exam: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  quiz: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  assignment: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  project: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  other: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function SyllabusTab({ courseId, syllabi, onManualAdd, onSuccess }: { courseId: number, syllabi: any[], onManualAdd: () => void, onSuccess?: () => void }) {
  const parse = useParseSyllabus(courseId);
  const deleteSyllabus = useDeleteSyllabus(courseId);
  const [file, setFile] = useState<File | null>(null);

  // Get the latest parsed content from either the mutation result or the most recent syllabus
  const parsedFromMutation = parse.data?.parsed;
  const latestSyllabus = syllabi.length > 0 ? syllabi[0] : null;
  const parsedContent = parsedFromMutation || latestSyllabus?.parsedContent;

  const handleUpload = async () => {
    if (!file) return;
    parse.mutate(file, {
      onSuccess: () => {
        setFile(null);
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Upload Section */}
      <div className="bg-card rounded-2xl p-8 border border-border shadow-sm text-center">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
          <Upload className="w-8 h-8" />
        </div>
        <h3 className="text-2xl font-display font-bold mb-2">Upload Syllabus</h3>
        <p className="text-muted-foreground max-w-lg mx-auto mb-8">
          Upload your syllabus PDF. AI will extract the course info, grading weights, deadlines, and assignments.
        </p>

        <div className="max-w-md mx-auto flex items-center gap-4">
          <input
            type="file"
            accept="application/pdf,.pdf,.docx,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="flex-1 block w-full text-sm text-slate-500 file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90 file:cursor-pointer file:transition-colors bg-secondary rounded-xl"
          />
          <Button
            onClick={handleUpload}
            disabled={!file}
            isLoading={parse.isPending}
            data-testid="button-extract-ai"
          >
            {parse.isPending ? "Parsing..." : "Parse Syllabus"}
          </Button>
        </div>

        {parse.isPending && (
          <div className="mt-6 flex items-center justify-center gap-3 text-muted-foreground animate-pulse">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">Reading PDF and analyzing with AI... this may take 15-30 seconds</span>
          </div>
        )}
      </div>

      {/* Error State */}
      {parse.isError && (
        <div className="bg-destructive/10 border border-destructive/20 p-6 rounded-2xl animate-in fade-in">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <h4 className="text-destructive font-bold text-lg">Parsing Failed</h4>
          </div>
          <p className="text-destructive/80 mb-4">{parse.error?.message || "We couldn't extract info from this document."}</p>
          <Button variant="outline" onClick={onManualAdd}>Add Manually</Button>
        </div>
      )}

      {/* Success Banner */}
      {parse.isSuccess && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-6 rounded-2xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-2">
          <div>
            <h4 className="text-green-800 dark:text-green-300 font-bold text-lg">Syllabus Parsed Successfully!</h4>
            <p className="text-green-700 dark:text-green-400">{parse.data?.message}</p>
          </div>
          <Button variant="primary" onClick={onSuccess} data-testid="button-view-assignments">
            View Assignments
          </Button>
        </div>
      )}

      {/* ── Parsed Results Display ── */}
      {parsedContent && (
        <div className="space-y-6 animate-in fade-in">
          {/* Course Info Header */}
          {parsedContent.course && (
            <div className="bg-primary/5 rounded-2xl p-6 border border-primary/10">
              <h3 className="text-2xl font-display font-bold text-foreground">
                {parsedContent.course.name || "Course"}
              </h3>
              <p className="text-muted-foreground mt-1">
                {parsedContent.course.instructor && <>Prof. {parsedContent.course.instructor}</>}
                {parsedContent.course.instructor && parsedContent.course.term && " • "}
                {parsedContent.course.term}
              </p>
              {parsedContent.course.meeting_times && (
                <p className="text-sm text-muted-foreground/80 mt-1">
                  📅 {parsedContent.course.meeting_times}
                </p>
              )}
            </div>
          )}

          {/* Summary */}
          {parsedContent.summary && (
            <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
              <h4 className="font-display font-bold text-lg mb-2">Course Summary</h4>
              <p className="text-muted-foreground leading-relaxed">{parsedContent.summary}</p>
            </div>
          )}

          {/* Grade Breakdown Table */}
          {Array.isArray(parsedContent.grade_breakdown) && parsedContent.grade_breakdown.length > 0 && (
            <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
              <h4 className="font-display font-bold text-lg mb-4">Grade Breakdown</h4>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary">
                      <th className="text-left px-4 py-3 font-bold text-foreground">Category</th>
                      <th className="text-right px-4 py-3 font-bold text-foreground">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedContent.grade_breakdown.map((item: any, idx: number) => (
                      <tr key={idx} className="border-t border-border hover:bg-secondary/50 transition-colors">
                        <td className="px-4 py-3 text-foreground">{item.category}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="bg-primary/10 text-primary px-2.5 py-1 rounded-lg font-bold text-xs">
                            {item.weight}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Deadlines */}
          {Array.isArray(parsedContent.deadlines) && parsedContent.deadlines.length > 0 && (
            <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
              <h4 className="font-display font-bold text-lg mb-4">Deadlines</h4>
              <div className="space-y-2">
                {parsedContent.deadlines.map((d: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${DEADLINE_BADGE_COLORS[d.type] || DEADLINE_BADGE_COLORS.other}`}>
                        {d.type}
                      </span>
                      <span className="font-medium text-foreground">{d.item}</span>
                    </div>
                    <span className="text-sm text-muted-foreground font-medium shrink-0 ml-4">{d.date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assignments */}
          {Array.isArray(parsedContent.assignments) && parsedContent.assignments.length > 0 && (
            <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
              <h4 className="font-display font-bold text-lg mb-4">Assignments</h4>
              <div className="space-y-2">
                {parsedContent.assignments.map((a: any, idx: number) => (
                  <div key={idx} className="flex items-start justify-between p-3 rounded-xl hover:bg-secondary/50 transition-colors">
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{a.name}</p>
                      {a.description && <p className="text-sm text-muted-foreground mt-0.5">{a.description}</p>}
                    </div>
                    {a.weight && (
                      <span className="bg-primary/10 text-primary px-2.5 py-1 rounded-lg font-bold text-xs shrink-0 ml-4">
                        {a.weight}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Policies */}
          {Array.isArray(parsedContent.important_policies) && parsedContent.important_policies.length > 0 && (
            <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
              <h4 className="font-display font-bold text-lg mb-4">Key Policies</h4>
              <ul className="space-y-2">
                {parsedContent.important_policies.map((policy: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                    {policy}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Uploaded Documents List */}
      {syllabi.length > 0 && (
        <div>
          <h3 className="text-xl font-display font-bold mb-4">Uploaded Documents</h3>
          <div className="grid gap-4">
            {syllabi.map((s: any) => (
              <div key={s.id} className="flex items-center p-4 bg-card border border-border rounded-xl">
                <FileText className="w-8 h-8 text-muted-foreground mr-4" />
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Syllabus Document</p>
                  <p className="text-sm text-muted-foreground">Uploaded on {format(new Date(s.createdAt), "MMM d, yyyy")}</p>
                </div>
                {s.parsedContent && (
                  <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mr-3">
                    AI Parsed
                  </span>
                )}
                <button
                  onClick={() => deleteSyllabus.mutate(s.id)}
                  disabled={deleteSyllabus.isPending}
                  className="text-muted-foreground hover:text-destructive p-2 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
