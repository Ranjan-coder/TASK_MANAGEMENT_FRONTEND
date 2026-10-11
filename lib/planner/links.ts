/**
 * Meeting links (planner-module-plan.md). Links are end-to-end encrypted, so the
 * server can't check them: they are checked here when saved AND every time they
 * are shown (another attendee's app could have stored anything).
 *
 * Only https links can be opened. Known providers show their name; any other
 * https link is allowed but shown with a "check this link" warning.
 */
const PROVIDERS: { name: string; hosts: string[] }[] = [
  { name: "Google Meet", hosts: ["meet.google.com"] },
  { name: "Zoom", hosts: ["zoom.us", "zoom.com"] },
  { name: "Microsoft Teams", hosts: ["teams.microsoft.com", "teams.live.com"] },
  { name: "Webex", hosts: ["webex.com"] },
  { name: "Jitsi", hosts: ["meet.jit.si", "8x8.vc"] }
];

export interface CheckedLink {
  ok: boolean;
  href: string | null; // safe to put in <a href> (https only), else null
  provider: string | null; // "Zoom" … or null for an unknown https site
  host: string | null;
  error?: string;
}

const hostMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export function checkMeetingLink(raw: string): CheckedLink {
  const text = String(raw || "").trim();
  if (!text) return { ok: false, href: null, provider: null, host: null, error: "Paste the meeting link" };
  if (text.length > 2000) return { ok: false, href: null, provider: null, host: null, error: "That link is too long" };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, href: null, provider: null, host: null, error: "That isn't a valid link" };
  }
  if (url.protocol !== "https:") return { ok: false, href: null, provider: null, host: url.hostname || null, error: "Only secure (https) links can be used" };
  if (url.username || url.password) return { ok: false, href: null, provider: null, host: url.hostname, error: "Links with a username or password aren't allowed" };
  const host = url.hostname.toLowerCase();
  const provider = PROVIDERS.find((p) => p.hosts.some((h) => hostMatches(host, h)))?.name || null;
  return { ok: true, href: url.toString(), provider, host };
}
