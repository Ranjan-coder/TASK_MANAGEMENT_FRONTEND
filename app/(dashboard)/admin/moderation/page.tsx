"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, X, Plus, Trash2, Search, Save } from "lucide-react";
import { toast } from "sonner";
import { moderationApi, type Severity, type Term } from "@/lib/api/moderation.api";
import { slaApi } from "@/lib/api/sla.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { cn } from "@/lib/utils";

const SEVERITY_STYLE: Record<Severity, string> = {
  mild: "bg-slate-500/15 text-slate-200 border-slate-500/30",
  abusive: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  threat: "bg-rose-500/15 text-rose-200 border-rose-500/30"
};
const LANG_LABEL: Record<Term["language"], string> = { en: "English", hi: "Hindi", hinglish: "Hinglish", other: "Other" };
const when = (d?: string | null) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const card = "bg-slate-900/80 border border-slate-800 rounded-2xl p-5";

export default function ModerationPage() {
  const [tab, setTab] = useState<"alerts" | "words">("alerts");
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center">
          <ShieldAlert className="h-5 w-5 text-amber-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Moderation</h1>
          <p className="text-sm text-slate-400">
            Abuse alerts from project chats. Words are checked on people&apos;s devices; Bonito only receives counts, never the messages.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {(["alerts", "words"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className={cn("px-3 py-1.5 rounded-lg border text-xs", tab === t ? "bg-violet-600/25 border-violet-500/50 text-white" : "border-slate-700 text-slate-300")}>
            {t === "alerts" ? "Alerts" : "Word list & rules"}
          </button>
        ))}
      </div>
      {tab === "alerts" ? <Alerts /> : <Words />}
    </div>
  );
}

function Alerts() {
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["mod-incidents", status], queryFn: async () => (await moderationApi.incidents(status)).data.data });

  return (
    <>
      <div className="flex gap-2">
        {(["open", "resolved"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s} className={cn("px-3 py-1.5 rounded-lg border text-xs", status === s ? "border-slate-400 text-white" : "border-slate-800 text-slate-400")}>
            {s === "open" ? "Open" : "Resolved"} {data?.counts?.[s] ? <span className="text-slate-500">{data.counts[s]}</span> : null}
          </button>
        ))}
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : !data?.items.length ? (
        <p className="text-sm text-slate-400 border border-dashed border-slate-800 rounded-xl p-8 text-center">{status === "open" ? "No open alerts." : "No resolved alerts yet."}</p>
      ) : (
        <ul className="space-y-2">
          {data.items.map((i) => (
            <li key={i._id}>
              <button onClick={() => setOpenId(i._id)} className="w-full text-left bg-slate-900/80 border border-slate-800 hover:border-slate-600 rounded-xl p-4 flex flex-wrap items-center gap-3">
                <span className={cn("px-2 py-0.5 rounded-full border text-[11px] capitalize", SEVERITY_STYLE[i.severity])}>{i.severity}</span>
                <span className="flex-1 min-w-[220px]">
                  <span className="block text-sm text-white">{i.conversation?.name || "Deleted chat"}</span>
                  <span className="block text-[11px] text-slate-400">
                    {i.trigger === "threat" ? "Threat" : `${i.hitCount} flagged words`} ·{" "}
                    {i.offenders.map((o) => `${o.user?.name || "?"}${o.user?.role === "customer" ? " (customer)" : ""} ${o.hits}`).join(", ")}
                  </span>
                </span>
                <span className="text-[11px] text-slate-400">{when(i.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {openId && <IncidentDrawer id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function IncidentDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: i, isLoading } = useQuery({ queryKey: ["mod-incident", id], queryFn: async () => (await moderationApi.incident(id)).data.data });
  const [note, setNote] = useState("");
  const act = useMutation({
    mutationFn: async (action: "resolve" | "request_evidence") => (await moderationApi.act(id, action, note.trim() || undefined)).data,
    onSuccess: (res) => {
      qc.setQueryData(["mod-incident", id], res.data);
      qc.invalidateQueries({ queryKey: ["mod-incidents"] });
      toast.success(res.message);
      setNote("");
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't update the alert"))
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="inc-title" onClick={(e) => e.stopPropagation()} className="w-full max-w-xl h-full overflow-y-auto bg-slate-900 border-l border-slate-700 shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900">
          <h2 id="inc-title" className="text-lg font-semibold text-white">Abuse alert</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        {isLoading || !i ? (
          <p className="p-5 text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="p-5 space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("px-2 py-0.5 rounded-full border text-[11px] capitalize", SEVERITY_STYLE[i.severity])}>{i.severity}</span>
              <span className="text-xs text-slate-400">
                {i.trigger === "threat" ? "Raised at once for a threat" : `${i.threshold}+ flagged words within ${i.windowSize} messages`} · {when(i.createdAt)}
              </span>
            </div>
            <p className="text-white font-medium">{i.conversation?.name}</p>

            <section>
              <h3 className="text-xs font-semibold text-slate-300 mb-1">Who sent the flagged words</h3>
              <ul className="space-y-1">
                {i.offenders.map((o, k) => (
                  <li key={k} className="flex justify-between text-xs bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-2">
                    <span className="text-slate-200">{o.user?.name}{o.user?.role === "customer" ? " (customer)" : ""}</span>
                    <span className="text-slate-400">{o.hits} words in {o.messages} messages</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-slate-500 mt-1">Total so far: {i.hitCount}. Last flag {when(i.lastFlagAt)}.</p>
            </section>

            <section>
              <h3 className="text-xs font-semibold text-slate-300 mb-1">People in the chat</h3>
              <ul className="text-xs text-slate-300 space-y-0.5">
                {i.team.map((u) => (
                  <li key={u._id}>{u.name} — {u.projectRole}{u.phone ? ` · ${u.phone}` : ""}{u.email ? ` · ${u.email}` : ""}</li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="text-xs font-semibold text-slate-300 mb-1">Reports from this chat</h3>
              {i.reports.length ? (
                <ul className="text-xs text-slate-300 space-y-0.5">
                  {i.reports.map((r) => (
                    <li key={r._id}>
                      <a href="/admin/reports" className="text-violet-300 hover:underline">#{r.ticketNo}</a> · {r.reporter?.name} about {r.reportedUser?.name} · {r.status.replace("_", " ")} · {when(r.createdAt)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">None yet. Admins can&apos;t read the chat — ask the participants to report what happened.</p>
              )}
            </section>

            {i.status === "resolved" ? (
              <p className="text-xs text-slate-300 border-t border-slate-800 pt-4">
                Resolved by {i.resolvedBy?.name} {when(i.resolvedAt)}{i.resolutionNote ? ` — ${i.resolutionNote}` : ""}
              </p>
            ) : (
              <section className="border-t border-slate-800 pt-4 space-y-3">
                <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 2000))} rows={2} placeholder="Note (optional, internal)" className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-xs placeholder-slate-500" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={Boolean(i.evidenceRequestedAt) || act.isPending} onClick={() => act.mutate("request_evidence")} className="px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-200 hover:border-slate-500 disabled:opacity-40">
                    {i.evidenceRequestedAt ? `Evidence requested ${when(i.evidenceRequestedAt)}` : "Ask participants for evidence"}
                  </button>
                  <button type="button" disabled={act.isPending} onClick={() => act.mutate("resolve")} className="px-3 py-2 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-500 disabled:opacity-40">
                    Resolve
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Asking for evidence posts a notice in the chat and notifies everyone in it. Resolving restarts the count; until then, only a threat raises another alert.
                </p>
              </section>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function Words() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["mod-terms"], queryFn: async () => (await moderationApi.terms()).data.data });
  const settings = useQuery({ queryKey: ["reply-time-settings"], queryFn: async () => (await slaApi.getSettings()).data.data });
  const [q, setQ] = useState("");
  const [sev, setSev] = useState<Severity | "">("");
  const [form, setForm] = useState({ display: "", severity: "abusive" as Severity, language: "hinglish" as Term["language"] });
  const [rules, setRules] = useState<{ threshold: number; window: number } | null>(null);

  useEffect(() => {
    const m = settings.data?.moderation;
    if (m && !rules) setRules({ threshold: m.threshold, window: m.window });
  }, [settings.data, rules]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["mod-terms"] });
  const add = useMutation({
    mutationFn: () => moderationApi.addTerm({ ...form, display: form.display.trim() }),
    onSuccess: () => {
      toast.success("Word added — devices pick it up within 10 minutes");
      setForm((f) => ({ ...f, display: "" }));
      refresh();
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't add the word"))
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { severity?: Severity; active?: boolean } }) => moderationApi.updateTerm(id, body),
    onSuccess: refresh,
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't update"))
  });
  const remove = useMutation({
    mutationFn: (id: string) => moderationApi.deleteTerm(id),
    onSuccess: refresh,
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't remove"))
  });
  const saveRules = useMutation({
    mutationFn: () => slaApi.updateSettings({ moderation: rules! }),
    onSuccess: () => {
      toast.success("Rules saved");
      qc.invalidateQueries({ queryKey: ["reply-time-settings"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save the rules"))
  });

  const terms = useMemo(
    () => (data?.terms || []).filter((t) => (!sev || t.severity === sev) && (!q || t.display.toLowerCase().includes(q.toLowerCase()))),
    [data?.terms, q, sev]
  );

  return (
    <div className="space-y-5">
      <section className={card}>
        <h2 className="text-base font-semibold text-white">Rules</h2>
        {rules && (
          <div className="mt-3 flex flex-wrap items-end gap-3 text-xs text-slate-300">
            <label>
              Alert at
              <input type="number" min={2} max={50} value={rules.threshold} onChange={(e) => setRules({ ...rules, threshold: Number(e.target.value) })} className="block mt-1 w-24 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm" />
            </label>
            <span className="pb-2">flagged words within the last</span>
            <label>
              Messages
              <input type="number" min={10} max={500} value={rules.window} onChange={(e) => setRules({ ...rules, window: Number(e.target.value) })} className="block mt-1 w-24 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm" />
            </label>
            <button type="button" onClick={() => saveRules.mutate()} disabled={saveRules.isPending || rules.threshold > rules.window} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-500 disabled:opacity-40">
              <Save className="h-3.5 w-3.5" /> Save
            </button>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-500">Threat words alert immediately. Each chat gets one alert until it&apos;s resolved or goes a full window of messages without flags.</p>
        {data?.stats && (
          <p className="mt-3 text-xs text-slate-300">
            Last {data.stats.days} days: <strong className="text-emerald-300">{data.stats.prevented}</strong> messages rewritten after the warning ·{" "}
            <strong className="text-amber-300">{data.stats.sentAnyway}</strong> sent anyway
          </p>
        )}
      </section>

      <section className={card}>
        <h2 className="text-base font-semibold text-white">Add a word or phrase</h2>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.display.trim().length >= 2) add.mutate();
          }}
        >
          <label className="text-xs text-slate-300 flex-1 min-w-[180px]">
            Word or phrase
            <input value={form.display} maxLength={60} onChange={(e) => setForm({ ...form, display: e.target.value })} className="block mt-1 w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm" placeholder="e.g. tod dunga" />
          </label>
          <label className="text-xs text-slate-300">
            Severity
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })} className="block mt-1 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm">
              <option value="mild">Mild</option>
              <option value="abusive">Abusive</option>
              <option value="threat">Threat (alerts at once)</option>
            </select>
          </label>
          <label className="text-xs text-slate-300">
            Language
            <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as Term["language"] })} className="block mt-1 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm">
              {Object.entries(LANG_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={add.isPending || form.display.trim().length < 2} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-500 disabled:opacity-40">
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>
        <p className="mt-2 text-[11px] text-slate-500">Spelling tricks are handled automatically (sh!t, f.u.c.k, fuuuck). Use phrases for words with innocent meanings (e.g. “maar dunga”, not “maar”).</p>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-white mr-auto">Word list ({data?.terms.length ?? 0})</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search words" className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-xs" />
          </div>
          <select value={sev} onChange={(e) => setSev(e.target.value as Severity | "")} aria-label="Filter by severity" className="px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-xs">
            <option value="">All</option>
            <option value="mild">Mild</option>
            <option value="abusive">Abusive</option>
            <option value="threat">Threat</option>
          </select>
        </div>
        {isLoading ? (
          <p className="mt-3 text-sm text-slate-400">Loading…</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-800 border border-slate-800 rounded-lg max-h-[480px] overflow-y-auto">
            {terms.map((t) => (
              <li key={t._id} className={cn("flex flex-wrap items-center gap-2 px-3 py-2 text-sm", !t.active && "opacity-50")}>
                <span className="flex-1 min-w-[140px] text-slate-100">{t.display}</span>
                <span className="text-[11px] text-slate-500 w-16">{LANG_LABEL[t.language]}</span>
                <select value={t.severity} onChange={(e) => update.mutate({ id: t._id, body: { severity: e.target.value as Severity } })} aria-label={`Severity of ${t.display}`} className={cn("px-2 py-1 rounded-md border text-[11px] bg-transparent", SEVERITY_STYLE[t.severity])}>
                  <option value="mild">mild</option>
                  <option value="abusive">abusive</option>
                  <option value="threat">threat</option>
                </select>
                <label className="flex items-center gap-1 text-[11px] text-slate-400">
                  <input type="checkbox" checked={t.active} onChange={(e) => update.mutate({ id: t._id, body: { active: e.target.checked } })} className="accent-violet-500" /> on
                </label>
                <button type="button" onClick={() => confirm(`Remove "${t.display}"?`) && remove.mutate(t._id)} aria-label={`Remove ${t.display}`} className="text-slate-500 hover:text-rose-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
