import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CheckSquare, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/to-mark")({
  head: () => ({ meta: [{ title: "To mark — Antony Addy Formations" }] }),
  component: ToMarkPage,
});

type Row = {
  id: string; title: string; file_url: string | null; created_at: string;
  attributions: { students: { name: string } | null }[];
};

function ToMarkPage() {
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["to-mark"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, file_url, created_at, attributions(students(name))")
        .eq("marked", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold flex items-center gap-3">
          To mark
          {docs.length > 0 && <span className="text-sm font-medium bg-warning/15 text-warning rounded-full px-2.5 py-0.5">{docs.length}</span>}
        </h1>
        <p className="text-muted-foreground mt-1">Your weekly grading queue — every document still flagged unmarked.</p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 text-center">
          <CheckSquare className="h-10 w-10 mx-auto text-success" />
          <h2 className="font-display text-lg font-semibold mt-4">All clear</h2>
          <p className="text-muted-foreground mt-1 text-sm">Nothing left to mark. Lovely.</p>
        </div>
      ) : (
        <div className="bg-card border rounded-lg divide-y">
          {docs.map((d) => (
            <Link key={d.id} to="/documents/$id" params={{ id: d.id }} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{d.title}</span>
                  {d.file_url && (
                    <a href={d.file_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  {d.attributions.length === 0 ? "No students linked"
                    : d.attributions.map((a) => a.students?.name).filter(Boolean).join(", ")}
                </div>
              </div>
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-warning/10 text-warning">Unmarked</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
