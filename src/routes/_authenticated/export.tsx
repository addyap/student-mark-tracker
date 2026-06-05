import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet, ClipboardList } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/export")({
  head: () => ({ meta: [{ title: "Export — Trainer" }] }),
  component: ExportPage,
});

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

function download(filename: string, csv: string) {
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ExportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
  const [school, setSchool] = useState<string>("__all__");
  const [from, setFrom] = useState(monthAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: schools = [] } = useQuery({
    queryKey: ["schools"],
    queryFn: async () => {
      const [s1, s2] = await Promise.all([
        supabase.from("students").select("school"),
        supabase.from("sessions").select("school"),
      ]);
      const set = new Set<string>();
      [...(s1.data ?? []), ...(s2.data ?? [])].forEach((r: any) => { if (r.school) set.add(r.school); });
      return Array.from(set).sort();
    },
  });

  const filtersValid = useMemo(() => !!from && !!to && from <= to, [from, to]);

  async function exportFullReport() {
    if (!filtersValid) { toast.error("Pick a valid date range"); return; }
    setBusy("full");
    try {
      // Students (filter by school if chosen)
      let stuQ = supabase.from("students").select("id, name, school, email").order("name");
      if (school !== "__all__") stuQ = stuQ.eq("school", school);
      const { data: students, error: sErr } = await stuQ;
      if (sErr) throw sErr;
      const studentIds = (students ?? []).map((s) => s.id);
      if (studentIds.length === 0) { toast.error("No students match those filters"); setBusy(null); return; }

      // Attendance + sessions in range
      const { data: att, error: aErr } = await supabase
        .from("attendance")
        .select("student_id, progress_note, sessions!inner(id, session_date, session_time, school, title)")
        .in("student_id", studentIds)
        .gte("sessions.session_date", from)
        .lte("sessions.session_date", to);
      if (aErr) throw aErr;

      // Attributions + documents in range (by document created_at)
      const { data: attr, error: atErr } = await supabase
        .from("attributions")
        .select("student_id, individual_mark, individual_mark_max, documents!inner(id, title, collective_mark, collective_mark_max, marked, created_at)")
        .in("student_id", studentIds)
        .gte("documents.created_at", from + "T00:00:00")
        .lte("documents.created_at", to + "T23:59:59");
      if (atErr) throw atErr;

      const studentById = new Map(students!.map((s) => [s.id, s]));

      const sessionRows: any[][] = [[
        "Type", "Student name", "School", "Date", "Time", "Session school", "Session title", "Progress note",
        "Document title", "Individual mark", "Individual max", "Collective mark", "Collective max", "Marked",
      ]];

      (att ?? []).forEach((row: any) => {
        const s = studentById.get(row.student_id);
        const se = row.sessions;
        sessionRows.push([
          "Session", s?.name, s?.school, se?.session_date, se?.session_time ?? "",
          se?.school ?? "", se?.title ?? "", row.progress_note ?? "",
          "", "", "", "", "", "",
        ]);
      });

      (attr ?? []).forEach((row: any) => {
        const s = studentById.get(row.student_id);
        const d = row.documents;
        sessionRows.push([
          "Document", s?.name, s?.school, (d?.created_at ?? "").slice(0, 10), "",
          "", "", "",
          d?.title ?? "",
          row.individual_mark ?? "",
          row.individual_mark_max ?? "",
          d?.collective_mark ?? "",
          d?.collective_mark_max ?? "",
          d?.marked ? "yes" : "no",
        ]);
      });

      // Sort by student name then date for readability
      const header = sessionRows.shift()!;
      sessionRows.sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[3]).localeCompare(String(b[3])));
      const csv = toCsv([header, ...sessionRows]);
      const tag = school === "__all__" ? "all-schools" : school.replace(/\s+/g, "_");
      download(`trainer-report_${tag}_${from}_${to}.csv`, csv);
      toast.success("Report downloaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function exportAttendance() {
    if (!filtersValid) { toast.error("Pick a valid date range"); return; }
    setBusy("attendance");
    try {
      let seQ = supabase.from("sessions")
        .select("id, session_date, session_time, school, title")
        .gte("session_date", from)
        .lte("session_date", to)
        .order("session_date").order("session_time", { nullsFirst: true });
      if (school !== "__all__") seQ = seQ.eq("school", school);
      const { data: sessions, error: seErr } = await seQ;
      if (seErr) throw seErr;
      if (!sessions || sessions.length === 0) { toast.error("No sessions in that range"); setBusy(null); return; }

      const sessionIds = sessions.map((s) => s.id);
      const { data: att, error: aErr } = await supabase
        .from("attendance")
        .select("session_id, student_id, progress_note, students(name, school)")
        .in("session_id", sessionIds);
      if (aErr) throw aErr;

      const rows: any[][] = [[
        "Date", "Time", "School", "Session title", "Student name", "Student school", "Signature", "Progress note",
      ]];
      const bySession = new Map<string, any[]>();
      (att ?? []).forEach((a: any) => {
        const arr = bySession.get(a.session_id) ?? [];
        arr.push(a); bySession.set(a.session_id, arr);
      });

      sessions.forEach((s: any) => {
        const list = (bySession.get(s.id) ?? []).sort((a: any, b: any) =>
          String(a.students?.name ?? "").localeCompare(String(b.students?.name ?? ""))
        );
        if (list.length === 0) {
          rows.push([s.session_date, s.session_time ?? "", s.school ?? "", s.title ?? "", "(no attendees)", "", "", ""]);
        } else {
          list.forEach((a: any) => {
            rows.push([
              s.session_date,
              s.session_time ?? "",
              s.school ?? "",
              s.title ?? "",
              a.students?.name ?? "",
              a.students?.school ?? "",
              "", // signature column left blank for paper sign-off
              a.progress_note ?? "",
            ]);
          });
        }
      });

      const tag = school === "__all__" ? "all-schools" : school.replace(/\s+/g, "_");
      download(`emargement_${tag}_${from}_${to}.csv`, toCsv(rows));
      toast.success("Attendance sheet downloaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold">Export</h1>
        <p className="text-muted-foreground mt-1">Download clean CSVs for reporting and émargement.</p>
      </div>

      <div className="bg-card border rounded-lg p-6 space-y-5 max-w-2xl">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label>School</Label>
            <select
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="__all__">All schools</option>
              {schools.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" /></div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 pt-2">
          <button
            onClick={exportFullReport}
            disabled={busy !== null}
            className="text-left border rounded-lg p-4 hover:border-primary hover:bg-muted/30 transition-colors disabled:opacity-60"
          >
            <div className="flex items-center gap-2 font-display font-semibold">
              <FileSpreadsheet className="h-5 w-5 text-primary" /> Full report
            </div>
            <p className="text-sm text-muted-foreground mt-1">Per student: sessions, progress notes, documents, individual & collective marks (separate columns).</p>
            <div className="mt-3 inline-flex items-center text-sm text-primary font-medium">
              <Download className="h-4 w-4 mr-1" /> {busy === "full" ? "Building…" : "Download CSV"}
            </div>
          </button>

          <button
            onClick={exportAttendance}
            disabled={busy !== null}
            className="text-left border rounded-lg p-4 hover:border-primary hover:bg-muted/30 transition-colors disabled:opacity-60"
          >
            <div className="flex items-center gap-2 font-display font-semibold">
              <ClipboardList className="h-5 w-5 text-primary" /> Attendance (émargement)
            </div>
            <p className="text-sm text-muted-foreground mt-1">One row per attendee per session, with a blank Signature column to print and sign.</p>
            <div className="mt-3 inline-flex items-center text-sm text-primary font-medium">
              <Download className="h-4 w-4 mr-1" /> {busy === "attendance" ? "Building…" : "Download CSV"}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
