import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "./Toast";
import { Spinner, ErrorState } from "./States";
import { pct } from "../lib/format";
import type { ScanCandidate, ScanResult } from "../types";

const SCAN_INTERVAL_MS = 1500;
const MAX_EDGE = 1000;

interface Props {
  onResult: (result: ScanResult) => void;
}

export function CameraScanner({ onResult }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inFlightRef = useRef(false);
  const cancelledRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const onResultRef = useRef(onResult);

  const [status, setStatus] = useState<"starting" | "ready" | "error">("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [top, setTop] = useState<ScanCandidate | null>(null);
  const [attempt, setAttempt] = useState(0);

  const toast = useToast();

  // Keep the latest onResult without restarting the camera loop.
  useEffect(() => {
    onResultRef.current = onResult;
  });

  useEffect(() => {
    cancelledRef.current = false;
    let localStream: MediaStream | null = null;

    function captureFile(): Promise<File | null> {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) return Promise.resolve(null);
      const { videoWidth: vw, videoHeight: vh } = video;
      const scale = Math.min(1, MAX_EDGE / Math.max(vw, vh));
      const w = Math.round(vw * scale);
      const h = Math.round(vh * scale);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return Promise.resolve(null);
      ctx.drawImage(video, 0, 0, w, h);
      return new Promise((resolve) => {
        canvas.toBlob(
          (blob) => resolve(blob ? new File([blob], "capture.jpg", { type: "image/jpeg" }) : null),
          "image/jpeg",
          0.8,
        );
      });
    }

    async function tick() {
      if (cancelledRef.current) return;
      if (!inFlightRef.current) {
        const file = await captureFile();
        if (file && !cancelledRef.current) {
          inFlightRef.current = true;
          try {
            const res = await api.scan(file);
            if (!cancelledRef.current) {
              setTop(res.candidates[0] ?? null);
              onResultRef.current(res);
            }
          } catch (e) {
            if (e instanceof ApiError && e.status === 503) {
              toast.error("The server's OCR engine (Tesseract) isn't installed.");
              cancelledRef.current = true;
              return;
            }
            // Swallow transient errors (e.g. network blips) — the next tick retries.
          } finally {
            inFlightRef.current = false;
          }
        }
      }
      if (!cancelledRef.current) {
        timerRef.current = window.setTimeout(tick, SCAN_INTERVAL_MS);
      }
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setErrorMsg(
          "The camera needs a secure context (localhost or HTTPS) and isn't available here.",
        );
        return;
      }
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (e) {
        setStatus("error");
        const name = e instanceof DOMException ? e.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setErrorMsg("Camera permission denied. Allow camera access, then retry.");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setErrorMsg("No camera was found on this device.");
        } else {
          setErrorMsg("Could not start the camera.");
        }
        return;
      }
      if (cancelledRef.current) {
        localStream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = localStream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = localStream;
        try {
          await video.play();
        } catch {
          // Autoplay may be blocked; muted + playsInline usually prevents this.
        }
      }
      setStatus("ready");
      timerRef.current = window.setTimeout(tick, SCAN_INTERVAL_MS);
    }

    start();

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      const s = streamRef.current ?? localStream;
      s?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [attempt, toast]);

  function retry() {
    setStatus("starting");
    setErrorMsg("");
    setTop(null);
    setAttempt((a) => a + 1);
  }

  if (status === "error") {
    return <ErrorState message={errorMsg} onRetry={retry} />;
  }

  return (
    <div>
      <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-black dark:border-slate-800">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />

        {/* Framing guide */}
        <div className="pointer-events-none absolute inset-4 rounded-lg border-2 border-dashed border-white/60" />

        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 text-slate-100">
            <Spinner label="Starting camera…" />
          </div>
        )}

        {status === "ready" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
            {top ? (
              <>
                <p className="text-sm font-semibold text-white">{top.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/30">
                    <div className="h-full bg-brand-500" style={{ width: pct(top.confidence) }} />
                  </div>
                  <span className="text-lg font-bold text-white">{pct(top.confidence)}</span>
                </div>
              </>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand-400" /> Searching…
              </span>
            )}
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
      <p className="mt-3 text-center text-xs text-slate-400">
        Point your camera at a single card. Matches update live below.
      </p>
    </div>
  );
}
