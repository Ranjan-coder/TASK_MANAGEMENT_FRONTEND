import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { formatPrice, type CatalogItem } from "@/lib/api/content.api";

/** Product/service tile linking to its detail page. */
export function CatalogCard({ item }: { item: CatalogItem }) {
  const cover = item.images[0];
  const price = formatPrice(item.startingPrice, item.priceUnit);

  return (
    <Link
      href={`/home/catalog/${item.slug}`}
      className="group flex flex-col rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 hover:border-violet-500/50 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
    >
      <div className="relative aspect-[4/3] bg-slate-800">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.url} alt="" loading="lazy" className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-300" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-slate-600">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
        {item.featured && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[10px] font-bold">Popular</span>
        )}
      </div>
      <div className="p-3.5 space-y-1 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-violet-300/80 font-semibold">{item.category}</p>
        <h3 className="font-semibold text-white leading-snug">{item.name}</h3>
        {item.summary && <p className="text-xs text-slate-400 line-clamp-2">{item.summary}</p>}
        {price && <p className="text-sm font-semibold text-emerald-400 pt-1">{price}</p>}
      </div>
    </Link>
  );
}
