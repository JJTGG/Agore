"use client";

import {
  Mic,
  Square,
  Loader2,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/browser";

const supabase = createClient();

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mpeg",
] as const;

type SupportedMimeType =
  | "audio/webm"
  | "audio/mp4"
  | "audio/ogg"
  | "audio/mpeg";

type VoiceNoteComposerProps = {
  conversationId: string;
  disabled?: boolean;
  onSent?: () => void;
  onError?: (message: string) => void;
};

function normalizeMimeType(value: string): SupportedMimeType | null {
  const baseType = value.split(";")[0]?.trim().toLowerCase();

  switch (baseType) {
    case "audio/webm":
      return "audio/webm";
    case "audio/mp4":
      return "audio/mp4";
    case "audio/ogg":
      return "audio/ogg";
    case "audio/mpeg":
      return "audio/mpeg";
    default:
      return null;
  }
}

function getRecorderMimeType(): {
  recorderMimeType: string;
  uploadMimeType: SupportedMimeType;
} | null {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return null;
  }

  for (const candidate of MIME_CANDIDATES) {
    if (!MediaRecorder.isTypeSupported(candidate)) {
      continue;
    }

    const normalized = normalizeMimeType(candidate);

    if (!normalized) {
      continue;
    }

    return {
      recorderMimeType: candidate,
      uploadMimeType: normalized,
    };
  }

  return null;
}

function getAudioExtension(mimeType: SupportedMimeType) {
  switch (mimeType) {
    case "audio/webm":
      return "webm";
    case "audio/mp4":
      return "mp4";
    case "audio/ogg":
      return "ogg";
    case "audio/mpeg":
      return "mp3";
  }
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(
    0,
    Math.floor(milliseconds / 1000),
  );

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function VoiceNoteComposer({
  conversationId,
  disabled = false,
  onSent,
  onError,
}: VoiceNoteComposerProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const conversationIdRef = useRef(conversationId);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const interval = window.setInterval(() => {
      const startedAt = startedAtRef.current;

      if (!startedAt) {
        return;
      }

      setElapsedMs(Date.now() - startedAt);
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRecording]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;

      recorderRef.current?.stop();

      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      recorderRef.current = null;
      streamRef.current = null;
    };
  }, []);

  function reportError(message: string) {
    onError?.(message);
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    streamRef.current = null;
  }

  async function cleanupPreparedMessage(messageId: string) {
    try {
      await fetch(
        `/api/conversations/${encodeURIComponent(
          conversationIdRef.current,
        )}/voice?messageId=${encodeURIComponent(messageId)}`,
        {
          method: "DELETE",
        },
      );
    } catch {
      // Cleanup is best-effort. The server route remains the final
      // authority for removing abandoned voice-message state.
    }
  }

  async function uploadVoiceMessage(
    blob: Blob,
    mimeType: SupportedMimeType,
    durationMs: number,
  ) {
    setIsProcessing(true);

    let preparedMessageId: string | null = null;

    try {
      const extension = getAudioExtension(mimeType);
      const fileName = `voice-${Date.now()}.${extension}`;

      const prepareResponse = await fetch(
        `/api/conversations/${encodeURIComponent(
          conversationIdRef.current,
        )}/voice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "prepare",
            mime_type: mimeType,
            file_name: fileName,
          }),
        },
      );

      const prepareData = await prepareResponse.json();

      if (prepareResponse.status === 401) {
        reportError("Your session has expired. Please sign in again.");
        return;
      }

      if (!prepareResponse.ok) {
        reportError(
          prepareData.error ??
            "Unable to prepare the voice message.",
        );
        return;
      }

      const messageId = prepareData.message?.id as string | undefined;
      const storagePath = prepareData.storage_path as
        | string
        | undefined;

      if (!messageId || !storagePath) {
        reportError(
          "The voice message could not be prepared correctly.",
        );
        return;
      }

      preparedMessageId = messageId;

      const { error: uploadError } = await supabase.storage
        .from("message-media")
        .upload(storagePath, blob, {
          contentType: mimeType,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error(
          "Agore voice upload failed:",
          uploadError,
        );

        reportError(
          "The voice recording could not be uploaded.",
        );

        await cleanupPreparedMessage(messageId);
        return;
      }

      const finalizeResponse = await fetch(
        `/api/conversations/${encodeURIComponent(
          conversationIdRef.current,
        )}/voice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "finalize",
            message_id: messageId,
            storage_path: storagePath,
            file_name: fileName,
            mime_type: mimeType,
            size_bytes: blob.size,
            duration_ms: Math.max(
              0,
              Math.round(durationMs),
            ),
          }),
        },
      );

      const finalizeData = await finalizeResponse.json();

      if (finalizeResponse.status === 401) {
        reportError("Your session has expired. Please sign in again.");
        await cleanupPreparedMessage(messageId);
        return;
      }

      if (!finalizeResponse.ok) {
        reportError(
          finalizeData.error ??
            "Unable to finish the voice message.",
        );

        await cleanupPreparedMessage(messageId);
        return;
      }

      onSent?.();
    } catch (error) {
      console.error(
        "Agore voice message processing failed:",
        error,
      );

      reportError(
        "Something went wrong while sending the voice message.",
      );

      if (preparedMessageId) {
        await cleanupPreparedMessage(preparedMessageId);
      }
    } finally {
      setIsProcessing(false);
    }
  }

  async function startRecording() {
    if (
      disabled ||
      isRecording ||
      isProcessing ||
      !conversationId
    ) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      reportError(
        "Your browser does not support microphone recording.",
      );
      return;
    }

    const recorderType = getRecorderMimeType();

    if (!recorderType) {
      reportError(
        "Your browser does not support a compatible voice recording format.",
      );
      return;
    }

    setElapsedMs(0);
    setIsProcessing(false);
    cancelledRef.current = false;
    chunksRef.current = [];

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      if (disabled || cancelledRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: recorderType.recorderMimeType,
      });

      streamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        reportError(
          "The browser could not continue the voice recording.",
        );

        setIsRecording(false);
        recorderRef.current = null;
        stopStream();
      };

      recorder.onstop = () => {
        const startedAt = startedAtRef.current;
        const durationMs =
          startedAt === null
            ? 0
            : Math.max(0, Date.now() - startedAt);

        startedAtRef.current = null;
        setIsRecording(false);
        setElapsedMs(durationMs);

        const chunks = chunksRef.current;
        chunksRef.current = [];

        recorderRef.current = null;
        stopStream();

        if (cancelledRef.current || chunks.length === 0) {
          return;
        }

        const blob = new Blob(chunks, {
          type: recorderType.recorderMimeType,
        });

        if (blob.size <= 0) {
          reportError(
            "The voice recording was empty.",
          );
          return;
        }

        const maxBytes = 15 * 1024 * 1024;

        if (blob.size > maxBytes) {
          reportError(
            "That recording is larger than the 15 MB message limit.",
          );
          return;
        }

        const maxDurationMs = 60 * 60 * 1000;

        if (durationMs > maxDurationMs) {
          reportError(
            "That recording is longer than the allowed limit.",
          );
          return;
        }

        void uploadVoiceMessage(
          blob,
          recorderType.uploadMimeType,
          durationMs,
        );
      };

      startedAtRef.current = Date.now();
      setIsRecording(true);

      recorder.start();
    } catch (error) {
      console.error(
        "Agore microphone permission failed:",
        error,
      );

      if (
        error instanceof DOMException &&
        error.name === "NotAllowedError"
      ) {
        reportError(
          "Microphone permission was denied.",
        );
      } else if (
        error instanceof DOMException &&
        error.name === "NotFoundError"
      ) {
        reportError(
          "No microphone was found on this device.",
        );
      } else {
        reportError(
          "Unable to start voice recording.",
        );
      }

      setIsRecording(false);
      recorderRef.current = null;
      stopStream();
    }
  }

  function stopRecording() {
    if (!isRecording) {
      return;
    }

    const recorder = recorderRef.current;

    if (!recorder) {
      setIsRecording(false);
      stopStream();
      return;
    }

    if (recorder.state === "recording") {
      recorder.stop();
    }
  }

  function cancelRecording() {
    cancelledRef.current = true;

    const recorder = recorderRef.current;

    if (recorder && recorder.state === "recording") {
      recorder.stop();
    } else {
      recorderRef.current = null;
      stopStream();
      setIsRecording(false);
      setElapsedMs(0);
    }

    chunksRef.current = [];
    startedAtRef.current = null;
    setElapsedMs(0);
  }

  if (isRecording) {
    return (
      <div className="inline-flex h-11 items-center gap-2 rounded-full border border-[#e1d4d4] bg-white px-2 shadow-sm">
        <button
          type="button"
          onClick={cancelRecording}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#8d2f2f] transition hover:bg-[#fff1f1]"
          aria-label="Cancel voice recording"
          title="Cancel"
        >
          <Trash2 size={15} />
        </button>

        <span
          className="min-w-[46px] text-center text-xs font-semibold tabular-nums text-[#6d7177]"
          aria-live="polite"
        >
          {formatDuration(elapsedMs)}
        </span>

        <span className="hidden text-xs font-medium text-[#777b81] sm:inline">
          Recording
        </span>

        <button
          type="button"
          onClick={stopRecording}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#8d2f2f] text-white transition hover:bg-[#762525]"
          aria-label="Stop and send voice recording"
          title="Stop and send"
        >
          <Square size={13} fill="currentColor" />
        </button>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div
        className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfe4ef] bg-white px-4 text-xs font-semibold text-[#5f6670]"
        aria-live="polite"
      >
        <Loader2
          size={15}
          className="animate-spin text-[#2148b8]"
        />
        Sending voice…
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void startRecording()}
      disabled={disabled}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d9d8d2] bg-white text-[#5d6269] transition hover:border-[#b8c9f3] hover:bg-[#f8faff] hover:text-[#2148b8] disabled:cursor-not-allowed disabled:opacity-50"
      aria-label="Record voice message"
      title="Record voice message"
    >
      <Mic size={17} />
    </button>
  );
}