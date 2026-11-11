"use client";

import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { adminContentApi, type MediaAsset } from "@/lib/api/content.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { UploadError, type VideoTicket } from "@/lib/upload/chunkedUpload";

interface Props {
  purpose: "campaign" | "catalog";
  accept: "image" | "video" | "image-or-video";
  onUploaded: (asset: MediaAsset) => void;
  label?: string;
}

// Extensions as well as types: Windows often has no type registered for .mov /
// .m4v / .3gp, and then the picker hides those files (the server checks the bytes)
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,video/x-m4v,video/3gpp,.mp4,.mov,.m4v,.3gp,.webm";
const ACCEPT = {
  image: IMAGE_ACCEPT,
  video: VIDEO_ACCEPT,
  "image-or-video": `${IMAGE_ACCEPT},${VIDEO_ACCEPT}`
};

const HINT = {
  image: "JPG, PNG or WebP · up to 10 MB",
  video: "MP4, MOV, M4V, 3GP or WebM · up to 50 MB and 60 seconds · a 720p export is about 3× smaller and faster",
  "image-or-video": "Image up to 10 MB, or video up to 50 MB / 60 s"
};

const VIDEO_EXT = /\.(mp4|mov|m4v|3gp|webm)$/i;
/**
 * A reason the person can act on. "Upload failed" alone hid the cause: no
 * answer from the server (connection dropped / timed out) looked the same as
 * a refused file.
 */
const uploadErrorMessage = (err: any): string => {
  if (err instanceof UploadError) return err.message;
  if (err?.response) return apiErrorMessage(err, "Upload failed. Please try again.");
  if (err?.code === "ECONNABORTED") return "The upload timed out. Check your connection and try again.";
  return "Couldn't reach the server — check your connection and try again.";
};

interface Resume {
  file: File;
  ticket: VideoTicket;
  ticketAt: number;
  fromPiece: number;
}
// Signatures last an hour; leave room for the rest of the upload
const TICKET_REUSE_MS = 45 * 60 * 1000;

const timeLeft = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return "less than a minute left";
  const m = Math.round(s / 60);
  return `about ${m} min left`;
};

/** By type, or by name when the browser reports no / an odd type (e.g. "" for .mov). */
export const isVideoFile = (file: Pick<File, "type" | "name">) => file.type.startsWith("video/") || VIDEO_EXT.test(file.name);

/** Drop zone + file picker that uploads straight to the media endpoint with progress. */
export function MediaUploader({ purpose, accept, onUploaded, label = "Upload" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // A video upload that broke part-way: Resume continues from its first missing piece
  const [resume, setResume] = useState<Resume | null>(null);
  const [eta, setEta] = useState("");

  /** Progress plus a time-left estimate from the speed so far (slow links take minutes). */
  const tracker = (startPct: number) => {
    const t0 = Date.now();
    setEta("");
    return (pct: number) => {
      setProgress(pct);
      const moved = pct - startPct;
      if (moved >= 2) setEta(timeLeft(((Date.now() - t0) / moved) * (100 - pct)));
    };
  };

  const sendVideo = async (file: File, prior: Resume | null, signal: AbortSignal) => {
    // Cloudinary refuses a signature after an hour: an older ticket starts over
    const reuse = prior && Date.now() - prior.ticketAt < TICKET_REUSE_MS ? prior : null;
    const ticket = reuse?.ticket ?? (await adminContentApi.videoTicket(file.size));
    const ticketAt = reuse?.ticketAt ?? Date.now();
    const fromPiece = reuse?.fromPiece ?? 0;
    const pieces = Math.ceil(file.size / ticket.chunkBytes);
    try {
      const { public_id } = await adminContentApi.sendVideo(file, ticket, {
        signal,
        fromPiece,
        onProgress: tracker(Math.floor((fromPiece / pieces) * 100))
      });
      return await adminContentApi.finishVideo(public_id, file.size);
    } catch (err) {
      // Only connection trouble can be resumed; a refused piece (4xx) means starting over
      const { resumeFrom: from, status = 0 } = (err as UploadError) ?? {};
      if (typeof from === "number" && (status === 0 || status === 429 || status >= 500)) setResume({ file, ticket, ticketAt, fromPiece: from });
      throw err;
    }
  };

  const upload = async (file: File, prior: Resume | null = null) => {
    setError("");
    setResume(null);
    const isVideo = isVideoFile(file);
    if (accept === "image" && isVideo) return setError("Please choose an image.");
    if (accept === "video" && !isVideo) return setError("Please choose a video.");
    if (file.size > (isVideo ? 50 : 10) * 1024 * 1024) {
      return setError(isVideo ? "Videos must be 50 MB or smaller." : "Images must be 10 MB or smaller.");
    }
    setProgress(0);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      onUploaded(
        isVideo && purpose === "campaign"
          ? // Straight to Cloudinary in pieces (big files no longer pass through our server)
            await sendVideo(file, prior, abort.signal)
          : await adminContentApi.uploadMedia(file, purpose, setProgress)
      );
    } catch (err) {
      if (!abort.signal.aborted) setError(uploadErrorMessage(err));
      else setResume(null);
    } finally {
      abortRef.current = null;
      setProgress(null);
      setEta("");
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
            <p className="text-xs text-slate-300">
              Uploading… {progress}%{eta && <span className="text-slate-500"> · {eta}</span>}
            </p>
            <div className="w-full max-w-xs h-1.5 rounded bg-slate-800 overflow-hidden">
              <div className="h-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <button type="button" onClick={() => abortRef.current?.abort()} className="text-[11px] text-slate-400 hover:text-white">
              Cancel
            </button>
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
      {error && (
        <p role="alert" className="text-xs text-red-400 mt-1.5">
          {error}
          {resume && progress === null && (
            <>
              {" "}
              <button type="button" onClick={() => upload(resume.file, resume)} className="font-semibold text-violet-300 hover:text-violet-200 underline">
                Resume upload
              </button>
              <span className="text-slate-500"> (continues from {Math.round((resume.fromPiece * resume.ticket.chunkBytes * 100) / resume.file.size)}%)</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
