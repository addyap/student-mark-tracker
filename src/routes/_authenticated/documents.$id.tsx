import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getOwnerId, type Student, type Document, type Attribution } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CourseSelect } from "@/components/CourseSelect";
import { DrivePanel } from "@/components/DrivePanel";
import { useCourses } from "@/components/CourseSelect";

export const Route = createFileRoute("/_authenticated/documents/$id")({
  head: () => ({ meta: [{ title: "Document — Antony Addy Formations" }] }),
  component: DocumentPage,
});

function DocumentPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: doc } = useQuery({
    queryKey: ["document", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Document;
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").order("name");
      if (error) throw error;
      return data as Student[];
    },
  });

  const { data: attributions = [] } = useQuery({
    queryKey: ["doc-attributions", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("attributions").select("*").eq("document_id", id);
      if (error) throw error;
      return data as Attribution[];
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions-light"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id, session_date, title, school").order("session_date", { ascending: false });
      if (error) throw error;
      return data as { id: string; session_date: string; title: string | null; school: string | null }[];
    },
  });

  const [title, setTitle] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [collective, setCollective] = useState("");
  const [collectiveMax, setCollectiveMax] = useState("");
  const [marked, setMarked] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [courseId, setCourseId] = useState<string>("");

  useEffect(() => {
    if (!doc) return;
    setTitle(doc.title);
    setFileUrl(doc.file_url ?? "");
    setCollective(doc.collective_mark != null ? String(doc.collective_mark) : "");
    setCollectiveMax(doc.collective_mark_max != null ? String(doc.collective_mark_max) : "");
    setMarked(doc.marked);
    setSessionId(doc.session_id ?? "");
    setCourseId(((doc as unknown as { course_id: string | null }).course_id) ?? "");
  }, [doc]);

  const saveDoc = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("documents").update({
        title: title.trim(),
        file_url: fileUrl.trim() || null,
        collective_mark: collective === "" ? null : Number(collective),
        collective_mark_max: collectiveMax === "" ? null : Number(collectiveMax),
        marked,
        session_id: sessionId || null,
        course_id: courseId || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["document", id] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["student-attributions"] });
      qc.invalidateQueries({ queryKey: ["documents-light"] });
      qc.invalidateQueries({ queryKey: ["course-documents"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteDoc = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Document deleted"); navigate({ to: "/documents" }); },
    onError: (e) => toast.error((e as Error).message),
  });

  async function toggleStudent(studentId: string, checked: boolean) {
    const owner_id = await getOwnerId();
    if (checked) {
      const { error } = await supabase.from("attributions").insert({ owner_id, document_id: id, student_id: studentId });
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("attributions").delete().eq("document_id", id).eq("student_id", studentId);
      if (error) { toast.error(error.message); return; }
    }
    qc.invalidateQueries({ queryKey: ["doc-attributions", id] });
    qc.invalidateQueries({ queryKey: ["documents"] });
  }

  async function updateAttribution(attr: Attribution, patch: { individual_mark?: number | null; individual_mark_max?: number | null }) {
    const { error } = await supabase.from("attributions").update(patch).eq("id", attr.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["doc-attributions", id] });
    qc.invalidateQueries({ queryKey: ["student-attributions"] });
  }

  if (!doc) return <p className="text-muted-foreground">Loading…</p>;

  const attrByStudent = new Map(attributions.map((a) => [a.student_id, a]));

  return (
    <div>
      <Link to="/documents" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> All documents
      </Link>

      <div className="bg-card border rounded-lg p-6 space-y-5">
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 text-lg font-medium" />
        </div>
        <div>
          <Label>File link (URL)</Label>
          <div className="mt-1 flex gap-2">
            <Input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…" />
            {fileUrl && (
              <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center px-3 rounded-md border text-sm text-muted-foreground hover:text-primary">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Course (optional)</Label>
            <div className="mt-1"><CourseSelect value={courseId} onChange={setCourseId} includeNone /></div>
          </div>
          <div>
            <Label>Linked session (optional)</Label>
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">— No session —</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.session_date + "T00:00:00").toLocaleDateString()} {s.school ? `· ${s.school}` : ""}{s.title ? ` · ${s.title}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>


        <div className="grid sm:grid-cols-3 gap-4 items-end">
          <div className="sm:col-span-2 grid grid-cols-2 gap-3">
            <div>
              <Label>Collective mark</Label>
              <Input type="number" step="0.5" value={collective} onChange={(e) => setCollective(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Max</Label>
              <Input type="number" step="0.5" value={collectiveMax} onChange={(e) => setCollectiveMax(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div className="flex items-center justify-between bg-muted/40 rounded-md px-4 py-2.5 border">
            <div>
              <div className="text-sm font-medium">Marked</div>
              <div className="text-xs text-muted-foreground">{marked ? "Done" : "In the queue"}</div>
            </div>
            <Switch checked={marked} onCheckedChange={setMarked} />
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="ghost" className="text-brand-red hover:bg-brand-red/10 hover:text-brand-red" onClick={() => { if (confirm("Delete this document?")) deleteDoc.mutate(); }}>
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
          <Button onClick={() => saveDoc.mutate()} disabled={saveDoc.isPending}>{saveDoc.isPending ? "Saving…" : "Save document"}</Button>
        </div>
      </div>

      <div className="mt-6">
        <DrivePanel
          onAttach={({ link, name, subfolder }) => {
            setFileUrl(link);
            if (!title.trim()) setTitle(name);

            let matched: string[] = [];
            if (subfolder) {
              const sf = subfolder.trim().toLowerCase();

              // Course match
              const course = courses.find((c) => c.name.trim().toLowerCase() === sf);
              if (course) { setCourseId(course.id); matched.push(`course "${course.name}"`); }

              // Session match (by title or date)
              const session = sessions.find((s) => {
                if (s.title && s.title.trim().toLowerCase() === sf) return true;
                if (s.session_date === subfolder.trim()) return true;
                try {
                  const d = new Date(s.session_date + "T00:00:00").toLocaleDateString();
                  if (d === subfolder.trim()) return true;
                } catch { /* ignore */ }
                return false;
              });
              if (session) {
                setSessionId(session.id);
                matched.push(`session "${session.title ?? session.session_date}"`);
              }

              // Student match → auto-attribute after save
              const student = students.find((s) => s.name.trim().toLowerCase() === sf);
              if (student) {
                toggleStudent(student.id, true);
                matched.push(`student "${student.name}"`);
              }
            }

            if (matched.length) {
              toast.success(`Attached and pre-filled: ${matched.join(", ")}. Confirm and Save.`);
            } else {
              toast.success("Drive link attached — click Save document to persist.");
            }
          }}
        />
      </div>

      <h2 className="font-display text-xl font-semibold mt-10 mb-2">Attribute to students</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Tick one for individual work, several for group work. Individual marks are tracked per student and never merged with the collective mark.
      </p>

      {students.length === 0 ? (
        <div className="bg-card border rounded-lg p-8 text-center text-sm text-muted-foreground">
          Add students first to attribute work.
        </div>
      ) : (
        <div className="bg-card border rounded-lg divide-y">
          {students.map((s) => {
            const attr = attrByStudent.get(s.id);
            const checked = !!attr;
            return (
              <div key={s.id} className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4 flex-wrap">
                <label className="flex items-center gap-3 flex-1 min-w-[180px] cursor-pointer min-h-[44px]">
                  <Checkbox checked={checked} onCheckedChange={(c) => toggleStudent(s.id, !!c)} className="h-5 w-5" />
                  <div>
                    <div className="font-medium">{s.name}</div>
                    {s.school && <div className="text-xs text-muted-foreground">{s.school}</div>}
                  </div>
                </label>
                {checked && attr && (
                  <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto pl-8 sm:pl-0">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mr-1 hidden sm:block">Individual</div>
                    <Input
                      type="number" step="0.5" inputMode="decimal"
                      defaultValue={attr.individual_mark ?? ""}
                      onBlur={(e) => updateAttribution(attr, { individual_mark: e.target.value === "" ? null : Number(e.target.value) })}
                      className="w-20" placeholder="mark"
                    />
                    <span className="text-muted-foreground">/</span>
                    <Input
                      type="number" step="0.5" inputMode="decimal"
                      defaultValue={attr.individual_mark_max ?? ""}
                      onBlur={(e) => updateAttribution(attr, { individual_mark_max: e.target.value === "" ? null : Number(e.target.value) })}
                      className="w-20" placeholder="max"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
