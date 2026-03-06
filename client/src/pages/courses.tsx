import { useState } from "react";
import { Link } from "wouter";
import { useCourses, useCreateCourse, useJoinCourse } from "@/hooks/use-courses";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { LoadingSpinner } from "@/components/loading";
import { BookOpen, Plus, Search, Users, ArrowRight, X } from "lucide-react";

export default function Courses() {
  const { data: courses, isLoading } = useCourses();
  const createCourse = useCreateCourse();
  const joinCourse = useJoinCourse();
  
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
        <Button onClick={() => setIsCreating(true)}>
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
            <Input label="Course Code (e.g. CS101)" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} required />
            <Input label="Course Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
            <Input label="Section (e.g. 01)" value={formData.section} onChange={e => setFormData({...formData, section: e.target.value})} required />
            <Input label="Term (e.g. Fall 2024)" value={formData.term} onChange={e => setFormData({...formData, term: e.target.value})} required />
            <div className="md:col-span-2 flex justify-end mt-2">
              <Button type="submit" isLoading={createCourse.isPending}>Create & Join</Button>
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
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCourses?.map(course => (
          <div key={course.id} className="bg-card rounded-2xl p-6 shadow-sm border border-border hover:shadow-md transition-all group flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-primary/10 text-primary px-3 py-1 rounded-lg text-sm font-bold font-display">
                {course.code}
              </div>
              <div className="flex items-center text-muted-foreground text-sm font-medium">
                <Users className="w-4 h-4 mr-1" /> {course.studentCount}
              </div>
            </div>
            
            <h3 className="text-xl font-bold font-display leading-tight mb-2 line-clamp-2">
              {course.name}
            </h3>
            
            <p className="text-muted-foreground text-sm mb-6 flex-1">
              Section {course.section} • {course.term}
            </p>
            
            {course.isEnrolled ? (
              <Link href={`/courses/${course.id}`} className="block w-full">
                <Button variant="outline" className="w-full group-hover:border-primary group-hover:text-primary transition-colors">
                  Go to Course <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            ) : (
              <Button 
                className="w-full" 
                onClick={() => joinCourse.mutate(course.id)}
                isLoading={joinCourse.isPending}
              >
                Join Course
              </Button>
            )}
          </div>
        ))}
        
        {filteredCourses?.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg">No courses found matching "{search}"</p>
          </div>
        )}
      </div>
    </div>
  );
}
