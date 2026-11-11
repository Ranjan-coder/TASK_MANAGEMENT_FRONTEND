"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchChatPeople, type DirectoryPerson } from "@/lib/api/chat.api";

/** The value, once it has stopped changing for `ms` (one request per pause in typing). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Colleagues I can start a chat with (staff of my organisation who have chat),
 * searched by name. Debounced, cached per search term (going back to an earlier
 * term is instant), and paged with the server's keyset cursor: "load more"
 * fetches only the next page. A slow older response can never overwrite a newer one.
 */
export function useChatPeople(search: string, enabled = true) {
  const term = useDebounced(search.trim());
  const query = useInfiniteQuery({
    queryKey: ["chat", "people", term],
    queryFn: ({ pageParam }) => fetchChatPeople(term, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next ?? undefined,
    staleTime: 60_000,
    enabled
  });
  const people: DirectoryPerson[] = query.data?.pages.flatMap((p) => p.people) ?? [];
  return {
    people,
    loading: query.isFetching && !query.isFetchingNextPage,
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => query.fetchNextPage(),
    loadingMore: query.isFetchingNextPage
  };
}
