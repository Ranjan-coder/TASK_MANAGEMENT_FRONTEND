"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap, Trash2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { extrasApi } from "@/lib/api/projectExtras.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";

/**
 * Quick-reply templates for staff (R5). Picking one only fills the message
 * box ({customer} and {designer} are filled in); the person can edit it and
 * it's encrypted and checked like any other message when sent.
 */
export function QuickReplyButton({
  disabled,
  fill,
  onPick,
  currentText
}: {
  disabled?: boolean;
  fill: (text: string) => string;
  onPick: (text: string) => void;
  currentText: () => string;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["quick-replies"], queryFn: extrasApi.quickReplies, enabled: open, staleTime: 60_000 });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => boxRef.current && !boxRef.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const save = async () => {
    try {
      await extrasApi.addQuickReply({ title: title.trim(), text: text.trim() });
      qc.invalidateQueries({ queryKey: ["quick-replies"] });
      setAdding(false);
      setTitle("");
      setText("");
      toast.success("Reply saved");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't save"));
    }
  };

  const remove = async (id: string) => {
    try {
      await extrasApi.deleteQuickReply(id);
      qc.invalidateQueries({ queryKey: ["quick-replies"] });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete"));
    }
  };

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Quick replies"
        aria-label="Quick replies"
        aria-expanded={open}
        className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-amber-300 hover:bg-slate-700 transition"
      >
        <Zap className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute bottom-10 left-0 z-40 w-80 max-w-[85vw] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
            <p className="text-xs font-semibold text-white">Quick replies</p>
            <button type="button" onClick={() => { setAdding((v) => !v); setText(currentText()); }} className="inline-flex items-center gap-1 text-[11px] text-violet-300 hover:underline">
              {adding ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />} {adding ? "Cancel" : "New"}
            </button>
          </div>
          {adding && (
            <div className="p-3 space-y-2 border-b border-slate-800">
              <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 60))} placeholder="Name, e.g. Site visit" className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs" />
              <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 1000))} rows={3} placeholder="Hi {customer}, …" className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs" />
              <p className="text-[10px] text-slate-500">{"{customer}"} and {"{designer}"} are filled in with first names.</p>
              <button type="button" disabled={!title.trim() || !text.trim()} onClick={save} className="w-full py-1.5 rounded-lg bg-violet-600 text-white text-xs disabled:opacity-40">Save</button>
            </div>
          )}
          <ul className="max-h-64 overflow-y-auto py-1">
            {isLoading ? (
              <li className="px-3 py-2 text-xs text-slate-400">Loading…</li>
            ) : (
              (data ?? []).map((r) => (
                <li key={r._id} className="group flex items-start gap-1 px-1">
                  <button
                    type="button"
                    onClick={() => {
                      onPick(fill(r.text));
                      setOpen(false);
                    }}
                    className="flex-1 text-left px-2 py-1.5 rounded-lg hover:bg-slate-800"
                  >
                    <span className="block text-xs text-white">
                      {r.title} {r.shared && <span className="text-[10px] text-slate-500">· team</span>}
                    </span>
                    <span className="block text-[11px] text-slate-400 line-clamp-2">{fill(r.text)}</span>
                  </button>
                  {r.canEdit && !r.shared && (
                    <button type="button" onClick={() => remove(r._id)} aria-label={`Delete ${r.title}`} className="mt-1.5 p-1 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 focus:opacity-100">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
