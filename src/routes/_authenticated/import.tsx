import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getOwnerId } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Import — Antony Addy Formations" }] }),
  component: ImportPage,
});

// ---------- helpers ----------
function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseCSV(text: string): string[][] {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let cur: string[] = [];
  let val = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { val += '"'; i++; }
        else q = false;
      } else val += c;
    } else {
      if (c === '"') q = true;
      else if (c === "," || c === ";" || c === "\t") {
        // detect delimiter: only treat as separator if it's the dominant one in header
        cur.push(val); val = "";
      } else if (c === "\n") { cur.push(val); val = ""; rows.push(cur); cur = []; }
      else if (c === "\r") { /* skip */ }
      else val += c;
    }
  }
  if (val.length || cur.length) { cur.push(val); rows.push(cur); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

// Smarter delimiter detect: re-parse if header has only 1 column but ; or \t found
function smartParse(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = { ",": (firstLine.match(/,/g) || []).length, ";": (firstLine.match(/;/g) || []).length, "\t": (firstLine.match(/\t/g) || []).length };
  const delim = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as "," | ";" | "\t";
  const rows: string[][] = [];
  let cur: string[] = []; let val = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { val += '"'; i++; } else q = false; }
      else val += c;
    } else {
      if (c === '"') q = true;
      else if (c === delim) { cur.push(val); val = ""; }
      else if (c === "\n") { cur.push(val); val = ""; rows.push(cur); cur = []; }
      else if (c === "\r") {}
      else val += c;
    }
  }
  if (val.length || cur.length) { cur.push(val); rows.push(cur); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => norm(h));
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); });
    return o;
  });
}

function downloadFile(name: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["\ufeff" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// ---------- page ----------
function ImportPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold">Import</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          Upload a CSV to bulk-create students or lessons. You'll see a preview before anything is saved.
        </p>
      </div>

      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="lessons">Lessons</TabsTrigger>
        </TabsList>
        <TabsContent value="students" className="mt-6">
          <StudentsImport />
        </TabsContent>
        <TabsContent value="lessons" className="mt-6">
          <LessonsImport />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- shared UI ----------
function UploadCard({
  title, description, headers, onFile, templateName, templateContent,
}: {
  title: string;
  description: string;
  headers: string[];
  onFile: (text: string, filename: string) => void;
  templateName: string;
  templateContent: string;
}) {
  return (
    <div className="bg-card border rounded-lg p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 text-primary p-2"><FileSpreadsheet className="h-5 w-5" /></div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-semibold text-lg">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {headers.map((h) => <Badge key={h} variant="secondary" className="font-mono text-[11px]">{h}</Badge>)}
          </div>
          <p className="text-xs text-muted-foreground mt-2">Column order doesn't matter — we match by header name. UTF-8, French accents OK.</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium cursor-pointer hover:opacity-90">
          <Upload className="h-4 w-4" /> Choose CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const text = await f.text();
              onFile(text, f.name);
              e.currentTarget.value = "";
            }}
          />
        </label>
        <Button variant="outline" onClick={() => downloadFile(templateName, templateContent)}>
          <Download className="h-4 w-4 mr-1.5" /> Download template
        </Button>
      </div>
    </div>
  );
}

// ---------- STUDENTS ----------
type StudentRow = {
  line: number;
  name: string;
  email: string;
  course: string;
  status: "create" | "update" | "invalid";
  problems: string[];
  existingId?: string;
  courseId?: string;
};

function StudentsImport() {
  const qc = useQueryClient();
  const [filename, setFilename] = useState<string | null>(null);
  const [rows, setRows] = useState<StudentRow[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: existingStudents = [] } = useQuery({
    queryKey: ["students-all-for-import"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("id, email");
      if (error) throw error;
      return data as { id: string; email: string | null }[];
    },
  });
  const { data: courses = [] } = useQuery({
    queryKey: ["courses-all-for-import"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const studentByEmail = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of existingStudents) if (s.email) m.set(s.email.trim().toLowerCase(), s.id);
    return m;
  }, [existingStudents]);
  const courseByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of courses) m.set(norm(c.name), c.id);
    return m;
  }, [courses]);

  function handleFile(text: string, name: string) {
    const parsed = smartParse(text);
    const objs = rowsToObjects(parsed);
    if (objs.length === 0) { toast.error("CSV is empty"); return; }
    const headerKeys = Object.keys(objs[0]);
    if (!headerKeys.includes("name") && !headerKeys.includes("nom")) {
      toast.error('Missing "name" column');
      return;
    }
    const out: StudentRow[] = objs.map((o, idx) => {
      const nameVal = (o["name"] ?? o["nom"] ?? "").trim();
      const emailVal = (o["email"] ?? o["e-mail"] ?? o["mail"] ?? "").trim();
      const courseVal = (o["course"] ?? o["cours"] ?? o["classe"] ?? "").trim();
      const problems: string[] = [];
      let status: StudentRow["status"] = "create";
      let existingId: string | undefined;
      let courseId: string | undefined;

      if (!nameVal) { problems.push("Missing name"); status = "invalid"; }
      if (emailVal) {
        const found = studentByEmail.get(emailVal.toLowerCase());
        if (found) { status = status === "invalid" ? "invalid" : "update"; existingId = found; }
      }
      if (courseVal) {
        const id = courseByName.get(norm(courseVal));
        if (id) courseId = id;
        else problems.push(`Unknown course "${courseVal}" — student will be imported, enrollment skipped`);
      }

      return { line: idx + 2, name: nameVal, email: emailVal, course: courseVal, status, problems, existingId, courseId };
    });
    setRows(out);
    setFilename(name);
  }

  const counts = useMemo(() => {
    if (!rows) return { create: 0, update: 0, invalid: 0, warn: 0, enroll: 0 };
    return {
      create: rows.filter((r) => r.status === "create").length,
      update: rows.filter((r) => r.status === "update").length,
      invalid: rows.filter((r) => r.status === "invalid").length,
      warn: rows.filter((r) => r.status !== "invalid" && r.problems.length).length,
      enroll: rows.filter((r) => r.status !== "invalid" && r.courseId).length,
    };
  }, [rows]);

  async function commit() {
    if (!rows) return;
    setSubmitting(true);
    try {
      const owner_id = await getOwnerId();
      const valid = rows.filter((r) => r.status !== "invalid");
      let created = 0, updated = 0, enrolled = 0;

      for (const r of valid) {
        let studentId = r.existingId;
        if (r.status === "update" && studentId) {
          const patch: { name: string; email?: string } = { name: r.name };
          if (r.email) patch.email = r.email;
          const { error } = await supabase.from("students").update(patch).eq("id", studentId);
          if (error) throw error;
          updated++;
        } else {
          const { data, error } = await supabase
            .from("students")
            .insert({ owner_id, name: r.name, email: r.email || null })
            .select("id")
            .single();
          if (error) throw error;
          studentId = data.id;
          created++;
        }
        if (r.courseId && studentId) {
          // Avoid duplicate enrollment
          const { data: existing } = await supabase
            .from("enrollments")
            .select("id")
            .eq("student_id", studentId)
            .eq("course_id", r.courseId)
            .maybeSingle();
          if (!existing) {
            const { error } = await supabase
              .from("enrollments")
              .insert({ owner_id, student_id: studentId, course_id: r.courseId });
            if (error) throw error;
            enrolled++;
          }
        }
      }

      toast.success(`Imported: ${created} created, ${updated} updated, ${enrolled} enrolled`);
      setRows(null); setFilename(null);
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["enrollments-all"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <UploadCard
        title="Import students"
        description="Match on email — existing students are updated, new ones are created. Optionally enroll in a course."
        headers={["name", "email", "course"]}
        templateName="students-template.csv"
        templateContent={`name,email,course\nMarie Dupont,marie.dupont@example.com,Bachelor 1\nJean Lefèvre,jean.lefevre@example.com,Bachelor 1\nÉlodie Martin,,\n`}
        onFile={handleFile}
      />

      {rows && (
        <PreviewPanel
          filename={filename!}
          counts={[
            { label: "To create", value: counts.create, tone: "ok" },
            { label: "To update", value: counts.update, tone: "ok" },
            { label: "Enrollments", value: counts.enroll, tone: "ok" },
            { label: "With warnings", value: counts.warn, tone: "warn" },
            { label: "Invalid (skipped)", value: counts.invalid, tone: "bad" },
          ]}
          onCancel={() => { setRows(null); setFilename(null); }}
          onConfirm={commit}
          submitting={submitting}
          confirmDisabled={counts.create + counts.update === 0}
        >
          <PreviewTable
            columns={["Line", "Name", "Email", "Course", "Action", "Notes"]}
            data={rows.map((r) => [
              String(r.line),
              r.name || <em className="text-muted-foreground">missing</em>,
              r.email || "—",
              r.course || "—",
              <StatusBadge key="s" status={r.status} />,
              r.problems.length ? <span className="text-amber-700">{r.problems.join("; ")}</span> : "",
            ])}
          />
        </PreviewPanel>
      )}
    </div>
  );
}

// ---------- LESSONS / SESSIONS ----------
type LessonRow = {
  line: number;
  date: string;
  course: string;
  title: string;
  plan: string;
  status: "create" | "invalid";
  problems: string[];
  courseId?: string;
  school?: string;
  normalizedDate?: string;
};

function parseDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  // ISO yyyy-mm-dd
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = (Number(y) >= 50 ? "19" : "20") + y;
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

function LessonsImport() {
  const qc = useQueryClient();
  const [filename, setFilename] = useState<string | null>(null);
  const [rows, setRows] = useState<LessonRow[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-all-for-import-lessons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, name, institution");
      if (error) throw error;
      return data as { id: string; name: string; institution: string | null }[];
    },
  });
  const courseMap = useMemo(() => {
    const m = new Map<string, { id: string; institution: string | null }>();
    for (const c of courses) m.set(norm(c.name), { id: c.id, institution: c.institution });
    return m;
  }, [courses]);

  function handleFile(text: string, name: string) {
    const parsed = smartParse(text);
    const objs = rowsToObjects(parsed);
    if (objs.length === 0) { toast.error("CSV is empty"); return; }
    const out: LessonRow[] = objs.map((o, idx) => {
      const dateVal = (o["date"] ?? "").trim();
      const courseVal = (o["course"] ?? o["cours"] ?? o["classe"] ?? "").trim();
      const titleVal = (o["title"] ?? o["titre"] ?? "").trim();
      const planVal = (o["topic"] ?? o["plan"] ?? o["summary"] ?? o["resume"] ?? o["résumé"] ?? "").trim();
      const problems: string[] = [];
      let status: LessonRow["status"] = "create";
      const normDate = parseDate(dateVal);
      if (!normDate) { problems.push("Invalid or missing date"); status = "invalid"; }
      if (!titleVal) { problems.push("Missing title"); status = "invalid"; }
      let courseId: string | undefined; let school: string | undefined;
      if (!courseVal) { problems.push("Missing course"); status = "invalid"; }
      else {
        const c = courseMap.get(norm(courseVal));
        if (!c) { problems.push(`Unknown course "${courseVal}"`); status = "invalid"; }
        else { courseId = c.id; school = c.institution ?? undefined; }
      }
      return { line: idx + 2, date: dateVal, course: courseVal, title: titleVal, plan: planVal, status, problems, courseId, school, normalizedDate: normDate ?? undefined };
    });
    setRows(out);
    setFilename(name);
  }

  const counts = useMemo(() => {
    if (!rows) return { create: 0, invalid: 0 };
    return {
      create: rows.filter((r) => r.status === "create").length,
      invalid: rows.filter((r) => r.status === "invalid").length,
    };
  }, [rows]);

  async function commit() {
    if (!rows) return;
    setSubmitting(true);
    try {
      const owner_id = await getOwnerId();
      const valid = rows.filter((r) => r.status === "create");
      const payload = valid.map((r) => ({
        owner_id,
        session_date: r.normalizedDate!,
        course_id: r.courseId!,
        title: r.title,
        lesson_plan: r.plan || null,
        school: r.school || null,
      }));
      // Batch insert in chunks of 100
      for (let i = 0; i < payload.length; i += 100) {
        const chunk = payload.slice(i, i + 100);
        const { error } = await supabase.from("sessions").insert(chunk);
        if (error) throw error;
      }
      toast.success(`Imported ${valid.length} lessons`);
      setRows(null); setFilename(null);
      qc.invalidateQueries({ queryKey: ["sessions"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <UploadCard
        title="Import lessons (sessions)"
        description="One session per row, linked to an existing course. Full plan documents go through Drive Sync — this is for the structured lesson list and an optional short summary."
        headers={["date", "course", "title", "topic"]}
        templateName="lessons-template.csv"
        templateContent={`date,course,title,topic\n2026-01-15,Bachelor 1,Present perfect — review,"Refresher on present perfect vs past simple, with class exercises"\n15/01/2026,Bachelor 1,Writing workshop,Short essay on current events\n2026-02-03,Bachelor 2,Oral presentations,\n`}
        onFile={handleFile}
      />

      {rows && (
        <PreviewPanel
          filename={filename!}
          counts={[
            { label: "To create", value: counts.create, tone: "ok" },
            { label: "Invalid (skipped)", value: counts.invalid, tone: "bad" },
          ]}
          onCancel={() => { setRows(null); setFilename(null); }}
          onConfirm={commit}
          submitting={submitting}
          confirmDisabled={counts.create === 0}
        >
          <PreviewTable
            columns={["Line", "Date", "Course", "Title", "Topic", "Action", "Notes"]}
            data={rows.map((r) => [
              String(r.line),
              r.normalizedDate || <span className="text-destructive">{r.date || "missing"}</span>,
              r.course || <em className="text-muted-foreground">missing</em>,
              r.title || <em className="text-muted-foreground">missing</em>,
              r.plan ? <span className="line-clamp-1 max-w-[18rem] inline-block align-bottom">{r.plan}</span> : "—",
              <StatusBadge key="s" status={r.status} />,
              r.problems.length ? <span className="text-amber-700">{r.problems.join("; ")}</span> : "",
            ])}
          />
        </PreviewPanel>
      )}
    </div>
  );
}

// ---------- preview UI ----------
function StatusBadge({ status }: { status: "create" | "update" | "invalid" }) {
  if (status === "invalid") return <Badge variant="destructive">Skip</Badge>;
  if (status === "update") return <Badge variant="secondary">Update</Badge>;
  return <Badge>Create</Badge>;
}

function PreviewPanel({
  filename, counts, children, onCancel, onConfirm, submitting, confirmDisabled,
}: {
  filename: string;
  counts: { label: string; value: number; tone: "ok" | "warn" | "bad" }[];
  children: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
  confirmDisabled: boolean;
}) {
  return (
    <div className="bg-card border rounded-lg p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-semibold text-lg flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" /> Preview
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">{filename}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button onClick={onConfirm} disabled={submitting || confirmDisabled}>
            {submitting ? "Importing…" : "Confirm import"}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {counts.map((c) => (
          <div key={c.label} className={`rounded-md border px-3 py-2.5 ${
            c.tone === "bad" ? "border-destructive/30 bg-destructive/5" :
            c.tone === "warn" ? "border-amber-300 bg-amber-50" :
            "border-border bg-muted/30"
          }`}>
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="text-xl font-semibold tabular-nums mt-0.5 flex items-center gap-1.5">
              {c.tone === "warn" && <AlertTriangle className="h-4 w-4 text-amber-600" />}
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto -mx-5 sm:-mx-6 px-5 sm:px-6">{children}</div>
    </div>
  );
}

function PreviewTable({ columns, data }: { columns: string[]; data: React.ReactNode[][] }) {
  return (
    <div className="min-w-full">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
            {columns.map((c) => <th key={c} className="py-2 pr-4 font-medium whitespace-nowrap">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && (
            <tr><td colSpan={columns.length} className="py-6 text-center text-muted-foreground">No rows</td></tr>
          )}
          {data.map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              {row.map((cell, j) => <td key={j} className="py-2 pr-4 align-top">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
