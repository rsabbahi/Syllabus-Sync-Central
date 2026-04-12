import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { api } from "@shared/routes";

export interface CalendarConnectionSafe {
  id: number;
  userId: string;
  provider: string;
  displayName: string | null;
  lastSyncedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ParsedCalendarEvent {
  externalId: string;
  title: string;
  startDate: string;
  endDate: string | null;
  description: string | null;
  location: string | null;
  isDuplicate: boolean;
}

export function useCalendarConnections() {
  return useQuery<CalendarConnectionSafe[]>({
    queryKey: [api.calendar.connections.list.path],
    queryFn: () => apiRequest("GET", api.calendar.connections.list.path).then(r => r.json()),
  });
}

export function useDeleteCalendarConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/calendar/connections/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.calendar.connections.list.path] });
      qc.invalidateQueries({ queryKey: [api.tasks.list.path] });
    },
  });
}

export function useSyncGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest("POST", api.calendar.google.sync.path).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.tasks.list.path] });
      qc.invalidateQueries({ queryKey: [api.calendar.connections.list.path] });
    },
  });
}

export function useSyncMicrosoft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest("POST", api.calendar.microsoft.sync.path).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.tasks.list.path] });
      qc.invalidateQueries({ queryKey: [api.calendar.connections.list.path] });
    },
  });
}

export function useUploadIcs() {
  return useMutation({
    mutationFn: (file: File): Promise<{ events: ParsedCalendarEvent[] }> => {
      const form = new FormData();
      form.append("file", file);
      return fetch(api.calendar.ics.upload.path, {
        method: "POST",
        body: form,
        credentials: "include",
      }).then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ message: "Upload failed" }));
          throw new Error(err.message);
        }
        return r.json();
      });
    },
  });
}

export function useConfirmIcsImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (events: ParsedCalendarEvent[]): Promise<{ imported: number; skipped: number }> =>
      apiRequest("POST", api.calendar.ics.confirm.path, { events }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.tasks.list.path] });
    },
  });
}
