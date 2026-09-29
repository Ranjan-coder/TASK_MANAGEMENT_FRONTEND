import apiClient from "./client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CampaignKind = "video" | "image" | "offer";
export type CtaType = "none" | "consultation" | "call" | "whatsapp" | "link";
export type CampaignStatus = "draft" | "published" | "archived";
// Computed by the server: a published campaign is scheduled, live or expired
export type CampaignState = "draft" | "archived" | "scheduled" | "live" | "expired";

export interface MediaAsset {
  url: string;
  publicId: string;
  resourceType: "image" | "video";
  posterUrl?: string | null;
  width?: number;
  height?: number;
  duration?: number;
  bytes?: number;
}

export interface CampaignCta {
  type: CtaType;
  label: string;
  value: string;
}

/** What customers receive. */
export interface PublicCampaign {
  _id: string;
  title: string;
  description: string;
  kind: CampaignKind;
  media: Pick<MediaAsset, "url" | "resourceType" | "posterUrl" | "width" | "height"> | null;
  offer: { badge?: string; terms?: string } | null;
  cta: CampaignCta;
  startAt: string;
  endAt: string | null;
}

export interface AdminCampaign extends Omit<PublicCampaign, "media"> {
  media?: MediaAsset | null;
  priority: number;
  status: CampaignStatus;
  state: CampaignState;
  targetCities: string[];
  stats: { impressions: number; clicks: number; leads: number };
  createdAt: string;
  updatedAt: string;
}

export interface CampaignInput {
  title: string;
  description: string;
  kind: CampaignKind;
  media: MediaAsset | null;
  offer: { badge: string; terms: string } | null;
  cta: CampaignCta;
  startAt: string;
  endAt: string | null;
  priority: number;
  status: CampaignStatus;
  targetCities: string[];
}

export interface Lead {
  _id: string;
  customer: { _id: string; name: string; email: string; phone?: string } | null;
  message: string;
  status: "new" | "contacted" | "converted" | "closed";
  createdAt: string;
}

export interface CatalogImage {
  url: string;
  publicId?: string;
  width?: number;
  height?: number;
}

export interface CatalogItem {
  _id: string;
  kind: "product" | "service" | "portfolio";
  category: string;
  name: string;
  slug: string;
  summary: string;
  description: string;
  images: CatalogImage[];
  startingPrice: number | null;
  priceUnit: string;
  features: string[];
  featured: boolean;
  /** Portfolio projects: where it is, and the "before" photo (images are the "after" photos) */
  location?: string;
  beforeImage?: (CatalogImage & { publicId?: string }) | null;
  order?: number;
  isPublished?: boolean;
}

export type CatalogInput = Omit<CatalogItem, "_id" | "slug" | "images" | "order" | "isPublished" | "beforeImage"> & {
  images: { url: string; publicId: string; width?: number; height?: number }[];
  beforeImage?: { url: string; publicId: string; width?: number; height?: number } | null;
  order: number;
  isPublished: boolean;
};

// ── Customer ──────────────────────────────────────────────────────────────────

export const contentApi = {
  liveCampaigns: () => apiClient.get<{ data: PublicCampaign[] }>("/campaigns/live").then((r) => r.data.data),

  recordEvent: (id: string, type: "impression" | "click") =>
    apiClient.post(`/campaigns/${id}/events`, { type }).catch(() => undefined), // never disturb the page

  requestConsultation: (id: string, message: string) =>
    apiClient
      .post<{ data: { alreadyRequested: boolean }; message: string }>(`/campaigns/${id}/lead`, { message })
      .then((r) => r.data),

  catalog: (params: { kind?: "product" | "service" | "portfolio"; category?: string } = {}) =>
    apiClient.get<{ data: CatalogItem[] }>("/catalog", { params }).then((r) => r.data.data),

  catalogItem: (slug: string) => apiClient.get<{ data: CatalogItem }>(`/catalog/${slug}`).then((r) => r.data.data)
};

// ── Content manager ───────────────────────────────────────────────────────────

export const adminContentApi = {
  uploadMedia: (file: File, purpose: "campaign" | "catalog", onProgress?: (pct: number) => void) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient
      .post<{ data: MediaAsset }>(`/admin/media?purpose=${purpose}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 5 * 60 * 1000,
        onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100))
      })
      .then((r) => r.data.data);
  },

  campaigns: () => apiClient.get<{ data: AdminCampaign[] }>("/admin/campaigns").then((r) => r.data.data),
  createCampaign: (body: CampaignInput) =>
    apiClient.post<{ data: AdminCampaign }>("/admin/campaigns", body).then((r) => r.data.data),
  updateCampaign: (id: string, body: CampaignInput) =>
    apiClient.put<{ data: AdminCampaign }>(`/admin/campaigns/${id}`, body).then((r) => r.data.data),
  deleteCampaign: (id: string) => apiClient.delete(`/admin/campaigns/${id}`),
  campaignLeads: (id: string) => apiClient.get<{ data: Lead[] }>(`/admin/campaigns/${id}/leads`).then((r) => r.data.data),

  catalog: () => apiClient.get<{ data: CatalogItem[] }>("/admin/catalog").then((r) => r.data.data),
  createCatalogItem: (body: CatalogInput) =>
    apiClient.post<{ data: CatalogItem }>("/admin/catalog", body).then((r) => r.data.data),
  updateCatalogItem: (id: string, body: CatalogInput) =>
    apiClient.put<{ data: CatalogItem }>(`/admin/catalog/${id}`, body).then((r) => r.data.data),
  deleteCatalogItem: (id: string) => apiClient.delete(`/admin/catalog/${id}`)
};

// ── Display helpers ───────────────────────────────────────────────────────────

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function formatPrice(amount: number | null | undefined, unit?: string): string | null {
  if (amount === null || amount === undefined) return null;
  return `From ${inr.format(amount)}${unit ? ` ${unit}` : ""}`;
}

/** "Ends today", "Ends tomorrow", "Ends in 3 days" — or null if no end date / far away. */
export function endsInLabel(endAt: string | null): string | null {
  if (!endAt) return null;
  const ms = new Date(endAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "Ends today";
  if (days === 1) return "Ends tomorrow";
  if (days <= 14) return `Ends in ${days} days`;
  return null;
}

/** Safe href for a call-to-action (server already normalised the value). */
export function ctaHref(cta: CampaignCta): string | null {
  switch (cta.type) {
    case "call":
      return `tel:${cta.value}`;
    case "whatsapp":
      return `https://wa.me/${cta.value.replace(/\D/g, "")}?text=${encodeURIComponent("Hi Bonito, I'd like to know more about your offer.")}`;
    case "link":
      return cta.value.startsWith("https://") ? cta.value : null;
    default:
      return null;
  }
}

export function ctaDefaultLabel(type: CtaType): string {
  return (
    { none: "", consultation: "Book free consultation", call: "Call us", whatsapp: "Chat on WhatsApp", link: "Learn more" } as Record<
      CtaType,
      string
    >
  )[type];
}

export const CATALOG_CATEGORIES = [
  "Modular Kitchen",
  "Wardrobes",
  "Living Room",
  "Bedroom",
  "Full Home Interiors",
  "Renovation",
  "Furniture",
  "Lighting",
  "Decor",
  "Consultation"
];
