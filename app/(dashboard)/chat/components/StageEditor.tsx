"use client";

import { useEffect } from "react";
import { MapPin } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlowControl } from "@/components/projects/FlowControl";
import { workflowApi, type ProjectFlowResult, type StaffFlowView } from "@/lib/api/workflow.api";
import { isAdmin } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";
import { getSocket } from "@/lib/socket";
import type { Timeline } from "@/lib/api/projectExtras.api";
import type { Conversation } from "@/types/chat";

type FlowData = { status: ProjectFlowResult["status"]; stage: string; version: number; flow: StaffFlowView; dueAt: string | null };

/**
 * The project's workflow in the chat's info panel. Everyone on the team sees it;
 * the project team, the stage's handlers and admins can move it (the server
 * decides). Kept live from the person-by-person "chat:project:stage" event.
 */
export function StageEditor({ conversation, canEdit, onUpdated }: { conversation: Conversation; canEdit: boolean; onUpdated: (t: Timeline) => void }) {
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const key = ["project-flow", conversation._id];
  const { data, refetch } = useQuery({ queryKey: key, queryFn: () => workflowApi.projectFlow(conversation._id) });

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
      {!data ? (
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
