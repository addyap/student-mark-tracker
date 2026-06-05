import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google secrets missing. Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in Cloud → Secrets.",
    );
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google token refresh failed (${res.status}). Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN. Details: ${text.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("No access_token returned by Google.");
  return json.access_token;
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  iconLink: string | null;
  modifiedTime: string | null;
};

export const listDriveFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ files: DriveFile[]; folderId: string }> => {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) {
      throw new Error("GOOGLE_DRIVE_FOLDER_ID is missing in Cloud → Secrets.");
    }
    const token = await getAccessToken();
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id,name,mimeType,webViewLink,iconLink,modifiedTime)",
      orderBy: "modifiedTime desc",
      pageSize: "200",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Drive list failed (${res.status}). Check GOOGLE_DRIVE_FOLDER_ID and that the Google account has access to that folder. Details: ${text.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as { files?: DriveFile[] };
    return { files: json.files ?? [], folderId };
  });

export type CalEvent = {
  id: string;
  summary: string | null;
  start: string | null; // ISO
  end: string | null;
  allDay: boolean;
  htmlLink: string | null;
  location: string | null;
};

export const listCalendarEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ pastDays: z.number().min(0).max(365).optional(), futureDays: z.number().min(0).max(365).optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<{ events: CalEvent[] }> => {
    const pastDays = data.pastDays ?? 14;
    const futureDays = data.futureDays ?? 60;
    const token = await getAccessToken();
    const now = Date.now();
    const timeMin = new Date(now - pastDays * 86400000).toISOString();
    const timeMax = new Date(now + futureDays * 86400000).toISOString();
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Calendar list failed (${res.status}). Make sure Calendar API is enabled and the refresh token grants Calendar read scope. Details: ${text.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as {
      items?: Array<{
        id: string;
        summary?: string;
        location?: string;
        htmlLink?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
    };
    const events: CalEvent[] = (json.items ?? []).map((e) => {
      const allDay = !!e.start?.date && !e.start?.dateTime;
      return {
        id: e.id,
        summary: e.summary ?? null,
        start: e.start?.dateTime ?? e.start?.date ?? null,
        end: e.end?.dateTime ?? e.end?.date ?? null,
        allDay,
        htmlLink: e.htmlLink ?? null,
        location: e.location ?? null,
      };
    });
    return { events };
  });
