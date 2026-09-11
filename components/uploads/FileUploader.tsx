"use client";

import { useState } from "react";
import { UploadCloud, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { Attachment, ApiResponse } from "@/types";

interface FileUploaderProps {
  entityType: "task" | "comment";
  entityId: string;
  onUploaded: (attachment: Attachment) => void;
}

export function FileUploader({ entityType, entityId, onUploaded }: FileUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isLinkMode, setIsLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("entityType", entityType);
    formData.append("entityId", entityId);

    setIsUploading(true);
    try {
      const res = await apiClient.post<ApiResponse<Attachment>>("/uploads", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      onUploaded(res.data.data);
      toast.success("File uploaded successfully");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkUrl) return;

    setIsUploading(true);
    try {
      const res = await apiClient.post<ApiResponse<Attachment>>("/uploads/link", {
        url: linkUrl,
        title: linkTitle,
        entityType,
        entityId
      });
      onUploaded(res.data.data);
      setLinkUrl("");
      setLinkTitle("");
      setIsLinkMode(false);
      toast.success("Link attached successfully");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to attach link");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          Attachments (PDF, Docs, Images, Links)
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsLinkMode(!isLinkMode)}
          className="text-xs h-7 gap-1"
        >
          <LinkIcon className="h-3 w-3" />
          {isLinkMode ? "Upload File" : "Attach Link"}
        </Button>
      </div>

      {!isLinkMode ? (
        <label className="flex flex-col items-center justify-center p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 cursor-pointer hover:bg-slate-50 transition-colors">
          <UploadCloud className="h-6 w-6 text-slate-400 mb-1" />
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {isUploading ? "Uploading file..." : "Click or drag file to attach (max 20MB)"}
          </span>
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
          />
        </label>
      ) : (
        <form onSubmit={handleLinkSubmit} className="space-y-2">
          <Input
            placeholder="https://example.com/spec.pdf or Figma link"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
          <div className="flex gap-2">
            <Input
              placeholder="Link Title (Optional)"
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={isUploading || !linkUrl}>
              Add
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
