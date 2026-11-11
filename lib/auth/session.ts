/**
 * lib/auth/session.ts — leaving the app (sign-out, expired session) happens once.
 *
 * Sign-out used to clear the signed-in user before leaving the page: the app
 * re-rendered without a user (a customer briefly got the staff frame), the
 * re-mounted parts asked /auth/me again — 401 — the API client tried
 * /auth/refresh — 401 — and both the client and sign-out sent the browser to
 * /login, so it loaded twice.
 *
 * Now one latch: once set, the API client stops sending requests and never
 * tries a refresh, and the page is replaced exactly once. The full page load
 * is deliberate: it wipes everything held in memory (decrypted messages, chat
 * keys, cached data) — a client-side route change would keep it.
 */
let leaving = false;

export const isLeaving = () => leaving;

/** Blocks further API calls (the sign-out request itself is sent before this). */
export const beginLeaving = () => {
  leaving = true;
};

/** Replaces the page (no Back into a signed-out screen). Idempotent. */
export const leaveTo = (path: string) => {
  if (typeof window === "undefined") return;
  if (leaving && window.location.pathname === path) return;
  leaving = true;
  window.location.replace(path);
};
