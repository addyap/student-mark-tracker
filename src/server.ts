import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

function readRuntimeEnv(name: string, env: unknown): string | undefined {
  const processValue = process.env[name];
  if (typeof processValue === "string" && processValue.length > 0) return processValue;

  if (env && typeof env === "object") {
    const envValue = (env as Record<string, unknown>)[name];
    if (typeof envValue === "string" && envValue.length > 0) return envValue;
  }

  const viteValue = {
    SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  }[name];
  if (typeof viteValue === "string" && viteValue.length > 0) return viteValue;

  return undefined;
}

function ensureSupabaseRuntimeEnv(env: unknown) {
  const supabaseUrl =
    readRuntimeEnv("SUPABASE_URL", env) ?? readRuntimeEnv("VITE_SUPABASE_URL", env);
  const supabasePublishableKey =
    readRuntimeEnv("SUPABASE_PUBLISHABLE_KEY", env) ??
    readRuntimeEnv("VITE_SUPABASE_PUBLISHABLE_KEY", env);

  if (supabaseUrl) {
    process.env.SUPABASE_URL = supabaseUrl;
    process.env.VITE_SUPABASE_URL ??= supabaseUrl;
  }

  if (supabasePublishableKey) {
    process.env.SUPABASE_PUBLISHABLE_KEY = supabasePublishableKey;
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??= supabasePublishableKey;
  }
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      ensureSupabaseRuntimeEnv(env);
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
