"use client";

import { useState } from "react";
import { decryptFile, b64ToBuf } from "@/lib/crypto/e2e";
import { ChatAttachment } from "@/types/chat";
import { cn } from "@/lib/utils";
import { FileText, Download, X, ZoomIn, Loader2, Lock } from "lucide-react";

interface FilePreviewProps {
  attachment: ChatAttachment;
  sessionKey: CryptoKey | null;
}

export function FilePreview({ attachment, sessionKey }: FilePreviewProps) {
  const isImage = attachment.fileType === "image";
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [error, setError] = useState(false);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDecryptAndView = async () => {
    if (decryptedUrl) {
      setLightboxOpen(true);
      return;
    }
    if (!sessionKey || !attachment.fileIv) return;
    setDecrypting(true);
    setError(false);
    try {
      // Fetch encrypted blob from Cloudinary
      const resp = await fetch(attachment.url);
      const encryptedBuffer = await resp.arrayBuffer();

      // Decrypt with session key + stored IV
      const plainBuffer = await decryptFile(encryptedBuffer, attachment.fileIv, sessionKey);

      // Create object URL from decrypted bytes
      const blob = new Blob([plainBuffer], { type: attachment.mimeType });
      const url = URL.createObjectURL(blob);
      setDecryptedUrl(url);
      if (isImage) setLightboxOpen(true);
      else {
        // Download non-image files directly
        const a = document.createElement("a");
        a.href = url;
        a.download = attachment.originalName;
        a.click();
      }
    } catch {
      setError(true);
    } finally {
      setDecrypting(false);
    }
  };

  if (isImage) {
    return (
      <>
        <div
          className="relative group cursor-pointer rounded-xl overflow-hidden border border-slate-700 bg-slate-800 max-w-xs"
          onClick={handleDecryptAndView}
        >
          {/* Blurred placeholder */}
          <div className="flex items-center justify-center h-40 w-full bg-slate-800">
            {decrypting ? (
              <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
            ) : error ? (
              <div className="flex flex-col items-center gap-1 text-rose-400">
                <Lock className="h-5 w-5" />
                <span className="text-xs">Decrypt failed</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <Lock className="h-5 w-5 text-violet-400" />
                <span className="text-xs text-slate-400">Click to decrypt & view</span>
                <span className="text-[10px] text-slate-600">{attachment.originalName}</span>
              </div>
            )}
          </div>

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
            <ZoomIn className="h-5 w-5 text-white" />
          </div>
        </div>

        {/* Lightbox */}
        {lightboxOpen && decryptedUrl && (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightboxOpen(false)}
          >
            <button
              className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
              onClick={() => setLightboxOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={decryptedUrl}
              alt={attachment.originalName}
              className="max-h-full max-w-full rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                const a = document.createElement("a");
                a.href = decryptedUrl;
                a.download = attachment.originalName;
                a.click();
              }}
              className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm transition"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
          </div>
        )}
      </>
    );
  }

  // Non-image file
  return (
    <button
      onClick={handleDecryptAndView}
      disabled={decrypting || !sessionKey}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-700/60 border border-slate-600/50 hover:border-violet-500/40 transition disabled:opacity-60 max-w-xs w-full text-left"
    >
      <div className="h-9 w-9 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0">
        {decrypting ? (
          <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
        ) : (
          <FileText className="h-4 w-4 text-blue-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 font-medium truncate">{attachment.originalName}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-slate-500">{formatSize(attachment.fileSize)}</span>
          {error ? (
            <span className="text-xs text-rose-400">Decrypt failed</span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <Lock className="h-2.5 w-2.5" /> Encrypted
            </span>
          )}
        </div>
      </div>
      <Download className="h-4 w-4 text-slate-500 shrink-0" />
    </button>
  );
}
