import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, FileText, CheckSquare, ExternalLink } from "lucide-react";
import { formatDate } from "./sessions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Trainer" }] }),
  component: DashboardPage,
});

type UpSession = {
  id: string; session_date: string; session_time: string | null;
  school: string | null; title: string | null;
  attendance: { id: string }[];
};

type UnmarkedDoc = {
  id: string; title: string; file_url: string | null; created_at: string;
  attributions: { students: { name: string } | null }[];
};

function DashboardPage() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
  const fromIso = today.toISOString().slice(0, 10);
  const toIso = in7.toISOString().slice(0, 10);

  const { data: upcoming = [], isLoading: loadingUp } = useQuery({
    queryKey: ["dashboard-upcoming", fromIso, toIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, session_date, session_time, school, title, attendance(id)")
        .gte("session_date", fromIso)
        .lte("session_date", toIso)
        .order("session_date", { ascending: true })
        .order("session_time", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return data as unknown as UpSession[];
    },
  });

  const { data: unmarked = [], isLoading: loadingDocs } = useQuery({
    queryKey: ["dashboard-unmarked"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, file_url, created_at, attributions(students(name))")
        .eq("marked", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as UnmarkedDoc[];
    },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">The next seven days, and what still needs marking.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="bg-card border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" /> Next 7 days
              {upcoming.length > 0 && (
                <span className="text-xs font-medium bg-secondary text-secondary-foreground rounded-full px-2 py-0.5">{upcoming.length}</span>
              )}
            </h2>
            <Link to="/sessions" className="text-xs text-muted-foreground hover:text-primary">All sessions →</Link>
          </div>
          {loadingUp ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled in the next week.</p>
          ) : (
            <div className="divide-y border rounded-md">
              {upcoming.map((s) => (
                <Link key={s.id} to="/sessions/$id" params={{ id: s.id }} className="block p-3 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-medium">{formatDate(s.session_date)}{s.session_time && <span className="ml-2 text-sm text-muted-foreground">{s.session_time.slice(0, 5)}</span>}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {[s.school, s.title].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{s.attendance.length} {s.attendance.length === 1 ? "student" : "students"}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="bg-card border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-warning" /> Still to mark
              {unmarked.length > 0 && (
                <span className="text-xs font-medium bg-warning/15 text-warning rounded-full px-2 py-0.5">{unmarked.length}</span>
              )}
            </h2>
            <Link to="/to-mark" className="text-xs text-muted-foreground hover:text-primary">Marking queue →</Link>
          </div>
          {loadingDocs ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : unmarked.length === 0 ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4" /> Nothing left to mark.</p>
          ) : (
            <div className="divide-y border rounded-md">
              {unmarked.slice(0, 8).map((d) => (
                <Link key={d.id} to="/documents/$id" params={{ id: d.id }} className="block p-3 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{d.title}</span>
                    {d.file_url && (
                      <a href={d.file_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {d.attributions.length === 0 ? "No students linked" : d.attributions.map((a) => a.students?.name).filter(Boolean).join(", ")}
                  </div>
                </Link>
              ))}
              {unmarked.length > 8 && (
                <div className="p-2 text-center text-xs text-muted-foreground">+{unmarked.length - 8} more</div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
