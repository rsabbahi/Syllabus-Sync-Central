import { GraduationCap } from "lucide-react";

export default function Login() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-card rounded-3xl p-8 border border-border shadow-xl text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <GraduationCap className="w-12 h-12 text-primary" />
        </div>
        <h1 className="text-4xl font-display font-bold mb-3">SyllabusSync</h1>
        <p className="text-muted-foreground text-lg mb-8">
          The ultimate student workflow engine. Unify your courses, deadlines, and grades in one place.
        </p>
        
        <a 
          href="/api/login"
          className="block w-full py-4 px-6 bg-primary text-primary-foreground font-bold text-lg rounded-xl shadow-lg shadow-primary/30 hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
        >
          Login with Replit
        </a>
      </div>
    </div>
  );
}
