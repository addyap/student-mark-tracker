import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
const logoAsset = { url: "/logo.png" };
import { LogOut, Users, FileText, CheckSquare, CalendarDays, LayoutDashboard, Download, BookOpen, Menu, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { GlobalSearch } from "@/components/GlobalSearch";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/courses", label: "Courses", icon: BookOpen },
    { to: "/students", label: "Students", icon: Users },
    { to: "/sessions", label: "Sessions", icon: CalendarDays },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/documents", label: "Documents", icon: FileText },
    { to: "/to-mark", label: "To mark", icon: CheckSquare },
    { to: "/import", label: "Import", icon: Upload },
    { to: "/export", label: "Export", icon: Download },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-primary text-primary-foreground sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/dashboard" className="flex items-center gap-2.5 shrink-0">
            <img src={logoAsset.url} alt="Antony Addy Formations" className="h-9 w-9 object-contain" />
            <span className="hidden sm:inline font-display text-lg font-semibold tracking-tight">Antony Addy</span>
          </Link>

          {/* Desktop search */}
          <div className="hidden lg:block flex-1 max-w-xs">
            <GlobalSearch />
          </div>

          {/* Desktop nav — lg: and up only, so it never renders in the cramped icon-only mid-range a md: breakpoint would hit on tablets (e.g. iPad portrait) */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-md text-sm font-medium transition-colors ${
                    active ? "bg-white/15 text-white" : "text-primary-foreground/75 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <button onClick={signOut} className="ml-1 flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-primary-foreground/75 hover:text-white hover:bg-white/10">
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </nav>

          {/* Mobile menu trigger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                aria-label="Open menu"
                className="lg:hidden inline-flex items-center justify-center h-11 w-11 rounded-md text-primary-foreground/90 hover:bg-white/10"
              >
                <Menu className="h-6 w-6" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0">
              <SheetHeader className="px-5 pt-5 pb-3 border-b">
                <SheetTitle className="flex items-center gap-2.5">
                  <img src={logoAsset.url} alt="" className="h-7 w-7 object-contain" />
                  <span className="font-display">Antony Addy</span>
                </SheetTitle>
              </SheetHeader>
              <nav className="p-3 flex flex-col">
                {navItems.map((item) => {
                  const active = pathname.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-md text-base font-medium transition-colors ${
                        active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  );
                })}
                <button
                  onClick={() => { setMobileOpen(false); signOut(); }}
                  className="mt-2 flex items-center gap-3 px-3 py-3 rounded-md text-base text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <LogOut className="h-5 w-5" /> Sign out
                </button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
        <div className="lg:hidden px-4 pb-3">
          <GlobalSearch />
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-6 sm:py-10">{children}</main>
    </div>
  );
}
