"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, X, Search } from "lucide-react";
import { toast } from "sonner";
import type { ContactCandidate, ContactInput, EditableContact } from "@/lib/api/contacts.api";
import { apiErrorCode, apiErrorMessage } from "@/lib/api/customerAuth.api";
import { TOPICS } from "@/lib/projectContacts";
import { cn } from "@/lib/utils";

const MAX = 8;
type Row = ContactInput & { name: string; id: number };
const keyOf = (r: Pick<ContactInput, "topic" | "label">) => (r.topic === "custom" ? `custom:${r.label.trim().toLowerCase()}` : r.topic);
const input = "w-full px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500";

/**
 * Edits one list of contacts: a project's own (admins + its manager) or the
 * company defaults (admins). Rendered in a portal: inside the chat's blurred
 * panels a fixed overlay would otherwise be trapped (see ProjectChatActions).
 */
export function ContactsEditor({
  title,
  intro,
  initial,
  rev,
  loadCandidates,
  onSave,
  onConflict,
  onClose
}: {
  title: string;
  intro: string;
  initial: EditableContact[];
  rev: number;
  loadCandidates: (search: string) => Promise<ContactCandidate[]>;
  onSave: (contacts: ContactInput[], rev: number) => Promise<unknown>;
  onConflict: () => void;
  onClose: () => void;
}) {
  let nextId = 0;
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((c) => ({ topic: c.topic, label: c.label, user: c.user, phone: c.phone, whatsapp: c.whatsapp, email: c.email, hours: c.hours, name: c.person?.name ?? "(no longer active)", id: nextId++ }))
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  // Same rule as the server: one contact per topic (custom: per name) — O(n) with a Map
  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) seen.set(keyOf(r), (seen.get(keyOf(r)) || 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [rows]);
  const incomplete = rows.some((r) => !r.user || (r.topic === "custom" && r.label.trim().length < 2));

  const set = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => {
    const used = new Set(rows.map((r) => r.topic));
    const topic = TOPICS.find((t) => t.value !== "custom" && !used.has(t.value))?.value ?? "custom";
    setRows((rs) => [...rs, { topic, label: "", user: "", phone: "", whatsapp: false, email: "", hours: "", name: "", id: Date.now() }]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(rows.map(({ topic, label, user, phone, whatsapp, email, hours }) => ({ topic, label: label.trim(), user, phone: phone.trim(), whatsapp, email: email.trim(), hours: hours.trim() })), rev);
      toast.success("Contacts saved");
      onClose();
    } catch (err) {
      if (apiErrorCode(err) === "CONTACTS_CHANGED") {
        toast.error("Someone else just changed these contacts — showing their version.");
        onConflict();
        onClose();
      } else toast.error(apiErrorMessage(err, "Couldn't save the contacts"));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="contacts-editor-title" className="w-full max-w-2xl max-h-full sm:max-h-[92vh] flex flex-col bg-slate-900 sm:rounded-2xl border border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 shrink-0">
          <h2 id="contacts-editor-title" className="text-base font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <p className="text-xs text-slate-400">{intro}</p>
          {rows.length === 0 && <p className="text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg p-4 text-center">No contacts here yet.</p>}
          {rows.map((r, i) => (
            <fieldset key={r.id} className={cn("rounded-xl border p-3 space-y-2", dupes.has(keyOf(r)) ? "border-rose-500/50" : "border-slate-800")}>
              <legend className="sr-only">Contact {i + 1}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] text-slate-400">
                  Topic
                  <select value={r.topic} onChange={(e) => set(r.id, { topic: e.target.value as Row["topic"] })} className={cn(input, "mt-0.5")} aria-label={`Topic ${i + 1}`}>
                    {TOPICS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] text-slate-400">
                  {r.topic === "custom" ? "Topic name" : "Shown as (optional)"}
                  <input value={r.label} maxLength={40} onChange={(e) => set(r.id, { label: e.target.value })} placeholder={r.topic === "custom" ? "e.g. Furniture delivery" : TOPICS.find((t) => t.value === r.topic)?.label} className={cn(input, "mt-0.5")} aria-label={`Topic name ${i + 1}`} />
                </label>
              </div>
              <PersonPicker
                name={r.name}
                index={i}
                load={loadCandidates}
                onPick={(p) =>
                  // Prefill from the profile (P3), only into empty fields: anything typed stays
                  set(r.id, { user: p._id, name: p.name, phone: r.phone || p.phone, email: r.email || p.email })
                }
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-[11px] text-slate-400">
                  Phone (shown to the customer)
                  <input value={r.phone} maxLength={20} inputMode="tel" onChange={(e) => set(r.id, { phone: e.target.value })} placeholder="Optional" className={cn(input, "mt-0.5")} aria-label={`Phone ${i + 1}`} />
                </label>
                <label className="text-[11px] text-slate-400">
                  Email
                  <input value={r.email} maxLength={120} type="email" onChange={(e) => set(r.id, { email: e.target.value })} placeholder="Optional" className={cn(input, "mt-0.5")} aria-label={`Email ${i + 1}`} />
                </label>
                <label className="text-[11px] text-slate-400">
                  Hours
                  <input value={r.hours} maxLength={60} onChange={(e) => set(r.id, { hours: e.target.value })} placeholder="e.g. Tue–Sun, 10–7" className={cn(input, "mt-0.5")} aria-label={`Hours ${i + 1}`} />
                </label>
              </div>
              <div className="flex items-center justify-between">
                <label className={cn("text-[11px] flex items-center gap-1.5", r.phone ? "text-slate-300" : "text-slate-600")}>
                  <input type="checkbox" checked={r.whatsapp} disabled={!r.phone} onChange={(e) => set(r.id, { whatsapp: e.target.checked })} className="accent-violet-500" /> This number is on WhatsApp
                </label>
                <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} className="text-[11px] text-rose-300 hover:text-rose-200 inline-flex items-center gap-1" aria-label={`Remove contact ${i + 1}`}>
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
              </div>
              {dupes.has(keyOf(r)) && <p className="text-[11px] text-rose-300">This topic is listed twice — keep one.</p>}
            </fieldset>
          ))}
          {rows.length < MAX && (
            <button type="button" onClick={add} className="w-full py-2 rounded-lg border border-dashed border-slate-700 text-xs text-slate-300 hover:text-white hover:border-slate-500 inline-flex items-center justify-center gap-1">
              <Plus className="h-3.5 w-3.5" /> Add contact
            </button>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-800 shrink-0">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-200 hover:bg-slate-800">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving || incomplete || dupes.size > 0} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40">
            {saving ? "Saving…" : "Save contacts"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Search active staff (debounced; results cached per search by React Query). */
function PersonPicker({ name, index, load, onPick }: { name: string; index: number; load: (s: string) => Promise<ContactCandidate[]>; onPick: (p: ContactCandidate) => void }) {
  const [open, setOpen] = useState(!name);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const { data, isFetching } = useQuery({ queryKey: ["contact-candidates", search], queryFn: () => load(search), enabled: open, staleTime: 60_000 });

  if (!open) {
    return (
      <p className="text-xs text-slate-200">
        <span className="text-[11px] text-slate-400">Person: </span>
        {name}{" "}
        <button type="button" onClick={() => setOpen(true)} className="text-[11px] text-violet-300 hover:text-violet-200 underline">
          Change
        </button>
      </p>
    );
  }
  return (
    <div>
      <label className="text-[11px] text-slate-400 block">
        Person
        <span className="relative block mt-0.5">
          <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search staff by name" className={cn(input, "pl-7")} aria-label={`Person ${index + 1}`} />
        </span>
      </label>
      <ul className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-800 divide-y divide-slate-800" role="listbox" aria-label="Staff">
        {isFetching && !data && <li className="px-2.5 py-1.5 text-[11px] text-slate-500">Searching…</li>}
        {data?.length === 0 && <li className="px-2.5 py-1.5 text-[11px] text-slate-500">No one found</li>}
        {data?.map((p) => (
          <li key={p._id}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => {
                onPick(p);
                setOpen(false);
              }}
              className="w-full text-left px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              {p.name}
              {p.designation && <span className="text-slate-500"> · {p.designation}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
