import { db } from "./db";
import { eq, and, inArray, isNull } from "drizzle-orm";
import {
  courses,
  courseStudents,
  syllabi,
  assignments,
  userGrades,
  tasks,
  users,
  prepCache,
  assignmentResources,
  calendarConnections,
  calendarImportedEvents,
  type User,
  type Course,
  type CourseStudent,
  type Syllabus,
  type Assignment,
  type UserGrade,
  type Task,
  type PrepCache,
  type AssignmentResources,
  type CalendarConnection,
  type CalendarImportedEvent,
  type InsertCalendarConnection,
  type InsertCourse,
  type InsertTask,
  type UpdateTask,
  type InsertUserGrade,
  type InsertAssignment,
  type UpdateAssignment,
  type UpdateUserProfile,
  type CourseResponse,
  type CourseGradeTrackerResponse,
  type GradeTrackerItem,
  type PrepContent,
  type ResourceLink
} from "@shared/schema";
import { addWeeks } from "date-fns";
import type { NormalizedEvent } from "./services/calendar/icsParser";

export interface IStorage {
  // Profile
  getUser(id: string): Promise<User | undefined>;
  updateUserProfile(id: string, updates: UpdateUserProfile): Promise<User>;

  // Course
  getCourses(): Promise<Course[]>;
  getCourse(id: number): Promise<Course | undefined>;
  createCourse(course: InsertCourse, userId: string): Promise<Course>;
  joinCourse(courseId: number, userId: string): Promise<void>;
  leaveCourse(courseId: number, userId: string): Promise<void>;
  getEnrolledCourses(userId: string): Promise<Course[]>;
  getCourseDetails(courseId: number, userId: string): Promise<CourseResponse | undefined>;

  // Syllabus
  addSyllabus(courseId: number, userId: string, fileUrl: string, rawText: string, parsedContent: any): Promise<Syllabus>;
  deleteSyllabus(id: number): Promise<void>;
  getSyllabiForCourse(courseId: number): Promise<Syllabus[]>;

  // Assignments
  getAssignmentsByCourse(courseId: number): Promise<Assignment[]>;
  getAssignment(id: number): Promise<Assignment | undefined>;
  clearCourseAssignments(courseId: number): Promise<void>;
  createAssignment(courseId: number, assignment: Omit<InsertAssignment, "courseId">): Promise<Assignment>;
  updateAssignment(id: number, updates: UpdateAssignment): Promise<Assignment>;
  deleteAssignment(id: number): Promise<void>;

  // Grades
  getUserGrades(userId: string): Promise<UserGrade[]>;
  upsertUserGrade(userId: string, grade: InsertUserGrade): Promise<UserGrade>;
  getGradeTracker(userId: string): Promise<CourseGradeTrackerResponse[]>;

  // Tasks
  getTasksByUser(userId: string): Promise<Task[]>;
  createTask(userId: string, task: InsertTask): Promise<Task>;
  createTaskWithRecurrence(userId: string, task: InsertTask): Promise<Task[]>;
  updateTask(id: number, updates: UpdateTask): Promise<Task>;
  deleteTask(id: number): Promise<void>;
  deleteTaskAndRecurrences(parentId: number): Promise<void>;

  // Prep Cache (T002)
  getPrepCache(courseId: number): Promise<PrepCache | undefined>;
  upsertPrepCache(courseId: number, content: PrepContent): Promise<PrepCache>;

  // Assignment Resources (T004)
  getAssignmentResources(assignmentId: number): Promise<AssignmentResources | undefined>;
  upsertAssignmentResources(assignmentId: number, resources: ResourceLink[]): Promise<AssignmentResources>;

  // Helpers
  generateTasksForAssignment(userId: string, assignment: Assignment): Promise<void>;

  // Calendar Connections
  getCalendarConnections(userId: string): Promise<CalendarConnection[]>;
  getCalendarConnection(id: number): Promise<CalendarConnection | undefined>;
  upsertCalendarConnection(data: InsertCalendarConnection): Promise<CalendarConnection>;
  updateCalendarConnectionTokens(id: number, tokens: { accessToken: string; refreshToken?: string; tokenExpiresAt: Date }): Promise<void>;
  touchCalendarConnection(id: number): Promise<void>;
  deleteCalendarConnection(id: number): Promise<void>;

  // Calendar Imported Events
  getImportedExternalIds(userId: string): Promise<string[]>;
  getCalendarImportedEvents(userId: string): Promise<CalendarImportedEvent[]>;
  importCalendarEvents(userId: string, connectionId: number | null, events: NormalizedEvent[]): Promise<{ imported: number; skipped: number }>;
  deleteImportedEventsByConnection(connectionId: number): Promise<void>;
  cleanupOldCalendarTasks(userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUserProfile(id: string, updates: UpdateUserProfile): Promise<User> {
    const [updated] = await db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async getCourses(): Promise<Course[]> {
    return await db.select().from(courses);
  }

  async getCourse(id: number): Promise<Course | undefined> {
    const [course] = await db.select().from(courses).where(eq(courses.id, id));
    return course;
  }

  async createCourse(course: InsertCourse, userId: string): Promise<Course> {
    const [newCourse] = await db.insert(courses).values({ ...course, createdBy: userId }).returning();
    await this.joinCourse(newCourse.id, userId);
    return newCourse;
  }

  async joinCourse(courseId: number, userId: string): Promise<void> {
    const [existing] = await db.select().from(courseStudents).where(and(eq(courseStudents.courseId, courseId), eq(courseStudents.userId, userId)));
    if (!existing) {
      await db.insert(courseStudents).values({ courseId, userId });
    }
  }

  async leaveCourse(courseId: number, userId: string): Promise<void> {
    // Remove enrollment
    await db.delete(courseStudents).where(and(eq(courseStudents.courseId, courseId), eq(courseStudents.userId, userId)));
    // If no students remain and this user created the course, delete it entirely
    const remaining = await db.select().from(courseStudents).where(eq(courseStudents.courseId, courseId));
    if (remaining.length === 0) {
      const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
      if (course?.createdBy === userId) {
        await db.delete(syllabi).where(eq(syllabi.courseId, courseId));
        await db.delete(assignments).where(eq(assignments.courseId, courseId));
        await db.delete(courses).where(eq(courses.id, courseId));
      }
    }
  }

  async getEnrolledCourses(userId: string): Promise<Course[]> {
    const enrolled = await db.select().from(courseStudents).where(eq(courseStudents.userId, userId));
    if (enrolled.length === 0) return [];
    return await db.select().from(courses).where(inArray(courses.id, enrolled.map(e => e.courseId)));
  }

  async getCourseDetails(courseId: number, userId: string): Promise<CourseResponse | undefined> {
    const course = await this.getCourse(courseId);
    if (!course) return undefined;

    const courseAssignments = await this.getAssignmentsByCourse(courseId);
    const courseSyllabi = await db.select().from(syllabi).where(eq(syllabi.courseId, courseId));
    const students = await db.select().from(courseStudents).where(eq(courseStudents.courseId, courseId));
    const isEnrolled = students.some(s => s.userId === userId);

    return {
      ...course,
      assignments: courseAssignments,
      syllabi: courseSyllabi,
      studentCount: students.length,
      isEnrolled
    };
  }

  async addSyllabus(courseId: number, userId: string, fileUrl: string, rawText: string, parsedContent: any): Promise<Syllabus> {
    const [newSyllabus] = await db.insert(syllabi).values({
      courseId, uploadedBy: userId, fileUrl, rawText, parsedContent
    }).returning();
    return newSyllabus;
  }

  async deleteSyllabus(id: number): Promise<void> {
    await db.delete(syllabi).where(eq(syllabi.id, id));
  }

  async getSyllabiForCourse(courseId: number): Promise<Syllabus[]> {
    return await db.select().from(syllabi).where(eq(syllabi.courseId, courseId));
  }

  async getAssignmentsByCourse(courseId: number): Promise<Assignment[]> {
    return await db.select().from(assignments).where(eq(assignments.courseId, courseId)).orderBy(assignments.dueDate);
  }

  async getAssignment(id: number): Promise<Assignment | undefined> {
    const [a] = await db.select().from(assignments).where(eq(assignments.id, id));
    return a;
  }

  async clearCourseAssignments(courseId: number): Promise<void> {
    const courseAssignments = await this.getAssignmentsByCourse(courseId);
    const assignmentIds = courseAssignments.map(a => a.id);
    if (assignmentIds.length > 0) {
      await db.delete(tasks).where(inArray(tasks.assignmentId, assignmentIds));
      await db.delete(userGrades).where(inArray(userGrades.assignmentId, assignmentIds));
      await db.delete(assignmentResources).where(inArray(assignmentResources.assignmentId, assignmentIds));
      await db.delete(assignments).where(eq(assignments.courseId, courseId));
    }
    // Also clear prep cache when re-uploading
    await db.delete(prepCache).where(eq(prepCache.courseId, courseId));
  }

  async createAssignment(courseId: number, assignment: Omit<InsertAssignment, "courseId">): Promise<Assignment> {
    const [newAssignment] = await db.insert(assignments).values({ ...assignment, courseId }).returning();
    return newAssignment;
  }

  async updateAssignment(id: number, updates: UpdateAssignment): Promise<Assignment> {
    const [updated] = await db.update(assignments).set(updates).where(eq(assignments.id, id)).returning();
    return updated;
  }

  async deleteAssignment(id: number): Promise<void> {
    await db.delete(assignments).where(eq(assignments.id, id));
  }

  async getUserGrades(userId: string): Promise<UserGrade[]> {
    return await db.select().from(userGrades).where(eq(userGrades.userId, userId));
  }

  async upsertUserGrade(userId: string, grade: InsertUserGrade): Promise<UserGrade> {
    const [existing] = await db.select().from(userGrades).where(and(eq(userGrades.userId, userId), eq(userGrades.assignmentId, grade.assignmentId)));
    if (existing) {
      const [updated] = await db.update(userGrades).set({ score: grade.score?.toString() }).where(eq(userGrades.id, existing.id)).returning();
      return updated;
    } else {
      const [newGrade] = await db.insert(userGrades).values({ userId, ...grade, score: grade.score?.toString() }).returning();
      return newGrade;
    }
  }

  async getGradeTracker(userId: string): Promise<CourseGradeTrackerResponse[]> {
    const enrolledCourses = await this.getEnrolledCourses(userId);
    const allGrades = await this.getUserGrades(userId);
    const result: CourseGradeTrackerResponse[] = [];

    for (const course of enrolledCourses) {
      const courseAssignments = await this.getAssignmentsByCourse(course.id);
      const trackerItems: GradeTrackerItem[] = courseAssignments.map(a => ({
        assignment: a,
        grade: allGrades.find(g => g.assignmentId === a.id) || null
      }));
      result.push({ ...course, trackerItems });
    }
    return result;
  }

  async getTasksByUser(userId: string): Promise<Task[]> {
    const rows = await db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(tasks.dueDate);
    // Strip any corrupted rows where the title is literally "[object Object]"
    return rows.filter(t => t.title && t.title !== '[object Object]');
  }

  async createTask(userId: string, task: InsertTask): Promise<Task> {
    const [newTask] = await db.insert(tasks).values({ ...task, userId }).returning();
    return newTask;
  }

  async createTaskWithRecurrence(userId: string, task: InsertTask): Promise<Task[]> {
    const { recurrenceRule, recurrenceDayOfWeek } = task;

    // Create the parent task first (no recurrenceParentId)
    const [parent] = await db.insert(tasks).values({ ...task, userId, recurrenceParentId: null }).returning();

    if (!recurrenceRule || recurrenceRule === null) return [parent];

    const weeks = recurrenceRule === "weekly" ? 12 : recurrenceRule === "biweekly" ? 6 : 3;
    const step = recurrenceRule === "biweekly" ? 2 : recurrenceRule === "monthly" ? 4 : 1;

    const instances: Task[] = [parent];
    let baseDate = new Date(task.dueDate);

    for (let i = 1; i <= weeks; i += step) {
      const nextDate = addWeeks(baseDate, step);
      // Adjust to same day of week if specified
      if (recurrenceDayOfWeek !== null && recurrenceDayOfWeek !== undefined) {
        while (nextDate.getDay() !== recurrenceDayOfWeek) {
          nextDate.setDate(nextDate.getDate() + 1);
        }
      }
      baseDate = new Date(nextDate);

      const [instance] = await db.insert(tasks).values({
        ...task,
        userId,
        dueDate: nextDate,
        completed: false,
        recurrenceParentId: parent.id,
      }).returning();
      instances.push(instance);
      if (instances.length > 13) break; // safety cap
    }

    return instances;
  }

  async updateTask(id: number, updates: UpdateTask): Promise<Task> {
    const [updated] = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning();
    return updated;
  }

  async deleteTask(id: number): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async deleteTaskAndRecurrences(parentId: number): Promise<void> {
    // Delete all instances that have this task as parent, then the parent itself
    await db.delete(tasks).where(eq(tasks.recurrenceParentId, parentId));
    await db.delete(tasks).where(eq(tasks.id, parentId));
  }

  // Prep cache
  async getPrepCache(courseId: number): Promise<PrepCache | undefined> {
    const [row] = await db.select().from(prepCache).where(eq(prepCache.courseId, courseId));
    return row;
  }

  async upsertPrepCache(courseId: number, content: PrepContent): Promise<PrepCache> {
    const existing = await this.getPrepCache(courseId);
    if (existing) {
      const [updated] = await db.update(prepCache)
        .set({ content, generatedAt: new Date() })
        .where(eq(prepCache.courseId, courseId))
        .returning();
      return updated;
    }
    const [newRow] = await db.insert(prepCache).values({ courseId, content }).returning();
    return newRow;
  }

  // Assignment resources
  async getAssignmentResources(assignmentId: number): Promise<AssignmentResources | undefined> {
    const [row] = await db.select().from(assignmentResources).where(eq(assignmentResources.assignmentId, assignmentId));
    return row;
  }

  async upsertAssignmentResources(assignmentId: number, resources: ResourceLink[]): Promise<AssignmentResources> {
    const existing = await this.getAssignmentResources(assignmentId);
    if (existing) {
      const [updated] = await db.update(assignmentResources)
        .set({ resources, generatedAt: new Date() })
        .where(eq(assignmentResources.assignmentId, assignmentId))
        .returning();
      return updated;
    }
    const [newRow] = await db.insert(assignmentResources).values({ assignmentId, resources }).returning();
    return newRow;
  }

  // ── Calendar Connections ──────────────────────────────────────────────────

  async getCalendarConnections(userId: string): Promise<CalendarConnection[]> {
    return db.select().from(calendarConnections).where(eq(calendarConnections.userId, userId));
  }

  async getCalendarConnection(id: number): Promise<CalendarConnection | undefined> {
    const [row] = await db.select().from(calendarConnections).where(eq(calendarConnections.id, id));
    return row;
  }

  async upsertCalendarConnection(data: InsertCalendarConnection): Promise<CalendarConnection> {
    // One connection per provider per user — update if exists
    const [existing] = await db.select().from(calendarConnections).where(
      and(eq(calendarConnections.userId, data.userId!), eq(calendarConnections.provider, data.provider!))
    );
    if (existing) {
      const [updated] = await db.update(calendarConnections)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(calendarConnections.id, existing.id))
        .returning();
      return updated;
    }
    const [newRow] = await db.insert(calendarConnections).values(data).returning();
    return newRow;
  }

  async updateCalendarConnectionTokens(
    id: number,
    tokens: { accessToken: string; refreshToken?: string; tokenExpiresAt: Date }
  ): Promise<void> {
    const updates: Partial<CalendarConnection> = {
      accessToken: tokens.accessToken,
      tokenExpiresAt: tokens.tokenExpiresAt,
      updatedAt: new Date(),
    };
    if (tokens.refreshToken) updates.refreshToken = tokens.refreshToken;
    await db.update(calendarConnections).set(updates).where(eq(calendarConnections.id, id));
  }

  async touchCalendarConnection(id: number): Promise<void> {
    await db.update(calendarConnections)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(calendarConnections.id, id));
  }

  async deleteCalendarConnection(id: number): Promise<void> {
    // Delete imported events and their tasks first
    await this.deleteImportedEventsByConnection(id);
    await db.delete(calendarConnections).where(eq(calendarConnections.id, id));
  }

  // ── Calendar Imported Events ─────────────────────────────────────────────

  async getImportedExternalIds(userId: string): Promise<string[]> {
    try {
      const rows = await db.select({ externalId: calendarImportedEvents.externalId })
        .from(calendarImportedEvents)
        .where(eq(calendarImportedEvents.userId, userId));
      return rows.map(r => r.externalId);
    } catch {
      return [];
    }
  }

  async getCalendarImportedEvents(userId: string): Promise<CalendarImportedEvent[]> {
    try {
      const rows = await db.select()
        .from(calendarImportedEvents)
        .where(eq(calendarImportedEvents.userId, userId));
      // Filter out old rows from previous architecture that have no startDate
      return rows.filter(r => r.startDate != null);
    } catch {
      return [];
    }
  }

  /**
   * Import calendar events directly into calendarImportedEvents.
   * Does NOT create tasks — events are their own entity.
   */
  async importCalendarEvents(
    userId: string,
    connectionId: number | null,
    events: NormalizedEvent[]
  ): Promise<{ imported: number; skipped: number }> {
    let existingIds: Set<string>;
    try {
      existingIds = new Set(await this.getImportedExternalIds(userId));
    } catch {
      existingIds = new Set();
    }

    let imported = 0;
    let skipped = 0;

    for (const event of events) {
      if (existingIds.has(event.externalId)) {
        skipped++;
        continue;
      }

      try {
        await db.insert(calendarImportedEvents).values({
          userId,
          connectionId,
          externalId: event.externalId,
          title: event.title,
          startDate: event.startDate,
          endDate: event.endDate,
          description: event.description,
          location: event.location,
        });
        existingIds.add(event.externalId);
        imported++;
      } catch (e) {
        console.warn('Failed to insert calendar event:', event.externalId, e);
      }
    }

    return { imported, skipped };
  }

  async deleteImportedEventsByConnection(connectionId: number): Promise<void> {
    try {
      await db.delete(calendarImportedEvents)
        .where(eq(calendarImportedEvents.connectionId, connectionId));
    } catch {
      // table may not exist
    }
  }

  /**
   * Remove tasks that were created from old calendar imports (bad architecture).
   * Deletes tasks with title '[object Object]' that have no assignment link.
   */
  async cleanupOldCalendarTasks(userId: string): Promise<void> {
    try {
      await db.delete(tasks).where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.title, '[object Object]'),
          isNull(tasks.assignmentId)
        )
      );
    } catch {
      // graceful failure
    }
  }

  async generateTasksForAssignment(userId: string, assignment: Assignment): Promise<void> {
    const dueDate = new Date(assignment.dueDate);
    const tasksToCreate: InsertTask[] = [];

    if (assignment.type.toLowerCase().includes('paper')) {
      const researchDate = new Date(dueDate);
      researchDate.setDate(researchDate.getDate() - 5);
      tasksToCreate.push({ title: `Start Research for ${assignment.name}`, dueDate: researchDate, assignmentId: assignment.id, isAutoGenerated: true, completed: false });
      const writeDate = new Date(dueDate);
      writeDate.setDate(writeDate.getDate() - 2);
      tasksToCreate.push({ title: `Write Draft for ${assignment.name}`, dueDate: writeDate, assignmentId: assignment.id, isAutoGenerated: true, completed: false });
    } else if (assignment.type.toLowerCase().includes('exam') || assignment.type.toLowerCase().includes('midterm') || assignment.type.toLowerCase().includes('final')) {
      const studyDate = new Date(dueDate);
      studyDate.setDate(studyDate.getDate() - 3);
      tasksToCreate.push({ title: `Study for ${assignment.name}`, dueDate: studyDate, assignmentId: assignment.id, isAutoGenerated: true, completed: false });
    } else {
      const startTask = new Date(dueDate);
      startTask.setDate(startTask.getDate() - 1);
      tasksToCreate.push({ title: `Start working on ${assignment.name}`, dueDate: startTask, assignmentId: assignment.id, isAutoGenerated: true, completed: false });
    }

    for (const t of tasksToCreate) {
      await this.createTask(userId, t);
    }
  }
}

export const storage = new DatabaseStorage();
