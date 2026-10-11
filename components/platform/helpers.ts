import type { ModuleInfo } from "@/lib/api/platform.api";

/** Shared by the product owner's console pages. */

export const STATUS_STYLE: Record<string, string> = {
  active: "border-emerald-500/40 text-emerald-300",
  suspended: "border-red-500/40 text-red-300"
};

export function describeAction(action: string, meta: Record<string, unknown> | undefined, labels: Map<string, string>) {
  if (action === "platform_module_changed") {
    const m = meta as { module?: string; after?: { enabled?: boolean } } | undefined;
    const name = labels.get(m?.module || "") || m?.module;
    return `${name} ${m?.after?.enabled ? "on / updated" : "switched off"}`;
  }
  // Standard departments / designations: template_<kind>_<created|updated|deleted>
  const tpl = /^template_(department|designation)_(created|updated|deleted)$/.exec(action);
  if (tpl) {
    const m = meta as { name?: string; companies?: number; detached?: number } | undefined;
    const what = `Standard ${tpl[1]} “${m?.name ?? ""}”`;
    if (tpl[2] === "deleted") return `${what} removed from the standard list`;
    return `${what} ${tpl[2] === "created" ? "added" : "changed"} · reached ${m?.companies ?? 0} compan${m?.companies === 1 ? "y" : "ies"}`;
  }
  return (
    {
      platform_org_created: "Organisation created",
      platform_org_suspended: "Organisation suspended",
      platform_org_active: "Organisation reactivated",
      platform_org_updated: "Organisation renamed"
    }[action] || action
  );
}

/**
 * Module picker that keeps choices consistent with the dependency graph: ticking
 * a module ticks what it needs, unticking one unticks what needs it (both lists
 * come precomputed from the server).
 */
export function toggleWithDeps(selected: Set<string>, mod: ModuleInfo, on: boolean) {
  const next = new Set(selected);
  if (on) [mod.key, ...mod.requiresAll].forEach((k) => next.add(k));
  else [mod.key, ...mod.neededBy].forEach((k) => next.delete(k));
  return next;
}
