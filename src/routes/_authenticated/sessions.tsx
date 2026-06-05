import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getOwnerId } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CalendarDays, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sessions")({
  head: () => ({ meta: [{ title: "Sessions — Trainer" }] }),
  component: SessionsPage,
});

type Row = {
  id: string;
  session_date: string;
  session_time: string | null;
  school: string | null;
  title: string | null;
  attendance: { id: string }[];
};

function SessionsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, session_date, session_time, school, title, attendance(id)")
        .order("session_date", { ascending: false })
        .order("session_time", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [school, setSchool] = useState("");
  const [title, setTitle] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const owner_id = await getOwnerId();
      const { data, error } = await supabase
        .from("sessions")
        .insert({
          owner_id,
          session_date: date,
          session_time: time || null,
          school: school.trim() || null,
          title: title.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success("Session created");
      qc.invalidateQueries({ queryKey: ["sessions"] });
      setOpen(false);
      setSchool(""); setTitle(""); setTime("");
      navigate({ to: "/sessions/$id", params: { id: data.id } });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-semibold">Sessions</h1>
          <p className="text-muted-foreground mt-1">Lessons in order — newest first.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> New session</Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : sessions.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 text-center">
          <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="font-display text-lg font-semibold mt-4">No sessions yet</h2>
          <p className="text-muted-foreground mt-1 text-sm">Log your first lesson to start tracking attendance and progress.</p>
          <Button onClick={() => setOpen(true)} className="mt-6"><Plus className="h-4 w-4 mr-1" /> New session</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <Link key={s.id} to="/sessions/$id" params={{ id: s.id }} className="block bg-card border rounded-lg p-5 hover:border-primary transition-colors">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-display text-lg font-semibold">{formatDate(s.session_date)}</span>
                    {s.session_time && <span className="text-sm text-muted-foreground">{s.session_time.slice(0, 5)}</span>}
                    {s.school && <span className="inline-flex items-center rounded-full bg-secondary text-secondary-foreground text-xs font-medium px-2.5 py-0.5">{s.school}</span>}
                  </div>
                  {s.title && <div className="mt-1.5 text-sm">{s.title}</div>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {s.attendance.length} {s.attendance.length === 1 ? "student" : "students"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New session</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" /></div>
              <div><Label>Time (optional)</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1" /></div>
            </div>
            <div><Label>School (optional)</Label><Input value={school} onChange={(e) => setSchool(e.target.value)} className="mt-1" placeholder="e.g. Lycée Voltaire" /></div>
            <div><Label>Title (optional)</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" placeholder="e.g. Past simple — practice" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={!date || create.isPending}>{create.isPending ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
