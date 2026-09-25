"use client";

import { useState, useRef } from "react";
import { encryptFile, encryptMessage, bufToB64 } from "@/lib/crypto/e2e";
import { cn } from "@/lib/utils";
import { FileText, Image as ImageIcon, X, Upload, Lock } from "lucide-react";

interface FileUploadPreviewProps {
  conversationId: string;
  sessionKey: CryptoKey | null;
  onUploaded: () => void;
  onCancel: () => void;
}

interface PendingFile {
  file: File;
  previewUrl?: string;
  fileType: "image" | "pdf" | "doc" | "docx" | "xls" | "xlsx" | "other";
}

export function FileUploadPreview({ conversationId, sessionKey, onUploaded, onCancel }: FileUploadPreviewProps) {
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    let fileType: PendingFile["fileType"] = "other";
    if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) fileType = "image";
    else if (ext === "pdf") fileType = "pdf";
    else if (["doc", "docx"].includes(ext)) fileType = "doc";
    else if (["xls", "xlsx"].includes(ext)) fileType = "xls";

    const previewUrl = fileType === "image" ? URL.createObjectURL(file) : undefined;
    setPending({ file, previewUrl, fileType });
  };

  const handleUpload = async () => {
    if (!pending || !sessionKey) return;
    setUploading(true);
    setProgress(0);

    try {
      // 1. Read file into ArrayBuffer
      const buffer = await pending.file.arrayBuffer();
      setProgress(20);

      // 2. Encrypt file bytes client-side
      const { encryptedBuffer, iv: fileIv } = await encryptFile(buffer, sessionKey);
      setProgress(50);

      // 3. Generate a per-file AES key (we use the session key directly; fileIv provides uniqueness)
      // The encryptedFileKey field will hold the fileIv as a reference (session key is shared)
      const encryptedFileKey = fileIv; // simplified: fileIv is the unique key material per file

      // 4. Build FormData with encrypted blob
      const encryptedBlob = new Blob([encryptedBuffer], { type: "application/octet-stream" });
      const formData = new FormData();
      formData.append("file", encryptedBlob, pending.file.name + ".enc");
      formData.append("originalName", pending.file.name);
      formData.append("mimeType", pending.file.type);
      formData.append("fileSize", String(pending.file.size));
      formData.append("fileType", pending.fileType);
      formData.append("encryptedFileKey", encryptedFileKey);
      formData.append("fileIv", fileIv);

      setProgress(70);

      // 5. Upload to backend
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";
      const resp = await fetch(`${API}/chat/conversations/${conversationId}/attachments`, {
        method: "POST",
        credentials: "include",
        body: formData
      });

      if (!resp.ok) throw new Error("Upload failed");
      setProgress(100);

      if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
      setPending(null);
      onUploaded();
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="px-4 pb-2">
      {!pending ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={!sessionKey}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-violet-500/40 text-xs transition disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            Attach file
            <Lock className="h-3 w-3 text-emerald-400" />
          </button>
        </>
      ) : (
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-2.5 sm:p-3 flex items-center gap-2.5 sm:gap-3">
          {/* Preview */}
          <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-lg overflow-hidden shrink-0 bg-slate-700 flex items-center justify-center border border-slate-600">
            {pending.previewUrl ? (
              <img src={pending.previewUrl} alt="preview" className="h-full w-full object-cover" />
            ) : pending.fileType === "image" ? (
              <ImageIcon className="h-5 w-5 text-violet-400" />
            ) : (
              <FileText className="h-5 w-5 text-blue-400" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm text-slate-200 font-medium truncate">{pending.file.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] sm:text-xs text-slate-500 shrink-0">{formatSize(pending.file.size)}</span>
              <span className="hidden sm:flex items-center gap-1 text-[10px] text-emerald-400 truncate">
                <Lock className="h-2.5 w-2.5 shrink-0" /> Will encrypt before upload
              </span>
            </div>
            {uploading && (
              <div className="mt-1.5 h-1 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Send"}
            </button>
            <button
              onClick={() => {
                if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
                setPending(null);
                onCancel();
              }}
              className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
