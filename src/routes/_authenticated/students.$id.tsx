import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { avg, pct, type Student } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink, CalendarDays, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/students/$id")({
  head: () => ({ meta: [{ title: "Student profile — Trainer" }] }),
  component: StudentProfile,
});

type AttrRow = {
  individual_mark: number | null;
  individual_mark_max: number | null;
  documents: {
    id: string;
    title: string;
    file_url: string | null;
    collective_mark: number | null;
    collective_mark_max: number | null;
    marked: boolean;
    created_at: string;
    session_id: string | null;
  } | null;
};

type AttendanceRow = {
  id: string;
  progress_note: string | null;
  sessions: {
    id: string;
    session_date: string;
    title: string | null;
    school: string | null;
  } | null;
};

function StudentProfile() {
  const { id } = Route.useParams();

  const { data: student } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Student;
    },
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["student-attributions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attributions")
        .select("individual_mark, individual_mark_max, documents(id, title, file_url, collective_mark, collective_mark_max, marked, created_at, session_id)")
        .eq("student_id", id);
      if (error) throw error;
      return data as unknown as AttrRow[];
    },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["student-timeline", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("id, progress_note, sessions(id, session_date, title, school)")
        .eq("student_id", id);
      if (error) throw error;
      return data as unknown as AttendanceRow[];
    },
  });

  const individualPcts = rows.map((r) => pct(r.individual_mark, r.individual_mark_max));
  const collectivePcts = rows.map((r) => pct(r.documents?.collective_mark, r.documents?.collective_mark_max));
  const avgIndividual = avg(individualPcts);
  const avgCollective = avg(collectivePcts);

  if (!student) return <p className="text-muted-foreground">Loading…</p>;

  // Build timeline: sessions (by date) + marked work (by created_at). Newest first.
  type TimelineItem =
    | { kind: "session"; date: string; sortKey: string; sessionId: string; title: string | null; school: string | null; note: string | null }
    | { kind: "doc"; date: string; sortKey: string; doc: NonNullable<AttrRow["documents"]>; individual: number | null; individualMax: number | null };

  const items: TimelineItem[] = [];
  for (const a of attendance) {
    if (!a.sessions) continue;
    items.push({
      kind: "session",
      date: a.sessions.session_date,
      sortKey: a.sessions.session_date,
      sessionId: a.sessions.id,
      title: a.sessions.title,
      school: a.sessions.school,
      note: a.progress_note,
    });
  }
  for (const r of rows) {
    if (!r.documents) continue;
    items.push({
      kind: "doc",
      date: r.documents.created_at.slice(0, 10),
      sortKey: r.documents.created_at,
      doc: r.documents,
      individual: r.individual_mark,
      individualMax: r.individual_mark_max,
    });
  }
  items.sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1));

  return (
    <div>
      <Link to="/students" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> All students
      </Link>

      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <h1 className="font-display text-3xl font-semibold">{student.name}</h1>
        {student.school && <Badge variant="secondary">{student.school}</Badge>}
      </div>
      <div className="mt-1 text-sm text-muted-foreground space-x-3">
        {student.email && <span>{student.email}</span>}
        {student.phone && <span>{student.phone}</span>}
      </div>

      <div className="mt-8 grid sm:grid-cols-2 gap-4">
        <StatCard label="Average individual mark" value={avgIndividual} hint="Across this student's individual marks only" />
        <StatCard label="Average collective mark" value={avgCollective} hint="Across documents shared with the student" accent />
      </div>

      <h2 className="font-display text-xl font-semibold mt-10 mb-3">Progress timeline</h2>
      {items.length === 0 ? (
        <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground text-sm">
          Nothing yet. Log a session or attribute a document to start this student's timeline.
        </div>
      ) : (
        <ol className="relative border-l border-border ml-3 space-y-5">
          {items.map((it, i) => (
            <li key={i} className="pl-6 relative">
              <span className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full ring-4 ring-background ${it.kind === "session" ? "bg-primary" : "bg-brand-red"}`} />
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                {formatDateShort(it.date)}
              </div>
              {it.kind === "session" ? (
                <div className="mt-1 bg-card border rounded-lg p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    <Link to="/sessions/$id" params={{ id: it.sessionId }} className="font-medium hover:text-primary">
                      {it.title || "Session"}
                    </Link>
                    {it.school && <span className="text-xs text-muted-foreground">· {it.school}</span>}
                  </div>
                  {it.note ? (
                    <p className="mt-2 text-sm text-foreground/80 whitespace-pre-wrap">{it.note}</p>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground italic">No progress note.</p>
                  )}
                </div>
              ) : (
                <div className="mt-1 bg-card border rounded-lg p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText className="h-4 w-4 text-brand-red" />
                    <Link to="/documents/$id" params={{ id: it.doc.id }} className="font-medium hover:text-primary">
                      {it.doc.title}
                    </Link>
                    {it.doc.file_url && (
                      <a href={it.doc.file_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <MarkedBadge marked={it.doc.marked} />
                  </div>
                  <div className="mt-2 flex gap-6 text-sm">
                    <div>
                      <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">Individual</span>
                      {formatMark(it.individual, it.individualMax)}
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">Collective</span>
                      {formatMark(it.doc.collective_mark, it.doc.collective_mark_max)}
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StatCard({ label, value, hint, accent }: { label: string; value: number | null; hint: string; accent?: boolean }) {
  return (
    <div className={`bg-card border rounded-lg p-6 ${accent ? "border-l-4 border-l-brand-red" : "border-l-4 border-l-primary"}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className="font-display text-4xl font-semibold mt-2">
        {value === null ? <span className="text-muted-foreground">—</span> : `${value.toFixed(1)}%`}
      </div>
      <div className="text-xs text-muted-foreground mt-2">{hint}</div>
    </div>
  );
}

function formatMark(m: number | null | undefined, max: number | null | undefined) {
  if (typeof m !== "number") return <span className="text-muted-foreground">—</span>;
  return <span>{m}{typeof max === "number" ? <span className="text-muted-foreground"> / {max}</span> : null}</span>;
}

function formatDateShort(iso: string) {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function MarkedBadge({ marked }: { marked: boolean }) {
  return marked
    ? <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-success/10 text-success">Marked</span>
    : <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-warning/10 text-warning">Unmarked</span>;
}
