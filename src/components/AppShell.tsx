import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Users, FileText, CheckSquare } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const navItems = [
    { to: "/students", label: "Students", icon: Users },
    { to: "/documents", label: "Documents", icon: FileText },
    { to: "/to-mark", label: "To mark", icon: CheckSquare },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link to="/students" className="flex items-center gap-2.5">
            <span className="h-3.5 w-3.5 rounded-sm bg-brand-red" />
            <span className="font-display text-lg font-semibold tracking-tight">Trainer</span>
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    active ? "bg-white/15 text-white" : "text-primary-foreground/75 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
            <button onClick={signOut} className="ml-2 flex items-center gap-2 px-3 py-2 rounded-md text-sm text-primary-foreground/75 hover:text-white hover:bg-white/10">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
