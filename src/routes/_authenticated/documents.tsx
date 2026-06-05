import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getOwnerId } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { MarkedBadge } from "./students.$id";
import { CourseSelect, useCourses } from "@/components/CourseSelect";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({ meta: [{ title: "Documents — Antony Addy Formations" }] }),
  component: DocumentsPage,
});

type DocRow = {
  id: string; title: string; file_url: string | null; marked: boolean;
  collective_mark: number | null; collective_mark_max: number | null;
  course_id: string | null;
  attributions: { student_id: string; students: { name: string } | null }[];
};

function DocumentsPage() {
  const qc = useQueryClient();
  const [courseFilter, setCourseFilter] = useState<string>("__all__");
  const { data: courses = [] } = useCourses();

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, file_url, marked, collective_mark, collective_mark_max, course_id, attributions(student_id, students(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as DocRow[];
    },
  });

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const filtered = useMemo(() => courseFilter === "__all__" ? docs : docs.filter((d) => d.course_id === courseFilter), [docs, courseFilter]);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [courseId, setCourseId] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const owner_id = await getOwnerId();
      const { data, error } = await supabase.from("documents").insert({ title: title.trim(), file_url: fileUrl.trim() || null, course_id: courseId || null, owner_id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("Document created"); qc.invalidateQueries({ queryKey: ["documents"] }); setOpen(false); setTitle(""); setFileUrl(""); setCourseId(""); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div>
      <div className="flex items-start sm:items-center justify-between mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Documents</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Work assigned to one or several students.</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="flex-1 sm:w-56 sm:flex-none"><CourseSelect value={courseFilter} onChange={setCourseFilter} includeAll /></div>
          <Button onClick={() => setOpen(true)} className="shrink-0"><Plus className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">New document</span><span className="sm:hidden">New</span></Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        docs.length === 0 ? (
          <div className="bg-card border rounded-lg p-12 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
            <h2 className="font-display text-lg font-semibold mt-4">No documents yet</h2>
            <p className="text-muted-foreground mt-1 text-sm">Create your first document and attribute it to students.</p>
            <Button onClick={() => setOpen(true)} className="mt-6"><Plus className="h-4 w-4 mr-1" /> New document</Button>
          </div>
        ) : <p className="text-muted-foreground">No documents match this course filter.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => {
            const c = d.course_id ? courseById.get(d.course_id) : null;
            return (
              <Link key={d.id} to="/documents/$id" params={{ id: d.id }} className="block bg-card border rounded-lg p-5 hover:border-primary transition-colors">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display font-semibold text-lg">{d.title}</h3>
                      {d.file_url && (
                        <a href={d.file_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {c && <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs font-medium px-2.5 py-0.5">{c.name}</span>}
                    </div>
                    <div className="mt-1.5 text-sm text-muted-foreground">
                      {d.attributions.length === 0 ? "No students linked"
                        : d.attributions.length === 1 ? `Individual — ${d.attributions[0].students?.name ?? "—"}`
                        : `Group — ${d.attributions.length} students`}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {typeof d.collective_mark === "number" && (
                      <div className="text-sm">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider mr-2">Collective</span>
                        <span className="font-medium">{d.collective_mark}{typeof d.collective_mark_max === "number" ? ` / ${d.collective_mark_max}` : ""}</span>
                      </div>
                    )}
                    <MarkedBadge marked={d.marked} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New document</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" placeholder="e.g. Essay — Climate change" /></div>
            <div><Label>Course (optional)</Label><div className="mt-1"><CourseSelect value={courseId} onChange={setCourseId} includeNone /></div></div>
            <div><Label>File link (URL)</Label><Input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} className="mt-1" placeholder="https://…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={!title.trim() || create.isPending}>{create.isPending ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
