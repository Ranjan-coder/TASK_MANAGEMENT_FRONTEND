"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Quote, Plus, Pencil, Trash2, X, Star } from "lucide-react";
import { toast } from "sonner";
import { extrasApi, type AdminTestimonial } from "@/lib/api/projectExtras.api";
import { adminContentApi } from "@/lib/api/content.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { MediaUploader } from "@/components/admin/MediaUploader";
import { cn } from "@/lib/utils";

const input = "w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500";
const label = "block text-xs font-medium text-slate-300 mb-1";

interface Form {
  customerName: string;
  location: string;
  quote: string;
  rating: number | null;
  projectType: string;
  photo: { url: string; publicId: string } | null;
  portfolioItem: string;
  consentConfirmed: boolean;
  isPublished: boolean;
  order: number;
}

const empty = (): Form => ({ customerName: "", location: "", quote: "", rating: 5, projectType: "", photo: null, portfolioItem: "", consentConfirmed: false, isPublished: false, order: 0 });
const fromRow = (t: AdminTestimonial): Form => ({
  customerName: t.customerName,
  location: t.location,
  quote: t.quote,
  rating: t.rating,
  projectType: t.projectType,
  photo: t.photo?.url ? { url: t.photo.url, publicId: t.photo.publicId } : null,
  portfolioItem: t.portfolioItem?._id ?? "",
  consentConfirmed: t.consentConfirmed,
  isPublished: t.isPublished,
  order: t.order
});

/** Testimonials shown on the customer Home page (R6). */
export default function TestimonialsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-testimonials"], queryFn: extrasApi.adminTestimonials });
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => extrasApi.deleteTestimonial(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-testimonials"] });
      toast.success("Testimonial deleted");
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't delete"))
  });

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
          <Quote className="h-5 w-5 text-violet-300" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Testimonials</h1>
          <p className="text-sm text-slate-400">Shown on the customer Home page. Only publish quotes the customer agreed to share.</p>
        </div>
        <button onClick={() => setEditing({ id: null, form: empty() })} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-500">
          <Plus className="h-4 w-4" /> New testimonial
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : !data?.length ? (
        <p className="text-sm text-slate-400 border border-dashed border-slate-800 rounded-xl p-8 text-center">No testimonials yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((t) => (
            <li key={t._id} className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white flex-1 truncate">{t.customerName}</p>
                <span className={cn("px-2 py-0.5 rounded-full border text-[10px]", t.isPublished ? "border-emerald-500/40 text-emerald-200" : "border-slate-700 text-slate-400")}>{t.isPublished ? "Published" : "Hidden"}</span>
              </div>
              <p className="text-sm text-slate-300 line-clamp-3">“{t.quote}”</p>
              <p className="text-[11px] text-slate-500">
                {t.rating ? `${t.rating}★ · ` : ""}
                {[t.projectType, t.location].filter(Boolean).join(" · ")}
                {t.portfolioItem ? ` · linked to ${t.portfolioItem.name}` : ""}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setEditing({ id: t._id, form: fromRow(t) })} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                <button onClick={() => confirm(`Delete the testimonial from ${t.customerName}?`) && remove.mutate(t._id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && <Editor id={editing.id} initial={editing.form} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Editor({ id, initial, onClose }: { id: string | null; initial: Form; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(initial);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const portfolio = useQuery({ queryKey: ["admin-catalog"], queryFn: adminContentApi.catalog });
  const projects = (portfolio.data ?? []).filter((i) => i.kind === "portfolio");

  const save = useMutation({
    mutationFn: () =>
      extrasApi.saveTestimonial(id, { ...form, portfolioItem: form.portfolioItem || null, rating: form.rating || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-testimonials"] });
      toast.success("Testimonial saved");
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save"))
  });

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="t-title">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="w-full max-w-lg max-h-full sm:max-h-[92vh] overflow-y-auto bg-slate-900 sm:rounded-2xl border border-slate-700"
      >
        <div className="sticky top-0 flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900">
          <h2 id="t-title" className="text-lg font-semibold text-white">{id ? "Edit testimonial" : "New testimonial"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="t-name" className={label}>Customer name as shown</label>
              <input id="t-name" required minLength={2} maxLength={60} value={form.customerName} onChange={(e) => set("customerName", e.target.value)} className={input} placeholder="Anita R." />
            </div>
            <div>
              <label htmlFor="t-loc" className={label}>Area <span className="text-slate-500">(optional)</span></label>
              <input id="t-loc" maxLength={60} value={form.location} onChange={(e) => set("location", e.target.value)} className={input} placeholder="Whitefield" />
            </div>
          </div>
          <div>
            <label htmlFor="t-quote" className={label}>Quote</label>
            <textarea id="t-quote" required minLength={10} maxLength={600} rows={4} value={form.quote} onChange={(e) => set("quote", e.target.value)} className={input} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={label}>Rating</span>
              <div className="flex gap-1" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={form.rating === n} aria-label={`${n} stars`} onClick={() => set("rating", n)}>
                    <Star className={cn("h-6 w-6", (form.rating ?? 0) >= n ? "fill-amber-400 text-amber-400" : "text-slate-600")} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="t-type" className={label}>Project type <span className="text-slate-500">(optional)</span></label>
              <input id="t-type" maxLength={60} value={form.projectType} onChange={(e) => set("projectType", e.target.value)} className={input} placeholder="3BHK full home" />
            </div>
          </div>
          <div>
            <label htmlFor="t-portfolio" className={label}>Link to a portfolio project <span className="text-slate-500">(optional)</span></label>
            <select id="t-portfolio" value={form.portfolioItem} onChange={(e) => set("portfolioItem", e.target.value)} className={input}>
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <span className={label}>Photo <span className="text-slate-500">(optional)</span></span>
            {form.photo ? (
              <div className="relative h-16 w-16 rounded-full overflow-hidden bg-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.photo.url} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => set("photo", null)} aria-label="Remove photo" className="absolute inset-0 bg-black/50 text-white opacity-0 hover:opacity-100 flex items-center justify-center"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <MediaUploader purpose="catalog" accept="image" label="Add photo" onUploaded={(m) => set("photo", { url: m.url, publicId: m.publicId })} />
            )}
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={form.consentConfirmed} onChange={(e) => set("consentConfirmed", e.target.checked)} className="mt-1 accent-violet-500" required />
            The customer agreed to Bonito showing this quote{form.photo ? " and photo" : ""} to other customers.
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={form.isPublished} onChange={(e) => set("isPublished", e.target.checked)} className="accent-violet-500" />
            Show on the customer Home page
          </label>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 px-5 py-3 border-t border-slate-800 bg-slate-900">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-200">Cancel</button>
          <button type="submit" disabled={save.isPending || !form.consentConfirmed} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40">
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
