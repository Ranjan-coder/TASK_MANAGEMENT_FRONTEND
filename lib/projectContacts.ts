/**
 * lib/projectContacts.ts — pure helpers for project contacts (project-contacts-plan.md):
 * topic names and the links behind Call / WhatsApp / Email. Tested in
 * scripts/contacts.check.ts.
 */
import type { ContactTopic } from "@/lib/api/contacts.api";

export const TOPICS: { value: ContactTopic; label: string; hint: string }[] = [
  { value: "design", label: "Design questions", hint: "Layouts, materials, revisions" },
  { value: "site", label: "Site & installation", hint: "Site visits, measurements, installation" },
  { value: "payments", label: "Payments & billing", hint: "Invoices, milestones, receipts" },
  { value: "general", label: "General & escalation", hint: "Anything else, or if you're not happy" },
  { value: "custom", label: "Other topic…", hint: "Name it yourself" }
];

/** tel: link: digits and a leading + only (the server already normalised it). */
export const telHref = (phone: string) => {
  const p = phone.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return p.replace(/\D/g, "").length >= 6 ? `tel:${p}` : null;
};

/** wa.me wants the number without "+" or spaces. Indian mobiles only (the server checks too). */
export const whatsappHref = (phone: string, text?: string) => {
  const digits = phone.replace(/\D/g, "");
  if (!/^91[6-9]\d{9}$/.test(digits)) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
};

export const mailHref = (email: string, subject?: string) =>
  /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email) ? `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}` : null;

/** "+919876543210" → "+91 98765 43210" (display only). */
export const formatPhone = (phone: string) => {
  const m = phone.match(/^\+91([6-9]\d{4})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
};
