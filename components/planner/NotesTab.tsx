"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, Pin, PinOff, Plus, Search, Trash2, X, Loader2, Check } from "lucide-react";
import { useNotes, type Note } from "@/hooks/usePlanner";
import type { NoteColor } from "@/lib/api/planner.api";
import { cn } from "@/lib/utils";
import { NOTE_COLORS, btn, input, fmtWhen } from "./ui";

const AUTOSAVE_MS = 800;

/**
 * Notes: pinned first, then newest. Search runs on this device against an inverted
 * index of the decrypted notes (lib/planner/searchIndex.ts), so each keystroke is
 * instant and nothing readable is sent to the server.
 */
export function NotesTab({ vaultKey }: { vaultKey: CryptoKey }) {
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const { notes, index, isLoading, create, update, remove } = useNotes(vaultKey, archived);

  const shown = useMemo(() => {
    const hits = index.search(query);
    const list = hits ? notes.filter((n) => hits.has(n._id)) : notes;
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }, [notes, index, query]);
  const current = notes.find((n) => n._id === openId) || null;

  const newNote = async () => {
    const note = await create.mutateAsync({ content: { title: "", body: "", tags: [] } });
    setOpenId(note._id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <label className="relative flex-1 min-w-[200px]">
          <span className="sr-only">Search notes</span>
          <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your notes" className={cn(input, "pl-9")} />
        </label>
        <button onClick={() => setArchived((a) => !a)} className={btn}>
          {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />} {archived ? "Back to notes" : "Archive"}
        </button>
        {!archived && (
          <button onClick={newNote} disabled={create.isPending} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold">
            <Plus className="h-4 w-4" /> New note
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="h-32 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
      ) : shown.length === 0 ? (
        <p className="text-sm text-slate-500 py-10 text-center">{query ? "No notes match." : archived ? "Nothing archived." : "No notes yet. Write your first one."}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((n) => (
            <li key={n._id}>
              <button onClick={() => setOpenId(n._id)} className={cn("w-full text-left rounded-2xl border p-4 h-40 overflow-hidden hover:border-violet-500/50 transition", NOTE_COLORS[n.color])}>
                <span className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-white truncate">{n.broken ? "Can't open this note" : n.title || "Untitled"}</span>
                  {n.pinned && <Pin className="h-3.5 w-3.5 text-amber-300 shrink-0" />}
                </span>
                <span className="block text-sm text-slate-300 mt-1 line-clamp-4 whitespace-pre-line">{n.body}</span>
                <span className="block text-[11px] text-slate-500 mt-2">{fmtWhen(n.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {current && (
        <NoteEditor
          key={current._id}
          note={current}
          saving={update.isPending}
          onSave={(patch) => update.mutate({ note: current, patch })}
          onDelete={() => {
            remove.mutate(current._id);
            setOpenId(null);
          }}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

type Patch = Partial<Pick<Note, "title" | "body" | "tags" | "pinned" | "color" | "archived">>;

/** Side panel editor. Typing autosaves after a short pause (one write per pause). */
function NoteEditor({ note, saving, onSave, onDelete, onClose }: { note: Note; saving: boolean; onSave: (p: Patch) => void; onDelete: () => void; onClose: () => void }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [tags, setTags] = useState(note.tags.join(", "));
  const [dirty, setDirty] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty) return;
    onSave({ title: title.trim(), body, tags: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20) });
    setDirty(false);
  };

  // Debounced autosave: restarts on every keystroke, fires 800 ms after the last
  useEffect(() => {
    if (!dirty) return;
    timer.current = setTimeout(flush, AUTOSAVE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, tags, dirty]);

  // Don't lose typing when the tab closes
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setter(e.target.value);
    setDirty(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-label="Edit note" onClick={() => { flush(); onClose(); }}>
      <div className={cn("w-full max-w-xl h-full overflow-y-auto border-l p-5 space-y-3", NOTE_COLORS[note.color], "bg-slate-900")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400 inline-flex items-center gap-1">
            {dirty || saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</> : <><Check className="h-3 w-3" /> Saved</>}
          </span>
          <div className="flex gap-1.5">
            <button onClick={() => onSave({ pinned: !note.pinned })} className={btn} aria-label={note.pinned ? "Unpin" : "Pin"}>
              {note.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => { flush(); onSave({ archived: !note.archived }); onClose(); }} className={btn}>
              {note.archived ? "Unarchive" : "Archive"}
            </button>
            <button onClick={() => window.confirm("Delete this note for good?") && onDelete()} className={cn(btn, "text-red-300")} aria-label="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => { flush(); onClose(); }} className={btn} aria-label="Close">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <input value={title} onChange={change(setTitle)} placeholder="Title" maxLength={200} className="w-full bg-transparent text-xl font-semibold text-white placeholder-slate-600 focus:outline-none" autoFocus={!note.title} />
        <textarea value={body} onChange={change(setBody)} placeholder="Write something…" rows={16} maxLength={60000} className="w-full bg-transparent text-sm text-slate-200 placeholder-slate-600 focus:outline-none resize-y leading-relaxed" />
        <input value={tags} onChange={change(setTags)} placeholder="Tags, separated by commas" className={input} />
        <div className="flex gap-1.5" role="radiogroup" aria-label="Colour">
          {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={note.color === c}
              aria-label={c}
              onClick={() => onSave({ color: c })}
              className={cn("h-6 w-6 rounded-full border", NOTE_COLORS[c], note.color === c && "ring-2 ring-violet-400")}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
