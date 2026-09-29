export const metadata = { title: "Privacy Policy — Bonito" };

/*
 * DRAFT — written to match how the app actually works (2026-09-28). Items in
 * [square brackets] must be filled in, and the whole text reviewed by
 * Bonito's legal advisor, before launch. Keep the version below in step with
 * PRIVACY_POLICY_VERSION in the backend .env (it's recorded with each consent).
 */
export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>Version 2026-09-28 · [Bonito legal entity name], [registered address]</p>
      <p>
        This policy explains what personal data the Bonito app collects, why, how long we keep it and your rights under India&apos;s Digital
        Personal Data Protection Act, 2023 (&ldquo;DPDP Act&rdquo;).
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, email address and mobile number, and the date and version of the terms you accepted.</li>
        <li><strong>Project details:</strong> your project name, stage and timeline, the Bonito team working with you, and design approvals you give (the design title, your decision, comment and time).</li>
        <li><strong>Consultation requests</strong> you make from offers, and <strong>ratings and reports</strong> you submit.</li>
        <li><strong>Sign-in and security records:</strong> device type, time and IP address of sign-ins, used to protect your account.</li>
        <li><strong>Chat messages and files.</strong> Chats are end-to-end encrypted: they are encrypted on your device and only the people in the chat can read them. Bonito&apos;s servers store them in encrypted form and cannot read them.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To provide our interior design services and connect you with your design team.</li>
        <li>To verify your mobile number and let you reset your password with one-time codes sent by SMS.</li>
        <li>To show you offers, products and past projects from Bonito, and to follow up consultation requests you make.</li>
        <li>To measure and improve how quickly our team replies, and to review reports and ratings.</li>
        <li>To keep the service safe (for example, detecting unusual sign-ins).</li>
      </ul>

      <h2>Notifications and alerts</h2>
      <ul>
        <li>In-app and device notifications tell you about replies, project updates and design approvals. You can turn device notifications on or off in Settings → Notifications on each device.</li>
        <li><strong>WhatsApp / SMS alerts are optional.</strong> If you turn them on, and a reply from your designer stays unread for about 10 minutes, we send a short message with the project name and a link to the app — never the message itself. At most one every 3 hours per project, and never between 9 PM and 8 AM. We use [MSG91 / provider name] to send them.</li>
      </ul>

      <h2>Keeping chats respectful</h2>
      <ul>
        <li>
          Before a message is sent, the app checks it <strong>on your device</strong> against a list of abusive words. If it finds any, it asks if you want to send
          anyway. If you do, Bonito receives only the number of flagged words and their severity — not the message. If a chat reaches a set number of flagged
          words, Bonito management is alerted.
        </li>
        <li>
          If you <strong>report</strong> someone, the messages you choose to include are shared with Bonito admins, together with a cryptographic proof (message
          franking) that shows they are genuine and unedited. Nothing else in the chat is revealed. Screenshots you attach are stored privately and their
          location data is removed.
        </li>
      </ul>

      <h2>Who we share it with</h2>
      <ul>
        <li>Your design team and Bonito staff who need it for your project. Marketing staff can see your contact details to follow up consultation requests.</li>
        <li>Service providers who process data for us: cloud hosting and database ([provider]), file storage (Cloudinary), SMS and WhatsApp delivery ([provider]), email ([provider]), and your browser&apos;s push notification service.</li>
        <li>Authorities, when the law requires it.</li>
        <li>We do not sell your personal data.</li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account and project data: while your account is open, and afterwards only as long as needed for legal, tax or warranty reasons [confirm period].</li>
        <li>One-time sign-in codes and reply-time records: 90 days.</li>
        <li>Read notifications: 180 days.</li>
        <li>Report evidence (shared messages and screenshots): 1 year after the report is closed; the outcome record is kept.</li>
        <li>Original versions of edited or deleted project-chat messages (still encrypted): 1 year.</li>
      </ul>

      <h2>Your rights</h2>
      <ul>
        <li><strong>Access and copy:</strong> Settings → Privacy &amp; data → <em>Download my data</em>. Your chat history is decrypted on your own device and added to the file.</li>
        <li><strong>Correction:</strong> update your details in Settings, or ask us.</li>
        <li><strong>Erasure:</strong> Settings → Privacy &amp; data → <em>Request account deletion</em>. We complete requests within 30 days. We remove your name, contact details, photo, consultation requests and notifications and take you out of your project chats. Messages you sent stay in the project record under &ldquo;Deleted customer&rdquo;, still encrypted, as they are part of a shared conversation. If we must keep something for a legal reason (for example an open dispute), we&apos;ll tell you.</li>
        <li><strong>Withdraw consent:</strong> turn off optional alerts in Settings at any time, or delete your account.</li>
        <li><strong>Nominate</strong> someone to exercise these rights on your behalf, and <strong>complain</strong> to the Data Protection Board of India.</li>
      </ul>

      <h2>Grievance officer</h2>
      <p>[Name], [designation] — [email] · [phone]. We respond within [7] days.</p>

      <h2>Children</h2>
      <p>The Bonito app is for adults. We do not knowingly collect data from anyone under 18.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that affects you, we&apos;ll tell you in the app and ask for your consent again where required.</p>
    </>
  );
}
