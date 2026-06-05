import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Search, Users, FileText, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";

type Hit =
  | { kind: "student"; id: string; title: string; sub?: string | null }
  | { kind: "document"; id: string; title: string; sub?: string | null }
  | { kind: "session"; id: string; title: string; sub?: string | null };

export function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const like = `%${term}%`;
      const [s, d, se] = await Promise.all([
        supabase.from("students").select("id, name, school").ilike("name", like).limit(8),
        supabase.from("documents").select("id, title, marked").ilike("title", like).limit(8),
        supabase.from("sessions").select("id, title, school, session_date").or(`title.ilike.${like},school.ilike.${like}`).limit(8),
      ]);
      if (cancelled) return;
      const out: Hit[] = [];
      (s.data ?? []).forEach((r: any) => out.push({ kind: "student", id: r.id, title: r.name, sub: r.school }));
      (d.data ?? []).forEach((r: any) => out.push({ kind: "document", id: r.id, title: r.title, sub: r.marked ? "Marked" : "Unmarked" }));
      (se.data ?? []).forEach((r: any) => out.push({ kind: "session", id: r.id, title: r.title || r.session_date, sub: [r.school, r.title ? r.session_date : null].filter(Boolean).join(" · ") || null }));
      setHits(out);
      setLoading(false);
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const grouped = useMemo(() => ({
    students: hits.filter((h) => h.kind === "student"),
    sessions: hits.filter((h) => h.kind === "session"),
    documents: hits.filter((h) => h.kind === "document"),
  }), [hits]);

  function go(h: Hit) {
    setOpen(false);
    setQ("");
    if (h.kind === "student") navigate({ to: "/students/$id", params: { id: h.id } });
    else if (h.kind === "document") navigate({ to: "/documents/$id", params: { id: h.id } });
    else navigate({ to: "/sessions/$id", params: { id: h.id } });
  }

  return (
    <div ref={wrapRef} className="relative w-full max-w-xs">
      <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-foreground/60 pointer-events-none" />
      <Input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search students, sessions, docs…"
        className="pl-8 h-9 bg-white/10 border-white/20 text-primary-foreground placeholder:text-primary-foreground/60 focus-visible:bg-white/15 focus-visible:ring-white/40"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute z-50 mt-2 w-[22rem] right-0 sm:left-0 sm:right-auto bg-popover text-popover-foreground border rounded-lg shadow-lg overflow-hidden">
          {loading && hits.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Searching…</div>
          ) : hits.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No matches.</div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto py-1">
              <Group label="Students" icon={Users} items={grouped.students} onPick={go} />
              <Group label="Sessions" icon={CalendarDays} items={grouped.sessions} onPick={go} />
              <Group label="Documents" icon={FileText} items={grouped.documents} onPick={go} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ label, icon: Icon, items, onPick }: { label: string; icon: any; items: Hit[]; onPick: (h: Hit) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="py-1">
      <div className="px-3 py-1 text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-3 w-3" /> {label}
      </div>
      {items.map((h) => (
        <button
          key={`${h.kind}-${h.id}`}
          onClick={() => onPick(h)}
          className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors"
        >
          <div className="text-sm font-medium truncate">{h.title}</div>
          {h.sub && <div className="text-xs text-muted-foreground truncate">{h.sub}</div>}
        </button>
      ))}
    </div>
  );
}
