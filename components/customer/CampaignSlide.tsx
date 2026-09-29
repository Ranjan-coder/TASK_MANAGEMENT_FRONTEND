"use client";

import { useEffect, useRef } from "react";
import { Phone, MessageCircle, ExternalLink, CalendarCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ctaDefaultLabel, ctaHref, endsInLabel, type CampaignCta, type PublicCampaign } from "@/lib/api/content.api";

interface Props {
  campaign: Pick<PublicCampaign, "title" | "description" | "kind" | "media" | "offer" | "cta" | "endAt">;
  /** Only the active slide loads/plays its video */
  active?: boolean;
  onCta?: () => void;
  onVideoEnded?: () => void;
  className?: string;
}

const CTA_ICON: Record<CampaignCta["type"], typeof Phone | null> = {
  none: null,
  consultation: CalendarCheck,
  call: Phone,
  whatsapp: MessageCircle,
  link: ExternalLink
};

/**
 * One campaign as customers see it: video/poster/offer card with the text over a
 * gradient and a single call-to-action. Also used as the admin editor preview.
 */
export function CampaignSlide({ campaign, active = true, onCta, onVideoEnded, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = campaign.media?.resourceType === "video";
  const ends = endsInLabel(campaign.endAt);
  const href = ctaHref(campaign.cta);
  const label = campaign.cta.label || ctaDefaultLabel(campaign.cta.type);
  const Icon = CTA_ICON[campaign.cta.type];

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) v.play().catch(() => {}); // muted autoplay; ignore if blocked
    else v.pause();
  }, [active]);

  const ctaClass =
    "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-900 text-sm font-semibold shadow-lg hover:bg-violet-50 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400";

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-900 via-slate-900 to-slate-950 text-white",
        "aspect-[4/5] sm:aspect-[16/9]",
        className
      )}
    >
      {campaign.media &&
        (isVideo ? (
          <video
            ref={videoRef}
            // Load the file only for the slide being shown
            src={active ? campaign.media.url : undefined}
            poster={campaign.media.posterUrl || undefined}
            muted
            playsInline
            preload={active ? "auto" : "none"}
            onEnded={onVideoEnded}
            className="absolute inset-0 h-full w-full object-cover"
            aria-label={campaign.title}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={campaign.media.url}
            alt={campaign.title}
            loading={active ? "eager" : "lazy"}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ))}

      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

      <div className="absolute top-3 left-3 flex flex-wrap gap-2">
        {campaign.offer?.badge && (
          <span className="px-2.5 py-1 rounded-full bg-amber-400 text-slate-900 text-xs font-bold shadow">{campaign.offer.badge}</span>
        )}
        {ends && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/60 text-white text-xs font-medium">
            <Clock className="h-3 w-3" /> {ends}
          </span>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 space-y-3 max-w-2xl">
        <h3 className="text-2xl sm:text-3xl font-bold leading-tight text-balance drop-shadow">{campaign.title}</h3>
        {campaign.description && (
          <p className="text-sm sm:text-base text-white/85 line-clamp-3 whitespace-pre-line">{campaign.description}</p>
        )}
        {campaign.offer?.terms && <p className="text-[11px] text-white/60 line-clamp-2">{campaign.offer.terms}</p>}

        {campaign.cta.type !== "none" &&
          (href ? (
            <a
              href={href}
              target={campaign.cta.type === "call" ? undefined : "_blank"}
              rel="noopener noreferrer"
              onClick={onCta}
              className={ctaClass}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {label}
            </a>
          ) : (
            <button type="button" onClick={onCta} className={ctaClass}>
              {Icon && <Icon className="h-4 w-4" />}
              {label}
            </button>
          ))}
      </div>
    </article>
  );
}
