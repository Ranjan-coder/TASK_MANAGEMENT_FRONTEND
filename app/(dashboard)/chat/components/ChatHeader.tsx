"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Users, Lock, Info, ShieldCheck, Key, Search, FolderOpen, NotebookPen, MoreVertical } from "lucide-react";
import { useChatStore } from "@/store/chatStore";
import { stageLabel } from "@/lib/api/projectExtras.api";
import { cn } from "@/lib/utils";
import { orgHasModule } from "@/lib/modules";
import type { Conversation } from "@/types/chat";
import type { User } from "@/types";
import { ProjectChatActions } from "./ProjectChatActions";
import { NotifyMenu } from "./NotifyMenu";

interface Props {
  conv: Conversation | null;
  user: User | null;
  showGroupInfo: boolean;
  onBack: () => void;
  onToggleGroupInfo: () => void;
  onOpenSafetyNumbers: () => void;
  onOpenKeySetup: () => void;
  onOpenSearch: () => void;
  onOpenFiles: () => void;
  /** Staff in a project chat: open the team's private notes */
  onOpenTeamNotes?: () => void;
}

/** "⋯" menu for header actions on small screens (md and up shows them as buttons). */
function HeaderMore({ items }: { items: { label: string; icon: typeof Key; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative md:hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="More chat actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-40 w-52 rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-md shadow-2xl py-1">
          {items.map(({ label, icon: Icon, onClick }) => (
            <button
              key={label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onClick();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-800 text-left"
            >
              <Icon className="h-4 w-4 text-slate-400" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Conversation title, status line and header actions. */
export function ChatHeader({ conv, user, showGroupInfo, onBack, onToggleGroupInfo, onOpenSafetyNumbers, onOpenKeySetup, onOpenSearch, onOpenFiles, onOpenTeamNotes }: Props) {
  const otherMember = conv?.members.find((m) => m.user._id !== user?._id);
  // Only this one person's presence, not every online-status change in the organisation
  const otherOnline = useChatStore((s) => (otherMember ? s.onlineUsers.has(otherMember.user._id) : false));

  const label = !conv ? "" : conv.type === "group" ? conv.name || "Group" : otherMember?.user.name || "Unknown";

  let subtitle = "";
  if (conv?.project) {
    const status = { active: "", on_hold: " · On hold", completed: " · Completed" }[conv.project.status];
    subtitle = `${stageLabel(conv.project.stage)} · ${conv.members.length} people${status}`;
  } else if (conv?.type === "group") {
    subtitle = `${conv.members.length} members`;
  } else if (conv) {
    subtitle = otherOnline ? "● Online" : "Offline";
  }

  return (
    <div className="relative z-30 h-14 px-3 sm:px-4 flex items-center gap-2 sm:gap-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm shrink-0">
      <button
        onClick={onBack}
        className="md:hidden h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
        aria-label="Back to conversations"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-600/30 to-blue-600/30 border border-violet-500/25 flex items-center justify-center font-bold text-sm text-violet-300 shrink-0">
        {conv?.type === "group" ? <Users className="h-4 w-4" /> : label[0]?.toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{label}</p>
        <p className={cn("text-[11px] truncate", subtitle.startsWith("●") ? "text-emerald-400" : "text-slate-400")}>{subtitle}</p>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Project chats: rate / report (customers), flag a customer (staff) — whenever the
            organisation has Reports (an org-wide action, no personal grant needed) */}
        {conv?.project && user && orgHasModule(user, "reports") && (
          <ProjectChatActions conversation={conv} myUserId={user._id} isCustomer={user.role === "customer"} />
        )}

        {/* Safety numbers (DM only) — in the ⋯ menu on phones */}
        {conv?.type === "dm" && otherMember?.user.publicKey && (
          <button
            onClick={onOpenSafetyNumbers}
            title="Verify safety numbers"
            aria-label="Verify safety numbers"
            className="hidden md:flex h-8 w-8 rounded-lg items-center justify-center text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition"
          >
            <ShieldCheck className="h-4 w-4" />
          </button>
        )}

        <button
          onClick={onOpenSearch}
          title="Search this chat"
          aria-label="Search this chat"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <Search className="h-4 w-4" />
        </button>

        <button
          onClick={onOpenFiles}
          title="Shared files"
          aria-label="Shared files"
          className="hidden md:flex h-8 w-8 rounded-lg items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <FolderOpen className="h-4 w-4" />
        </button>

        {onOpenTeamNotes && (
          <button
            onClick={onOpenTeamNotes}
            title="Team notes (customers can't see these)"
            aria-label="Team notes"
            className="hidden md:flex h-8 px-2 rounded-lg items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 hover:bg-slate-800 transition"
          >
            <NotebookPen className="h-4 w-4" />
            <span className="hidden xl:inline">Team notes</span>
          </button>
        )}

        {conv && <NotifyMenu conv={conv} />}

        <button
          onClick={onOpenKeySetup}
          title="Manage encryption keys"
          aria-label="Manage encryption keys"
          className="hidden md:flex h-8 w-8 rounded-lg items-center justify-center text-slate-400 hover:text-violet-400 hover:bg-slate-800 transition"
        >
          <Key className="h-4 w-4" />
        </button>

        {/* Phones: the less-used actions in one menu so the chat name has room */}
        <HeaderMore
          items={[
            { label: "Shared files", icon: FolderOpen, onClick: onOpenFiles },
            ...(onOpenTeamNotes ? [{ label: "Team notes", icon: NotebookPen, onClick: onOpenTeamNotes }] : []),
            ...(conv?.type === "dm" && otherMember?.user.publicKey ? [{ label: "Verify safety numbers", icon: ShieldCheck, onClick: onOpenSafetyNumbers }] : []),
            { label: "Encryption keys", icon: Key, onClick: onOpenKeySetup }
          ]}
        />

        {conv?.type === "group" && (
          <button
            onClick={onToggleGroupInfo}
            aria-label="Group info"
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center transition",
              showGroupInfo ? "bg-violet-600/25 text-violet-400" : "text-slate-400 hover:text-white hover:bg-slate-800"
            )}
          >
            <Info className="h-4 w-4" />
          </button>
        )}

        {/* E2E lock badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20" title="End-to-end encrypted">
          <Lock className="h-3 w-3 text-emerald-400" />
          <span className="text-[10px] text-emerald-400 font-medium hidden sm:block">E2E</span>
        </div>
      </div>
    </div>
  );
}
