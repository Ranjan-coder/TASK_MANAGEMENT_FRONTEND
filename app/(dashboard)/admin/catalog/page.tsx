"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, ImageIcon, Star, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import {
  adminContentApi,
  formatPrice,
  CATALOG_CATEGORIES,
  type CatalogInput,
  type CatalogItem
} from "@/lib/api/content.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { MediaUploader } from "@/components/admin/MediaUploader";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500";
const labelClass = "block text-xs font-medium text-slate-300 mb-1";

const emptyItem = (): CatalogInput => ({
  kind: "service",
  category: "",
  name: "",
  summary: "",
  description: "",
  images: [],
  startingPrice: null,
  priceUnit: "",
  features: [],
  location: "",
  beforeImage: null,
  order: 0,
  featured: false,
  isPublished: false
});

const toInput = (i: CatalogItem): CatalogInput => ({
  kind: i.kind,
  category: i.category,
  name: i.name,
  summary: i.summary,
  description: i.description,
  images: i.images.map((img) => ({ url: img.url, publicId: img.publicId as string, width: img.width, height: img.height })),
  startingPrice: i.startingPrice,
  priceUnit: i.priceUnit,
  features: i.features,
  location: i.location ?? "",
  beforeImage: i.beforeImage?.url ? { url: i.beforeImage.url, publicId: i.beforeImage.publicId as string, width: i.beforeImage.width, height: i.beforeImage.height } : null,
  order: i.order ?? 0,
  featured: i.featured,
  isPublished: Boolean(i.isPublished)
});

export default function CatalogAdminPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ id: string | null; input: CatalogInput } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CatalogItem | null>(null);
  const { data: items, isLoading } = useQuery({ queryKey: ["admin-catalog"], queryFn: adminContentApi.catalog });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-catalog"] });

  const togglePublish = useMutation({
    mutationFn: (i: CatalogItem) => adminContentApi.updateCatalogItem(i._id, { ...toInput(i), isPublished: !i.isPublished }),
    onSuccess: (i) => {
      toast.success(i.isPublished ? "Published — customers can see it" : "Hidden from customers");
      refresh();
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't update"))
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminContentApi.deleteCatalogItem(id),
    onSuccess: () => {
      toast.success("Item deleted");
      setConfirmDelete(null);
      refresh();
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't delete"))
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Products &amp; services</h1>
          <p className="text-sm text-slate-400">The catalog customers browse on their Home page.</p>
        </div>
        <button onClick={() => setEditing({ id: null, input: emptyItem() })} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold">
          <Plus className="h-4 w-4" /> New item
        </button>
      </div>

      {isLoading ? (
        <div className="h-40 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
      ) : !items || items.length === 0 ? (
        <div className="p-8 rounded-2xl border border-dashed border-slate-700 text-center space-y-2">
          <p className="text-white font-semibold">Your catalog is empty</p>
          <p className="text-sm text-slate-400">Add services like “Modular kitchen” or products like “Sliding wardrobe”.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <li key={i._id} className="flex flex-col rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
              <div className="relative aspect-[4/3] bg-slate-800 flex items-center justify-center text-slate-600">
                {i.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.images[0].url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-8 w-8" />
                )}
                <span className={cn("absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold", i.isPublished ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200")}>
                  {i.isPublished ? "Published" : "Hidden"}
                </span>
                {i.featured && <Star className="absolute top-2 right-2 h-4 w-4 text-amber-400 fill-amber-400" aria-label="Featured" />}
              </div>
              <div className="p-3.5 space-y-1 flex-1">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">{i.kind} · {i.category}</p>
                <p className="font-semibold text-white">{i.name}</p>
                <p className="text-xs text-emerald-400">{formatPrice(i.startingPrice, i.priceUnit) ?? "No price shown"}</p>
              </div>
              <div className="flex gap-2 p-3 pt-0">
                <button onClick={() => setEditing({ id: i._id, input: toInput(i) })} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-200 text-xs"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                <button onClick={() => togglePublish.mutate(i)} disabled={togglePublish.isPending} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-200 text-xs">
                  {i.isPublished ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {i.isPublished ? "Hide" : "Publish"}
                </button>
                <button onClick={() => setConfirmDelete(i)} aria-label={`Delete ${i.name}`} className="ml-auto inline-flex items-center px-2.5 py-1.5 rounded-lg border border-rose-500/30 text-rose-300 text-xs"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <CatalogEditor
          id={editing.id}
          initial={editing.input}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-4">
            <p className="text-white font-semibold">Delete “{confirmDelete.name}”?</p>
            <p className="text-sm text-slate-400">Its images are removed too. To just hide it from customers, use Hide instead.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800">Cancel</button>
              <button onClick={() => remove.mutate(confirmDelete._id)} disabled={remove.isPending} className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogEditor({ id, initial, onClose, onSaved }: { id: string | null; initial: CatalogInput; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CatalogInput>(initial);
  const [featuresText, setFeaturesText] = useState(initial.features.join("\n"));
  const [priceText, setPriceText] = useState(initial.startingPrice?.toString() ?? "");
  const set = <K extends keyof CatalogInput>(key: K, value: CatalogInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const price = priceText.replace(/[^\d]/g, "");
      const body: CatalogInput = {
        ...form,
        startingPrice: price ? Number(price) : null,
        features: featuresText.split("\n").map((f) => f.trim()).filter(Boolean).slice(0, 12)
      };
      return id ? adminContentApi.updateCatalogItem(id, body) : adminContentApi.createCatalogItem(body);
    },
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save"))
  });

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="catalog-editor-title">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="w-full max-w-2xl max-h-full sm:max-h-[92vh] overflow-y-auto bg-slate-900 sm:rounded-2xl border border-slate-700 shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900">
          <h2 id="catalog-editor-title" className="text-lg font-semibold text-white">{id ? "Edit item" : "New item"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="i-kind" className={labelClass}>Type</label>
              <select id="i-kind" value={form.kind} onChange={(e) => set("kind", e.target.value as CatalogInput["kind"])} className={inputClass}>
                <option value="service">Service</option>
                <option value="product">Product</option>
                <option value="portfolio">Portfolio (finished project)</option>
              </select>
            </div>
            <div>
              <label htmlFor="i-category" className={labelClass}>Category</label>
              <input id="i-category" required list="catalog-categories" maxLength={50} value={form.category} onChange={(e) => set("category", e.target.value)} className={inputClass} placeholder="Modular Kitchen" />
              <datalist id="catalog-categories">
                {CATALOG_CATEGORIES.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          <div>
            <label htmlFor="i-name" className={labelClass}>Name</label>
            <input id="i-name" required minLength={2} maxLength={120} value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} placeholder="L-shaped modular kitchen" />
          </div>
          <div>
            <label htmlFor="i-summary" className={labelClass}>Short summary</label>
            <input id="i-summary" maxLength={200} value={form.summary} onChange={(e) => set("summary", e.target.value)} className={inputClass} placeholder="Soft-close drawers, quartz top, 10-year warranty" />
          </div>
          <div>
            <label htmlFor="i-desc" className={labelClass}>Description</label>
            <textarea id="i-desc" rows={4} maxLength={3000} value={form.description} onChange={(e) => set("description", e.target.value)} className={inputClass} />
          </div>

          <div>
            {form.kind === "portfolio" && (
              <div className="mb-3 space-y-3">
                <div>
                  <label htmlFor="i-location" className={labelClass}>Location <span className="text-slate-500">(e.g. Whitefield, Bengaluru — no house numbers)</span></label>
                  <input id="i-location" maxLength={60} value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <span className={labelClass}>“Before” photo <span className="text-slate-500">(optional — shows a before/after slider with the cover photo)</span></span>
                  {form.beforeImage ? (
                    <div className="relative w-32 aspect-square rounded-lg overflow-hidden bg-slate-800">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={form.beforeImage.url} alt="Before" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => set("beforeImage", null)} aria-label="Remove before photo" className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/70 text-white flex items-center justify-center">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <MediaUploader purpose="catalog" accept="image" label="Add before photo" onUploaded={(m) => set("beforeImage", { url: m.url, publicId: m.publicId, width: m.width, height: m.height })} />
                  )}
                </div>
              </div>
            )}
            <span className={labelClass}>{form.kind === "portfolio" ? "“After” photos" : "Images"} ({form.images.length}/8) · the first one is the cover</span>
            {form.images.length > 0 && (
              <ul className="grid grid-cols-4 gap-2 mb-2">
                {form.images.map((img, idx) => (
                  <li key={img.publicId} className="relative aspect-square rounded-lg overflow-hidden bg-slate-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => set("images", form.images.filter((_, i) => i !== idx))}
                      aria-label={`Remove image ${idx + 1}`}
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/70 text-white flex items-center justify-center"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {form.images.length < 8 && (
              <MediaUploader
                purpose="catalog"
                accept="image"
                label="Add image"
                onUploaded={(m) => setForm((f) => ({ ...f, images: [...f.images, { url: m.url, publicId: m.publicId, width: m.width, height: m.height }] }))}
              />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="i-price" className={labelClass}>Starting price (₹) <span className="text-slate-500">(optional)</span></label>
              <input id="i-price" inputMode="numeric" value={priceText} onChange={(e) => setPriceText(e.target.value)} className={inputClass} placeholder="150000" />
            </div>
            <div>
              <label htmlFor="i-unit" className={labelClass}>Price note</label>
              <input id="i-unit" maxLength={30} value={form.priceUnit} onChange={(e) => set("priceUnit", e.target.value)} className={inputClass} placeholder="onwards / per sq ft" />
            </div>
          </div>

          <div>
            <label htmlFor="i-features" className={labelClass}>Highlights (one per line, up to 12)</label>
            <textarea id="i-features" rows={4} value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} className={inputClass} placeholder={"Soft-close hinges\nAnti-bacterial laminate\nFree 3D design"} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3 items-end">
            <div>
              <label htmlFor="i-order" className={labelClass}>Sort order</label>
              <input id="i-order" type="number" min={0} max={10000} value={form.order} onChange={(e) => set("order", Number(e.target.value) || 0)} className={inputClass} />
            </div>
            <label htmlFor="i-featured" className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer pb-2">
              <input id="i-featured" type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} className="h-4 w-4 accent-violet-600" /> Mark as popular
            </label>
            <label htmlFor="i-published" className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer pb-2">
              <input id="i-published" type="checkbox" checked={form.isPublished} onChange={(e) => set("isPublished", e.target.checked)} className="h-4 w-4 accent-violet-600" /> Show to customers
            </label>
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 px-5 py-3 border-t border-slate-800 bg-slate-900">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800">Cancel</button>
          <button type="submit" disabled={save.isPending} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-semibold">
            {save.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
