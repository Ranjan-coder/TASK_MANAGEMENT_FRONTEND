"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { usersApi } from "@/lib/api/users.api";
import type { User } from "@/types";

export interface PickedUser {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  publicKey?: string;
  keyVersion?: number;
}

interface Props {
  id: string;
  label: string;
  /** "customer" searches customer accounts; "staff" searches Bonito staff who can join projects */
  kind: "customer" | "staff";
  value: PickedUser[];
  onChange: (users: PickedUser[]) => void;
  multiple?: boolean;
  required?: boolean;
  exclude?: string[];
  placeholder?: string;
}

const STAFF_ROLES = ["user", "admin", "superadmin"];

/** Search-as-you-type picker over the Users API (admin only). */
export function UserPicker({ id, label, kind, value, onChange, multiple = false, required, exclude = [], placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // Stable keys so the search effect doesn't re-run on every render
  const hiddenKey = [...exclude, ...value.map((v) => v._id)].sort().join(",");

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await usersApi.getUsers({
          search: query || undefined,
          role: kind === "customer" ? "customer" : undefined,
          status: "active",
          limit: 50
        });
        const users = (res.data.data as User[])
          .filter((u) => (kind === "customer" ? u.role === "customer" : STAFF_ROLES.includes(u.role)))
          .filter((u) => !hiddenKey.split(",").includes(u._id))
          .map((u) => ({ _id: u._id, name: u.name, email: u.email, phone: u.phone, role: u.role, publicKey: u.publicKey, keyVersion: u.keyVersion }));
        if (active) setResults(users.slice(0, 20));
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, open, kind, hiddenKey]);

  const pick = (u: PickedUser) => {
    onChange(multiple ? [...value, u] : [u]);
    setQuery("");
    if (!multiple) setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor={id} className="block text-xs font-medium text-slate-300 mb-1">
        {label} {!required && <span className="text-slate-500">(optional)</span>}
      </label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {value.map((u) => (
            <span key={u._id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-violet-600/20 border border-violet-500/30 text-violet-100 text-xs">
              {u.name}
              {kind === "customer" && u.phone && <span className="text-violet-300/70">{u.phone}</span>}
              {!u.publicKey && <span className="text-amber-300/80" title="Hasn't opened Chat yet — will get access automatically">•</span>}
              <button type="button" onClick={() => onChange(value.filter((v) => v._id !== u._id))} aria-label={`Remove ${u.name}`} className="h-5 w-5 rounded-full hover:bg-violet-500/30 flex items-center justify-center">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {(multiple || value.length === 0) && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            id={id}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={placeholder || (kind === "customer" ? "Search customers by name or email" : "Search staff by name or email")}
            autoComplete="off"
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
      )}
      {open && (multiple || value.length === 0) && (
        <ul role="listbox" className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
          {loading ? (
            <li className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-500">No matches</li>
          ) : (
            results.map((u) => (
              <li key={u._id}>
                <button type="button" role="option" aria-selected={false} onClick={() => pick(u)} className="w-full text-left px-3 py-2 hover:bg-slate-800">
                  <span className="block text-sm text-white">{u.name}</span>
                  <span className="block text-[11px] text-slate-400">
                    {u.email}
                    {u.phone ? ` · ${u.phone}` : ""}
                    {kind === "staff" && u.role ? ` · ${u.role}` : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
