"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

interface CommentEditorProps {
  onSubmit: (text: string) => Promise<void>;
  isLoading?: boolean;
}

export function CommentEditor({ onSubmit, isLoading }: CommentEditorProps) {
  const [text, setText] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isLoading) return;
    await onSubmit(text);
    setText("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a comment or ask a question... (@mention supported)"
        className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      />
      <div className="flex justify-between items-center">
        <p className="text-[11px] text-slate-400">Supports basic formatting</p>
        <Button type="submit" size="sm" disabled={!text.trim() || isLoading} className="gap-1.5">
          <Send className="h-3.5 w-3.5" />
          <span>{isLoading ? "Posting..." : "Comment"}</span>
        </Button>
      </div>
    </form>
  );
}
