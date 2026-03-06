import { useState } from "react";
import { useRoute } from "wouter";
import { useCourse } from "@/hooks/use-courses";
import { useAssignments, useCreateAssignment, useDeleteAssignment } from "@/hooks/use-assignments";
import { useUploadSyllabus } from "@/hooks/use-syllabi";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { LoadingSpinner } from "@/components/loading";
import { format } from "date-fns";
import { FileText, Plus, Trash2, Upload, AlertCircle } from "lucide-react";

export default function CourseDetails() {
  const [, params] = useRoute("/courses/:id");
  const courseId = parseInt(params?.id || "0");
  
  const { data: course, isLoading: courseLoading } = useCourse(courseId);
  const { data: assignments, isLoading: assignmentsLoading } = useAssignments(courseId);
  
  const [activeTab, setActiveTab] = useState<"syllabus" | "assignments">("assignments");

  if (courseLoading || assignmentsLoading) return <LoadingSpinner />;
  if (!course) return <div className="p-8 text-center text-xl font-bold">Course not found.</div>;

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
        <button 
          onClick={() => setActiveTab("assignments")}
          className={`px-6 py-4 font-semibold text-lg border-b-2 transition-colors ${activeTab === "assignments" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Assignments & Timeline
        </button>
        <button 
          onClick={() => setActiveTab("syllabus")}
          className={`px-6 py-4 font-semibold text-lg border-b-2 transition-colors ${activeTab === "syllabus" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Syllabus Extraction
        </button>
      </div>

      <div className="pt-4">
        {activeTab === "assignments" && <AssignmentsTab courseId={courseId} assignments={assignments || []} />}
        {activeTab === "syllabus" && <SyllabusTab courseId={courseId} syllabi={course.syllabi || []} />}
      </div>
    </div>
  );
}

function AssignmentsTab({ courseId, assignments }: { courseId: number, assignments: any[] }) {
  const createAssignment = useCreateAssignment(courseId);
  const deleteAssignment = useDeleteAssignment(courseId);
  const [isAdding, setIsAdding] = useState(false);
  
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
        <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary/50 border-b border-border text-sm font-semibold text-muted-foreground">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Due Date</th>
                  <th className="p-4">Weight</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {assignments.sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).map(a => (
                  <tr key={a.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="p-4 font-medium text-foreground">{a.name}</td>
                    <td className="p-4 uppercase text-xs tracking-wider text-muted-foreground font-bold">{a.type}</td>
                    <td className="p-4">{format(new Date(a.dueDate), "MMM d, yyyy")}</td>
                    <td className="p-4">
                      <span className="bg-primary/10 text-primary px-2 py-1 rounded font-bold">{a.weight}%</span>
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => deleteAssignment.mutate(a.id)}
                        className="text-muted-foreground hover:text-destructive p-2 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SyllabusTab({ courseId, syllabi }: { courseId: number, syllabi: any[] }) {
  const upload = useUploadSyllabus(courseId);
  const [file, setFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<"syllabus" | "assignments">("assignments"); // This is just for context, we need to find a way to switch

  const handleUpload = async () => {
    if (!file) return;
    upload.mutate(file, {
      onSuccess: () => {
        setFile(null);
        // We can't easily reach setActiveTab here without moving it or passing it,
        // but the toast will guide the user.
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
          >
            Extract AI
          </Button>
        </div>
      </div>

      {upload.isSuccess && (
        <div className="bg-green-50 border border-green-200 p-6 rounded-2xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-2">
          <div>
            <h4 className="text-green-800 font-bold text-lg">Success! Syllabus Parsed.</h4>
            <p className="text-green-700">The AI has successfully created assignments and study tasks from your syllabus.</p>
          </div>
          <Button variant="primary" onClick={() => window.location.reload()}>
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
                  <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                    AI Parsed
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
