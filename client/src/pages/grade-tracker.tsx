import { useState } from "react";
import { useGradeTracker, useUpsertGrade } from "@/hooks/use-grades";
import { LoadingSpinner } from "@/components/loading";
import { Input } from "@/components/input";
import { Target, TrendingUp, AlertCircle, ChevronDown, BarChart3 } from "lucide-react";
import { Button } from "@/components/button";

export default function GradeTracker() {
  const { data: trackerData, isLoading } = useGradeTracker();
  const upsertGrade = useUpsertGrade();
  const [expandedCourse, setExpandedCourse] = useState<number | null>(null);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-4xl font-display font-bold">Grade Tracker</h1>
        <p className="text-muted-foreground mt-2 text-lg">Input your scores to track current standing and run "what-if" scenarios.</p>
      </header>

      <div className="grid gap-6">
        {trackerData?.map((course: any) => {
          const items = course.trackerItems || [];
          const gradeBreakdown: { category: string; weight: string }[] = course.gradeBreakdown || [];

          // Calculate current stats
          const gradedItems = items.filter((i: any) => i.grade?.score !== null && i.grade?.score !== undefined);
          const weightAchieved = gradedItems.reduce((sum: number, i: any) => {
            const maxScore = Number(i.assignment.maxScore);
            const weight = Number(i.assignment.weight);
            if (!maxScore || !weight || isNaN(maxScore) || isNaN(weight)) return sum;
            return sum + (Number(i.grade!.score) / maxScore) * weight;
          }, 0);
          const weightAttempted = gradedItems.reduce((sum: number, i: any) => {
            const w = Number(i.assignment.weight);
            return sum + (isNaN(w) ? 0 : w);
          }, 0);
          const currentGrade = weightAttempted > 0 ? (weightAchieved / weightAttempted) * 100 : 0;
          const maxPossible = Math.min(100, weightAchieved + Math.max(0, 100 - weightAttempted));

          const isExpanded = expandedCourse === course.id;

          return (
            <div key={course.id} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
              <div
                className="p-6 cursor-pointer hover:bg-secondary/30 transition-colors flex items-center justify-between"
                onClick={() => setExpandedCourse(isExpanded ? null : course.id)}
              >
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg text-sm font-bold font-display">
                      {course.code}
                    </span>
                    <h2 className="text-2xl font-bold font-display">{course.name}</h2>
                  </div>
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><TrendingUp className="w-4 h-4"/> Current: <strong className="text-foreground">{currentGrade.toFixed(1)}%</strong></span>
                    <span className="flex items-center gap-1"><Target className="w-4 h-4"/> Max Possible: <strong className="text-foreground">{maxPossible.toFixed(1)}%</strong></span>
                  </div>
                </div>
                <div className={`p-2 rounded-full transition-transform duration-300 ${isExpanded ? "rotate-180 bg-secondary" : ""}`}>
                  <ChevronDown className="w-6 h-6 text-muted-foreground" />
                </div>
              </div>

              {isExpanded && (
                <div className="p-6 bg-secondary/10 border-t border-border">
                  {/* Grade Breakdown from Syllabus */}
                  {gradeBreakdown.length > 0 && (
                    <div className="mb-6 p-5 bg-card rounded-xl border border-border/50 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <BarChart3 className="w-5 h-5 text-primary" />
                        <h4 className="font-bold text-lg font-display">Syllabus Grade Breakdown</h4>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {gradeBreakdown.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                            <span className="text-sm font-medium text-foreground truncate mr-2">{item.category}</span>
                            <span className="text-sm font-bold text-primary whitespace-nowrap">{item.weight}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {items.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      No assignments found for this course.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-12 gap-4 text-sm font-bold text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/50">
                        <div className="col-span-5">Assignment</div>
                        <div className="col-span-2">Weight</div>
                        <div className="col-span-5 text-right">Score / Max</div>
                      </div>

                      {items.map((item: any) => (
                        <div key={item.assignment.id} className="grid grid-cols-12 gap-4 items-center p-3 bg-card rounded-xl border border-border/50 shadow-sm">
                          <div className="col-span-5 font-medium">{item.assignment.name}</div>
                          <div className="col-span-2 text-muted-foreground">{item.assignment.weight}%</div>
                          <div className="col-span-5 flex justify-end items-center gap-2">
                            <Input
                              type="number"
                              className="w-24 h-10 text-right font-bold !py-1 !px-3"
                              placeholder="-"
                              defaultValue={item.grade?.score ?? ""}
                              onBlur={(e) => {
                                const val = e.target.value;
                                if (val === "") return;
                                upsertGrade.mutate({
                                  assignmentId: item.assignment.id,
                                  score: val
                                });
                              }}
                            />
                            <span className="text-muted-foreground font-medium">/ {item.assignment.maxScore}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-8 p-6 bg-primary/5 rounded-xl border border-primary/10">
                    <h4 className="font-bold text-lg mb-2">What-If Calculator</h4>
                    <p className="text-muted-foreground text-sm mb-4">Change the scores above to see how it affects your final grade. The calculations update automatically when you click away from an input.</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {trackerData?.length === 0 && (
          <div className="text-center py-20 bg-card rounded-3xl border border-border">
            <Target className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-20" />
            <h2 className="text-2xl font-bold font-display mb-2">No Courses Yet</h2>
            <p className="text-muted-foreground">Join a course to start tracking your grades.</p>
          </div>
        )}
      </div>
    </div>
  );
}
