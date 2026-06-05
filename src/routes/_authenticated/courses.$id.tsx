import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getOwnerId, avg, pct, type Student } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CalendarDays, FileText, Users, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "./sessions";
import { MarkedBadge } from "./students.$id";

export const Route = createFileRoute("/_authenticated/courses/$id")({
  head: () => ({ meta: [{ title: "Course — Antony Addy Formations" }] }),
  component: CoursePage,
});

function CoursePage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data: course } = useQuery({
    queryKey: ["course", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*").eq("id", id).single();
      if (error) throw error;
      return data as { id: string; name: string; institution: string | null; academic_year: string | null; notes: string | null };
    },
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["course-enrollments", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("enrollments").select("id, student_id").eq("course_id", id);
      if (error) throw error;
      return data as { id: string; student_id: string }[];
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

  const { data: sessions = [] } = useQuery({
    queryKey: ["course-sessions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, session_date, session_time, school, title, attendance(id)")
        .eq("course_id", id)
        .order("session_date", { ascending: false });
      if (error) throw error;
      return data as unknown as { id: string; session_date: string; session_time: string | null; school: string | null; title: string | null; attendance: { id: string }[] }[];
    },
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["course-documents", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, file_url, marked, collective_mark, collective_mark_max, attributions(individual_mark, individual_mark_max)")
        .eq("course_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as { id: string; title: string; file_url: string | null; marked: boolean; collective_mark: number | null; collective_mark_max: number | null; attributions: { individual_mark: number | null; individual_mark_max: number | null }[] }[];
    },
  });

  const enrolledIds = useMemo(() => new Set(enrollments.map((e) => e.student_id)), [enrollments]);
  const enrolledStudents = useMemo(() => students.filter((s) => enrolledIds.has(s.id)), [students, enrolledIds]);

  const [showPicker, setShowPicker] = useState(false);

  async function toggleEnrollment(studentId: string, checked: boolean) {
    const owner_id = await getOwnerId();
    if (checked) {
      const { error } = await supabase.from("enrollments").insert({ owner_id, course_id: id, student_id: studentId });
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("enrollments").delete().eq("course_id", id).eq("student_id", studentId);
      if (error) { toast.error(error.message); return; }
    }
    qc.invalidateQueries({ queryKey: ["course-enrollments", id] });
    qc.invalidateQueries({ queryKey: ["student-courses"] });
    qc.invalidateQueries({ queryKey: ["courses"] });
  }

  const allIndividuals = documents.flatMap((d) => d.attributions.map((a) => pct(a.individual_mark, a.individual_mark_max)));
  const allCollectives = documents.map((d) => pct(d.collective_mark, d.collective_mark_max));
  const avgInd = avg(allIndividuals);
  const avgCol = avg(allCollectives);

  if (!course) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div>
      <Link to="/courses" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> All courses
      </Link>

      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <h1 className="font-display text-3xl font-semibold">{course.name}</h1>
        {course.institution && <Badge variant="secondary">{course.institution}</Badge>}
      </div>
      <div className="mt-1 text-sm text-muted-foreground space-x-3">
        {course.academic_year && <span>{course.academic_year}</span>}
      </div>
      {course.notes && <p className="mt-3 text-sm whitespace-pre-wrap">{course.notes}</p>}

      <div className="mt-8 grid sm:grid-cols-2 gap-4">
        <StatCard label="Avg individual mark (course)" value={avgInd} hint="Across individual attributions in this course's documents" />
        <StatCard label="Avg collective mark (course)" value={avgCol} hint="Across this course's documents" accent />
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold flex items-center gap-2"><Users className="h-5 w-5" /> Enrolled students ({enrolledStudents.length})</h2>
        <Button variant="outline" size="sm" onClick={() => setShowPicker((v) => !v)}>{showPicker ? "Done" : "Manage enrollment"}</Button>
      </div>

      {showPicker ? (
        students.length === 0 ? (
          <div className="bg-card border rounded-lg p-6 text-sm text-muted-foreground mt-3">Add students first.</div>
        ) : (
          <div className="bg-card border rounded-lg divide-y mt-3">
            {students.map((s) => (
              <label key={s.id} className="p-3 flex items-center gap-3 cursor-pointer min-h-[44px]">
                <Checkbox checked={enrolledIds.has(s.id)} onCheckedChange={(c) => toggleEnrollment(s.id, !!c)} className="h-5 w-5" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{s.name}</div>
                  {s.school && <div className="text-xs text-muted-foreground">{s.school}</div>}
                </div>
              </label>
            ))}
          </div>
        )
      ) : enrolledStudents.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-3">No students enrolled yet.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mt-3">
          {enrolledStudents.map((s) => (
            <Link key={s.id} to="/students/$id" params={{ id: s.id }} className="bg-card border rounded-lg p-3 hover:border-primary transition-colors">
              <div className="font-medium truncate">{s.name}</div>
              {s.school && <div className="text-xs text-muted-foreground">{s.school}</div>}
            </Link>
          ))}
        </div>
      )}

      <h2 className="font-display text-xl font-semibold mt-10 mb-3 flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Sessions ({sessions.length})</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sessions tagged to this course yet.</p>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {sessions.map((s) => (
            <Link key={s.id} to="/sessions/$id" params={{ id: s.id }} className="block bg-card border rounded-lg p-3 hover:border-primary transition-colors">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium">{formatDate(s.session_date)} {s.session_time && <span className="text-sm text-muted-foreground ml-1">{s.session_time.slice(0, 5)}</span>}</div>
                  {s.title && <div className="text-sm text-muted-foreground truncate">{s.title}</div>}
                </div>
                <span className="text-xs text-muted-foreground">{s.attendance.length} {s.attendance.length === 1 ? "attendee" : "attendees"}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <h2 className="font-display text-xl font-semibold mt-10 mb-3 flex items-center gap-2"><FileText className="h-5 w-5" /> Documents ({documents.length})</h2>
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents tagged to this course yet.</p>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {documents.map((d) => (
            <Link key={d.id} to="/documents/$id" params={{ id: d.id }} className="block bg-card border rounded-lg p-3 hover:border-primary transition-colors">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{d.title}</span>
                  {d.file_url && (
                    <a href={d.file_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {typeof d.collective_mark === "number" && (
                    <span className="text-xs"><span className="uppercase tracking-wider text-muted-foreground mr-1">Coll.</span>{d.collective_mark}{typeof d.collective_mark_max === "number" ? `/${d.collective_mark_max}` : ""}</span>
                  )}
                  <MarkedBadge marked={d.marked} />
                </div>
              </div>
            </Link>
          ))}
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
