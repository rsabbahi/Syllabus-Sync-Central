import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useUploadSyllabus(courseId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (file: File) => {
      const url = buildUrl(api.syllabi.upload.path, { courseId });
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(url, {
        method: api.syllabi.upload.method,
        body: formData,
        credentials: "include",
      });
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Failed to upload syllabus");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.courses.get.path, courseId] });
      queryClient.invalidateQueries({ queryKey: [api.assignments.list.path, courseId] });
      toast({
        title: "Syllabus Parsed!",
        description: data.message || "Assignments and tasks have been created.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
}
