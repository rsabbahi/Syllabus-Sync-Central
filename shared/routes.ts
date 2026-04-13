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
  profile: {
    get: {
      method: 'GET' as const,
      path: '/api/profile' as const,
      responses: { 200: z.custom<any>() }
    },
    update: {
      method: 'PUT' as const,
      path: '/api/profile' as const,
      responses: { 200: z.custom<any>() }
    },
    uploadAvatar: {
      method: 'POST' as const,
      path: '/api/profile/avatar' as const,
      responses: { 200: z.object({ url: z.string() }) }
    }
  },
  calendar: {
    events: {
      method: 'GET' as const,
      path: '/api/calendar/events' as const,
      responses: { 200: z.array(z.custom<any>()) }
    },
    ical: {
      method: 'GET' as const,
      path: '/api/calendar/ical' as const,
      responses: { 200: z.string() }
    },
    connections: {
      list: {
        method: 'GET' as const,
        path: '/api/calendar/connections' as const,
        responses: { 200: z.array(z.custom<any>()) }
      },
      delete: {
        method: 'DELETE' as const,
        path: '/api/calendar/connections/:id' as const,
        responses: { 204: z.void() }
      }
    },
    google: {
      connect: {
        method: 'GET' as const,
        path: '/api/calendar/google/connect' as const,
        responses: { 302: z.void() }
      },
      callback: {
        method: 'GET' as const,
        path: '/api/calendar/google/callback' as const,
        responses: { 302: z.void() }
      },
      sync: {
        method: 'POST' as const,
        path: '/api/calendar/google/sync' as const,
        responses: { 200: z.object({ imported: z.number(), skipped: z.number() }) }
      }
    },
    microsoft: {
      connect: {
        method: 'GET' as const,
        path: '/api/calendar/microsoft/connect' as const,
        responses: { 302: z.void() }
      },
      callback: {
        method: 'GET' as const,
        path: '/api/calendar/microsoft/callback' as const,
        responses: { 302: z.void() }
      },
      sync: {
        method: 'POST' as const,
        path: '/api/calendar/microsoft/sync' as const,
        responses: { 200: z.object({ imported: z.number(), skipped: z.number() }) }
      }
    },
    imported: {
      method: 'GET' as const,
      path: '/api/calendar/imported' as const,
      responses: { 200: z.array(z.custom<any>()) }
    },
    ics: {
      upload: {
        method: 'POST' as const,
        path: '/api/calendar/ics/upload' as const,
        responses: { 200: z.object({ events: z.array(z.custom<any>()) }) }
      },
      confirm: {
        method: 'POST' as const,
        path: '/api/calendar/ics/confirm' as const,
        responses: { 200: z.object({ imported: z.number(), skipped: z.number() }) }
      }
    }
  },
  syllabi: {
    upload: {
      method: 'POST' as const,
      path: '/api/courses/:courseId/syllabi' as const,
      responses: {
        200: z.object({ success: z.boolean(), message: z.string() })
      }
    },
    parseText: {
      method: 'POST' as const,
      path: '/api/courses/:courseId/syllabi/parse-text' as const,
      input: z.object({ text: z.string().min(50) }),
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
  },
  prep: {
    get: {
      method: 'GET' as const,
      path: '/api/courses/:courseId/prep' as const,
      responses: { 200: z.custom<any>() }
    },
    generate: {
      method: 'POST' as const,
      path: '/api/courses/:courseId/prep' as const,
      responses: { 200: z.custom<any>() }
    }
  },
  resources: {
    get: {
      method: 'GET' as const,
      path: '/api/assignments/:assignmentId/resources' as const,
      responses: { 200: z.custom<any>() }
    },
    generate: {
      method: 'POST' as const,
      path: '/api/assignments/:assignmentId/resources' as const,
      responses: { 200: z.custom<any>() }
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
