"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Star, X } from "lucide-react";
import { toast } from "sonner";
import { reportsApi, RATING_TAGS } from "@/lib/api/reports.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import type { Conversation } from "@/types/chat";
import { cn } from "@/lib/utils";
import { ReportDialog } from "./ReportDialog";

const PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const snoozeKey = (id: string) => `bonito:rating-prompt:${id}`;

const readSnooze = (id: string) => {
  try {
    return Number(localStorage.getItem(snoozeKey(id)) || 0);
  } catch {
    return 0;
  }
};

interface Props {
  conversation: Conversation;
  myUserId: string;
  isCustomer: boolean;
}

/**
 * Header buttons for project chats: customers rate their designer or report
 * a team member; staff flag a customer. Also shows the gentle "rate us" bar.
 */
export function ProjectChatActions({ conversation, myUserId, isCustomer }: Props) {
  const [reporting, setReporting] = useState(false);
  const [rating, setRating] = useState(false);

  return (
    <>
      {isCustomer && (
        <button onClick={() => setRating(true)} title="Rate your designer" aria-label="Rate your designer" className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition">
          <Star className="h-4 w-4" />
        </button>
      )}
      <button
        onClick={() => setReporting(true)}
        title={isCustomer ? "Report a team member" : "Flag a customer"}
        aria-label={isCustomer ? "Report a team member" : "Flag a customer"}
        className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
      >
        <Flag className="h-4 w-4" />
      </button>
      {reporting && <ReportDialog conversation={conversation} myUserId={myUserId} isCustomer={isCustomer} onClose={() => setReporting(false)} />}
      {rating && <RatingDialog conversationId={conversation._id} onClose={() => setRating(false)} />}
    </>
  );
}

/** A slim bar under the header when it's a good moment to ask for a rating. */
export function RatingPrompt({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(true);
  const { data } = useQuery({
    queryKey: ["my-rating", conversationId],
    queryFn: async () => (await reportsApi.myRating(conversationId)).data.data,
    staleTime: 60_000
  });

  useEffect(() => {
    setHidden(readSnooze(conversationId) > Date.now());
  }, [conversationId]);

  if (!data?.promptDue || hidden) return open ? <RatingDialog conversationId={conversationId} onClose={() => setOpen(false)} /> : null;

  const later = () => {
    try {
      localStorage.setItem(snoozeKey(conversationId), String(Date.now() + PROMPT_SNOOZE_MS));
    } catch {
      /* private mode: just hide for now */
    }
    setHidden(true);
  };

  return (
    <>
      <div className="px-4 py-2 flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/10 text-xs text-amber-100 shrink-0">
        <Star className="h-4 w-4 text-amber-300 shrink-0" />
        <span className="flex-1">How is {data.designer?.name.split(" ")[0] || "your designer"} doing? Your rating helps us improve.</span>
        <button onClick={() => setOpen(true)} className="px-2.5 py-1 rounded-md bg-amber-400/20 hover:bg-amber-400/30 font-medium">
          Rate
        </button>
        <button onClick={later} aria-label="Ask me later" className="text-amber-200/70 hover:text-amber-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <RatingDialog
          conversationId={conversationId}
          onClose={() => {
            setOpen(false);
            later();
          }}
        />
      )}
    </>
  );
}

function RatingDialog({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-rating", conversationId],
    queryFn: async () => (await reportsApi.myRating(conversationId)).data.data
  });
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.rating) {
      setStars(data.rating.stars);
      setTags(data.rating.tags);
      setComment(data.rating.comment);
    }
  }, [data?.rating]);

  const save = async () => {
    if (!stars) return;
    setSaving(true);
    try {
      await reportsApi.rate(conversationId, { stars, tags, comment: comment.trim() });
      toast.success("Thanks for your rating!");
      queryClient.invalidateQueries({ queryKey: ["my-rating", conversationId] });
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't save your rating"));
    } finally {
      setSaving(false);
    }
  };

  const shown = hover || stars;
  const name = data?.designer?.name || "your designer";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="rating-title" className="w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <h2 id="rating-title" className="text-base font-semibold text-white">Rate {name}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        {isLoading ? (
          <p className="p-5 text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="p-5 space-y-4">
            <div role="radiogroup" aria-label="Stars" className="flex justify-center gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={stars === n}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  onMouseEnter={() => setHover(n)}
                  onClick={() => setStars(n)}
                  className="p-1"
                >
                  <Star className={cn("h-8 w-8 transition", n <= shown ? "fill-amber-400 text-amber-400" : "text-slate-600")} />
                </button>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {RATING_TAGS.map((t) => {
                const on = tags.includes(t.value);
                return (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTags(on ? tags.filter((x) => x !== t.value) : [...tags, t.value])}
                    className={cn("px-3 py-1 rounded-full border text-xs", on ? "bg-violet-600/25 border-violet-500/50 text-violet-100" : "border-slate-700 text-slate-300")}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 1000))}
              rows={3}
              placeholder="Anything you'd like to add? (optional)"
              className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <p className="text-[11px] text-slate-500">Your designer sees only an overall average, never your individual rating.</p>
            <button type="button" onClick={save} disabled={!stars || saving} className="w-full py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40">
              {saving ? "Saving…" : data?.rating ? "Update rating" : "Submit rating"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
