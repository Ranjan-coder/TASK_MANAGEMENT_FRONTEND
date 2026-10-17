"use client";

import { MapPin } from "lucide-react";
import { StageControl } from "@/components/projects/StageControl";
import { isAdmin } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";
import type { ProjectStage, Timeline } from "@/lib/api/projectExtras.api";
import type { Conversation } from "@/types/chat";

/**
 * Project stage in the chat's info panel. Everyone sees it; the lead/backup
 * designer, project manager and admins can move it (the customer sees it on Home).
 */
export function StageEditor({ conversation, canEdit, onUpdated }: { conversation: Conversation; canEdit: boolean; onUpdated: (t: Timeline) => void }) {
  const me = useAuthStore((s) => s.user);
  const project = conversation.project!;
  return (
    <div className="w-full rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-2 text-left">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        <MapPin className="h-3 w-3" /> Project stage
      </p>
      <StageControl
        projectId={conversation._id}
        stage={project.stage as ProjectStage | undefined}
        status={project.status}
        expectedHandover={project.expectedHandover ?? null}
        canEdit={canEdit}
        isAdmin={isAdmin(me)}
        compact
        onUpdated={onUpdated}
      />
    </div>
  );
}
