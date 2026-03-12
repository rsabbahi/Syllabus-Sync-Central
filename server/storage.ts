import { db } from "./db";
import { eq, and, inArray } from "drizzle-orm";
import {
  courses,
  courseStudents,
  syllabi,
  assignments,
  userGrades,
  tasks,
  users,
  type User,
  type Course,
  type CourseStudent,
  type Syllabus,
  type Assignment,
  type UserGrade,
  type Task,
  type InsertCourse,
  type InsertTask,
  type UpdateTask,
  type InsertUserGrade,
  type InsertAssignment,
  type UpdateAssignment,
  type CourseResponse,
  type CourseGradeTrackerResponse,
  type GradeTrackerItem
} from "@shared/schema";

export interface IStorage {
  // Course
  getCourses(): Promise<Course[]>;
  getCourse(id: number): Promise<Course | undefined>;
  createCourse(course: InsertCourse, userId: string): Promise<Course>;
  joinCourse(courseId: number, userId: string): Promise<void>;
  getEnrolledCourses(userId: string): Promise<Course[]>;
  getCourseDetails(courseId: number, userId: string): Promise<CourseResponse | undefined>;

  // Syllabus
  addSyllabus(courseId: number, userId: string, fileUrl: string, rawText: string, parsedContent: any): Promise<Syllabus>;
  deleteSyllabus(id: number): Promise<void>;

  // Assignments
  getAssignmentsByCourse(courseId: number): Promise<Assignment[]>;
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
  updateTask(id: number, updates: UpdateTask): Promise<Task>;
  deleteTask(id: number): Promise<void>;
  
  // Helpers
  generateTasksForAssignment(userId: string, assignment: Assignment): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getCourses(): Promise<Course[]> {
    return await db.select().from(courses);
  }

  async getCourse(id: number): Promise<Course | undefined> {
    const [course] = await db.select().from(courses).where(eq(courses.id, id));
    return course;
  }

  async createCourse(course: InsertCourse, userId: string): Promise<Course> {
    const [newCourse] = await db.insert(courses).values({ ...course, createdBy: userId }).returning();
    await this.joinCourse(newCourse.id, userId); // creator automatically joins
    return newCourse;
  }

  async joinCourse(courseId: number, userId: string): Promise<void> {
    const [existing] = await db.select().from(courseStudents).where(and(eq(courseStudents.courseId, courseId), eq(courseStudents.userId, userId)));
    if (!existing) {
      await db.insert(courseStudents).values({ courseId, userId });
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
      courseId,
      uploadedBy: userId,
      fileUrl,
      rawText,
      parsedContent
    }).returning();
    return newSyllabus;
  }

  async deleteSyllabus(id: number): Promise<void> {
    await db.delete(syllabi).where(eq(syllabi.id, id));
  }

  async getAssignmentsByCourse(courseId: number): Promise<Assignment[]> {
    return await db.select().from(assignments).where(eq(assignments.courseId, courseId)).orderBy(assignments.dueDate);
  }

  async clearCourseAssignments(courseId: number): Promise<void> {
    const courseAssignments = await this.getAssignmentsByCourse(courseId);
    const assignmentIds = courseAssignments.map(a => a.id);
    
    if (assignmentIds.length > 0) {
      await db.delete(tasks).where(inArray(tasks.assignmentId, assignmentIds));
      await db.delete(userGrades).where(inArray(userGrades.assignmentId, assignmentIds));
      await db.delete(assignments).where(eq(assignments.courseId, courseId));
    }
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
      const trackerItems: GradeTrackerItem[] = courseAssignments.map(a => {
        const g = allGrades.find(g => g.assignmentId === a.id);
        return {
          assignment: a,
          grade: g || null
        };
      });
      
      result.push({
        ...course,
        trackerItems
      });
    }
    
    return result;
  }

  async getTasksByUser(userId: string): Promise<Task[]> {
    return await db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(tasks.dueDate);
  }

  async createTask(userId: string, task: InsertTask): Promise<Task> {
    const [newTask] = await db.insert(tasks).values({ ...task, userId }).returning();
    return newTask;
  }

  async updateTask(id: number, updates: UpdateTask): Promise<Task> {
    const [updated] = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning();
    return updated;
  }

  async deleteTask(id: number): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
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
