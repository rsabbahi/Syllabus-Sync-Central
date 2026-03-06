import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { CourseGradeTrackerResponse } from "@shared/schema";
import { z } from "zod";

export function useGradeTracker() {
  return useQuery({
    queryKey: [api.grades.tracker.path],
    queryFn: async () => {
      const res = await fetch(api.grades.tracker.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch grade tracker");
      return await res.json() as CourseGradeTrackerResponse[];
    },
  });
}

export function useUpsertGrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.grades.upsert.input>) => {
      const validated = api.grades.upsert.input.parse(data);
      const res = await fetch(api.grades.upsert.path, {
        method: api.grades.upsert.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to upsert grade");
      return api.grades.upsert.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.grades.tracker.path] }),
  });
}
