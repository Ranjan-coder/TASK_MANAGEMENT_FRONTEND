/**
 * Where a notification leads, and its icon. Shared by the bell dropdown,
 * the Notifications page and the live toasts so they always agree.
 */
type Role = string | undefined;

interface NotificationLike {
  type: string;
  title: string;
  relatedTask?: unknown;
  relatedConversation?: unknown;
  actionUrl?: string;
}

const refId = (v: unknown): string | null =>
  !v ? null : typeof v === "string" ? v : ((v as { _id?: string })._id ?? null);

export function notificationTarget(n: NotificationLike, role: Role): string | null {
  const isAdmin = role === "admin" || role === "superadmin";
  const task = refId(n.relatedTask);
  if (task) return `/tasks/${task}`;
  switch (n.type) {
    case "sla_escalated":
      // Admins usually aren't in the project chat; the overview lists who's waiting
      return isAdmin ? "/admin/overview" : refId(n.relatedConversation) ? `/chat/${refId(n.relatedConversation)}` : null;
    case "report_update":
      return isAdmin && /^(New report|Response received)/.test(n.title) ? "/admin/reports" : "/settings?section=reports";
    case "moderation_alert":
      if (refId(n.relatedConversation)) return `/chat/${refId(n.relatedConversation)}`; // "please help us review"
      return isAdmin ? "/admin/moderation" : null;
    case "project_update":
      if (/^(Payment to confirm)/.test(n.title)) return isAdmin ? "/admin/payments?filter=verifying" : null;
      if (/^Referral reward to approve/.test(n.title)) return isAdmin ? "/admin/referrals" : null;
      if (/^(Payment|We couldn't find your payment|Invoice available)/.test(n.title)) return "/home/payments";
      if (/referral/i.test(n.title)) return "/home/refer";
      break;
    case "rating_alert":
      return isAdmin ? "/admin/performance" : null;
    case "consultation_request":
      return isAdmin || role === "marketing" ? "/admin/leads" : null;
    case "security_alert":
      if (/deletion request/i.test(n.title)) return isAdmin && /^Account deletion/.test(n.title) ? "/admin/privacy" : "/settings?section=privacy";
      return "/settings?section=sessions";
  }
  const conv = refId(n.relatedConversation);
  if (conv) return `/chat/${conv}`;
  return n.actionUrl || null;
}

export const NOTIFICATION_ICONS: Record<string, string> = {
  task_assigned: "📋",
  task_updated: "✏️",
  task_status_changed: "🔄",
  comment_added: "💬",
  mentioned: "@",
  due_date_reminder: "⏰",
  task_completed: "✅",
  account_created: "👤",
  security_alert: "🔐",
  consultation_request: "📞",
  project_update: "🏠",
  sla_reminder: "⏳",
  sla_escalated: "🚨",
  report_update: "⚑",
  rating_alert: "⭐",
  moderation_alert: "⚠️",
  attachment_added: "📎",
  link_added: "🔗"
};

/** Types that deserve a toast with an "Open" button (sla_reminder has its own popup). */
export const URGENT_TYPES = new Set(["sla_escalated", "moderation_alert", "report_update", "rating_alert"]);
