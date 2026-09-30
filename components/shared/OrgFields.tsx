"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { SearchSelect, type SelectOption } from "./SearchSelect";
import { useDepartments, useDesignations, useStaffDirectory, useInvalidateOrg, designationsFor } from "@/hooks/useOrg";
import { orgApi, LEVEL_LABELS, type Department, type Designation } from "@/lib/api/org.api";
import { useAuthStore } from "@/store/authStore";
import type { Role } from "@/types";

export interface OrgValue {
  departmentId: string | null;
  designationId: string | null;
  reportsTo: string | null;
}

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

/**
 * Department, designation and "reports to" pickers for creating or editing a person.
 * Designations are filtered to the chosen department and grouped by level; titles
 * this admin can't give are shown greyed out (the API enforces the same rule).
 * Superadmins can create a missing department or designation inline.
 */
export function OrgFields({
  value,
  onChange,
  onSuggestRole,
  excludeUserId,
  labelClass = "block text-sm font-medium text-slate-300 mb-1.5"
}: {
  value: OrgValue;
  onChange: (patch: Partial<OrgValue>) => void;
  /** Called with a designation's suggested role when one is picked */
  onSuggestRole?: (role: Role) => void;
  /** The person being edited (can't report to themselves) */
  excludeUserId?: string;
  labelClass?: string;
}) {
  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === "superadmin";
  const { departments, byId: deptById } = useDepartments();
  const { designations, byId: desigById, minAssignableLevel } = useDesignations();
  const { people } = useStaffDirectory();
  const invalidate = useInvalidateOrg();

  const deptOptions = useMemo<SelectOption[]>(() => departments.map((d) => ({ value: d._id, label: d.name })), [departments]);

  const desigOptions = useMemo<SelectOption[]>(() => {
    const min = minAssignableLevel ?? 1;
    return designationsFor(designations, value.departmentId)
      .slice()
      .sort((a, b) => a.level - b.level || a.sortOrder - b.sortOrder)
      .map((g) => ({
        value: g._id,
        label: g.name,
        hint: g.short || undefined,
        group: `Level ${g.level} · ${LEVEL_LABELS[g.level] ?? ""}`,
        disabled: g.level < min && g._id !== value.designationId,
        disabledReason: "Only a superadmin can give this designation"
      }));
  }, [designations, value.departmentId, value.designationId, minAssignableLevel]);

  const managerOptions = useMemo<SelectOption[]>(
    () =>
      people
        .filter((p) => p._id !== excludeUserId)
        .map((p) => ({ value: p._id, label: p.name, hint: [p.designation, p.department].filter(Boolean).join(" · ") || undefined })),
    [people, excludeUserId]
  );

  const pickDesignation = (id: string | null) => {
    onChange({ designationId: id });
    const g = id ? desigById.get(id) : null;
    if (g?.suggestedRole && onSuggestRole) onSuggestRole(g.suggestedRole);
  };

  const pickDepartment = (id: string | null) => {
    // Keep the title only if it still fits the new department
    const g = value.designationId ? desigById.get(value.designationId) : null;
    const fits = !g || !id || g.departments.length === 0 || g.departments.includes(id);
    onChange({ departmentId: id, ...(fits ? {} : { designationId: null }) });
  };

  const createDepartment = async (name: string) => {
    try {
      const d = await orgApi.create<Department>("departments", { name });
      await invalidate();
      toast.success(`Department “${d.name}” created`);
      return d._id;
    } catch (err) {
      toast.error(errMsg(err, "Couldn't create the department"));
      return null;
    }
  };

  const createDesignation = async (name: string) => {
    try {
      // New titles default to executive level and the chosen department; adjust in Organisation
      const g = await orgApi.create<Designation>("designations", { name, level: 8, departments: value.departmentId ? [value.departmentId] : [] });
      await invalidate();
      toast.success(`Designation “${g.name}” created (level 8 — change it in Organisation)`);
      return g._id;
    } catch (err) {
      toast.error(errMsg(err, "Couldn't create the designation"));
      return null;
    }
  };

  const currentDeptInactive = value.departmentId && !deptById.has(value.departmentId);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="org-department" className={labelClass}>Department</label>
          <SearchSelect
            id="org-department"
            value={value.departmentId}
            onChange={pickDepartment}
            options={deptOptions}
            placeholder={currentDeptInactive ? "(no longer in use)" : "Choose a department"}
            allowClear
            onCreate={isSuper ? createDepartment : undefined}
            createLabel="Create department"
          />
        </div>
        <div>
          <label htmlFor="org-designation" className={labelClass}>Designation</label>
          <SearchSelect
            id="org-designation"
            value={value.designationId}
            onChange={pickDesignation}
            options={desigOptions}
            placeholder="Choose a designation"
            allowClear
            onCreate={isSuper ? createDesignation : undefined}
            createLabel="Create designation"
          />
        </div>
      </div>
      <div>
        <label htmlFor="org-manager" className={labelClass}>Reports to</label>
        <SearchSelect id="org-manager" value={value.reportsTo} onChange={(id) => onChange({ reportsTo: id })} options={managerOptions} placeholder="Choose a manager (optional)" allowClear />
      </div>
    </div>
  );
}
