"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, Mail, MessageCircle, AtSign, Clock } from "lucide-react";
import { contactsApi, type ProjectContact } from "@/lib/api/contacts.api";
import { formatPhone, mailHref, telHref, whatsappHref } from "@/lib/projectContacts";
import { getSocket } from "@/lib/socket";
import { cn } from "@/lib/utils";

export const contactsKey = (projectId: string) => ["project-contacts", projectId];

/**
 * A project's contacts, cached per project and kept live: when an admin or the
 * project manager saves, the server pings the chat's members and only that
 * project's entry is refetched (no polling).
 */
export function useProjectContacts(projectId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => qc.invalidateQueries({ queryKey: contactsKey(projectId) });
    const handler = (e: { conversationId: string }) => e.conversationId === projectId && refresh();
    socket.on("chat:project:contacts", handler);
    // A change made while this device was offline (no ping received): catch up once on reconnect
    socket.io.on("reconnect", refresh);
    return () => {
      socket.off("chat:project:contacts", handler);
      socket.io.off("reconnect", refresh);
    };
  }, [projectId, qc]);
  return useQuery({ queryKey: contactsKey(projectId), queryFn: () => contactsApi.forProject(projectId), staleTime: 5 * 60_000 });
}

const action = "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-slate-700 text-slate-200 hover:border-violet-500/60 hover:text-white transition";

/**
 * Who to contact about what. `onAsk` (in the chat) puts "@Name" in the message
 * box; elsewhere (Home) it can open the chat.
 */
export function ContactCards({
  contacts,
  projectName,
  onAsk,
  compact
}: {
  contacts: ProjectContact[];
  projectName: string;
  onAsk?: (c: ProjectContact) => void;
  compact?: boolean;
}) {
  if (!contacts.length) return <p className="text-xs text-slate-500">No contacts yet — message the team in the chat.</p>;
  return (
    <ul className={cn("space-y-2", compact && "grid gap-2 sm:grid-cols-2 space-y-0")}>
      {contacts.map((c) => {
        const tel = c.phone ? telHref(c.phone) : null;
        const wa = c.whatsapp ? whatsappHref(c.phone, `Hi ${c.person.name.split(" ")[0]}, about "${projectName}": `) : null;
        const mail = c.email ? mailHref(c.email, `${projectName} — ${c.label}`) : null;
        return (
          <li key={c.key} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/90">{c.label}</p>
            <div className="mt-1 flex items-center gap-2 min-w-0">
              <span className="h-7 w-7 shrink-0 rounded-full bg-violet-600/30 text-violet-100 text-xs font-semibold flex items-center justify-center overflow-hidden" aria-hidden>
                {c.person.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.person.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  c.person.name.charAt(0).toUpperCase()
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-white truncate">
                  {c.person.name}
                  {c.person.onLeave && <span className="ml-1.5 text-[10px] text-amber-300 border border-amber-500/30 rounded px-1">On leave</span>}
                </span>
                {c.person.designation && <span className="block text-[11px] text-slate-400 truncate">{c.person.designation}</span>}
              </span>
            </div>
            {(c.hours || c.phone) && (
              <p className="mt-1 text-[11px] text-slate-400 flex flex-wrap gap-x-2">
                {c.phone && <span>{formatPhone(c.phone)}</span>}
                {c.hours && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden /> {c.hours}
                  </span>
                )}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tel && (
                <a href={tel} className={action} aria-label={`Call ${c.person.name}`}>
                  <Phone className="h-3 w-3" aria-hidden /> Call
                </a>
              )}
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className={action} aria-label={`WhatsApp ${c.person.name}`}>
                  <MessageCircle className="h-3 w-3" aria-hidden /> WhatsApp
                </a>
              )}
              {mail && (
                <a href={mail} className={action} aria-label={`Email ${c.person.name}`}>
                  <Mail className="h-3 w-3" aria-hidden /> Email
                </a>
              )}
              {c.inChat && onAsk && (
                <button type="button" onClick={() => onAsk(c)} className={action} aria-label={`Ask ${c.person.name} in chat`}>
                  <AtSign className="h-3 w-3" aria-hidden /> Ask in chat
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
