"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ImageIcon, MessageSquare, MapPin } from "lucide-react";
import { BeforeAfter } from "@/components/customer/BeforeAfter";
import { contentApi, formatPrice } from "@/lib/api/content.api";
import { cn, sizedImage } from "@/lib/utils";

/** Product / service detail for customers. */
export default function CatalogItemPage() {
  const { slug } = useParams<{ slug: string }>();
  const [active, setActive] = useState(0);
  const { data: item, isLoading, isError } = useQuery({
    queryKey: ["catalog-item", slug],
    queryFn: () => contentApi.catalogItem(slug),
    retry: false
  });

  if (isLoading) {
    return <div className="max-w-4xl mx-auto h-96 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />;
  }
  if (isError || !item) {
    return (
      <div className="max-w-md mx-auto text-center space-y-3 py-16">
        <p className="text-white font-semibold">This item isn&apos;t available any more.</p>
        <Link href="/home" className="text-violet-400 hover:text-violet-300 text-sm">Back to Home</Link>
      </div>
    );
  }

  const price = formatPrice(item.startingPrice, item.priceUnit);
  const image = item.images[active];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-6">
      <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          {item.kind === "portfolio" && item.beforeImage?.url && image && (
            <BeforeAfter before={item.beforeImage.url} after={image.url} alt={item.name} />
          )}
          <div className={cn("aspect-[4/3] rounded-2xl overflow-hidden bg-slate-800", item.kind === "portfolio" && item.beforeImage?.url && image && "hidden")}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sizedImage(image.url, 900)} decoding="async" alt={item.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-slate-600">
                <ImageIcon className="h-10 w-10" />
              </div>
            )}
          </div>
          {item.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {item.images.map((img, i) => (
                <button
                  key={img.url}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Show image ${i + 1}`}
                  aria-current={i === active}
                  className={cn("h-16 w-20 shrink-0 rounded-lg overflow-hidden border-2", i === active ? "border-violet-500" : "border-transparent opacity-70")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sizedImage(img.url, 160)} loading="lazy" decoding="async" alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-violet-300/80 font-semibold">
              {item.kind === "service" ? "Service" : item.kind === "portfolio" ? "Our work" : "Product"} · {item.category}
            </p>
            {item.location && (
              <p className="inline-flex items-center gap-1 text-xs text-slate-400">
                <MapPin className="h-3 w-3" /> {item.location}
              </p>
            )}
            <h1 className="text-2xl font-bold text-white">{item.name}</h1>
            {price && <p className="text-lg font-semibold text-emerald-400">{price}</p>}
          </div>
          {item.summary && <p className="text-slate-300">{item.summary}</p>}
          {item.features.length > 0 && (
            <ul className="space-y-1.5">
              {item.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                  <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          )}
          {item.description && <p className="text-sm text-slate-400 whitespace-pre-line leading-relaxed">{item.description}</p>}
          <Link href="/chat" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold">
            <MessageSquare className="h-4 w-4" /> {item.kind === "portfolio" ? "Want something like this? Ask your designer" : "Ask your designer"}
          </Link>
          <p className="text-[11px] text-slate-500">Prices are indicative and depend on size, materials and site conditions.</p>
        </div>
      </div>
    </div>
  );
}
