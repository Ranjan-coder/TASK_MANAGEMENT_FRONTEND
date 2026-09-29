"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { contentApi, type PublicCampaign } from "@/lib/api/content.api";
import { CampaignSlide } from "./CampaignSlide";
import { ConsultationDialog } from "./ConsultationDialog";

const IMAGE_SLIDE_MS = 6000;

/**
 * Home page hero. Images advance every 6 s, videos when they finish. Pauses on
 * hover/focus, supports swipe, and never auto-advances for people who prefer
 * reduced motion. Each campaign's view is counted once when it's first shown.
 */
export function CampaignCarousel({ campaigns }: { campaigns: PublicCampaign[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [consultFor, setConsultFor] = useState<PublicCampaign | null>(null);
  const seen = useRef(new Set<string>());
  const touchX = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);

  const count = campaigns.length;
  const current = campaigns[index];
  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Count a view only while the carousel is actually on screen
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting && e.intersectionRatio >= 0.5), {
      threshold: [0, 0.5, 1]
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!current || !onScreen || seen.current.has(current._id)) return;
    seen.current.add(current._id);
    contentApi.recordEvent(current._id, "impression");
  }, [current, onScreen]);

  // Auto-advance image/offer slides
  useEffect(() => {
    if (!current || count < 2 || paused || userPaused || reducedMotion) return;
    if (current.media?.resourceType === "video") return; // advances on "ended"
    const t = setTimeout(() => go(index + 1), IMAGE_SLIDE_MS);
    return () => clearTimeout(t);
  }, [current, index, count, paused, userPaused, reducedMotion, go]);

  if (!current) return null;

  const onCta = (c: PublicCampaign) => {
    contentApi.recordEvent(c._id, "click");
    if (c.cta.type === "consultation") setConsultFor(c);
  };

  return (
    <section
      ref={rootRef}
      aria-roledescription="carousel"
      aria-label="Offers and campaigns"
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
        touchX.current = null;
      }}
    >
      <div aria-live={paused || userPaused ? "polite" : "off"}>
        {campaigns.map((c, i) => (
          <div
            key={c._id}
            hidden={i !== index}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}: ${c.title}`}
          >
            <CampaignSlide
              campaign={c}
              active={i === index && onScreen && !userPaused}
              onCta={() => onCta(c)}
              onVideoEnded={() => count > 1 && !reducedMotion && go(index + 1)}
            />
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous offer"
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next offer"
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 right-4 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              aria-label={userPaused ? "Play slideshow" : "Pause slideshow"}
              className="h-7 w-7 flex items-center justify-center rounded-full bg-black/50 text-white"
            >
              {userPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
            {campaigns.map((c, i) => (
              <button
                key={c._id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show offer ${i + 1}`}
                aria-current={i === index}
                className={cn("h-2 rounded-full transition-all", i === index ? "w-6 bg-white" : "w-2 bg-white/50")}
              />
            ))}
          </div>
        </>
      )}

      {consultFor && <ConsultationDialog campaign={consultFor} onClose={() => setConsultFor(null)} />}
    </section>
  );
}
