import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

/**
 * Client-side PDF text extraction using PDF.js, then send to server for LLM parsing.
 * This is the primary upload path — extracts text in the browser, no file upload needed.
 */
export function useParseSyllabus(courseId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (file: File) => {
      // Step 1: Extract text from PDF client-side using PDF.js
      toast({ title: "Reading PDF...", description: "Extracting text from your syllabus" });

      let text = "";

      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).href;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((s: any) => s.str).join(" ") + "\n";
        }
      } else if (
        file.name.toLowerCase().endsWith(".txt") ||
        file.name.toLowerCase().endsWith(".md")
      ) {
        text = await file.text();
      } else {
        // For DOCX and other formats, fall back to server-side upload
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
      }

      if (text.trim().length < 50) {
        throw new Error(
          "Could not extract enough text from this PDF. It may be a scanned image. Try a text-based PDF or upload a DOCX/TXT file instead."
        );
      }

      // Step 2: Send extracted text to server for LLM parsing
      toast({ title: "Parsing syllabus...", description: "AI is analyzing your syllabus" });

      const url = buildUrl(api.syllabi.parseText.path, { courseId });
      const res = await fetch(url, {
        method: api.syllabi.parseText.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Failed to parse syllabus");
      }

      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.courses.get.path, courseId] });
      queryClient.invalidateQueries({ queryKey: [api.assignments.list.path, courseId] });
      queryClient.invalidateQueries({ queryKey: [api.grades.tracker.path] });
      toast({
        title: "Syllabus Parsed!",
        description: data.message || "Course info, assignments, and grades have been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/** Legacy file upload — kept as fallback for DOCX files */
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

export function useDeleteSyllabus(courseId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (syllabusId: number) => {
      const url = buildUrl(api.syllabi.delete.path, { id: syllabusId });
      const res = await fetch(url, {
        method: api.syllabi.delete.method,
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to delete syllabus");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.courses.get.path, courseId] });
      toast({
        title: "Deleted",
        description: "Syllabus removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete syllabus.",
        variant: "destructive",
      });
    },
  });
}
