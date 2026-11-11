"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Contact, Pencil } from "lucide-react";
import { contactsApi } from "@/lib/api/contacts.api";
import { askInChat } from "@/lib/chat/composeBus";
import { ContactCards, contactsKey, useProjectContacts } from "@/components/projects/ContactCards";
import { ContactsEditor } from "@/components/projects/ContactsEditor";
import type { Conversation } from "@/types/chat";

/**
 * "Your contacts" in a project chat's info panel (project-contacts-plan.md):
 * who to talk to about what. Admins and the project's manager get an Edit
 * button (the server decides: `editable` is only sent to them).
 */
export function ProjectContactsSection({ conversation, isCustomer }: { conversation: Conversation; isCustomer: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useProjectContacts(conversation._id);
  const [editing, setEditing] = useState(false);

  return (
    <div className="w-full rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-2 text-left">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
          <Contact className="h-3 w-3" /> {isCustomer ? "Your contacts" : "Customer contacts"}
        </p>
        {data?.editable && (
          <button type="button" onClick={() => setEditing(true)} className="text-[11px] text-violet-300 hover:text-violet-200 inline-flex items-center gap-1">
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
      </div>
      {isCustomer && <p className="text-[11px] text-slate-500">Reach the right person for each kind of question.</p>}
      {isLoading ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : isError ? (
        <p className="text-xs text-rose-300">
          Couldn&apos;t load contacts.{" "}
          <button type="button" onClick={() => refetch()} className="underline">
            Try again
          </button>
        </p>
      ) : (
        <ContactCards
          contacts={data?.contacts ?? []}
          projectName={conversation.name || "your project"}
          onAsk={(c) => askInChat(conversation._id, { id: c.person._id, name: c.person.name })}
        />
      )}
      {!isCustomer && data?.editable && (
        <p className="text-[11px] text-slate-500">Lead designer and project manager are listed automatically (chat only). Add phone, email or other topics with Edit; company-wide defaults are in Admin → Projects.</p>
      )}
      {editing && data?.editable && (
        <ContactsEditor
          title={`Contacts — ${conversation.name}`}
          intro="Shown to the customer in this project. These replace the company defaults for the same topic. Phone and email fill in from the person's profile; change them to a work number if needed."
          initial={data.editable.contacts}
          rev={data.editable.rev}
          loadCandidates={(s) => contactsApi.projectCandidates(conversation._id, s)}
          onSave={async (contacts, rev) => qc.setQueryData(contactsKey(conversation._id), await contactsApi.saveProject(conversation._id, contacts, rev))}
          onConflict={() => qc.invalidateQueries({ queryKey: contactsKey(conversation._id) })}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
