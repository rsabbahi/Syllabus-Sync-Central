import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useCourse } from "@/hooks/use-courses";
import { useAssignments, useCreateAssignment, useDeleteAssignment } from "@/hooks/use-assignments";
import { useUploadSyllabus, useDeleteSyllabus } from "@/hooks/use-syllabi";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { LoadingSpinner } from "@/components/loading";
import { format } from "date-fns";
import { FileText, Plus, Trash2, Upload, AlertCircle, X, BookOpen, Sparkles, ExternalLink, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
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
  
  const [activeTab, setActiveTab] = useState<"syllabus" | "assignments" | "prep">("assignments");
  const [isAdding, setIsAdding] = useState(false);

  if (courseLoading || assignmentsLoading) return <LoadingSpinner />;
  if (!course) return <div className="p-8 text-center text-xl font-bold">Course not found.</div>;

  const hasSyllabus = (course.syllabi || []).length > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-primary/5 rounded-3xl p-8 border border-primary/10">
        <div className="inline-block bg-primary/10 text-primary px-4 py-1.5 rounded-xl text-sm font-bold font-display mb-4">
          {course.code}
        </div>
        <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">{course.name}</h1>
        <p className="text-lg text-muted-foreground font-medium">
          Section {course.section} • {course.term} • {course.studentCount} Students Enrolled
        </p>
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
        }} />}
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
                {prep.topics.map((t: string, i: number) => (
                  <span key={i} className="bg-primary/10 text-primary px-3 py-1.5 rounded-xl text-sm font-semibold" data-testid={`topic-${i}`}>
                    {t}
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
                  {prep.readingPrompts.map((p: string, i: number) => (
                    <li key={i} className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                      <p className="text-sm text-muted-foreground leading-relaxed">{p}</p>
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
                  {prep.practiceQuestions.map((q: string, i: number) => (
                    <li key={i} className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-bold flex items-center justify-center mt-0.5">Q{i + 1}</span>
                      <p className="text-sm text-foreground font-medium leading-relaxed">{q}</p>
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
      weight: Number(formData.weight),
      maxScore: Number(formData.maxScore)
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

function SyllabusTab({ courseId, syllabi, onManualAdd }: { courseId: number, syllabi: any[], onManualAdd: () => void }) {
  const upload = useUploadSyllabus(courseId);
  const deleteSyllabus = useDeleteSyllabus(courseId);
  const [file, setFile] = useState<File | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    upload.mutate(file, {
      onSuccess: () => {
        setFile(null);
        window.location.reload();
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="bg-card rounded-2xl p-8 border border-border shadow-sm text-center">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
          <Upload className="w-8 h-8" />
        </div>
        <h3 className="text-2xl font-display font-bold mb-2">Upload Syllabus</h3>
        <p className="text-muted-foreground max-w-lg mx-auto mb-8">
          Upload a PDF syllabus. Our AI will extract course details, grading weights, and generate a complete timeline of deadlines for everyone in the class.
        </p>
        
        <div className="max-w-md mx-auto flex items-center gap-4">
          <input 
            type="file" 
            accept="application/pdf"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="flex-1 block w-full text-sm text-slate-500 file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90 file:cursor-pointer file:transition-colors bg-secondary rounded-xl"
          />
          <Button 
            onClick={handleUpload} 
            disabled={!file} 
            isLoading={upload.isPending}
            data-testid="button-extract-ai"
          >
            Extract AI
          </Button>
        </div>
      </div>

      {upload.isError && (
        <div className="bg-destructive/10 border border-destructive/20 p-6 rounded-2xl mb-6 animate-in fade-in">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <h4 className="text-destructive font-bold text-lg">Parsing Failed</h4>
          </div>
          <p className="text-destructive/80 mb-4">{(upload.error as any)?.response?.data?.message || "We couldn't extract assignments from this document."}</p>
          <Button variant="outline" onClick={onManualAdd}>
            Add Manually
          </Button>
        </div>
      )}

      {upload.isSuccess && (
        <div className="bg-green-50 border border-green-200 p-6 rounded-2xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-2">
          <div>
            <h4 className="text-green-800 font-bold text-lg">Syllabus Parsed Successfully!</h4>
            <p className="text-green-700">Assignments and study tasks have been created from your syllabus.</p>
          </div>
          <Button variant="primary" onClick={() => window.location.reload()} data-testid="button-view-assignments">
            View Assignments
          </Button>
        </div>
      )}

      {syllabi.length > 0 && (
        <div>
          <h3 className="text-xl font-display font-bold mb-4">Uploaded Documents</h3>
          <div className="grid gap-4">
            {syllabi.map(s => (
              <div key={s.id} className="flex items-center p-4 bg-card border border-border rounded-xl">
                <FileText className="w-8 h-8 text-muted-foreground mr-4" />
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Syllabus Document</p>
                  <p className="text-sm text-muted-foreground">Uploaded on {format(new Date(s.createdAt), "MMM d, yyyy")}</p>
                </div>
                {s.parsedContent && (
                  <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mr-3">
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
