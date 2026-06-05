import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getOwnerId, type Student } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "./sessions";
import { CourseSelect } from "@/components/CourseSelect";

export const Route = createFileRoute("/_authenticated/sessions/$id")({
  head: () => ({ meta: [{ title: "Session — Antony Addy Formations" }] }),
  component: SessionPage,
});

type Session = {
  id: string;
  session_date: string;
  session_time: string | null;
  school: string | null;
  title: string | null;
  lesson_plan: string | null;
  course_id: string | null;
};

type Attendance = {
  id: string;
  session_id: string;
  student_id: string;
  progress_note: string | null;
};

type LinkedDoc = {
  id: string;
  title: string;
  file_url: string | null;
  marked: boolean;
};

function SessionPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ["session", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Session;
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

  const { data: attendance = [] } = useQuery({
    queryKey: ["session-attendance", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance").select("*").eq("session_id", id);
      if (error) throw error;
      return data as Attendance[];
    },
  });

  const { data: allDocs = [] } = useQuery({
    queryKey: ["documents-light"],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("id, title, file_url, marked, session_id").order("created_at", { ascending: false });
      if (error) throw error;
      return data as (LinkedDoc & { session_id: string | null })[];
    },
  });

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [school, setSchool] = useState("");
  const [title, setTitle] = useState("");
  const [lessonPlan, setLessonPlan] = useState("");
  const [courseId, setCourseId] = useState<string>("");

  useEffect(() => {
    if (!session) return;
    setDate(session.session_date);
    setTime(session.session_time?.slice(0, 5) ?? "");
    setSchool(session.school ?? "");
    setTitle(session.title ?? "");
    setLessonPlan(session.lesson_plan ?? "");
    setCourseId(session.course_id ?? "");
  }, [session]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sessions").update({
        session_date: date,
        session_time: time || null,
        school: school.trim() || null,
        title: title.trim() || null,
        lesson_plan: lessonPlan.trim() || null,
        course_id: courseId || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["session", id] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["course-sessions"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Session deleted"); navigate({ to: "/sessions" }); },
    onError: (e) => toast.error((e as Error).message),
  });

  async function toggleAttendance(studentId: string, checked: boolean) {
    const owner_id = await getOwnerId();
    if (checked) {
      const { error } = await supabase.from("attendance").insert({ owner_id, session_id: id, student_id: studentId });
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("attendance").delete().eq("session_id", id).eq("student_id", studentId);
      if (error) { toast.error(error.message); return; }
    }
    qc.invalidateQueries({ queryKey: ["session-attendance", id] });
    qc.invalidateQueries({ queryKey: ["sessions"] });
  }

  async function updateNote(attId: string, note: string) {
    const { error } = await supabase.from("attendance").update({ progress_note: note.trim() || null }).eq("id", attId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["session-attendance", id] });
    qc.invalidateQueries({ queryKey: ["student-timeline"] });
  }

  async function toggleDocLink(docId: string, linked: boolean) {
    const { error } = await supabase.from("documents").update({ session_id: linked ? id : null }).eq("id", docId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["documents-light"] });
    qc.invalidateQueries({ queryKey: ["documents"] });
  }

  if (!session) return <p className="text-muted-foreground">Loading…</p>;

  const attByStudent = new Map(attendance.map((a) => [a.student_id, a]));
  const linkedDocs = allDocs.filter((d) => d.session_id === id);

  return (
    <div>
      <Link to="/sessions" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> All sessions
      </Link>

      <div className="bg-card border rounded-lg p-6 space-y-5">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="font-display text-2xl font-semibold">{formatDate(date || session.session_date)}</h1>
          {time && <span className="text-muted-foreground">{time}</span>}
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" /></div>
          <div><Label>Time</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1" /></div>
          <div><Label>School</Label><Input value={school} onChange={(e) => setSchool(e.target.value)} className="mt-1" placeholder="—" /></div>
        </div>
        <div>
          <Label>Course</Label>
          <div className="mt-1"><CourseSelect value={courseId} onChange={setCourseId} includeNone /></div>
        </div>
        <div>
          <Label>Title / topic</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" placeholder="e.g. Past simple — practice" />

        </div>
        <div>
          <Label>Lesson plan</Label>
          <Textarea value={lessonPlan} onChange={(e) => setLessonPlan(e.target.value)} rows={8} className="mt-1" placeholder="What was planned and taught…" />
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="ghost" className="text-brand-red hover:bg-brand-red/10 hover:text-brand-red" onClick={() => { if (confirm("Delete this session?")) del.mutate(); }}>
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save session"}</Button>
        </div>
      </div>

      <h2 className="font-display text-xl font-semibold mt-10 mb-2">Attendance</h2>
      <p className="text-sm text-muted-foreground mb-4">Tick students who attended. Add a short progress note for each one.</p>

      {students.length === 0 ? (
        <div className="bg-card border rounded-lg p-8 text-center text-sm text-muted-foreground">Add students first.</div>
      ) : (
        <div className="bg-card border rounded-lg divide-y">
          {students.map((s) => {
            const att = attByStudent.get(s.id);
            const checked = !!att;
            return (
              <div key={s.id} className="p-4">
                <div className="flex items-start gap-3">
                  <Checkbox checked={checked} onCheckedChange={(c) => toggleAttendance(s.id, !!c)} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{s.name}</div>
                    {s.school && <div className="text-xs text-muted-foreground">{s.school}</div>}
                    {checked && att && (
                      <Textarea
                        defaultValue={att.progress_note ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if ((att.progress_note ?? "") !== v) updateNote(att.id, v);
                        }}
                        rows={2}
                        placeholder="Progress note (optional) — how did they do?"
                        className="mt-2"
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="font-display text-xl font-semibold mt-10 mb-2">Documents from this session</h2>
      <p className="text-sm text-muted-foreground mb-4">Tick existing documents that came out of this lesson.</p>
      {allDocs.length === 0 ? (
        <div className="bg-card border rounded-lg p-8 text-center text-sm text-muted-foreground">No documents to link yet.</div>
      ) : (
        <div className="bg-card border rounded-lg divide-y">
          {allDocs.map((d) => {
            const linked = d.session_id === id;
            const linkedElsewhere = !!d.session_id && d.session_id !== id;
            return (
              <div key={d.id} className="p-3 flex items-center gap-3">
                <Checkbox checked={linked} disabled={linkedElsewhere} onCheckedChange={(c) => toggleDocLink(d.id, !!c)} />
                <Link to="/documents/$id" params={{ id: d.id }} className="flex-1 min-w-0 hover:text-primary">
                  <span className="font-medium">{d.title}</span>
                  {linkedElsewhere && <span className="ml-2 text-xs text-muted-foreground">(linked to another session)</span>}
                </Link>
                {d.file_url && (
                  <a href={d.file_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {linkedDocs.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">{linkedDocs.length} document{linkedDocs.length === 1 ? "" : "s"} attached to this session.</p>
      )}
    </div>
  );
}
