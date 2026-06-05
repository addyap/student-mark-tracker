import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getOwnerId } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, BookOpen } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/courses")({
  head: () => ({ meta: [{ title: "Courses — Antony Addy Formations" }] }),
  component: CoursesPage,
});

export type Course = {
  id: string;
  name: string;
  institution: string | null;
  academic_year: string | null;
  notes: string | null;
};

type Row = Course & { enrollments: { id: string }[] };

function CoursesPage() {
  const qc = useQueryClient();
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, name, institution, academic_year, notes, enrollments(id)")
        .order("name");
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);

  function openNew() { setEditing(null); setOpen(true); }
  function openEdit(c: Course) { setEditing(c); setOpen(true); }

  return (
    <div>
      <div className="flex items-start sm:items-center justify-between mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Courses</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Cohorts you teach — group students, sessions and documents by class.</p>
        </div>
        <Button onClick={openNew} className="shrink-0"><Plus className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Add course</span><span className="sm:hidden">Add</span></Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : courses.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 text-center">
          <BookOpen className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="font-display text-lg font-semibold mt-4">No courses yet</h2>
          <p className="text-muted-foreground mt-1 text-sm">Add your first course (e.g. "Bachelor 1 — École du Journalisme").</p>
          <Button onClick={openNew} className="mt-6"><Plus className="h-4 w-4 mr-1" /> Add course</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <div key={c.id} className="group bg-card border rounded-lg p-5 hover:border-primary transition-colors">
              <div className="flex items-start justify-between gap-3">
                <Link to="/courses/$id" params={{ id: c.id }} className="flex-1 min-w-0">
                  <div className="font-display font-semibold text-lg truncate">{c.name}</div>
                  {c.institution && <Badge variant="secondary" className="mt-1.5">{c.institution}</Badge>}
                  <div className="mt-3 text-sm text-muted-foreground space-y-0.5">
                    {c.academic_year && <div>{c.academic_year}</div>}
                    <div>{c.enrollments.length} {c.enrollments.length === 1 ? "student" : "students"}</div>
                  </div>
                </Link>
                <button onClick={() => openEdit(c)} className="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CourseDialog open={open} onOpenChange={setOpen} course={editing} onSaved={() => qc.invalidateQueries({ queryKey: ["courses"] })} />
    </div>
  );
}

function CourseDialog({
  open, onOpenChange, course, onSaved,
}: { open: boolean; onOpenChange: (b: boolean) => void; course: Course | null; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [year, setYear] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(course?.name ?? "");
    setInstitution(course?.institution ?? "");
    setYear(course?.academic_year ?? "");
    setNotes(course?.notes ?? "");
  }, [open, course]);

  const save = useMutation({
    mutationFn: async () => {
      const owner_id = await getOwnerId();
      const payload = {
        name: name.trim(),
        institution: institution.trim() || null,
        academic_year: year.trim() || null,
        notes: notes.trim() || null,
      };
      if (course) {
        const { error } = await supabase.from("courses").update(payload).eq("id", course.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("courses").insert({ ...payload, owner_id });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(course ? "Course updated" : "Course added"); onSaved(); onOpenChange(false); },
    onError: (e) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: async () => {
      if (!course) return;
      const { error } = await supabase.from("courses").delete().eq("id", course.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Course deleted"); onSaved(); onOpenChange(false); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{course ? "Edit course" : "Add course"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Course name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" placeholder="e.g. Bachelor 1" /></div>
          <div><Label>Institution / school</Label><Input value={institution} onChange={(e) => setInstitution(e.target.value)} className="mt-1" placeholder="e.g. École du Journalisme" /></div>
          <div><Label>Academic year / period (optional)</Label><Input value={year} onChange={(e) => setYear(e.target.value)} className="mt-1" placeholder="e.g. 2025–2026" /></div>
          <div><Label>Notes (optional)</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1" /></div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          {course ? (
            <Button variant="ghost" className="text-brand-red hover:bg-brand-red/10 hover:text-brand-red" onClick={() => { if (confirm("Delete this course? Sessions and documents will be unlinked from it.")) del.mutate(); }} disabled={del.isPending}>Delete</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>{save.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
