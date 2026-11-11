/**
 * Checks for project contacts (project-contacts-plan.md): the Call / WhatsApp /
 * Email links and "Ask in chat". No test runner needed:
 *
 *   node --experimental-transform-types --import ./scripts/ts-resolve.mjs scripts/contacts.check.ts
 */
import assert from "node:assert/strict";
import { formatPhone, mailHref, telHref, whatsappHref } from "../lib/projectContacts.ts";
import { askInChat, onComposeChange } from "../lib/chat/composeBus.ts";
import { getDraft, setDraft } from "../lib/chat/drafts.ts";

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

check("tel: links keep digits and one leading +; junk gives no link", () => {
  assert.equal(telHref("+919876543210"), "tel:+919876543210");
  assert.equal(telHref("1800-123-4567"), "tel:18001234567");
  assert.equal(telHref("+91+98765"), "tel:+9198765"); // stray "+" dropped
  assert.equal(telHref("12-34"), null); // too short
  assert.equal(telHref("javascript:alert(1)"), null);
});

check("WhatsApp only for Indian mobiles, text encoded", () => {
  assert.equal(whatsappHref("+919876543210"), "https://wa.me/919876543210");
  assert.equal(whatsappHref("+919876543210", "Hi & bye?"), "https://wa.me/919876543210?text=Hi%20%26%20bye%3F");
  assert.equal(whatsappHref("18001234567"), null); // toll-free isn't on WhatsApp
  assert.equal(whatsappHref("+915876543210"), null); // not a mobile series
});

check("mailto: only for plain addresses; subject encoded; header injection refused", () => {
  assert.equal(mailHref("priya@acme.test", "Rao Villa — Payments"), "mailto:priya@acme.test?subject=Rao%20Villa%20%E2%80%94%20Payments");
  assert.equal(mailHref("a@b.c?cc=evil@x.y"), null); // no smuggled cc/bcc
  assert.equal(mailHref("not an email"), null);
  assert.equal(mailHref("x@y.z\r\nBcc: evil@x.y"), null);
});

check("phones display grouped", () => {
  assert.equal(formatPhone("+919876543210"), "+91 98765 43210");
  assert.equal(formatPhone("18001234567"), "18001234567");
});

check("Ask in chat: @Name goes into the chat's draft once, remembered as a real mention; the open composer is told", () => {
  const pinged: string[] = [];
  const off = onComposeChange((k) => pinged.push(k));
  setDraft("c1", { text: "about the wardrobe", picked: [] });
  askInChat("c1", { id: "u1", name: "Priya Shah" });
  assert.deepEqual(getDraft("c1"), { text: "@Priya Shah about the wardrobe", picked: [{ id: "u1", name: "Priya Shah" }] });
  askInChat("c1", { id: "u1", name: "Priya Shah" }); // twice: no duplicate
  assert.equal(getDraft("c1")!.text, "@Priya Shah about the wardrobe");
  assert.equal(getDraft("c1")!.picked.length, 1);
  askInChat("c2", { id: "u2", name: "Ravi" }); // no draft yet (e.g. from Home)
  assert.deepEqual(getDraft("c2"), { text: "@Ravi ", picked: [{ id: "u2", name: "Ravi" }] });
  off();
  askInChat("c3", { id: "u3", name: "X" });
  assert.deepEqual(pinged, ["c1", "c1", "c2"]); // unsubscribed listeners aren't called
});

console.log(`\n${passed} checks passed`);
process.exit(0); // drafts schedule a save timer
