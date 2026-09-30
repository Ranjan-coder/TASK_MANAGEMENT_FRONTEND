"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Network, Search, Users } from "lucide-react";
import { orgApi, type OrgNode } from "@/lib/api/org.api";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

const norm = (s = "") => s.toLowerCase();

/**
 * Keeps only people who match the search, plus everyone above them (so the path
 * stays visible). One depth-first pass over the tree: O(n).
 */
function filterTree(nodes: OrgNode[], q: string): OrgNode[] {
  if (!q) return nodes;
  const walk = (n: OrgNode): OrgNode | null => {
    const kids = n.reports.map(walk).filter(Boolean) as OrgNode[];
    const hit = [n.name, n.designation, n.department].some((x) => norm(x).includes(q));
    return hit || kids.length ? { ...n, reports: hit ? n.reports : kids } : null;
  };
  return nodes.map(walk).filter(Boolean) as OrgNode[];
}

function Person({ n, depth, forceOpen, canOpenProfile }: { n: OrgNode; depth: number; forceOpen: boolean; canOpenProfile: boolean }) {
  const [open, setOpen] = useState(depth < 2);
  const expanded = forceOpen || open;
  const name = canOpenProfile ? <Link href={`/users/${n._id}`} className="hover:text-violet-300">{n.name}</Link> : n.name;
  return (
    <li>
      <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: depth * 20 }}>
        {n.reports.length > 0 ? (
          <button onClick={() => setOpen(!expanded)} aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} ${n.name}'s team`} className="text-slate-500 hover:text-white">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <div className="h-7 w-7 rounded-full bg-violet-700/70 flex items-center justify-center text-xs text-white shrink-0">
          {n.avatarUrl ? <img src={n.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" /> : n.name[0]}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-slate-100 truncate">{name}</p>
          <p className="text-[11px] text-slate-500 truncate">
            {[n.designation, n.department].filter(Boolean).join(" · ") || "No designation yet"}
            {n.reports.length > 0 && ` · ${n.reports.length} direct`}
          </p>
        </div>
      </div>
      {expanded && n.reports.length > 0 && (
        <ul className="border-l border-slate-800" style={{ marginLeft: depth * 20 + 8 }}>
          {n.reports.map((c) => <Person key={c._id} n={c} depth={depth + 1} forceOpen={forceOpen} canOpenProfile={canOpenProfile} />)}
        </ul>
      )}
    </li>
  );
}

export default function OrgChartPage() {
  const me = useAuthStore((s) => s.user);
  const canOpenProfile = me?.role === "superadmin" || me?.role === "admin";
  const [tab, setTab] = useState<"chart" | "team">("chart");
  const [search, setSearch] = useState("");
  const { data: chart, isLoading } = useQuery({ queryKey: ["org", "chart"], queryFn: orgApi.chart, staleTime: 60_000 });
  const { data: team } = useQuery({ queryKey: ["org", "team", "me"], queryFn: () => orgApi.team(), enabled: tab === "team" });
  const q = norm(search.trim());
  const roots = useMemo(() => filterTree(chart?.roots ?? [], q), [chart, q]);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
          <Network className="h-5 w-5 text-violet-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Org chart</h1>
          <p className="text-sm text-slate-400">Who reports to whom{chart ? ` · ${chart.total} people` : ""}. Managers are set by an admin in Users.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["chart", "team"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} className={cn("px-4 py-2 rounded-lg border text-sm", tab === k ? "bg-violet-600/25 border-violet-500/50 text-white" : "border-slate-700 text-slate-300")}>
            {k === "chart" ? "Everyone" : "My team"}
          </button>
        ))}
        {tab === "chart" && (
          <div className="relative ml-auto">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, title or department" aria-label="Search the org chart" className="pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm w-64" />
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        {tab === "chart" ? (
          isLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : roots.length ? (
            <ul>{roots.map((n) => <Person key={n._id} n={n} depth={0} forceOpen={Boolean(q)} canOpenProfile={canOpenProfile} />)}</ul>
          ) : (
            <p className="text-sm text-slate-400">No one matches.</p>
          )
        ) : !team ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : team.all.length === 0 ? (
          <p className="text-sm text-slate-400 flex items-center gap-2"><Users className="h-4 w-4" /> Nobody reports to you yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {team.all.map((p) => (
              <li key={p._id} className="py-2 flex items-center justify-between" style={{ paddingLeft: (p.depth - 1) * 20 }}>
                <span className="text-sm text-slate-200">{p.name}</span>
                <span className="text-xs text-slate-500">
                  {[p.designation, p.department].filter(Boolean).join(" · ")}
                  {p.depth > 1 && ` · level ${p.depth} below you`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
