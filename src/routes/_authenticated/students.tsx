import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getOwnerId, type Student } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { CourseSelect } from "@/components/CourseSelect";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({ meta: [{ title: "Students — Antony Addy Formations" }] }),
  component: StudentsPage,
});

function StudentsPage() {
  const qc = useQueryClient();
  const [courseFilter, setCourseFilter] = useState<string>("__all__");

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").order("name");
      if (error) throw error;
      return data as Student[];
    },
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["enrollments-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("enrollments").select("course_id, student_id");
      if (error) throw error;
      return data as { course_id: string; student_id: string }[];
    },
  });

  const filteredStudents = useMemo(() => {
    if (courseFilter === "__all__") return students;
    const ids = new Set(enrollments.filter((e) => e.course_id === courseFilter).map((e) => e.student_id));
    return students.filter((s) => ids.has(s.id));
  }, [students, enrollments, courseFilter]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);

  function openNew() { setEditing(null); setOpen(true); }
  function openEdit(s: Student) { setEditing(s); setOpen(true); }

  return (
    <div>
      <div className="flex items-start sm:items-center justify-between mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Students</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Everyone you teach, tagged by school and course.</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="flex-1 sm:w-56 sm:flex-none"><CourseSelect value={courseFilter} onChange={setCourseFilter} includeAll /></div>
          <Button onClick={openNew} className="shrink-0"><Plus className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Add student</span><span className="sm:hidden">Add</span></Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filteredStudents.length === 0 ? (
        students.length === 0 ? <EmptyState onAdd={openNew} /> : <p className="text-muted-foreground">No students match this course filter.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredStudents.map((s) => (
            <div key={s.id} className="group bg-card border rounded-lg p-5 hover:border-primary transition-colors">
              <div className="flex items-start justify-between gap-3">
                <Link to="/students/$id" params={{ id: s.id }} className="flex-1 min-w-0">
                  <div className="font-display font-semibold text-lg truncate">{s.name}</div>
                  {s.school && <Badge variant="secondary" className="mt-1.5">{s.school}</Badge>}
                  <div className="mt-3 text-sm text-muted-foreground space-y-0.5">
                    {s.email && <div className="truncate">{s.email}</div>}
                    {s.phone && <div>{s.phone}</div>}
                  </div>
                </Link>
                <button onClick={() => openEdit(s)} className="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <StudentDialog open={open} onOpenChange={setOpen} student={editing} onSaved={() => qc.invalidateQueries({ queryKey: ["students"] })} />
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="bg-card border rounded-lg p-12 text-center">
      <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground" />
      <h2 className="font-display text-lg font-semibold mt-4">No students yet</h2>
      <p className="text-muted-foreground mt-1 text-sm">Add your first student to start tracking work.</p>
      <Button onClick={onAdd} className="mt-6"><Plus className="h-4 w-4 mr-1" /> Add student</Button>
    </div>
  );
}

export function StudentDialog({
  open, onOpenChange, student, onSaved,
}: { open: boolean; onOpenChange: (b: boolean) => void; student: Student | null; onSaved: () => void }) {
  const [name, setName] = useState(student?.name ?? "");
  const [email, setEmail] = useState(student?.email ?? "");
  const [phone, setPhone] = useState(student?.phone ?? "");
  const [school, setSchool] = useState(student?.school ?? "");

  // Reset when target changes
  useState(() => { /* noop */ });

  const save = useMutation({
    mutationFn: async () => {
      const owner_id = await getOwnerId();
      const payload = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        school: school.trim() || null,
      };
      if (student) {
        const { error } = await supabase.from("students").update(payload).eq("id", student.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("students").insert({ ...payload, owner_id });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(student ? "Student updated" : "Student added"); onSaved(); onOpenChange(false); },
    onError: (e) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: async () => {
      if (!student) return;
      const { error } = await supabase.from("students").delete().eq("id", student.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Student deleted"); onSaved(); onOpenChange(false); },
    onError: (e) => toast.error((e as Error).message),
  });

  // Sync state when dialog opens with a different student
  if (open) {
    // nothing — fields seeded above on mount
  }

  return (
    <Dialog open={open} onOpenChange={(b) => { onOpenChange(b); if (b) { setName(student?.name ?? ""); setEmail(student?.email ?? ""); setPhone(student?.phone ?? ""); setSchool(student?.school ?? ""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{student ? "Edit student" : "Add student"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" /></div>
            <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" /></div>
          </div>
          <div><Label>School</Label><Input value={school} onChange={(e) => setSchool(e.target.value)} className="mt-1" placeholder="e.g. Lycée Voltaire" /></div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          {student ? (
            <Button variant="ghost" className="text-brand-red hover:bg-brand-red/10 hover:text-brand-red" onClick={() => del.mutate()} disabled={del.isPending}>Delete</Button>
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
