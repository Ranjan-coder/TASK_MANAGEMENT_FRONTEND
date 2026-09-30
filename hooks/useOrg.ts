import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orgApi, type Department, type Designation, type OrgNode } from "@/lib/api/org.api";

/**
 * Departments and designations change rarely: fetch once, keep for 5 minutes and
 * share between every screen (dropdowns filter in memory, no request per keystroke).
 * Any change made through the Organisation page clears these keys.
 */
const FIVE_MIN = 5 * 60 * 1000;
export const ORG_KEYS = {
  departments: (all: boolean) => ["org", "departments", all] as const,
  designations: (all: boolean) => ["org", "designations", all] as const,
  chart: ["org", "chart"] as const
};

export function useDepartments({ includeInactive = false, counts = false } = {}) {
  const q = useQuery({
    queryKey: [...ORG_KEYS.departments(includeInactive), counts],
    queryFn: () => orgApi.departments({ includeInactive, counts }),
    staleTime: FIVE_MIN
  });
  // O(1) lookups by id for tables and labels
  const byId = useMemo(() => new Map<string, Department>((q.data ?? []).map((d) => [d._id, d])), [q.data]);
  return { ...q, departments: q.data ?? [], byId };
}

export function useDesignations({ includeInactive = false, counts = false } = {}) {
  const q = useQuery({
    queryKey: [...ORG_KEYS.designations(includeInactive), counts],
    queryFn: () => orgApi.designations({ includeInactive, counts }),
    staleTime: FIVE_MIN
  });
  const designations = useMemo(() => q.data?.items ?? [], [q.data]);
  const byId = useMemo(() => new Map<string, Designation>(designations.map((g) => [g._id, g])), [designations]);
  return { ...q, designations, byId, minAssignableLevel: q.data?.minAssignableLevel ?? null };
}

/** Everyone in the org chart as a flat list (for the "reports to" picker). */
export function useStaffDirectory(enabled = true) {
  const q = useQuery({ queryKey: ORG_KEYS.chart, queryFn: orgApi.chart, staleTime: 60_000, enabled });
  const people = useMemo(() => {
    const out: OrgNode[] = [];
    const stack = [...(q.data?.roots ?? [])];
    while (stack.length) {
      const n = stack.pop()!;
      out.push(n);
      stack.push(...n.reports);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [q.data]);
  return { ...q, people };
}

export function useInvalidateOrg() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["org"] });
}

/** Designations that fit a department (those with no department list fit any). */
export function designationsFor(designations: Designation[], departmentId: string | null | undefined) {
  if (!departmentId) return designations;
  return designations.filter((g) => g.departments.length === 0 || g.departments.includes(departmentId));
}
