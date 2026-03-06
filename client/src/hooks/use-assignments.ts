import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import type { Assignment } from "@shared/schema";

export function useAssignments(courseId: number) {
  return useQuery({
    queryKey: [api.assignments.list.path, courseId],
    queryFn: async () => {
      const url = buildUrl(api.assignments.list.path, { courseId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch assignments");
      return api.assignments.list.responses[200].parse(await res.json());
    },
    enabled: !!courseId,
  });
}

export function useCreateAssignment(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.assignments.create.input>) => {
      const url = buildUrl(api.assignments.create.path, { courseId });
      const validated = api.assignments.create.input.parse(data);
      const res = await fetch(url, {
        method: api.assignments.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create assignment");
      return api.assignments.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.assignments.list.path, courseId] });
      queryClient.invalidateQueries({ queryKey: [api.courses.get.path, courseId] });
    },
  });
}

export function useUpdateAssignment(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & z.infer<typeof api.assignments.update.input>) => {
      const url = buildUrl(api.assignments.update.path, { id });
      const validated = api.assignments.update.input.parse(updates);
      const res = await fetch(url, {
        method: api.assignments.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update assignment");
      return api.assignments.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.assignments.list.path, courseId] });
      queryClient.invalidateQueries({ queryKey: [api.courses.get.path, courseId] });
    },
  });
}

export function useDeleteAssignment(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.assignments.delete.path, { id });
      const res = await fetch(url, {
        method: api.assignments.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete assignment");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.assignments.list.path, courseId] });
      queryClient.invalidateQueries({ queryKey: [api.courses.get.path, courseId] });
    },
  });
}
