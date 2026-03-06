import { Loader2 } from "lucide-react";

export function LoadingScreen() {
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-background">
      <Loader2 className="w-12 h-12 text-primary animate-spin" />
      <h2 className="mt-4 font-display text-xl font-medium text-foreground">Loading workspace...</h2>
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div className="w-full py-12 flex justify-center">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );
}
