"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, ShieldCheck, Clock, ChevronRight, Sparkles } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { fetchConversations } from "@/lib/api/chat.api";
import { contentApi, endsInLabel, type PublicCampaign } from "@/lib/api/content.api";
import { CampaignCarousel } from "@/components/customer/CampaignCarousel";
import { CatalogCard } from "@/components/customer/CatalogCard";
import { ConsultationDialog } from "@/components/customer/ConsultationDialog";
import { cn } from "@/lib/utils";
import { extrasApi } from "@/lib/api/projectExtras.api";
import { ProjectTimeline } from "@/components/customer/ProjectTimeline";
import { AlertsPrompt } from "@/components/customer/AlertsPrompt";
import { paymentsApi, inr } from "@/lib/api/payments.api";
import { IndianRupee, Gift } from "lucide-react";
import { BeforeAfter } from "@/components/customer/BeforeAfter";
import { Star, Quote, MapPin } from "lucide-react";

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-sm font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </h2>
  );
}

/** Customer portal home: campaigns, offers, services, products, and project chats. */
export default function CustomerHomePage() {
  const user = useAuthStore((s) => s.user);
  const [category, setCategory] = useState<string | null>(null);
  const [consultFor, setConsultFor] = useState<PublicCampaign | null>(null);

  const campaignsQ = useQuery({ queryKey: ["live-campaigns"], queryFn: contentApi.liveCampaigns, staleTime: 60_000 });
  const catalogQ = useQuery({ queryKey: ["catalog"], queryFn: () => contentApi.catalog(), staleTime: 5 * 60_000 });
  const convsQ = useQuery({ queryKey: ["customer-conversations"], queryFn: fetchConversations });
  const timelinesQ = useQuery({ queryKey: ["my-projects"], queryFn: extrasApi.myProjects });
  const testimonialsQ = useQuery({ queryKey: ["testimonials"], queryFn: extrasApi.testimonials, staleTime: 5 * 60_000 });
  const paymentsQ = useQuery({ queryKey: ["my-payments"], queryFn: paymentsApi.mine, staleTime: 60_000 });
  const nextPayment = (paymentsQ.data?.projects ?? [])
    .flatMap((p) => p.milestones.filter((m) => m.status === "upcoming" || m.status === "verifying").map((m) => ({ ...m, projectName: p.projectName })))
    .sort((a, b) => (a.dueDate ? +new Date(a.dueDate) : Infinity) - (b.dueDate ? +new Date(b.dueDate) : Infinity))[0];

  const hero = (campaignsQ.data ?? []).filter((c) => c.kind !== "offer");
  const offers = (campaignsQ.data ?? []).filter((c) => c.kind === "offer");
  const services = (catalogQ.data ?? []).filter((i) => i.kind === "service");
  const products = (catalogQ.data ?? []).filter((i) => i.kind === "product");
  const portfolio = (catalogQ.data ?? []).filter((i) => i.kind === "portfolio");
  const testimonials = testimonialsQ.data ?? [];
  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category))), [products]);
  const shownProducts = category ? products.filter((p) => p.category === category) : products;
  const projects = (convsQ.data ?? []).filter((c) => c.type === "group");
  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-6">
      <section className="space-y-1.5">
        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
          {greeting()}, {firstName}
        </h1>
        <p className="text-slate-400">Ideas, offers and your projects with Bonito.</p>
        {user?.phoneVerified && (
          <p className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Mobile number verified
          </p>
        )}
      </section>

      {/* Hero campaigns */}
      {campaignsQ.isLoading ? (
        <div className="aspect-[4/5] sm:aspect-[16/9] rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" aria-label="Loading offers" />
      ) : hero.length > 0 ? (
        <CampaignCarousel campaigns={hero} />
      ) : null}

      {/* Offers */}
      {offers.length > 0 && (
        <section aria-labelledby="offers-heading" className="space-y-3">
          <SectionTitle id="offers-heading">Current offers</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {offers.map((o) => {
              const ends = endsInLabel(o.endAt);
              return (
                <li key={o._id} className="flex flex-col rounded-2xl bg-gradient-to-br from-violet-600/20 to-slate-900 border border-violet-500/25 p-4 gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {o.offer?.badge && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 text-xs font-bold">{o.offer.badge}</span>
                    )}
                    {ends && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-200">
                        <Clock className="h-3 w-3" /> {ends}
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-white">{o.title}</h3>
                  {o.description && <p className="text-sm text-slate-300 line-clamp-3 whitespace-pre-line">{o.description}</p>}
                  {o.offer?.terms && <p className="text-[11px] text-slate-500">{o.offer.terms}</p>}
                  {o.cta.type === "consultation" && (
                    <button
                      type="button"
                      onClick={() => {
                        contentApi.recordEvent(o._id, "click");
                        setConsultFor(o);
                      }}
                      className="mt-auto self-start px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold"
                    >
                      {o.cta.label || "Book free consultation"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Your projects */}
      <section aria-labelledby="projects-heading" className="space-y-3">
        <SectionTitle id="projects-heading">Your projects</SectionTitle>
        <AlertsPrompt hasProjects={projects.length > 0} />
        {(paymentsQ.data?.projects.length ?? 0) > 0 && (
          <Link href="/home/payments" className={cn("flex items-center gap-3 p-4 rounded-2xl border transition", nextPayment?.overdue ? "bg-rose-500/10 border-rose-500/40" : "bg-slate-900 border-slate-800 hover:border-violet-500/50")}>
            <span className="h-10 w-10 rounded-xl bg-emerald-600/15 text-emerald-300 flex items-center justify-center shrink-0">
              <IndianRupee className="h-5 w-5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-white">Payments</span>
              <span className={cn("block text-xs truncate", nextPayment?.overdue ? "text-rose-200" : "text-slate-400")}>
                {nextPayment
                  ? nextPayment.status === "verifying"
                    ? `Checking your payment for ${nextPayment.title}`
                    : `Next: ${inr(nextPayment.amountPaise)} · ${nextPayment.title}${nextPayment.dueDate ? ` · ${nextPayment.overdue ? "was due" : "due"} ${new Date(nextPayment.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}`
                  : "All paid — receipts and invoices"}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-slate-500" />
          </Link>
        )}
        {convsQ.isLoading || timelinesQ.isLoading ? (
          <div className="h-20 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
        ) : timelinesQ.data && timelinesQ.data.length > 0 ? (
          <div className="space-y-3">
            {timelinesQ.data.map((p) => (
              <ProjectTimeline key={p._id} project={p} />
            ))}
          </div>
        ) : projects.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <li key={p._id}>
                <Link href={`/chat/${p._id}`} className="flex items-center gap-3 p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-violet-500/50 transition">
                  <span className="h-10 w-10 rounded-xl bg-violet-600/15 text-violet-300 flex items-center justify-center">
                    <MessageSquare className="h-5 w-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-white truncate">{p.name || "Project chat"}</span>
                    <span className="block text-xs text-slate-400">{p.members.length} people in this chat</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-500" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex gap-4">
            <span className="h-10 w-10 shrink-0 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center">
              <Clock className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <p className="font-semibold text-white">No project chat yet</p>
              <p className="text-sm text-slate-400">
                Once your consultation is booked, Bonito will add you to a project chat with your designer. You&apos;ll get a notification when it&apos;s ready.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Our work: finished projects with before/after */}
      {portfolio.length > 0 && (
        <section aria-labelledby="portfolio-heading" className="space-y-3">
          <SectionTitle id="portfolio-heading">Our work</SectionTitle>
          <ul className="grid gap-4 sm:grid-cols-2">
            {portfolio.map((w) => (
              <li key={w._id} className="rounded-2xl bg-slate-900 border border-slate-800 p-3 space-y-2">
                {w.beforeImage?.url && w.images[0] ? (
                  <BeforeAfter before={w.beforeImage.url} after={w.images[0].url} alt={w.name} />
                ) : w.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.images[0].url} alt={w.name} className="aspect-[4/3] w-full rounded-xl object-cover" />
                ) : null}
                <Link href={`/home/catalog/${w.slug}`} className="block group">
                  <span className="block font-semibold text-white group-hover:text-violet-200">{w.name}</span>
                  <span className="block text-xs text-slate-400">
                    {w.category}
                    {w.location && (
                      <span className="inline-flex items-center gap-0.5 ml-2">
                        <MapPin className="h-3 w-3" /> {w.location}
                      </span>
                    )}
                  </span>
                  {w.summary && <span className="block text-sm text-slate-300 mt-1 line-clamp-2">{w.summary}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {testimonials.length > 0 && (
        <section aria-labelledby="testimonials-heading" className="space-y-3">
          <SectionTitle id="testimonials-heading">What our customers say</SectionTitle>
          <ul className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1">
            {testimonials.map((t) => (
              <li key={t._id} className="snap-start shrink-0 w-[85%] sm:w-[48%] lg:w-[32%] rounded-2xl bg-slate-900 border border-slate-800 p-4 flex flex-col gap-3">
                <Quote className="h-5 w-5 text-violet-400" aria-hidden />
                <p className="text-sm text-slate-200 leading-relaxed flex-1">“{t.quote}”</p>
                {t.rating ? (
                  <span className="flex gap-0.5" aria-label={`${t.rating} out of 5 stars`}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} className={cn("h-3.5 w-3.5", i < t.rating! ? "fill-amber-400 text-amber-400" : "text-slate-600")} />
                    ))}
                  </span>
                ) : null}
                <div className="flex items-center gap-2">
                  {t.photo?.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.photo.url} alt="" className="h-9 w-9 rounded-full object-cover" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{t.customerName}</p>
                    <p className="text-[11px] text-slate-400 truncate">{[t.projectType, t.location].filter(Boolean).join(" · ")}</p>
                  </div>
                  {t.portfolioSlug && (
                    <Link href={`/home/catalog/${t.portfolioSlug}`} className="ml-auto text-[11px] text-violet-300 hover:underline shrink-0">
                      See project
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link href="/home/refer" className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 to-violet-600/10 border border-amber-500/25 hover:border-amber-400/50 transition">
        <Gift className="h-6 w-6 text-amber-300 shrink-0" aria-hidden />
        <span className="flex-1">
          <span className="block font-semibold text-white">Refer a friend</span>
          <span className="block text-xs text-slate-300">Share your code — you both get a reward when their project starts.</span>
        </span>
        <ChevronRight className="h-4 w-4 text-slate-500" />
      </Link>

      {/* Services */}
      {services.length > 0 && (
        <section aria-labelledby="services-heading" className="space-y-3">
          <SectionTitle id="services-heading">Our services</SectionTitle>
          <ul className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {services.map((s) => (
              <li key={s._id}>
                <CatalogCard item={s} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Products */}
      {products.length > 0 && (
        <section aria-labelledby="products-heading" className="space-y-3">
          <SectionTitle id="products-heading">Products</SectionTitle>
          {categories.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Filter by category">
              {[null, ...categories].map((c) => (
                <button
                  key={c ?? "all"}
                  type="button"
                  onClick={() => setCategory(c)}
                  aria-pressed={category === c}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition",
                    category === c ? "bg-violet-600 border-violet-600 text-white" : "border-slate-700 text-slate-300 hover:border-slate-500"
                  )}
                >
                  {c ?? "All"}
                </button>
              ))}
            </div>
          )}
          <ul className="grid gap-3 grid-cols-2 lg:grid-cols-3">
            {shownProducts.map((p) => (
              <li key={p._id}>
                <CatalogCard item={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Nothing published yet */}
      {!campaignsQ.isLoading && !catalogQ.isLoading && hero.length + offers.length + services.length + products.length + portfolio.length === 0 && (
        <div className="p-5 rounded-2xl border border-dashed border-slate-700 flex gap-4">
          <span className="h-10 w-10 shrink-0 rounded-xl bg-slate-800 text-amber-300 flex items-center justify-center">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <p className="font-semibold text-white">New offers are on the way</p>
            <p className="text-sm text-slate-400">Kitchen, wardrobe and full-home offers will appear here soon.</p>
          </div>
        </div>
      )}

      {consultFor && <ConsultationDialog campaign={consultFor} onClose={() => setConsultFor(null)} />}
    </div>
  );
}
