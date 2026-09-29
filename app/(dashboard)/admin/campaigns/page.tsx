"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Users as UsersIcon, X, Film, Image as ImageIcon, Tag, Eye, MousePointerClick, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import {
  adminContentApi,
  ctaDefaultLabel,
  type AdminCampaign,
  type CampaignInput,
  type CampaignKind,
  type CampaignState,
  type CtaType
} from "@/lib/api/content.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { MediaUploader } from "@/components/admin/MediaUploader";
import { CampaignSlide } from "@/components/customer/CampaignSlide";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATE_STYLE: Record<CampaignState, string> = {
  live: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  scheduled: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  draft: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  expired: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  archived: "bg-slate-800 text-slate-500 border-slate-700"
};
const STATE_LABEL: Record<CampaignState, string> = {
  live: "Live",
  scheduled: "Scheduled",
  draft: "Draft",
  expired: "Expired",
  archived: "Archived"
};

const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "No end date";

const emptyCampaign = (): CampaignInput => ({
  title: "",
  description: "",
  kind: "image",
  media: null,
  offer: null,
  cta: { type: "consultation", label: "", value: "" },
  startAt: new Date().toISOString(),
  endAt: null,
  priority: 50,
  status: "draft",
  targetCities: []
});

const toInput = (c: AdminCampaign): CampaignInput => ({
  title: c.title,
  description: c.description,
  kind: c.kind,
  media: c.media ?? null,
  offer: c.offer ? { badge: c.offer.badge ?? "", terms: c.offer.terms ?? "" } : null,
  cta: c.cta,
  startAt: c.startAt,
  endAt: c.endAt,
  priority: c.priority,
  status: c.status,
  targetCities: c.targetCities
});

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500";
const labelClass = "block text-xs font-medium text-slate-300 mb-1";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CampaignsAdminPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ id: string | null; input: CampaignInput } | null>(null);
  const [leadsFor, setLeadsFor] = useState<AdminCampaign | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminCampaign | null>(null);

  const { data: campaigns, isLoading } = useQuery({ queryKey: ["admin-campaigns"], queryFn: adminContentApi.campaigns });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminContentApi.deleteCampaign(id),
    onSuccess: () => {
      toast.success("Campaign deleted");
      setConfirmDelete(null);
      queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't delete"))
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Campaigns &amp; offers</h1>
          <p className="text-sm text-slate-400">What customers see on their Home page. Published items go live on their start date.</p>
        </div>
        <button
          onClick={() => setEditing({ id: null, input: emptyCampaign() })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold"
        >
          <Plus className="h-4 w-4" /> New campaign
        </button>
      </div>

      {isLoading ? (
        <div className="h-40 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
      ) : !campaigns || campaigns.length === 0 ? (
        <div className="p-8 rounded-2xl border border-dashed border-slate-700 text-center space-y-2">
          <p className="text-white font-semibold">No campaigns yet</p>
          <p className="text-sm text-slate-400">Create your first offer, video or poster for customers.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {campaigns.map((c) => {
            const ctr = c.stats.impressions ? Math.round((c.stats.clicks / c.stats.impressions) * 100) : 0;
            const thumb = c.media?.resourceType === "video" ? c.media.posterUrl : c.media?.url;
            return (
              <li key={c._id} className="flex flex-col sm:flex-row gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="w-full sm:w-40 aspect-video rounded-xl overflow-hidden bg-slate-800 shrink-0 flex items-center justify-center text-slate-500">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Tag className="h-6 w-6" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded-full border text-[11px] font-semibold", STATE_STYLE[c.state])}>{STATE_LABEL[c.state]}</span>
                    <span className="text-[11px] text-slate-500 capitalize">{c.kind === "image" ? "Image / poster" : c.kind}</span>
                    <span className="text-[11px] text-slate-500">Priority {c.priority}</span>
                  </div>
                  <p className="font-semibold text-white truncate">{c.title}</p>
                  <p className="text-xs text-slate-400">
                    {fmtDate(c.startAt)} → {fmtDate(c.endAt)}
                    {c.targetCities.length > 0 && ` · ${c.targetCities.join(", ")}`}
                  </p>
                  <div className="flex flex-wrap gap-4 text-xs text-slate-300 pt-1">
                    <span className="inline-flex items-center gap-1" title="Customers who saw it (once per day)"><Eye className="h-3.5 w-3.5 text-slate-500" /> {c.stats.impressions} views</span>
                    <span className="inline-flex items-center gap-1"><MousePointerClick className="h-3.5 w-3.5 text-slate-500" /> {c.stats.clicks} clicks ({ctr}%)</span>
                    <span className="inline-flex items-center gap-1"><PhoneCall className="h-3.5 w-3.5 text-slate-500" /> {c.stats.leads} consultation requests</span>
                  </div>
                </div>
                <div className="flex sm:flex-col gap-2 shrink-0">
                  <button onClick={() => setEditing({ id: c._id, input: toInput(c) })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200 text-xs hover:border-slate-500">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  {c.cta.type === "consultation" && (
                    <button onClick={() => setLeadsFor(c)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200 text-xs hover:border-slate-500">
                      <UsersIcon className="h-3.5 w-3.5" /> Requests
                    </button>
                  )}
                  <button onClick={() => setConfirmDelete(c)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-300 text-xs hover:bg-rose-500/10">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <CampaignEditor
          id={editing.id}
          initial={editing.input}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });
          }}
        />
      )}
      {leadsFor && <LeadsDrawer campaign={leadsFor} onClose={() => setLeadsFor(null)} />}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-4">
            <p className="text-white font-semibold">Delete “{confirmDelete.title}”?</p>
            <p className="text-sm text-slate-400">Its media and statistics are removed. To just hide it, edit it and set the status to Archived.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800">Cancel</button>
              <button onClick={() => deleteMutation.mutate(confirmDelete._id)} disabled={deleteMutation.isPending} className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────────

const KINDS: { value: CampaignKind; label: string; icon: typeof Film }[] = [
  { value: "video", label: "Video", icon: Film },
  { value: "image", label: "Image / poster", icon: ImageIcon },
  { value: "offer", label: "Offer card", icon: Tag }
];

function CampaignEditor({ id, initial, onClose, onSaved }: { id: string | null; initial: CampaignInput; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CampaignInput>(initial);
  const [citiesText, setCitiesText] = useState(initial.targetCities.join(", "));
  const set = <K extends keyof CampaignInput>(key: K, value: CampaignInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const body: CampaignInput = {
        ...form,
        offer: form.offer && (form.offer.badge || form.offer.terms) ? form.offer : null,
        targetCities: citiesText.split(",").map((c) => c.trim()).filter(Boolean)
      };
      return id ? adminContentApi.updateCampaign(id, body) : adminContentApi.createCampaign(body);
    },
    onSuccess: (c) => {
      toast.success(c.state === "live" ? "Saved — it's live now" : "Saved");
      onSaved();
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save the campaign"))
  });

  const mediaAccept = form.kind === "video" ? "video" : "image";
  const needsValue = form.cta.type === "call" || form.cta.type === "whatsapp" || form.cta.type === "link";

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="campaign-editor-title">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="w-full max-w-5xl max-h-full sm:max-h-[92vh] overflow-y-auto bg-slate-900 sm:rounded-2xl border border-slate-700 shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900">
          <h2 id="campaign-editor-title" className="text-lg font-semibold text-white">{id ? "Edit campaign" : "New campaign"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <fieldset>
              <legend className={labelClass}>Type</legend>
              <div className="grid grid-cols-3 gap-2">
                {KINDS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, kind: value, media: f.media && (value === "video") === (f.media.resourceType === "video") ? f.media : null }))}
                    aria-pressed={form.kind === value}
                    className={cn("flex flex-col items-center gap-1 py-2.5 rounded-lg border text-xs font-medium", form.kind === value ? "border-violet-500 bg-violet-500/15 text-violet-200" : "border-slate-700 text-slate-400")}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <span className={labelClass}>{form.kind === "video" ? "Video" : form.kind === "offer" ? "Image (optional)" : "Image or poster"}</span>
              {form.media ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2">
                  <p className="text-xs text-slate-300 truncate">
                    {form.media.resourceType === "video" ? `Video · ${Math.round(form.media.duration ?? 0)} s` : `Image · ${form.media.width}×${form.media.height}`}
                  </p>
                  <button type="button" onClick={() => set("media", null)} className="text-xs text-rose-300 hover:text-rose-200">Remove</button>
                </div>
              ) : (
                <MediaUploader purpose="campaign" accept={mediaAccept} onUploaded={(m) => set("media", m)} />
              )}
            </div>

            <div>
              <label htmlFor="c-title" className={labelClass}>Title</label>
              <input id="c-title" required minLength={3} maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)} className={inputClass} placeholder="Monsoon modular kitchen offer" />
            </div>
            <div>
              <label htmlFor="c-desc" className={labelClass}>Description</label>
              <textarea id="c-desc" rows={3} maxLength={1000} value={form.description} onChange={(e) => set("description", e.target.value)} className={inputClass} placeholder="One or two short lines customers will read over the image." />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="c-badge" className={labelClass}>Offer badge <span className="text-slate-500">(optional)</span></label>
                <input id="c-badge" maxLength={30} value={form.offer?.badge ?? ""} onChange={(e) => set("offer", { badge: e.target.value, terms: form.offer?.terms ?? "" })} className={inputClass} placeholder="Flat 20% off" />
              </div>
              <div>
                <label htmlFor="c-terms" className={labelClass}>Terms <span className="text-slate-500">(optional)</span></label>
                <input id="c-terms" maxLength={500} value={form.offer?.terms ?? ""} onChange={(e) => set("offer", { badge: form.offer?.badge ?? "", terms: e.target.value })} className={inputClass} placeholder="On orders above ₹3 lakh. T&C apply." />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="c-cta" className={labelClass}>Button</label>
                <select id="c-cta" value={form.cta.type} onChange={(e) => set("cta", { type: e.target.value as CtaType, label: "", value: "" })} className={inputClass}>
                  <option value="consultation">Book free consultation</option>
                  <option value="whatsapp">Chat on WhatsApp</option>
                  <option value="call">Call us</option>
                  <option value="link">Open a link</option>
                  <option value="none">No button</option>
                </select>
              </div>
              {form.cta.type !== "none" && (
                <div>
                  <label htmlFor="c-cta-label" className={labelClass}>Button text</label>
                  <input id="c-cta-label" maxLength={30} value={form.cta.label} onChange={(e) => set("cta", { ...form.cta, label: e.target.value })} className={inputClass} placeholder={ctaDefaultLabel(form.cta.type)} />
                </div>
              )}
              {needsValue && (
                <div>
                  <label htmlFor="c-cta-value" className={labelClass}>{form.cta.type === "link" ? "Link (https://)" : "Phone number"}</label>
                  <input id="c-cta-value" required value={form.cta.value} onChange={(e) => set("cta", { ...form.cta, value: e.target.value })} className={inputClass} placeholder={form.cta.type === "link" ? "https://bonito.in/offers" : "98765 43210"} />
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="c-start" className={labelClass}>Starts</label>
                <input id="c-start" type="datetime-local" required value={toLocalInput(form.startAt)} onChange={(e) => set("startAt", fromLocalInput(e.target.value) ?? form.startAt)} className={inputClass} />
              </div>
              <div>
                <label htmlFor="c-end" className={labelClass}>Ends <span className="text-slate-500">(optional)</span></label>
                <input id="c-end" type="datetime-local" value={toLocalInput(form.endAt)} onChange={(e) => set("endAt", fromLocalInput(e.target.value))} className={inputClass} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="c-status" className={labelClass}>Status</label>
                <select id="c-status" value={form.status} onChange={(e) => set("status", e.target.value as CampaignInput["status"])} className={inputClass}>
                  <option value="draft">Draft (hidden)</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <label htmlFor="c-priority" className={labelClass}>Order ({form.priority})</label>
                <input id="c-priority" type="range" min={0} max={100} value={form.priority} onChange={(e) => set("priority", Number(e.target.value))} className="w-full accent-violet-500 mt-2" />
                <p className="text-[10px] text-slate-500">Higher shows first</p>
              </div>
              <div>
                <label htmlFor="c-cities" className={labelClass}>Cities <span className="text-slate-500">(optional)</span></label>
                <input id="c-cities" value={citiesText} onChange={(e) => setCitiesText(e.target.value)} className={inputClass} placeholder="Leave empty for everyone" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className={labelClass}>Preview</p>
            <CampaignSlide campaign={{ ...form, media: form.media, offer: form.offer }} active />
            <p className="text-[11px] text-slate-500">This is how it looks on a customer&apos;s Home page.</p>
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 px-5 py-3 border-t border-slate-800 bg-slate-900">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800">Cancel</button>
          <button type="submit" disabled={save.isPending} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-semibold">
            {save.isPending ? "Saving..." : form.status === "published" ? "Save & publish" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Consultation requests ─────────────────────────────────────────────────────

function LeadsDrawer({ campaign, onClose }: { campaign: AdminCampaign; onClose: () => void }) {
  const { data: leads, isLoading } = useQuery({
    queryKey: ["campaign-leads", campaign._id],
    queryFn: () => adminContentApi.campaignLeads(campaign._id)
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-labelledby="leads-title">
      <div className="w-full max-w-md h-full overflow-y-auto bg-slate-900 border-l border-slate-700 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="leads-title" className="text-lg font-semibold text-white">Consultation requests</h2>
            <p className="text-xs text-slate-400">{campaign.title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        {isLoading ? (
          <div className="h-24 rounded-xl bg-slate-800 animate-pulse" />
        ) : !leads || leads.length === 0 ? (
          <p className="text-sm text-slate-400">No requests yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {leads.map((l) => (
              <li key={l._id} className="p-3 rounded-xl border border-slate-800 bg-slate-950/50 space-y-1">
                <p className="text-sm font-semibold text-white">{l.customer?.name ?? "Deleted account"}</p>
                {l.customer?.phone && <p className="text-xs text-slate-300 select-all">{l.customer.phone}</p>}
                {l.customer?.email && <p className="text-xs text-slate-400 select-all">{l.customer.email}</p>}
                {l.message && <p className="text-xs text-slate-300 whitespace-pre-line">“{l.message}”</p>}
                <p className="text-[10px] text-slate-500">{new Date(l.createdAt).toLocaleString("en-IN")}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
