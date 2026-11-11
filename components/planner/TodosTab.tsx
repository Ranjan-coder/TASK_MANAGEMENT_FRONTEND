"use client";

import { useEffect, useState } from "react";
import { BellPlus, GripVertical, Pencil, Plus, Trash2, Check } from "lucide-react";
import { useItems, useLists, useReminders, type TodoItem } from "@/hooks/usePlanner";
import { cn } from "@/lib/utils";
import { btn, input, fmtWhen, toLocalInput } from "./ui";

/**
 * Todo lists. Drag an item to reorder: the server writes ONE new rank between its
 * neighbours (fractional indexing), so even long lists reorder with a single write.
 */
export function TodosTab({ vaultKey }: { vaultKey: CryptoKey }) {
  const lists = useLists(vaultKey);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newList, setNewList] = useState("");

  useEffect(() => {
    if (!activeId && lists.lists.length) setActiveId(lists.lists[0]._id);
    if (activeId && lists.lists.length && !lists.lists.some((l) => l._id === activeId)) setActiveId(lists.lists[0]._id);
  }, [lists.lists, activeId]);

  const active = lists.lists.find((l) => l._id === activeId) || null;

  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      <aside className="space-y-2">
        <ul className="space-y-1" aria-label="Lists">
          {lists.lists.map((l) => (
            <li key={l._id}>
              <button
                onClick={() => setActiveId(l._id)}
                className={cn("w-full text-left px-3 py-2 rounded-lg text-sm truncate", l._id === activeId ? "bg-violet-600/25 text-white" : "text-slate-300 hover:bg-slate-800")}
              >
                {l.broken ? "Can't open this list" : l.title || "Untitled list"}
              </button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newList.trim()) return;
            lists.create.mutate(newList.trim(), { onSuccess: (l) => setActiveId(l._id) });
            setNewList("");
          }}
          className="flex gap-1.5"
        >
          <input value={newList} onChange={(e) => setNewList(e.target.value)} placeholder="New list" maxLength={100} className={input} />
          <button className={btn} aria-label="Add list">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </form>
      </aside>

      {active ? (
        <ListView
          key={active._id}
          vaultKey={vaultKey}
          listId={active._id}
          title={active.title}
          onRename={(title) => lists.rename.mutate({ list: active, title })}
          onDelete={() => window.confirm("Delete this list and everything in it?") && lists.remove.mutate(active._id)}
        />
      ) : (
        <p className="text-sm text-slate-500 py-10 text-center">{lists.isLoading ? "Loading…" : "Create a list to start."}</p>
      )}
    </div>
  );
}

function ListView({ vaultKey, listId, title, onRename, onDelete }: { vaultKey: CryptoKey; listId: string; title: string; onRename: (t: string) => void; onDelete: () => void }) {
  const { items, add, update, move, remove } = useItems(vaultKey, listId);
  const reminders = useReminders(vaultKey);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(title);

  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  // Drop onto row `target`: the moved item goes just before it
  const dropOn = (target: TodoItem) => {
    if (!dragId || dragId === target._id) return;
    // Neighbours in the list without the dragged item: it lands just before the target
    const rest = open.filter((i) => i._id !== dragId);
    const idx = rest.findIndex((i) => i._id === target._id);
    move.mutate({ id: dragId, before: rest[idx - 1]?._id, after: target._id });
    setDragId(null);
  };
  const dropAtEnd = () => {
    if (!dragId) return;
    const last = open.filter((i) => i._id !== dragId).pop();
    move.mutate({ id: dragId, before: last?._id });
    setDragId(null);
  };

  const remindMe = (item: TodoItem, chosen: string) => {
    const when = new Date(chosen);
    if (Number.isNaN(+when) || when < new Date()) return false;
    reminders.create.mutate({ text: item.text, at: when.toISOString(), link: { kind: "item", id: item._id } });
    return true;
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {renaming ? (
          <form
            className="flex gap-1.5 flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) onRename(name.trim());
              setRenaming(false);
            }}
          >
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={input} />
            <button className={btn}>Save</button>
          </form>
        ) : (
          <h2 className="text-lg font-semibold text-white truncate">{title || "Untitled list"}</h2>
        )}
        <div className="flex gap-1.5">
          <button onClick={() => setRenaming((r) => !r)} className={btn} aria-label="Rename list">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className={cn(btn, "text-red-300")} aria-label="Delete list">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          add.mutate({ text: text.trim(), dueAt: due ? new Date(due).toISOString() : null });
          setText("");
          setDue("");
        }}
        className="flex flex-wrap gap-2"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a todo" maxLength={1000} className={cn(input, "flex-1 min-w-[180px]")} />
        <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due" className={cn(input, "w-auto")} />
        <button className={btn} disabled={add.isPending}>
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </form>

      <ul className="divide-y divide-slate-800 border border-slate-800 rounded-xl" onDragOver={(e) => e.preventDefault()} onDrop={dropAtEnd}>
        {open.length === 0 && <li className="px-4 py-6 text-sm text-slate-500 text-center">Nothing to do here.</li>}
        {open.map((i) => (
          <Row
            key={i._id}
            item={i}
            dragging={dragId === i._id}
            onDragStart={() => setDragId(i._id)}
            onDrop={(e) => {
              e.stopPropagation();
              dropOn(i);
            }}
            onToggle={() => update.mutate({ item: i, done: true })}
            onEdit={(t) => update.mutate({ item: i, text: t })}
            onRemind={(at) => remindMe(i, at)}
            onDelete={() => remove.mutate(i._id)}
          />
        ))}
      </ul>

      {done.length > 0 && (
        <div>
          <button onClick={() => setShowDone((s) => !s)} className="text-xs text-slate-400 hover:text-white">
            {showDone ? "Hide" : "Show"} done ({done.length})
          </button>
          {showDone && (
            <ul className="mt-2 divide-y divide-slate-800 border border-slate-800 rounded-xl opacity-70">
              {done.map((i) => (
                <Row key={i._id} item={i} onToggle={() => update.mutate({ item: i, done: false })} onEdit={(t) => update.mutate({ item: i, text: t })} onDelete={() => remove.mutate(i._id)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Row({
  item,
  dragging,
  onDragStart,
  onDrop,
  onToggle,
  onEdit,
  onRemind,
  onDelete
}: {
  item: TodoItem;
  dragging?: boolean;
  onDragStart?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onToggle: () => void;
  onEdit: (text: string) => void;
  onRemind?: (at: string) => boolean;
  onDelete: () => void;
}) {
  const [text, setText] = useState(item.text);
  // Inline "remind me at …" picker (defaults to the due time, or an hour from now)
  const [remindAt, setRemindAt] = useState<string | null>(null);
  useEffect(() => setText(item.text), [item.text]);
  const overdue = !item.done && item.dueAt && new Date(item.dueAt) < new Date();

  return (
    <li
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={cn("flex items-center gap-2 px-3 py-2", dragging && "opacity-40")}
    >
      {onDragStart && <GripVertical className="h-4 w-4 text-slate-600 cursor-grab shrink-0" aria-hidden />}
      <button onClick={onToggle} aria-label={item.done ? "Mark not done" : "Mark done"} className={cn("h-5 w-5 rounded-md border flex items-center justify-center shrink-0", item.done ? "bg-emerald-600 border-emerald-500" : "border-slate-600 hover:border-violet-400")}>
        {item.done && <Check className="h-3.5 w-3.5 text-white" />}
      </button>
      <input
        value={item.broken ? "Can't open this item" : text}
        disabled={item.broken}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() && text !== item.text && onEdit(text.trim())}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className={cn("flex-1 bg-transparent text-sm focus:outline-none", item.done ? "line-through text-slate-500" : "text-slate-100")}
        aria-label="Todo text"
      />
      {item.dueAt && <span className={cn("text-[11px] whitespace-nowrap", overdue ? "text-rose-400" : "text-slate-500")}>{fmtWhen(item.dueAt)}</span>}
      {onRemind &&
        (remindAt === null ? (
          <button
            onClick={() => setRemindAt(toLocalInput(item.dueAt ? new Date(item.dueAt) : new Date(Date.now() + 3600e3)))}
            className="text-slate-500 hover:text-violet-300"
            aria-label="Remind me"
          >
            <BellPlus className="h-4 w-4" />
          </button>
        ) : (
          <span className="flex items-center gap-1">
            <input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} aria-label="Remind me at" className="bg-slate-950/60 border border-slate-700 rounded-md px-1.5 py-0.5 text-xs text-white" />
            <button onClick={() => onRemind(remindAt) && setRemindAt(null)} className="text-xs text-violet-300 hover:text-white">Set</button>
            <button onClick={() => setRemindAt(null)} className="text-xs text-slate-500 hover:text-white">Cancel</button>
          </span>
        ))}
      <button onClick={onDelete} className="text-slate-600 hover:text-red-400" aria-label="Delete">
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
