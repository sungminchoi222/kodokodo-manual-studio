"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { uploadNewFile, type UploadTarget } from "@/lib/upload-client";

/** 음성 메모: MediaRecorder 지원 시 앱 내 녹음, 아니면 기기 녹음 파일 선택 */
export function VoiceRecorder({ target }: { target: UploadTarget }) {
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<"idle" | "recording" | "uploading">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  async function upload(file: File) {
    setState("uploading");
    const res = await uploadNewFile(file, { ...target, role: "voice_memo" });
    setState("idle");
    if (!res.ok) setError(res.error);
    router.refresh();
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = recorder.mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : "webm";
        void upload(new File(chunksRef.current, `voice-memo-${Date.now()}.${ext}`, { type }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setSeconds(0);
      setState("recording");
    } catch {
      setError("Microphone is not available. Allow microphone access or choose a recording file.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {supported && state !== "recording" && (
        <button
          type="button"
          disabled={state === "uploading"}
          onClick={() => void start()}
          className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold disabled:opacity-50"
        >
          {state === "uploading" ? "Uploading voice memo…" : "Record voice memo"}
        </button>
      )}
      {state === "recording" && (
        <button
          type="button"
          onClick={() => recorderRef.current?.stop()}
          className="min-h-11 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white"
        >
          Stop · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </button>
      )}
      <button type="button" onClick={() => fileRef.current?.click()} className="text-sm underline">
        Choose audio file
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
      {error && <p className="w-full text-xs text-red-700">{error}</p>}
    </div>
  );
}
