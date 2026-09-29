"use client";

import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { adminContentApi, type MediaAsset } from "@/lib/api/content.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";

interface Props {
  purpose: "campaign" | "catalog";
  accept: "image" | "video" | "image-or-video";
  onUploaded: (asset: MediaAsset) => void;
  label?: string;
}

const ACCEPT = {
  image: "image/jpeg,image/png,image/webp",
  video: "video/mp4,video/webm,video/quicktime",
  "image-or-video": "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
};

const HINT = {
  image: "JPG, PNG or WebP · up to 10 MB",
  video: "MP4, WebM or MOV · up to 50 MB and 60 seconds",
  "image-or-video": "Image up to 10 MB, or video up to 50 MB / 60 s"
};

/** Drop zone + file picker that uploads straight to the media endpoint with progress. */
export function MediaUploader({ purpose, accept, onUploaded, label = "Upload" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File) => {
    setError("");
    const isVideo = file.type.startsWith("video/");
    if (accept === "image" && isVideo) return setError("Please choose an image.");
    if (accept === "video" && !isVideo) return setError("Please choose a video.");
    if (file.size > (isVideo ? 50 : 10) * 1024 * 1024) {
      return setError(isVideo ? "Videos must be 50 MB or smaller." : "Images must be 10 MB or smaller.");
    }
    setProgress(0);
    try {
      onUploaded(await adminContentApi.uploadMedia(file, purpose, setProgress));
    } catch (err) {
      setError(apiErrorMessage(err, "Upload failed. Please try again."));
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${
          dragging ? "border-violet-500 bg-violet-500/10" : "border-slate-700 bg-slate-950/40"
        }`}
      >
        {progress !== null ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
            <p className="text-xs text-slate-300">Uploading… {progress}%</p>
            <div className="w-full max-w-xs h-1.5 rounded bg-slate-800 overflow-hidden">
              <div className="h-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : (
          <>
            <Upload className="h-5 w-5 text-slate-400" />
            <button type="button" onClick={() => inputRef.current?.click()} className="text-sm font-medium text-violet-300 hover:text-violet-200">
              {label}
            </button>
            <p className="text-[11px] text-slate-500">or drag a file here · {HINT[accept]}</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT[accept]}
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
      </div>
      {error && <p role="alert" className="text-xs text-red-400 mt-1.5">{error}</p>}
    </div>
  );
}
