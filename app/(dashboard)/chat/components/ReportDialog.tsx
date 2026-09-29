"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, X, ImagePlus, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { reportsApi, REASONS, type ReportDirection } from "@/lib/api/reports.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { useChatStore } from "@/store/chatStore";
import type { Conversation, Message } from "@/types/chat";
import { cn } from "@/lib/utils";

const MAX_MESSAGES = 20;
const MAX_SHOTS = 5;
const MAX_SHOT_BYTES = 8 * 1024 * 1024;
const SHOT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const EMPTY: Message[] = [];

const refId = (v: unknown): string | null =>
  !v ? null : typeof v === "string" ? v : (v as { _id?: string })._id || null;

interface Props {
  conversation: Conversation;
  myUserId: string;
  isCustomer: boolean;
  onClose: () => void;
}

/**
 * Customers report a Bonito staff member; staff flag a customer. Ticked
 * messages are revealed to Bonito admins with their franking proof, so they
 * show as verified. Nothing else in the chat is shared.
 */
export function ReportDialog({ conversation, myUserId, isCustomer, onClose }: Props) {
  const project = conversation.project!;
  const direction: ReportDirection = isCustomer ? "customer_to_staff" : "staff_to_customer";
  const customerIds = useMemo(() => new Set(project.customers.map(refId).filter(Boolean) as string[]), [project.customers]);

  const roleLabel = (id: string) =>
    id === refId(project.leadDesigner)
      ? "Lead designer"
      : id === refId(project.backupDesigner)
        ? "Backup designer"
        : id === refId(project.manager)
          ? "Project manager"
          : customerIds.has(id)
            ? "Customer"
            : "Bonito team";

  const people = conversation.members
    .map((m) => m.user)
    .filter((u) => u._id !== myUserId && (isCustomer ? !customerIds.has(u._id) : customerIds.has(u._id)));

  const [reportedUserId, setReportedUserId] = useState(
    isCustomer ? refId(project.leadDesigner) || people[0]?._id || "" : people[0]?._id || ""
  );
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [shots, setShots] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const all = useChatStore((s) => s.messages[conversation._id]) ?? EMPTY;
  const selectable = all
    .filter((m) => m.type === "text" && !m.isDeleted && m.frankVerified && m.frankingKey && m.decryptedContent)
    .slice(-60)
    .reverse();

  useEffect(() => {
    const urls = shots.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [shots]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !sending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else if (n.size < MAX_MESSAGES) n.add(id);
      else toast.error(`Select up to ${MAX_MESSAGES} messages`);
      return n;
    });

  const addShots = (files: FileList | null) => {
    if (!files) return;
    const next = [...shots];
    for (const f of Array.from(files)) {
      if (next.length >= MAX_SHOTS) {
        toast.error(`Up to ${MAX_SHOTS} screenshots`);
        break;
      }
      if (!SHOT_TYPES.includes(f.type)) {
        toast.error(`${f.name}: use a JPG, PNG or WebP image`);
        continue;
      }
      if (f.size > MAX_SHOT_BYTES) {
        toast.error(`${f.name} is larger than 8 MB`);
        continue;
      }
      next.push(f);
    }
    setShots(next);
  };

  const descLen = description.trim().length;
  const canSend = Boolean(reportedUserId && reason && descLen >= 20 && descLen <= 2000 && !sending);

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const evidence = all
        .filter((m) => picked.has(m._id) && m.frankingKey && m.decryptedContent)
        .map((m) => ({ messageId: m._id, text: m.decryptedContent!, frankingKey: m.frankingKey! }));
      const res = await reportsApi.create({ conversationId: conversation._id, reportedUserId, reason, description: description.trim(), evidence }, shots);
      setDone(res.data.data.ticketNo);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't send the report"));
    } finally {
      setSending(false);
    }
  };

  const title = isCustomer ? "Report a team member" : "Flag a customer";

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="report-title" className="w-full max-w-lg max-h-full sm:max-h-[92vh] flex flex-col bg-slate-900 sm:rounded-2xl border border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 shrink-0">
          <h2 id="report-title" className="text-base font-semibold text-white flex items-center gap-2">
            <Flag className="h-4 w-4 text-rose-400" /> {title}
          </h2>
          <button type="button" onClick={onClose} disabled={sending} aria-label="Close" className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done !== null ? (
          <div className="p-6 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
            <p className="text-white font-semibold">Report #{done} received</p>
            <p className="text-sm text-slate-300">
              {isCustomer ? "We'll review it within 48 hours and let you know the outcome." : "An admin will review it and follow up."} You can check its status in Settings → Reports.
            </p>
            <button type="button" onClick={onClose} className="mt-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-500">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-4 overflow-y-auto">
              {people.length === 0 ? (
                <p className="text-sm text-slate-400">There's no one in this chat you can {isCustomer ? "report" : "flag"}.</p>
              ) : (
                <>
                  <label className="block text-xs text-slate-300">
                    {isCustomer ? "Who are you reporting?" : "Which customer?"}
                    <select value={reportedUserId} onChange={(e) => setReportedUserId(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm">
                      {people.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name} — {roleLabel(p._id)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <fieldset>
                    <legend className="text-xs text-slate-300 mb-1.5">Reason</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {REASONS[direction].map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          aria-pressed={reason === r.value}
                          onClick={() => setReason(r.value)}
                          className={cn(
                            "px-3 py-1.5 rounded-full border text-xs",
                            reason === r.value ? "bg-rose-500/20 border-rose-400/50 text-rose-100" : "border-slate-700 text-slate-300 hover:border-slate-500"
                          )}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <label className="block text-xs text-slate-300">
                    What happened?
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                      rows={4}
                      placeholder="Describe what happened (at least 20 characters)"
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <span className={cn("block text-right text-[11px]", descLen < 20 ? "text-slate-500" : "text-slate-400")}>{descLen}/2000</span>
                  </label>

                  <div>
                    <p className="text-xs text-slate-300">Messages to include (optional)</p>
                    <p className="text-[11px] text-slate-500 mb-1.5 flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3 text-emerald-400" /> Only ticked messages are shared with Bonito admins, marked as verified.
                    </p>
                    {selectable.length === 0 ? (
                      <p className="text-[11px] text-slate-500">No messages that can be included. Messages sent before this update can't be verified — add a screenshot instead.</p>
                    ) : (
                      <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-800 divide-y divide-slate-800">
                        {selectable.map((m) => (
                          <li key={m._id}>
                            <label className="flex gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-slate-800/50">
                              <input type="checkbox" checked={picked.has(m._id)} onChange={() => toggle(m._id)} className="mt-0.5 accent-violet-500" />
                              <span className="min-w-0">
                                <span className="text-slate-400">
                                  {m.sender._id === myUserId ? "You" : m.sender.name} · {new Date(m.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                                </span>
                                <span className="block text-slate-200 break-words line-clamp-2">{m.decryptedContent}</span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                    {picked.size > 0 && <p className="text-[11px] text-slate-400 mt-1">{picked.size} selected</p>}
                  </div>

                  <div>
                    <p className="text-xs text-slate-300 mb-1.5">Screenshots (optional, up to 5)</p>
                    <div className="flex flex-wrap gap-2">
                      {previews.map((src, i) => (
                        <div key={src} className="relative h-16 w-16 rounded-lg overflow-hidden border border-slate-700">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`Screenshot ${i + 1}`} className="h-full w-full object-cover" />
                          <button type="button" onClick={() => setShots(shots.filter((_, j) => j !== i))} aria-label={`Remove screenshot ${i + 1}`} className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/70 text-white flex items-center justify-center">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {shots.length < MAX_SHOTS && (
                        <label className="h-16 w-16 rounded-lg border border-dashed border-slate-600 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-400 cursor-pointer">
                          <ImagePlus className="h-5 w-5" />
                          <span className="sr-only">Add screenshots</span>
                          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { addShots(e.target.files); e.target.value = ""; }} />
                        </label>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Screenshots are marked "unverified". Location data in photos is removed.</p>
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-800 shrink-0">
              <button type="button" onClick={onClose} disabled={sending} className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-200 hover:bg-slate-800">
                Cancel
              </button>
              <button type="button" onClick={submit} disabled={!canSend} className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-500 disabled:opacity-40">
                {sending ? "Sending…" : "Send report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
