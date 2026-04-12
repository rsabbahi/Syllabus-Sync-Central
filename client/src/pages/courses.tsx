import { useState } from "react";
import { Link } from "wouter";
import { useCourses, useCreateCourse, useJoinCourse, useLeaveCourse } from "@/hooks/use-courses";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { LoadingSpinner } from "@/components/loading";
import { BookOpen, Plus, Search, Users, ArrowRight, X, Link2, FileText, LogOut } from "lucide-react";

export default function Courses() {
  const { data: courses, isLoading } = useCourses();
  const createCourse = useCreateCourse();
  const joinCourse = useJoinCourse();
  const leaveCourse = useLeaveCourse();
  
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    section: "",
    term: ""
  });

  if (isLoading) return <LoadingSpinner />;

  const filteredCourses = courses?.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  const myCourses = filteredCourses?.filter(c => c.isEnrolled) || [];
  const availableCourses = filteredCourses?.filter(c => !c.isEnrolled) || [];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createCourse.mutate(formData, {
      onSuccess: () => {
        setIsCreating(false);
        setFormData({ code: "", name: "", section: "", term: "" });
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold">Course Directory</h1>
          <p className="text-muted-foreground mt-2">Find and join your classes, or create a new one.</p>
        </div>
        <Button onClick={() => setIsCreating(true)} data-testid="button-new-course">
          <Plus className="w-4 h-4 mr-2" /> New Course
        </Button>
      </div>

      {isCreating && (
        <div className="bg-card rounded-2xl p-6 shadow-sm border border-border relative">
          <button 
            onClick={() => setIsCreating(false)}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-display font-bold mb-4">Create a Course</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Course Code (e.g. CS101)" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} required data-testid="input-course-code" />
            <Input label="Course Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required data-testid="input-course-name" />
            <Input label="Section (e.g. 01)" value={formData.section} onChange={e => setFormData({...formData, section: e.target.value})} required data-testid="input-course-section" />
            <Input label="Term (e.g. Fall 2024)" value={formData.term} onChange={e => setFormData({...formData, term: e.target.value})} required data-testid="input-course-term" />
            <div className="md:col-span-2 flex justify-end mt-2">
              <Button type="submit" isLoading={createCourse.isPending} data-testid="button-create-course">Create & Join</Button>
            </div>
          </form>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input 
          placeholder="Search by course code or name..." 
          className="pl-12"
          value={search}
          onChange={e => setSearch(e.target.value)}
          data-testid="input-search-courses"
        />
      </div>

      {/* My Courses */}
      {myCourses.length > 0 && (
        <section>
          <h2 className="text-lg font-display font-bold text-foreground mb-4">My Courses</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myCourses.map(course => (
              <CourseCard
                key={course.id}
                course={course}
                onJoin={() => {}}
                isJoining={false}
                onLeave={() => {
                  if (window.confirm(`Leave "${course.name}"? If you created it and no other students are enrolled, it will be deleted.`)) {
                    leaveCourse.mutate(course.id);
                  }
                }}
                isLeaving={leaveCourse.isPending}
              />
            ))}
          </div>
        </section>
      )}

      {/* Available to Link In */}
      {availableCourses.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <Link2 className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-display font-bold text-foreground">Available to Link In</h2>
            <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">Crowdsourced</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            These courses already have syllabi uploaded by other students. Link in to instantly get their assignments, deadlines, and calendar — no upload needed.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {availableCourses.map(course => (
              <CourseCard
                key={course.id}
                course={course}
                onJoin={() => joinCourse.mutate(course.id)}
                isJoining={joinCourse.isPending}
              />
            ))}
          </div>
        </section>
      )}

      {filteredCourses?.length === 0 && (
        <div className="col-span-full py-12 text-center text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg">No courses found matching "{search}"</p>
        </div>
      )}
    </div>
  );
}

function CourseCard({ course, onJoin, isJoining, onLeave, isLeaving }: {
  course: any;
  onJoin: () => void;
  isJoining: boolean;
  onLeave?: () => void;
  isLeaving?: boolean;
}) {
  const hasCanonicalSyllabus = (course.syllabi?.length || 0) > 0;

  return (
    <div className="bg-card rounded-2xl p-6 shadow-sm border border-border hover:shadow-md transition-all group flex flex-col" data-testid={`card-course-${course.id}`}>
      <div className="flex justify-between items-start mb-3">
        <div className="bg-primary/10 text-primary px-3 py-1 rounded-lg text-sm font-bold font-display">
          {course.code}
        </div>
        <div className="flex items-center gap-2">
          {hasCanonicalSyllabus && (
            <span className="flex items-center gap-1 text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full" data-testid={`badge-canonical-${course.id}`}>
              <FileText className="w-3 h-3" />
              Syllabus Ready
            </span>
          )}
          <div className="flex items-center text-muted-foreground text-sm font-medium">
            <Users className="w-4 h-4 mr-1" /> {course.studentCount}
          </div>
        </div>
      </div>
      
      <h3 className="text-xl font-bold font-display leading-tight mb-2 line-clamp-2">
        {course.name}
      </h3>
      
      <p className="text-muted-foreground text-sm mb-5 flex-1">
        Section {course.section} • {course.term}
      </p>

      {hasCanonicalSyllabus && !course.isEnrolled && (
        <p className="text-xs text-muted-foreground bg-secondary rounded-lg px-3 py-2 mb-3">
          {course.assignments?.length || 0} assignments already extracted and ready for you.
        </p>
      )}
      
      {course.isEnrolled ? (
        <div className="flex gap-2">
          <Link href={`/courses/${course.id}`} className="flex-1">
            <Button variant="outline" className="w-full group-hover:border-primary group-hover:text-primary transition-colors" data-testid={`button-goto-course-${course.id}`}>
              Go to Course <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          {onLeave && (
            <Button
              variant="outline"
              className="shrink-0 text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
              onClick={onLeave}
              isLoading={isLeaving}
              title="Leave course"
              data-testid={`button-leave-course-${course.id}`}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          )}
        </div>
      ) : (
        <Button 
          variant="primary"
          className="w-full"
          onClick={onJoin}
          isLoading={isJoining}
          data-testid={`button-join-course-${course.id}`}
        >
          <Link2 className="w-4 h-4 mr-2" />
          {hasCanonicalSyllabus ? "Link In" : "Join Course"}
        </Button>
      )}
    </div>
  );
}
