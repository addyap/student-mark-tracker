import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCalendarEvents, ensureSessionDriveFolder } from "@/lib/google.functions";
import { supabase } from "@/integrations/supabase/client";
import { getOwnerId } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { CalendarDays, RefreshCw, ExternalLink, Plus, MapPin } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Calendar — Antony Addy Formations" }] }),
  component: CalendarPage,
});

function CalendarPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchEvents = useServerFn(listCalendarEvents);

  const q = useQuery({
    queryKey: ["google-calendar-events"],
    queryFn: () => fetchEvents({ data: { pastDays: 14, futureDays: 60 } }),
    retry: false,
  });

  const createSession = useMutation({
    mutationFn: async (ev: { summary: string | null; start: string | null }) => {
      const owner_id = await getOwnerId();
      const startDate = ev.start ? new Date(ev.start) : new Date();
      const session_date = startDate.toISOString().slice(0, 10);
      const session_time = ev.start && ev.start.includes("T")
        ? startDate.toISOString().slice(11, 16)
        : null;
      const { data, error } = await supabase
        .from("sessions")
        .insert({
          owner_id,
          session_date,
          session_time,
          title: ev.summary || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success("Session created from event");
      qc.invalidateQueries({ queryKey: ["sessions"] });
      navigate({ to: "/sessions/$id", params: { id: data.id } });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const events = q.data?.events ?? [];
  const now = Date.now();
  const upcoming = events.filter((e) => e.start && new Date(e.start).getTime() >= now);
  const past = events.filter((e) => e.start && new Date(e.start).getTime() < now).reverse();

  return (
    <div>
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold">Calendar</h1>
          <p className="text-muted-foreground mt-1">Read-only view of your Google Calendar. Turn any event into a session.</p>
        </div>
        <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${q.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {q.isError && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3 mb-6">
          {(q.error as Error).message}
        </div>
      )}

      {q.isLoading && <p className="text-muted-foreground">Loading events…</p>}

      {!q.isLoading && !q.isError && events.length === 0 && (
        <div className="bg-card border rounded-lg p-12 text-center">
          <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="font-display text-lg font-semibold mt-4">No events</h2>
          <p className="text-muted-foreground mt-1 text-sm">Nothing in the last 14 days or next 60 days.</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="mb-10">
          <h2 className="font-display text-lg font-semibold mb-3">Upcoming</h2>
          <EventList items={upcoming} onCreate={(ev) => createSession.mutate(ev)} pending={createSession.isPending} />
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3">Recent</h2>
          <EventList items={past} onCreate={(ev) => createSession.mutate(ev)} pending={createSession.isPending} />
        </section>
      )}
    </div>
  );
}

function EventList({
  items,
  onCreate,
  pending,
}: {
  items: { id: string; summary: string | null; start: string | null; end: string | null; allDay: boolean; htmlLink: string | null; location: string | null }[];
  onCreate: (e: { summary: string | null; start: string | null }) => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-3">
      {items.map((e) => (
        <div key={e.id} className="bg-card border rounded-lg p-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{e.summary || "(no title)"}</div>
            <div className="text-sm text-muted-foreground mt-0.5">{formatWhen(e.start, e.end, e.allDay)}</div>
            {e.location && (
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><MapPin className="h-3 w-3" />{e.location}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {e.htmlLink && (
              <a href={e.htmlLink} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary p-2">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <Button size="sm" onClick={() => onCreate({ summary: e.summary, start: e.start })} disabled={pending}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Create session
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatWhen(start: string | null, end: string | null, allDay: boolean) {
  if (!start) return "";
  const s = new Date(start);
  if (allDay) return s.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) + " · all day";
  const datePart = s.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const startTime = s.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const endTime = end ? new Date(end).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null;
  return `${datePart} · ${startTime}${endTime ? ` – ${endTime}` : ""}`;
}
