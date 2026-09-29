"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import { Conversation, ConversationMember } from "@/types/chat";
import {
  removeMember,
  updateConversation,
  addMember,
  fetchConversations,
  fetchPublicKey
} from "@/lib/api/chat.api";
import { rotateConversationGroupKey } from "@/lib/crypto/conversationKeys";
import {
  X,
  Users,
  Crown,
  UserMinus,
  Shield,
  Edit2,
  LogOut,
  RotateCcw,
  Loader2,
  Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StageEditor } from "./StageEditor";
import { toast } from "sonner";

interface GroupInfoPanelProps {
  conversation: Conversation;
  onClose: () => void;
  onConversationUpdated: (conv: Conversation) => void;
}

export function GroupInfoPanel({ conversation, onClose, onConversationUpdated }: GroupInfoPanelProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setConversations = useChatStore((s) => s.setConversations);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(conversation.name || "");
  const [loading, setLoading] = useState<string | null>(null); // tracks which action is in progress

  const myMember = conversation.members.find((m) => m.user._id === user?._id);
  // Project chats are managed from Admin → Projects: no rename/remove/leave here
  const project = conversation.project;
  const isAdmin = myMember?.role === "admin" && !project;

  const refId = (ref: unknown) => (typeof ref === "string" ? ref : (ref as { _id?: string } | null)?._id ?? null);
  const projectRole = (userId: string): string | undefined => {
    if (!project) return undefined;
    if (refId(project.leadDesigner) === userId) return "Lead designer";
    if (refId(project.backupDesigner) === userId) return "Backup designer";
    if (refId(project.manager) === userId) return "Project manager";
    if (project.customers.some((c) => refId(c) === userId)) return "Customer";
    return "Bonito team";
  };

  // ── Rename group ────────────────────────────────────────────────────────────
  const handleRename = async () => {
    if (!nameInput.trim() || nameInput === conversation.name) {
      setEditingName(false);
      return;
    }
    setLoading("rename");
    try {
      const updated = await updateConversation(conversation._id, { name: nameInput.trim() });
      onConversationUpdated(updated);
      toast.success("Group renamed");
    } catch {
      toast.error("Failed to rename group");
    } finally {
      setLoading(null);
      setEditingName(false);
    }
  };

  // ── Remove member + re-key (forward secrecy) ───────────────────────────────
  const handleRemove = async (memberId: string) => {
    setLoading(memberId);
    try {
      await removeMember(conversation._id, memberId);

      // New key version for the remaining members, so the removed member
      // can't read anything sent from now on. Older versions stay, so history
      // remains readable. Only group admins can rotate (enforced by the server).
      try {
        const remaining = conversation.members
          .filter((m) => m.user._id !== memberId)
          .map((m) => ({ _id: m.user._id, publicKey: m.user.publicKey, keyVersion: m.user.keyVersion }));
        await rotateConversationGroupKey(conversation, user!._id, remaining);
        toast.success("Member removed. New messages use a new key they can't read.");
      } catch (err) {
        console.warn("Group key rotation failed:", err);
        toast.warning("Member removed, but the group key couldn't be rotated. A group admin should reopen the group.");
      }

      // Refresh
      const convs = await fetchConversations();
      setConversations(convs);
      onConversationUpdated({ ...conversation, members: conversation.members.filter((m) => m.user._id !== memberId) });
    } catch (err) {
      toast.error("Failed to remove member");
    } finally {
      setLoading(null);
    }
  };

  // ── Leave group (self) ──────────────────────────────────────────────────────
  const handleLeave = async () => {
    setLoading("leave");
    try {
      await removeMember(conversation._id, user!._id);
      toast.success("Left group");
      router.push("/chat");
    } catch {
      toast.error("Failed to leave group");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="w-full h-full flex flex-col border-l border-slate-800 bg-slate-900 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800">
        <span className="font-semibold text-white text-sm">Group Info</span>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Group avatar + name */}
      <div className="px-4 py-5 flex flex-col items-center gap-3 border-b border-slate-800">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-600/30 to-blue-600/30 border border-violet-500/30 flex items-center justify-center">
          <Users className="h-7 w-7 text-violet-400" />
        </div>

        {editingName ? (
          <div className="flex items-center gap-2 w-full">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              autoFocus
              className="flex-1 px-2 py-1 rounded-lg bg-slate-800 border border-violet-500/50 text-white text-sm focus:outline-none"
            />
            <button
              onClick={handleRename}
              disabled={loading === "rename"}
              className="h-7 w-7 rounded-lg bg-violet-600 hover:bg-violet-500 flex items-center justify-center text-white transition"
            >
              {loading === "rename" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white text-base">{conversation.name}</span>
            {isAdmin && (
              <button
                onClick={() => setEditingName(true)}
                className="h-6 w-6 rounded-md flex items-center justify-center text-slate-500 hover:text-violet-400 hover:bg-slate-800 transition"
              >
                <Edit2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        <p className="text-xs text-slate-400">{conversation.members.length} members</p>
        {project && (
          <p className="text-[11px] text-center text-slate-500 px-2">
            Project chat · {{ active: "Active", on_hold: "On hold", completed: "Completed" }[project.status]}. The team is managed by
            Bonito — contact us to add or change people.
          </p>
        )}
        {project && (
          <StageEditor
            conversation={conversation}
            canEdit={Boolean(user && [project.leadDesigner, project.backupDesigner, project.manager].some((u) => refId(u) === user._id))}
            onUpdated={(t) => onConversationUpdated?.({ ...conversation, project: { ...project, ...t } })}
          />
        )}
      </div>

      {/* Members list */}
      <div className="flex-1 px-3 py-3 space-y-1">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-1 mb-2">
          Members
        </p>
        {conversation.members.map((member) => (
          <MemberRow
            key={member.user._id}
            member={member}
            isMe={member.user._id === user?._id}
            isAdmin={isAdmin}
            roleLabel={projectRole(member.user._id)}
            loading={loading === member.user._id}
            onRemove={() => handleRemove(member.user._id)}
          />
        ))}
      </div>

      {/* Footer actions */}
      {!project && (
      <div className="px-4 pb-5 pt-2 border-t border-slate-800 space-y-2">
        <button
          onClick={handleLeave}
          disabled={!!loading}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-sm font-medium transition disabled:opacity-50"
        >
          {loading === "leave" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          Leave Group
        </button>
      </div>
      )}
    </div>
  );
}

interface MemberRowProps {
  member: ConversationMember;
  isMe: boolean;
  isAdmin: boolean;
  /** Role in a project chat, e.g. "Lead designer" */
  roleLabel?: string;
  loading: boolean;
  onRemove: () => void;
}

function MemberRow({ member, isMe, isAdmin, roleLabel, loading, onRemove }: MemberRowProps) {
  return (
    <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-slate-800/50 transition group">
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-600/30 to-slate-600 flex items-center justify-center text-xs font-bold text-slate-300 border border-slate-600">
          {member.user.name[0]?.toUpperCase()}
        </div>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-900",
            member.isOnline ? "bg-emerald-400" : "bg-slate-600"
          )}
        />
      </div>

      {/* Name + role */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm text-slate-200 font-medium truncate">
            {member.user.name}
            {isMe && <span className="text-slate-500 text-xs ml-1">(you)</span>}
          </span>
          {member.role === "admin" && !roleLabel && (
            <Crown className="h-3 w-3 text-amber-400 shrink-0" />
          )}
        </div>
        <span className="text-[10px] text-slate-500">{roleLabel || member.user.designation || member.role}</span>
      </div>

      {/* Remove button (admin only, not self) */}
      {isAdmin && !isMe && (
        <button
          onClick={onRemove}
          disabled={loading}
          className="h-6 w-6 rounded-md flex items-center justify-center text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <UserMinus className="h-3 w-3" />
          )}
        </button>
      )}
    </div>
  );
}
