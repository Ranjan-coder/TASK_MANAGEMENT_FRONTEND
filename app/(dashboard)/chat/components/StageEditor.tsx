"use client";

import { useEffect, useMemo } from "react";
import { Check, MapPin } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlowControl } from "@/components/projects/FlowControl";
import { workflowApi, type CustomerFlowView, type ProjectFlowResult, type StaffFlowView } from "@/lib/api/workflow.api";
import { isAdmin } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";
import { getSocket } from "@/lib/socket";
import { extrasApi, stageLabel, type MyProject, type Timeline } from "@/lib/api/projectExtras.api";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types/chat";

type FlowData = { status: ProjectFlowResult["status"]; stage: string; version: number; flow: StaffFlowView; dueAt: string | null };

/**
 * A customer's read-only view of their project's stage in the chat's info panel.
 *
 * The staff editor reads /projects/:id/flow, which is staff-only (internal
 * steps, checklists): customers got a 403 and "Loading…" forever. This reads
 * the customer-safe view from /projects/mine instead — the same cached query
 * the Home page uses, found by id (Map, O(1)) — and the customer version of
 * the live "chat:project:stage" event keeps it current.
 */
export function CustomerStage({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const { data, isError, refetch } = useQuery({ queryKey: ["my-projects"], queryFn: extrasApi.myProjects, staleTime: 60_000 });
  const byId = useMemo(() => new Map((data ?? []).map((p) => [p._id, p])), [data]);
  const project = byId.get(conversationId);

  useEffect(() => {
    const socket = getSocket();
    const handler = (e: { conversationId: string; status?: MyProject["status"]; stage?: string; flow?: unknown }) => {
      if (e.conversationId !== conversationId || !e.flow || "stepKey" in (e.flow as object)) return; // customer view only
      qc.setQueryData<MyProject[]>(["my-projects"], (old) =>
        old?.map((p) => (p._id === conversationId ? { ...p, status: e.status ?? p.status, stage: (e.stage ?? p.stage) as MyProject["stage"], flow: e.flow as CustomerFlowView } : p))
      );
    };
    socket.on("chat:project:stage", handler);
    return () => {
      socket.off("chat:project:stage", handler);
    };
  }, [conversationId, qc]);

  const stages = project?.flow?.stages;
  const current = stages?.find((s) => s.status === "current");
  return (
    <div className="w-full rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-2 text-left">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        <MapPin className="h-3 w-3" /> Project stage
      </p>
      {isError ? (
        <p className="text-xs text-rose-300">
          Couldn&apos;t load the stage.{" "}
          <button type="button" onClick={() => refetch()} className="underline">
            Try again
          </button>
        </p>
      ) : !data ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : !project ? (
        <p className="text-xs text-slate-500">Not available.</p>
      ) : stages?.length ? (
        <>
          <p className="text-sm text-white">
            {project.status === "completed" ? "Completed" : current?.name ?? "—"}
            {project.status === "on_hold" && <span className="ml-1.5 text-xs text-amber-300">· On hold</span>}
          </p>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden" aria-hidden>
            <div className="h-full bg-violet-500" style={{ width: `${project.status === "completed" ? 100 : project.flow!.progress.percent}%` }} />
          </div>
          <ol aria-label="Project progress" className="space-y-1">
            {stages.map((s) => {
              const done = project.status === "completed" || s.status === "done";
              return (
                <li key={s.key} aria-current={s.status === "current" ? "step" : undefined} className="flex items-center gap-2 text-xs">
                  {done ? <Check className="h-3 w-3 text-emerald-400" /> : <span className={cn("h-2 w-2 rounded-full mx-0.5 border", s.status === "current" ? "bg-violet-400 border-violet-400" : "border-slate-600")} />}
                  <span className={cn(done ? "text-slate-400" : s.status === "current" ? "text-white font-semibold" : "text-slate-500")}>{s.name}</span>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        // Older projects without a workflow: the stage name only
        <p className="text-sm text-white">{stageLabel(project.stage)}</p>
      )}
      {project?.expectedHandover && project.status !== "completed" && (
        <p className="text-[11px] text-slate-400">Expected handover {new Date(project.expectedHandover).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
      )}
    </div>
  );
}

/**
 * The project's workflow in the chat's info panel. Everyone on the team sees it;
 * the project team, the stage's handlers and admins can move it (the server
 * decides). Kept live from the person-by-person "chat:project:stage" event.
 */
export function StageEditor({ conversation, canEdit, onUpdated }: { conversation: Conversation; canEdit: boolean; onUpdated: (t: Timeline) => void }) {
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const key = ["project-flow", conversation._id];
  const { data, refetch, isError } = useQuery({ queryKey: key, queryFn: () => workflowApi.projectFlow(conversation._id) });

  useEffect(() => {
    const socket = getSocket();
    const handler = (e: Partial<ProjectFlowResult> & { conversationId: string }) => {
      if (e.conversationId !== conversation._id || !e.flow || !("stepKey" in e.flow)) return; // staff view only
      qc.setQueryData<FlowData>(key, (old) => (old ? { ...old, status: e.status ?? old.status, stage: e.stage ?? old.stage, version: e.version ?? old.version, flow: e.flow as StaffFlowView } : old));
    };
    socket.on("chat:project:stage", handler);
    return () => {
      socket.off("chat:project:stage", handler);
    };
  }, [conversation._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (r: ProjectFlowResult) => {
    qc.setQueryData<FlowData>(key, (old) => ({ ...(old as FlowData), status: r.status, stage: r.stage, version: r.version, flow: r.flow }));
    // Keep the chat header's stage in step (it reads conversation.project.stage)
    onUpdated({ stage: r.stage as Timeline["stage"], stageHistory: [], expectedHandover: conversation.project?.expectedHandover ?? null });
  };

  return (
    <div className="w-full rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-2 text-left">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        <MapPin className="h-3 w-3" /> Project stage
      </p>
      {isError ? (
        // It used to say "Loading…" forever when the request was refused
        <p className="text-xs text-rose-300">
          Couldn&apos;t load the stage.{" "}
          <button type="button" onClick={() => refetch()} className="underline">
            Try again
          </button>
        </p>
      ) : !data ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : (
        <FlowControl
          projectId={conversation._id}
          view={data.flow}
          version={data.version}
          status={data.status}
          expectedHandover={conversation.project?.expectedHandover ?? null}
          canEdit={canEdit}
          isAdmin={isAdmin(me)}
          compact
          onChange={apply}
          onStale={() => refetch()}
        />
      )}
    </div>
  );
}
