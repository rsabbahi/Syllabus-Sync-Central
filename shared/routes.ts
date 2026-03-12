import { z } from 'zod';
import { 
  insertCourseSchema, 
  insertAssignmentSchema, 
  updateAssignmentSchema,
  insertUserGradeSchema,
  insertTaskSchema,
  updateTaskSchema,
  courses,
  assignments,
  tasks,
  userGrades,
  syllabi
} from './schema';

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
  unauthorized: z.object({ message: z.string() })
};

export const api = {
  courses: {
    list: {
      method: 'GET' as const,
      path: '/api/courses' as const,
      responses: {
        200: z.array(z.custom<any>()), // CourseResponse
      }
    },
    get: {
      method: 'GET' as const,
      path: '/api/courses/:id' as const,
      responses: {
        200: z.custom<any>(), // CourseResponse
        404: errorSchemas.notFound,
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/courses' as const,
      input: insertCourseSchema,
      responses: {
        201: z.custom<any>(),
        400: errorSchemas.validation,
      }
    },
    join: {
      method: 'POST' as const,
      path: '/api/courses/:id/join' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
        404: errorSchemas.notFound
      }
    }
  },
  assignments: {
    list: {
      method: 'GET' as const,
      path: '/api/courses/:courseId/assignments' as const,
      responses: {
        200: z.array(z.custom<typeof assignments.$inferSelect>()),
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/courses/:courseId/assignments' as const,
      input: insertAssignmentSchema.omit({ courseId: true }),
      responses: {
        201: z.custom<typeof assignments.$inferSelect>(),
      }
    },
    update: {
      method: 'PUT' as const,
      path: '/api/assignments/:id' as const,
      input: updateAssignmentSchema,
      responses: {
        200: z.custom<typeof assignments.$inferSelect>(),
      }
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/assignments/:id' as const,
      responses: {
        204: z.void()
      }
    }
  },
  grades: {
    tracker: {
      method: 'GET' as const,
      path: '/api/grades/tracker' as const,
      responses: {
        200: z.array(z.custom<any>()) // CourseGradeTrackerResponse[]
      }
    },
    upsert: {
      method: 'POST' as const,
      path: '/api/grades' as const,
      input: insertUserGradeSchema,
      responses: {
        200: z.custom<typeof userGrades.$inferSelect>(),
      }
    }
  },
  tasks: {
    list: {
      method: 'GET' as const,
      path: '/api/tasks' as const,
      responses: {
        200: z.array(z.custom<typeof tasks.$inferSelect>())
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/tasks' as const,
      input: insertTaskSchema,
      responses: {
        201: z.custom<typeof tasks.$inferSelect>(),
      }
    },
    update: {
      method: 'PUT' as const,
      path: '/api/tasks/:id' as const,
      input: updateTaskSchema,
      responses: {
        200: z.custom<typeof tasks.$inferSelect>(),
      }
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/tasks/:id' as const,
      responses: {
        204: z.void()
      }
    }
  },
  syllabi: {
    upload: {
      method: 'POST' as const,
      path: '/api/courses/:courseId/syllabi' as const,
      // Input is FormData
      responses: {
        200: z.object({ success: z.boolean(), message: z.string() })
      }
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/syllabi/:id' as const,
      responses: {
        204: z.void()
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
