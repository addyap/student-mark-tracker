import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { avg, pct, type Student } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/students/$id")({
  head: () => ({ meta: [{ title: "Student profile — Trainer" }] }),
  component: StudentProfile,
});

type Row = {
  individual_mark: number | null;
  individual_mark_max: number | null;
  documents: {
    id: string;
    title: string;
    file_url: string | null;
    collective_mark: number | null;
    collective_mark_max: number | null;
    marked: boolean;
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
        .select("individual_mark, individual_mark_max, documents(id, title, file_url, collective_mark, collective_mark_max, marked)")
        .eq("student_id", id);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const individualPcts = rows.map((r) => pct(r.individual_mark, r.individual_mark_max));
  const collectivePcts = rows.map((r) => pct(r.documents?.collective_mark, r.documents?.collective_mark_max));
  const avgIndividual = avg(individualPcts);
  const avgCollective = avg(collectivePcts);

  if (!student) return <p className="text-muted-foreground">Loading…</p>;

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

      <h2 className="font-display text-xl font-semibold mt-10 mb-3">Documents</h2>
      {rows.length === 0 ? (
        <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground text-sm">
          No work attributed yet. Add a document and tick this student.
        </div>
      ) : (
        <div className="bg-card border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Document</th>
                <th className="text-left font-medium px-4 py-2.5">Individual</th>
                <th className="text-left font-medium px-4 py-2.5">Collective</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => r.documents && (
                <tr key={r.documents.id} className={i > 0 ? "border-t" : ""}>
                  <td className="px-4 py-3">
                    <Link to="/documents/$id" params={{ id: r.documents.id }} className="font-medium hover:text-primary">
                      {r.documents.title}
                    </Link>
                    {r.documents.file_url && (
                      <a href={r.documents.file_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center text-xs text-muted-foreground hover:text-primary">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">{formatMark(r.individual_mark, r.individual_mark_max)}</td>
                  <td className="px-4 py-3">{formatMark(r.documents.collective_mark, r.documents.collective_mark_max)}</td>
                  <td className="px-4 py-3"><MarkedBadge marked={r.documents.marked} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

export function MarkedBadge({ marked }: { marked: boolean }) {
  return marked
    ? <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-success/10 text-success">Marked</span>
    : <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-warning/10 text-warning">Unmarked</span>;
}
