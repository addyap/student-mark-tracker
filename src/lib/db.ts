import { supabase } from "@/integrations/supabase/client";

export type Student = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  school: string | null;
};

export type Document = {
  id: string;
  title: string;
  file_url: string | null;
  collective_mark: number | null;
  collective_mark_max: number | null;
  marked: boolean;
};

export type Attribution = {
  id: string;
  document_id: string;
  student_id: string;
  individual_mark: number | null;
  individual_mark_max: number | null;
};

export async function getOwnerId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

export function avg(vals: Array<number | null | undefined>) {
  const xs = vals.filter((v): v is number => typeof v === "number");
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function pct(mark: number | null | undefined, max: number | null | undefined) {
  if (typeof mark !== "number" || typeof max !== "number" || max <= 0) return null;
  return (mark / max) * 100;
}
