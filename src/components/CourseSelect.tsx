import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CourseLite = { id: string; name: string; institution: string | null };

export function useCourses() {
  return useQuery({
    queryKey: ["courses-light"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, name, institution").order("name");
      if (error) throw error;
      return data as CourseLite[];
    },
  });
}

export function CourseSelect({
  value, onChange, includeAll = false, includeNone = false, className,
}: {
  value: string;
  onChange: (v: string) => void;
  includeAll?: boolean;
  includeNone?: boolean;
  className?: string;
}) {
  const { data: courses = [] } = useCourses();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? "h-9 w-full rounded-md border border-input bg-background px-3 text-sm"}
    >
      {includeAll && <option value="__all__">All courses</option>}
      {includeNone && <option value="">— No course —</option>}
      {courses.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}{c.institution ? ` · ${c.institution}` : ""}
        </option>
      ))}
    </select>
  );
}

export function courseLabel(c: CourseLite | undefined | null) {
  if (!c) return "";
  return c.institution ? `${c.name} · ${c.institution}` : c.name;
}
