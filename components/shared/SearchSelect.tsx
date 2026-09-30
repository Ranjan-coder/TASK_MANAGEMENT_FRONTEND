"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  /** Extra text shown on the right and searched too (e.g. "GM", a department) */
  hint?: string;
  /** Options with the same group are listed under one heading, in the order given */
  group?: string;
  /** Shown but not selectable (e.g. a title this person isn't allowed to give) */
  disabled?: boolean;
  disabledReason?: string;
}

interface Props {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Show "None" to clear the choice */
  allowClear?: boolean;
  /** When set, offers "+ Create “typed text”" if nothing matches exactly */
  onCreate?: (name: string) => Promise<string | null>;
  createLabel?: string;
  disabled?: boolean;
  className?: string;
}

const MAX_SHOWN = 80;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Searchable dropdown. The search index (lower-cased label + hint) is built once per
 * option list, so typing filters in memory without re-processing every option;
 * at most 80 matches are drawn at a time. Keyboard: ↑ ↓ Enter Esc.
 */
export function SearchSelect({ id, value, onChange, options, placeholder = "Select…", allowClear, onCreate, createLabel = "Create", disabled, className }: Props) {
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const index = useMemo(() => options.map((o) => ({ o, text: norm(`${o.label} ${o.hint ?? ""}`) })), [options]);
  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  const matches = useMemo(() => {
    const q = norm(query);
    const hits = q ? index.filter((x) => x.text.includes(q)) : index;
    return hits.slice(0, MAX_SHOWN).map((x) => x.o);
  }, [index, query]);

  const exact = useMemo(() => {
    const q = norm(query);
    return q.length > 0 && options.some((o) => norm(o.label) === q);
  }, [options, query]);
  const showCreate = Boolean(onCreate) && norm(query).length >= 2 && !exact;

  // Rows the keyboard moves through: None, matches, Create
  const rows = useMemo(
    () => [...(allowClear ? [{ kind: "clear" as const }] : []), ...matches.map((o) => ({ kind: "option" as const, o })), ...(showCreate ? [{ kind: "create" as const }] : [])],
    [allowClear, matches, showCreate]
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => boxRef.current && !boxRef.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => setActive(0), [query, open]);

  const choose = async (row: (typeof rows)[number] | undefined) => {
    if (!row) return;
    if (row.kind === "clear") onChange(null);
    else if (row.kind === "option") {
      if (row.o.disabled) return;
      onChange(row.o.value);
    } else if (onCreate) {
      setCreating(true);
      try {
        const created = await onCreate(query.trim());
        if (created) onChange(created);
      } finally {
        setCreating(false);
      }
    }
    setOpen(false);
    setQuery("");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open) choose(rows[active]);
      else setOpen(true);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  let lastGroup: string | undefined;
  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-center w-full rounded-xl bg-slate-700/50 border border-slate-600 focus-within:ring-2 focus-within:ring-violet-500 transition",
          disabled && "opacity-60"
        )}
      >
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          value={open ? query : selected ? `${selected.label}${selected.hint ? ` · ${selected.hint}` : ""}` : ""}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKey}
          className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none"
        />
        {selected && allowClear && !disabled && (
          <button type="button" aria-label="Clear" onClick={() => onChange(null)} className="p-1 text-slate-500 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronDown className="h-4 w-4 mr-2.5 text-slate-500 shrink-0" />
      </div>

      {open && !disabled && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-2xl">
          {rows.map((row, i) => {
            if (row.kind === "clear")
              return (
                <li key="__clear" role="option" aria-selected={!value} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(row)} onMouseEnter={() => setActive(i)} className={cn("px-3 py-2 text-sm italic text-slate-400 cursor-pointer", i === active && "bg-slate-800")}>
                  None
                </li>
              );
            if (row.kind === "create")
              return (
                <li key="__create" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(row)} onMouseEnter={() => setActive(i)} className={cn("flex items-center gap-2 px-3 py-2 text-sm text-violet-300 cursor-pointer border-t border-slate-800", i === active && "bg-slate-800")}>
                  <Plus className="h-3.5 w-3.5" /> {creating ? "Creating…" : `${createLabel} “${query.trim()}”`}
                </li>
              );
            const o = row.o;
            const heading = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <li key={o.value}>
                {heading && <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{heading}</div>}
                <div
                  role="option"
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled}
                  title={o.disabled ? o.disabledReason : undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(row)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm",
                    o.disabled ? "text-slate-600 cursor-not-allowed" : "text-slate-200 cursor-pointer",
                    i === active && !o.disabled && "bg-slate-800"
                  )}
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="text-xs text-slate-500 shrink-0">{o.hint}</span>}
                  {o.value === value && <Check className="h-3.5 w-3.5 text-violet-400 shrink-0" />}
                </div>
              </li>
            );
          })}
          {rows.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matches</li>}
          {matches.length === MAX_SHOWN && <li className="px-3 py-1.5 text-[11px] text-slate-500">Keep typing to narrow the list…</li>}
        </ul>
      )}
    </div>
  );
}
