"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, PencilLine, Clock, X, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { getSocket } from "@/lib/socket";
import { extrasApi, type DesignApproval, type Timeline } from "@/lib/api/projectExtras.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { cn } from "@/lib/utils";

/**
 * Design approvals (R4) for one project chat: loads them, keeps them live
 * over the socket, and exposes lookups by message id.
 */
export function useProjectApprovals(conversationId: string, enabled: boolean) {
  const [byMessage, setByMessage] = useState<Record<string, DesignApproval>>({});

  const put = useCallback((a: DesignApproval) => {
    setByMessage((m) => {
      const current = m[a.message];
      // Keep the latest request per design (a withdrawn one can be replaced by a new request)
      if (current && current._id !== a._id && new Date(current.createdAt) > new Date(a.createdAt)) return m;
      return { ...m, [a.message]: a };
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    extrasApi
      .approvals(conversationId)
      .then((list) => {
        if (!alive) return;
        const map: Record<string, DesignApproval> = {};
        for (const a of [...list].reverse()) map[a.message] = a; // oldest first, newest wins
        setByMessage(map);
      })
      .catch(() => {});
    const socket = getSocket();
    const onApproval = (a: DesignApproval) => {
      if (String(a.conversation) === conversationId) put(a);
    };
    socket.on("chat:approval", onApproval);
    return () => {
      alive = false;
      socket.off("chat:approval", onApproval);
    };
  }, [conversationId, enabled, put]);

  return { approvalFor: (messageId: string) => byMessage[messageId], putApproval: put };
}

/** Live stage changes for a project chat (R1). */
export function useProjectStage(conversationId: string, onStage: (t: Timeline) => void) {
  useEffect(() => {
    const socket = getSocket();
    const handler = (e: Timeline & { conversationId: string }) => {
      if (e.conversationId === conversationId) onStage(e);
    };
    socket.on("chat:project:stage", handler);
    return () => {
      socket.off("chat:project:stage", handler);
    };
  }, [conversationId, onStage]);
}

const STATUS = {
  pending: { label: "Waiting for approval", icon: Clock, style: "border-amber-500/40 bg-amber-500/10 text-amber-100" },
  approved: { label: "Approved", icon: CheckCircle2, style: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" },
  changes_requested: { label: "Changes requested", icon: PencilLine, style: "border-sky-500/40 bg-sky-500/10 text-sky-100" },
  withdrawn: { label: "Request withdrawn", icon: X, style: "border-slate-600 bg-slate-800/60 text-slate-300" }
} as const;

const when = (d: string) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** The approval card under a design in the chat. */
export function ApprovalCard({
  approval,
  canDecide,
  canWithdraw,
  onChange
}: {
  approval: DesignApproval;
  canDecide: boolean;
  canWithdraw: boolean;
  onChange: (a: DesignApproval) => void;
}) {
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const meta = STATUS[approval.status];
  const Icon = meta.icon;

  const run = async (fn: () => Promise<DesignApproval>, ok: string) => {
    setBusy(true);
    try {
      onChange(await fn());
      toast.success(ok);
      setMode("idle");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update the approval"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("mt-1 mb-2 rounded-xl border px-3 py-2 text-xs space-y-1.5", meta.style)} onClick={(e) => e.stopPropagation()}>
      <p className="flex items-center gap-1.5 font-semibold">
        <Icon className="h-3.5 w-3.5" /> {approval.title}
      </p>
      <p className="opacity-80">
        {meta.label}
        {approval.decidedAt && approval.decidedBy ? ` by ${approval.decidedBy.name} · ${when(approval.decidedAt)}` : ` · asked ${when(approval.createdAt)}`}
      </p>
      {approval.comment && <p className="whitespace-pre-wrap">“{approval.comment}”</p>}

      {approval.status === "pending" && canDecide && mode === "idle" && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" disabled={busy} onClick={() => run(() => extrasApi.decide(approval._id, "approved"), "Design approved")} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-50">
            Approve
          </button>
          <button type="button" disabled={busy} onClick={() => setMode("changes")} className="px-3 py-1.5 rounded-lg border border-current/40 hover:bg-white/5">
            Request changes
          </button>
        </div>
      )}
      {approval.status === "pending" && canDecide && mode === "changes" && (
        <div className="space-y-1.5 pt-1">
          <textarea
            autoFocus
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 1000))}
            rows={2}
            placeholder="What would you like changed?"
            className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-2 py-1.5 text-white placeholder-slate-500"
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy || comment.trim().length < 3} onClick={() => run(() => extrasApi.decide(approval._id, "changes_requested", comment.trim()), "Sent to your designer")} className="px-3 py-1.5 rounded-lg bg-sky-600 text-white font-semibold disabled:opacity-40">
              Send
            </button>
            <button type="button" onClick={() => setMode("idle")} className="px-3 py-1.5 rounded-lg text-slate-300">
              Cancel
            </button>
          </div>
        </div>
      )}
      {approval.status === "pending" && canDecide && <p className="text-[10px] opacity-60">Your answer is recorded with the date and time.</p>}
      {approval.status === "pending" && canWithdraw && (
        <button type="button" disabled={busy} onClick={() => run(() => extrasApi.withdraw(approval._id), "Request withdrawn")} className="text-[11px] underline opacity-70 hover:opacity-100">
          Withdraw request
        </button>
      )}
    </div>
  );
}

/** Title prompt when a designer asks for approval. */
export function RequestApprovalDialog({ fileName, onCancel, onSubmit }: { fileName?: string; onCancel: () => void; onSubmit: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState(fileName ? fileName.replace(/\.[a-z0-9]+$/i, "").slice(0, 100) : "");
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="req-approval-title"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSubmit(title.trim());
          } finally {
            setBusy(false);
          }
        }}
        className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-3"
      >
        <h2 id="req-approval-title" className="text-base font-semibold text-white flex items-center gap-2">
          <FileCheck2 className="h-5 w-5 text-emerald-300" /> Ask for approval
        </h2>
        <label className="block text-xs text-slate-300">
          What is this design?
          <input autoFocus required minLength={2} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kitchen layout v2" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm" />
        </label>
        <p className="text-[11px] text-slate-500">
          The customer gets Approve / Request changes buttons. The title and their answer are kept as a sign-off record that Bonito admins can see; the design file itself stays encrypted.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-200">Cancel</button>
          <button type="submit" disabled={busy || title.trim().length < 2} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-40">
            {busy ? "Sending…" : "Ask customer"}
          </button>
        </div>
      </form>
    </div>
  );
}
