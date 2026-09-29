"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { extrasApi, PROJECT_STAGES, stageLabel, type ProjectStage, type Timeline } from "@/lib/api/projectExtras.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import type { Conversation } from "@/types/chat";

/**
 * Project stage in the chat's info panel. Everyone sees it; the lead/backup
 * designer and project manager can move it (the customer sees it on Home).
 */
export function StageEditor({ conversation, canEdit, onUpdated }: { conversation: Conversation; canEdit: boolean; onUpdated: (t: Timeline) => void }) {
  const project = conversation.project!;
  const current = (project.stage || "consultation") as ProjectStage;
  const [stage, setStage] = useState<ProjectStage>(current);
  const [note, setNote] = useState("");
  const [handover, setHandover] = useState(project.expectedHandover ? project.expectedHandover.slice(0, 10) : "");
  const [busy, setBusy] = useState(false);
  const dirty = stage !== current || note.trim() || handover !== (project.expectedHandover ? project.expectedHandover.slice(0, 10) : "");

  const save = async () => {
    setBusy(true);
    try {
      const t = await extrasApi.setStage(conversation._id, {
        stage,
        note: note.trim() || undefined,
        expectedHandover: handover ? new Date(`${handover}T12:00:00+05:30`).toISOString() : null
      });
      onUpdated(t);
      setNote("");
      toast.success(stage !== current ? `Moved to ${stageLabel(stage)} — the customer has been told` : "Saved");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update the stage"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-2 text-left">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        <MapPin className="h-3 w-3" /> Project stage
      </p>
      {!canEdit ? (
        <p className="text-sm text-white">{stageLabel(current)}</p>
      ) : (
        <>
          <select value={stage} onChange={(e) => setStage(e.target.value as ProjectStage)} aria-label="Project stage" className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm">
            {PROJECT_STAGES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Note for the customer (optional)" className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
          <label className="block text-[11px] text-slate-400">
            Expected handover
            <input type="date" value={handover} onChange={(e) => setHandover(e.target.value)} className="mt-0.5 w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
          </label>
          <button type="button" disabled={!dirty || busy} onClick={save} className="w-full py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium disabled:opacity-40">
            {busy ? "Saving…" : "Update"}
          </button>
        </>
      )}
    </div>
  );
}
