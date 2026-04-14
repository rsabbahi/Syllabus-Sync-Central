import { useCourses } from "@/hooks/use-courses";
import { useTasks, useUpdateTask, useDeleteTask } from "@/hooks/use-tasks";
import { format, isPast, isToday, isTomorrow, addDays, isBefore } from "date-fns";
import { CheckCircle2, Circle, Trash2, ListTodo, RefreshCw } from "lucide-react";
import { LoadingSpinner } from "@/components/loading";

const RECURRENCE_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

export default function TodoPage() {
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: courses, isLoading: coursesLoading } = useCourses();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  if (tasksLoading || coursesLoading) return <LoadingSpinner />;

  const enrolledCourses = courses?.filter(c => c.isEnrolled) || [];

  // Merge personal tasks and course assignments into one list
  type TodoItem = {
    id: number;
    title: string;
    dueDate: string | Date;
    type: "task" | "assignment";
    completed?: boolean;
    courseCode?: string;
    courseName?: string;
    assignmentType?: string;
    weight?: string | null;
    isRecurring?: boolean;
    recurrenceRule?: string | null;
  };

  const allItems: TodoItem[] = [
    ...(tasks || []).map(t => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      type: "task" as const,
      completed: t.completed ?? false,
      isRecurring: !!(t.recurrenceRule || t.recurrenceParentId),
      recurrenceRule: t.recurrenceRule,
    })),
    ...enrolledCourses.flatMap(c =>
      (c.assignments || []).map((a: any) => ({
        id: a.id,
        title: a.name,
        dueDate: a.dueDate,
        type: "assignment" as const,
        completed: false,
        courseCode: c.code,
        courseName: c.name,
        assignmentType: a.type,
        weight: a.weight,
      }))
    ),
  ].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  // Group by date label
  const grouped: Record<string, TodoItem[]> = {};
  for (const item of allItems) {
    const d = new Date(item.dueDate);
    let label: string;
    if (isPast(d) && !isToday(d)) label = "Overdue";
    else if (isToday(d)) label = "Today";
    else if (isTomorrow(d)) label = "Tomorrow";
    else if (isBefore(d, addDays(new Date(), 7))) label = format(d, "EEEE");
    else label = format(d, "MMM d, yyyy");

    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(item);
  }

  const handleToggleTask = (id: number, currentStatus: boolean) => {
    updateTask.mutate({ id, completed: !currentStatus });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-4xl font-display font-bold flex items-center gap-3">
          <ListTodo className="w-9 h-9 text-primary" />
          To Do
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          All your assignments and tasks, organized by date.
        </p>
      </header>

      {allItems.length === 0 ? (
        <div className="bg-card rounded-2xl p-12 border border-border text-center">
          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-lg font-medium">Nothing to do!</p>
          <p className="text-muted-foreground">Upload a syllabus to auto-populate assignments, or add tasks from the dashboard.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([label, items]) => (
            <div key={label}>
              <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 ${label === "Overdue" ? "text-destructive" : label === "Today" ? "text-primary" : "text-muted-foreground"}`}>
                {label}
                <span className="ml-2 text-xs font-normal normal-case text-muted-foreground">
                  ({items.length} item{items.length !== 1 ? "s" : ""})
                </span>
              </h3>
              <div className="space-y-2">
                {items.map(item => {
                  const eventDate = new Date(item.dueDate);
                  const isOverdue = isPast(eventDate) && !isToday(eventDate);

                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      className={`group flex items-center gap-4 p-4 rounded-xl bg-card border border-border shadow-sm transition-colors hover:bg-secondary/50 ${item.completed ? "opacity-60" : ""}`}
                      data-testid={`todo-${item.type}-${item.id}`}
                    >
                      {/* Checkbox — only for tasks */}
                      <div className="w-8 shrink-0 flex justify-center">
                        {item.type === "task" ? (
                          <button
                            onClick={() => handleToggleTask(item.id, !!item.completed)}
                            className="text-muted-foreground hover:text-primary transition-colors"
                          >
                            {item.completed ? (
                              <CheckCircle2 className="w-6 h-6 text-primary" />
                            ) : (
                              <Circle className="w-6 h-6" />
                            )}
                          </button>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-primary mt-1" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.type === "assignment" && item.courseCode && (
                            <span className="text-xs font-bold text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full">
                              {item.courseCode}
                            </span>
                          )}
                          {item.type === "task" && item.isRecurring && (
                            <span className="text-xs font-bold text-accent-foreground/60 bg-accent px-2 py-0.5 rounded-full flex items-center gap-1">
                              <RefreshCw className="w-3 h-3" />
                              {item.recurrenceRule ? RECURRENCE_LABELS[item.recurrenceRule] : "Recurring"}
                            </span>
                          )}
                          {item.type === "task" && !item.isRecurring && (
                            <span className="text-xs font-bold text-accent-foreground/60 bg-accent px-2 py-0.5 rounded-full">
                              Task
                            </span>
                          )}
                          <span className={`font-semibold ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                            {item.title}
                          </span>
                        </div>
                        {item.type === "assignment" && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.assignmentType && <>{item.assignmentType} • </>}
                            {item.weight && <>{item.weight}% • </>}
                            {item.courseName}
                          </p>
                        )}
                      </div>

                      {/* Date */}
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-medium ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
                          {format(eventDate, "MMM d")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(eventDate, "EEE")}
                        </p>
                      </div>

                      {/* Delete — only for tasks */}
                      {item.type === "task" && (
                        <button
                          onClick={() => deleteTask.mutate(item.id)}
                          className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
