/**
 * "Add to calendar" (planner-module-plan.md). Built in the browser because the
 * meeting details are end-to-end encrypted and the server can't read them.
 * Follows RFC 5545: escaped text, CRLF line endings, lines folded at 75 octets.
 */
export interface CalendarEvent {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
  location?: string;
  url?: string | null;
  organiser?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const utc = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
// Any line break (\r\n, \r or \n) becomes the escaped "\n": text can never start a new property line
const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");

/** Folds a content line at 75 octets (UTF-8 aware), continuation lines start with a space. */
const fold = (line: string) => {
  const bytes = new TextEncoder();
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    if (bytes.encode(current + ch).length > 75) {
      out.push(current);
      current = ` ${ch}`;
    } else current += ch;
  }
  out.push(current);
  return out.join("\r\n");
};

export function buildIcs(e: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Planner//Meeting//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@planner`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(e.start)}`,
    `DTEND:${utc(e.end)}`,
    `SUMMARY:${escape(e.title || "Meeting")}`,
    ...(e.description ? [`DESCRIPTION:${escape(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${escape(e.location)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR"
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/** Starts a download of the .ics file. */
export function downloadIcs(e: CalendarEvent) {
  const blob = new Blob([buildIcs(e)], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(e.title || "meeting").replace(/[^\w\- ]+/g, "").slice(0, 40) || "meeting"}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** "Add to Google Calendar" link (opens Google with the details pre-filled). */
export function googleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title || "Meeting",
    dates: `${utc(e.start)}/${utc(e.end)}`,
    details: [e.description, e.url].filter(Boolean).join("\n\n"),
    location: e.location || e.url || ""
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
