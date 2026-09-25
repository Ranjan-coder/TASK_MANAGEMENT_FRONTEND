"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import { fetchConversations, createGroup, fetchPublicKey } from "@/lib/api/chat.api";
import {
  generateGroupKey,
  deriveSessionKey,
  wrapGroupKey
} from "@/lib/crypto/e2e";
import { ensureUserKeys } from "@/lib/crypto/keyStore";
import { X, Users, Search, Plus, Loader2, ShieldCheck, Lock } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onClose: () => void;
}

import { usersApi } from "@/lib/api/users.api";

// Simple user search — uses usersApi
async function searchUsers(query: string) {
  try {
    const res = await usersApi.getUsers({
      search: query.trim() || undefined,
      limit: 20
    });
    return res.data?.data || [];
  } catch {
    return [];
  }
}

export function GroupCreateModal({ onClose }: Props) {
  const router = useRouter();
  const { user } = useAuthStore();
  const { setConversations } = useChatStore();

  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleSearch = async (q: string) => {
    setSearch(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await searchUsers(q.trim());
      setSearchResults(results.filter((u: any) => u._id !== user?._id));
    } finally {
      setSearching(false);
    }
  };

  const toggleUser = (u: any) => {
    setSelected((prev) =>
      prev.some((s) => s._id === u._id)
        ? prev.filter((s) => s._id !== u._id)
        : [...prev, u]
    );
  };

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Group name is required"); return; }
    if (selected.length < 1) { toast.error("Add at least 1 other member"); return; }
    if (!user) return;

    setCreating(true);
    try {
      // 1. Ensure current user's keys are active and published to backend
      const { privateKey: myPrivateKey, publicKeyB64: myPublicKey } = await ensureUserKeys(user._id);

      // 2. Generate a fresh group AES-256-GCM key
      const groupKey = await generateGroupKey();

      // 3. Encrypt the group key for each member
      const encryptedGroupKeys: Record<string, string> = {};

      // A) Encrypt for self
      const selfSession = await deriveSessionKey(myPrivateKey, myPublicKey);
      encryptedGroupKeys[user._id] = await wrapGroupKey(groupKey, selfSession);

      // B) Encrypt for selected members
      const membersWithoutKeys: string[] = [];

      for (const member of selected) {
        let memberPublicKey = member.publicKey;
        if (!memberPublicKey) {
          try {
            const keyInfo = await fetchPublicKey(member._id);
            memberPublicKey = keyInfo?.publicKey;
          } catch {}
        }

        if (memberPublicKey) {
          try {
            const sessionKey = await deriveSessionKey(myPrivateKey, memberPublicKey);
            encryptedGroupKeys[member._id] = await wrapGroupKey(groupKey, sessionKey);
          } catch (err) {
            console.warn(`Failed to encrypt key for member ${member.name}:`, err);
            membersWithoutKeys.push(member.name || member.email);
          }
        } else {
          membersWithoutKeys.push(member.name || member.email);
        }
      }

      const conv = await createGroup({
        type: "group",
        name: name.trim(),
        memberIds: selected.map((s) => s._id),
        encryptedGroupKeys
      });

      // Refresh conversation list
      const convs = await fetchConversations();
      setConversations(convs);

      if (membersWithoutKeys.length > 0) {
        toast.success(
          `Group "${conv.name}" created! Note: ${membersWithoutKeys.join(", ")} will receive encrypted access once they open Chat.`
        );
      } else {
        toast.success(`Group "${conv.name}" created`);
      }
      onClose();
      router.push(`/chat/${conv._id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create group");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/40 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-400" />
            <span className="font-semibold text-white text-sm">New Group</span>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Group name */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Group Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Project Alpha Team"
              maxLength={100}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition"
            />
          </div>

          {/* Selected members */}
          {selected.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Members ({selected.length})
              </label>
              <div className="flex flex-wrap gap-1.5">
                {selected.map((u) => (
                  <div
                    key={u._id}
                    className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full bg-violet-600/20 border border-violet-500/30 text-violet-300 text-xs"
                  >
                    <span>{u.name}</span>
                    <button
                      onClick={() => toggleUser(u)}
                      className="h-4 w-4 rounded-full flex items-center justify-center hover:bg-violet-500/30 transition"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search members */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Add Members
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition"
              />
              {searching && (
                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 animate-spin" />
              )}
            </div>

            {/* Results */}
            {searchResults.length > 0 && (
              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                {searchResults.map((u) => {
                  const isSelected = selected.some((s) => s._id === u._id);
                  return (
                    <button
                      key={u._id}
                      onClick={() => toggleUser(u)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-800 transition text-left"
                    >
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-600/30 to-slate-600 flex items-center justify-center text-xs font-bold text-slate-300 border border-slate-600 shrink-0">
                        {u.name?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm text-slate-200 font-medium truncate">{u.name}</p>
                          {u.publicKey ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 font-medium flex items-center gap-0.5">
                              <ShieldCheck className="h-2.5 w-2.5" /> E2E
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                              Key pending
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{u.email}</p>
                      </div>
                      <div
                        className={`h-5 w-5 rounded-full border flex items-center justify-center transition ${
                          isSelected
                            ? "bg-violet-600 border-violet-500"
                            : "border-slate-600"
                        }`}
                      >
                        {isSelected && <Plus className="h-3 w-3 text-white rotate-45" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-t border-slate-800 flex gap-2.5 sm:gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim() || selected.length === 0}
            className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            {creating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
            ) : (
              "Create Group"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
