"use client";

import {
  AlertCircle,
  Loader2,
  Pause,
  Play,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const supabase = createClient();

type VoiceMessagePlayerProps = {
  storagePath: string;
  durationMs: number | null;
  isOwn: boolean;
};

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(
    0,
    Math.floor(milliseconds / 1000),
  );

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

export default function VoiceMessagePlayer({
  storagePath,
  durationMs,
  isOwn,
}: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadAudioUrl() {
      setLoading(true);
      setError(false);
      setAudioUrl(null);
      setCurrentMs(0);
      setPlaying(false);

      const { data, error: signedUrlError } =
        await supabase.storage
          .from("message-media")
          .createSignedUrl(storagePath, 60 * 60);

      if (!active) {
        return;
      }

      if (signedUrlError || !data?.signedUrl) {
        console.error(
          "Agore voice message signed URL failed:",
          signedUrlError,
        );

        setError(true);
        setLoading(false);
        return;
      }

      setAudioUrl(data.signedUrl);
      setLoading(false);
    }

    void loadAudioUrl();

    return () => {
      active = false;
    };
  }, [storagePath]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const handleTimeUpdate = () => {
      const currentAudio = audioRef.current;

      if (!currentAudio) {
        return;
      }

      setCurrentMs(currentAudio.currentTime * 1000);
    };

    const handlePlay = () => {
      setPlaying(true);
    };

    const handlePause = () => {
      setPlaying(false);
    };

    const handleEnded = () => {
      const currentAudio = audioRef.current;

      setPlaying(false);
      setCurrentMs(0);

      if (currentAudio) {
        currentAudio.currentTime = 0;
      }
    };

    const handleError = () => {
      setPlaying(false);
      setError(true);
    };

    audio.addEventListener(
      "timeupdate",
      handleTimeUpdate,
    );
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener(
        "timeupdate",
        handleTimeUpdate,
      );
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener(
        "pause",
        handlePause,
      );
      audio.removeEventListener(
        "ended",
        handleEnded,
      );
      audio.removeEventListener(
        "error",
        handleError,
      );
    };
  }, [audioUrl]);

  async function togglePlayback() {
    const audio = audioRef.current;

    if (!audio || !audioUrl || loading || error) {
      return;
    }

    try {
      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
    } catch (playbackError) {
      console.error(
        "Agore voice playback failed:",
        playbackError,
      );

      setPlaying(false);
      setError(true);
    }
  }

  const effectiveDurationMs =
    durationMs && durationMs > 0
      ? durationMs
      : audioRef.current?.duration &&
          Number.isFinite(audioRef.current.duration)
        ? audioRef.current.duration * 1000
        : 0;

  const progress =
    effectiveDurationMs > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (currentMs / effectiveDurationMs) * 100,
          ),
        )
      : 0;

  if (error) {
    return (
      <div
        className={`flex min-w-[220px] items-center gap-2 text-xs ${
          isOwn
            ? "text-white/80"
            : "text-[#777b81]"
        }`}
      >
        <AlertCircle size={15} />
        <span>Voice message unavailable</span>
      </div>
    );
  }

  return (
    <div className="flex min-w-[220px] items-center gap-3">
      <button
        type="button"
        onClick={() => void togglePlayback()}
        disabled={loading || !audioUrl}
        aria-label={
          playing
            ? "Pause voice message"
            : "Play voice message"
        }
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${
          isOwn
            ? "bg-white/15 text-white hover:bg-white/25"
            : "bg-white text-[#2148b8] shadow-sm hover:bg-[#f7f8fc]"
        }`}
      >
        {loading ? (
          <Loader2
            size={16}
            className="animate-spin"
          />
        ) : playing ? (
          <Pause
            size={16}
            fill="currentColor"
          />
        ) : (
          <Play
            size={16}
            fill="currentColor"
            className="ml-0.5"
          />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className={`h-1.5 overflow-hidden rounded-full ${
            isOwn
              ? "bg-white/20"
              : "bg-[#dfe4ef]"
          }`}
        >
          <div
            className={`h-full rounded-full transition-[width] ${
              isOwn
                ? "bg-white"
                : "bg-[#2148b8]"
            }`}
            style={{
              width: `${progress}%`,
            }}
          />
        </div>

        <div
          className={`mt-1.5 flex items-center justify-between text-[11px] tabular-nums ${
            isOwn
              ? "text-white/70"
              : "text-[#85898f]"
          }`}
        >
          <span>{formatDuration(currentMs)}</span>

          <span>
            {effectiveDurationMs > 0
              ? formatDuration(effectiveDurationMs)
              : "Voice"}
          </span>
        </div>
      </div>

      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          className="hidden"
        />
      ) : null}
    </div>
  );
}