/**
 * Security headers for every page (Phase 11).
 * - CSP limits where scripts, images, media and API calls can come from, so an
 *   injected script can't load code or send data elsewhere, and the app can't
 *   be framed (clickjacking).
 * - Next.js needs inline scripts for hydration, so script-src allows
 *   'unsafe-inline' (no eval in production).
 */
const isDev = process.env.NODE_ENV !== "production";
const origin = (url, fallback) => {
  try {
    return new URL(url).origin;
  } catch {
    return fallback;
  }
};
const API_ORIGIN = origin(process.env.NEXT_PUBLIC_API_BASE_URL, "http://localhost:5000");
const SOCKET_ORIGIN = origin(process.env.NEXT_PUBLIC_SOCKET_URL, API_ORIGIN);
const SOCKET_WS = SOCKET_ORIGIN.replace(/^http/, "ws");
// HTTPS-only rules apply once the site is served over HTTPS (not a local `next start` on http)
const httpsOnly = !isDev && API_ORIGIN.startsWith("https://");

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Cloudinary: campaign/catalog media; api.cloudinary.com: short-lived private links (report screenshots)
  "img-src 'self' data: blob: https://res.cloudinary.com https://api.cloudinary.com",
  "media-src 'self' blob: https://res.cloudinary.com",
  "font-src 'self' data:",
  // API + live connection; encrypted chat files are downloaded from Cloudinary and decrypted in the browser
  `connect-src 'self' ${API_ORIGIN} ${SOCKET_ORIGIN} ${SOCKET_WS} https://res.cloudinary.com${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(httpsOnly ? ["upgrade-insecure-requests"] : [])
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(!httpsOnly ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }])
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hide the floating "N" dev-tools button shown by `next dev` (build errors still appear as an overlay).
  devIndicators: false,
  reactStrictMode: true,
  poweredByHeader: false,
  // The app uses plain <img> tags; turning the optimiser off removes the /_next/image endpoint
  // (the source of several Next.js advisories) instead of exposing it.
  images: { unoptimized: true },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The service worker must always be fresh so fixes reach installed apps
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }
    ];
  }
};

export default nextConfig;
