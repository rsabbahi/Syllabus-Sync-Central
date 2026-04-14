import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  BookOpen,
  Calendar,
  Target,
  LogOut,
  User as UserIcon,
  Menu,
  X,
  GraduationCap,
  LayoutDashboard,
  ListTodo,
} from "lucide-react";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/courses", label: "Courses", icon: BookOpen },
    { href: "/calendar", label: "Calendar", icon: Calendar },
    { href: "/todo", label: "To Do", icon: ListTodo },
    { href: "/tracker", label: "Grade Tracker", icon: Target },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar - Desktop */}
      <aside className="w-72 bg-card border-r border-border hidden md:flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <GraduationCap className="text-primary w-6 h-6" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight text-foreground">Syllabus<span className="text-primary">Sync</span></span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium
                  ${isActive 
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }
                `}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border space-y-2">
          <Link href="/profile">
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium cursor-pointer ${location === "/profile" ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
              <UserIcon className="w-5 h-5" />
              Profile
            </div>
          </Link>
          <div className="flex items-center justify-between px-4 py-3 bg-secondary rounded-xl">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
                {user?.profileImageUrl && !user.profileImageUrl.startsWith("emoji:") ? (
                  <img src={user.profileImageUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : user?.profileImageUrl?.startsWith("emoji:") ? (
                  <span className="text-base">{user.profileImageUrl.replace("emoji:", "")}</span>
                ) : (
                  <UserIcon className="w-4 h-4 text-primary" />
                )}
              </div>
              <div className="truncate">
                <p className="text-sm font-semibold truncate text-foreground">{user?.firstName || user?.email || "User"}</p>
              </div>
            </div>
            <button 
              onClick={() => logout()}
              className="p-2 text-muted-foreground hover:text-destructive transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative w-72 bg-card border-r border-border flex flex-col z-50">
            <div className="p-6 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <GraduationCap className="text-primary w-6 h-6" />
                </div>
                <span className="font-display font-bold text-xl tracking-tight text-foreground">Syllabus<span className="text-primary">Sync</span></span>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-2">
              {navItems.map((item) => {
                const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${isActive ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="p-4 border-t border-border">
              <Link href="/profile" onClick={() => setMobileMenuOpen(false)}>
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium cursor-pointer ${location === "/profile" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                  <UserIcon className="w-5 h-5" />
                  Profile
                </div>
              </Link>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <GraduationCap className="text-primary w-6 h-6" />
            <span className="font-display font-bold text-lg">SyllabusSync</span>
          </div>
          <button className="p-2 text-foreground" onClick={() => setMobileMenuOpen(true)}>
            <Menu className="w-6 h-6" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8 lg:p-10">
          <div className="max-w-6xl mx-auto h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
