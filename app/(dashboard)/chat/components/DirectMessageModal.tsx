"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import { createDM, fetchConversations } from "@/lib/api/chat.api";
import { X, MessageSquare, Search, Loader2, ShieldCheck, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { usersApi } from "@/lib/api/users.api";
import { cn } from "@/lib/utils";

interface Props {
  onClose: () => void;
}

// Search users via existing usersApi
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

export function DirectMessageModal({ onClose }: Props) {
  const router = useRouter();
  const { user } = useAuthStore();
  const { conversations, setConversations, onlineUsers } = useChatStore();

  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [startingWithId, setStartingWithId] = useState<string | null>(null);

  // Load initial users on mount
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    searchUsers("")
      .then((res) => {
        if (isMounted) {
          setUsers(res.filter((u: any) => u._id !== user?._id));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleSearch = async (q: string) => {
    setSearch(q);
    setLoading(true);
    try {
      const results = await searchUsers(q.trim());
      setUsers(results.filter((u: any) => u._id !== user?._id));
    } finally {
      setLoading(false);
    }
  };

  const handleStartDM = async (targetUser: any) => {
    if (startingWithId) return;
    setStartingWithId(targetUser._id);

    try {
      // 1. Check if a DM with this user already exists locally
      const existingConv = conversations.find(
        (c) => c.type === "dm" && c.members.some((m) => m.user._id === targetUser._id)
      );

      if (existingConv) {
        onClose();
        router.push(`/chat/${existingConv._id}`);
        return;
      }

      // 2. Create or find DM on server
      const conv = await createDM({
        type: "dm",
        memberIds: [targetUser._id]
      });

      // 3. Refresh conversations list
      const updated = await fetchConversations();
      setConversations(updated);

      toast.success(`Chat started with ${targetUser.name}`);
      onClose();
      router.push(`/chat/${conv._id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to start conversation");
    } finally {
      setStartingWithId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/50 flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">New Direct Message</h3>
              <p className="text-[11px] text-slate-400">Select a coworker to start chatting</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search input */}
        <div className="p-3 sm:p-4 border-b border-slate-800/80 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              autoFocus
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search coworkers by name or email…"
              className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
            )}
          </div>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1">
          {users.length === 0 && !loading && (
            <div className="text-center py-10 px-4">
              <div className="h-12 w-12 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mx-auto mb-2.5 text-slate-500">
                <UserIcon className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-slate-300">No coworkers found</p>
              <p className="text-xs text-slate-500 mt-1">Try a different search term</p>
            </div>
          )}

          {users.map((u) => {
            const isOnline = onlineUsers.has(u._id);
            const isStarting = startingWithId === u._id;

            return (
              <button
                key={u._id}
                onClick={() => handleStartDM(u)}
                disabled={isStarting}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800/80 transition text-left group border border-transparent hover:border-slate-700/60",
                  isStarting && "opacity-60 cursor-not-allowed"
                )}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  {u.avatarUrl ? (
                    <img
                      src={u.avatarUrl}
                      alt={u.name}
                      className="h-10 w-10 rounded-xl object-cover border border-slate-700"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-600/30 to-blue-600/20 border border-violet-500/30 flex items-center justify-center text-sm font-bold text-violet-300">
                      {u.name?.[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                  {/* Online indicator */}
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900",
                      isOnline ? "bg-emerald-400" : "bg-slate-600"
                    )}
                  />
                </div>

                {/* Name & Email */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-200 group-hover:text-white truncate">
                      {u.name}
                    </p>
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

                {/* Action button */}
                <div className="shrink-0">
                  {isStarting ? (
                    <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />
                  ) : (
                    <span className="text-xs font-semibold text-violet-400 group-hover:text-violet-300 bg-violet-600/10 group-hover:bg-violet-600/20 border border-violet-500/20 px-2.5 py-1 rounded-lg transition">
                      Chat
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800/80 bg-slate-950/40 flex items-center justify-between text-xs text-slate-500">
          <span>End-to-End Encrypted via ECDH P-256</span>
          <button
            onClick={onClose}
            className="hover:text-slate-300 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
