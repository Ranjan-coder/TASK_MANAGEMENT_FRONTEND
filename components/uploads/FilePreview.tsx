"use client";

import { Attachment } from "@/types";
import { FileText, Image as ImageIcon, Link as LinkIcon, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FilePreviewProps {
  attachments: Attachment[];
  onDelete?: (id: string) => void;
  canDelete?: boolean;
}

export function FilePreview({ attachments, onDelete, canDelete }: FilePreviewProps) {
  if (!attachments || attachments.length === 0) return null;

  const getIcon = (type: string) => {
    if (type === "image") return <ImageIcon className="h-4 w-4 text-purple-500" />;
    if (type === "link") return <LinkIcon className="h-4 w-4 text-blue-500" />;
    return <FileText className="h-4 w-4 text-amber-500" />;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {attachments.map((att) => (
        <div
          key={att._id}
          className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs gap-2"
        >
          <div className="flex items-center gap-2 min-w-0">
            {getIcon(att.fileType)}
            <span className="truncate font-medium text-slate-800 dark:text-slate-200">
              {att.originalName}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <a href={att.url} target="_blank" rel="noreferrer" download>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </a>

            {canDelete && onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(att._id)}
                className="h-7 w-7 text-red-500 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
