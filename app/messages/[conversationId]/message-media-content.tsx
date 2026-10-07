"use client";

import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const supabase = createClient();

type MessageMedia = {
  id: string;
  message_id: string;
  media_type: "image" | "file" | "audio";
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  created_at: string;
};

type MessageMediaContentProps = {
  media: MessageMedia[];
  isOwn: boolean;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(0)} KB`;
  }

  const megabytes = kilobytes / 1024;

  if (megabytes < 1024) {
    return `${megabytes.toFixed(1)} MB`;
  }

  return `${(megabytes / 1024).toFixed(1)} GB`;
}

export default function MessageMediaContent({
  media,
  isOwn,
}: MessageMediaContentProps) {
  const [signedUrls, setSignedUrls] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const relevantMedia = media.filter(
      (item) =>
        item.media_type === "image" ||
        item.media_type === "file",
    );

    if (relevantMedia.length === 0) {
      setSignedUrls({});
      return;
    }

    async function loadSignedUrls() {
      setLoading(true);

      try {
        const results = await Promise.all(
          relevantMedia.map(async (item) => {
            const { data, error } =
              await supabase.storage
                .from("message-media")
                .createSignedUrl(
                  item.storage_path,
                  60 * 60,
                );

            if (error || !data?.signedUrl) {
              return null;
            }

            return {
              id: item.id,
              url: data.signedUrl,
            };
          }),
        );

        if (!active) {
          return;
        }

        const nextUrls: Record<string, string> = {};

        for (const result of results) {
          if (result) {
            nextUrls[result.id] = result.url;
          }
        }

        setSignedUrls(nextUrls);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSignedUrls();

    return () => {
      active = false;
    };
  }, [media]);

  const visualMedia = media.filter(
    (item) =>
      item.media_type === "image" ||
      item.media_type === "file",
  );

  if (visualMedia.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {visualMedia.map((item) => {
        const signedUrl =
          signedUrls[item.id];

        const isImage =
          item.media_type === "image";

        if (!signedUrl) {
          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 rounded-2xl border px-3 py-3 ${
                isOwn
                  ? "border-white/15 bg-white/10"
                  : "border-[var(--border)] bg-[var(--surface)]"
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  isOwn
                    ? "bg-white/10 text-white/70"
                    : "bg-[var(--surface-muted)] text-[var(--accent)]"
                }`}
              >
                {loading ? (
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                ) : isImage ? (
                  <ImageIcon size={18} />
                ) : (
                  <FileText size={18} />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-xs font-semibold ${
                    isOwn
                      ? "text-white"
                      : "text-[var(--foreground)]"
                  }`}
                >
                  {item.file_name}
                </p>

                <p
                  className={`mt-0.5 text-[10px] ${
                    isOwn
                      ? "text-white/65"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {loading
                    ? "Loading attachment…"
                    : "Attachment unavailable"}
                </p>
              </div>
            </div>
          );
        }

        if (isImage) {
          return (
            <a
              key={item.id}
              href={signedUrl}
              target="_blank"
              rel="noreferrer"
              className="group/media block max-w-full overflow-hidden rounded-2xl border border-black/5 bg-black/5"
              aria-label={`Open ${item.file_name}`}
            >
              <img
                src={signedUrl}
                alt={item.file_name}
                loading="lazy"
                decoding="async"
                className="max-h-[26rem] w-auto max-w-full object-contain transition duration-200 group-hover/media:opacity-95"
              />
            </a>
          );
        }

        return (
          <a
            key={item.id}
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition ${
              isOwn
                ? "border-white/15 bg-white/10 hover:bg-white/15"
                : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-soft)]"
            }`}
            aria-label={`Open ${item.file_name}`}
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                isOwn
                  ? "bg-white/10 text-white"
                  : "bg-[var(--accent-soft)] text-[var(--accent)]"
              }`}
            >
              <FileText size={18} />
            </div>

            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-sm font-semibold ${
                  isOwn
                    ? "text-white"
                    : "text-[var(--foreground)]"
                }`}
              >
                {item.file_name}
              </p>

              <p
                className={`mt-0.5 text-[10px] ${
                  isOwn
                    ? "text-white/65"
                    : "text-[var(--muted)]"
                }`}
              >
                {formatFileSize(
                  item.size_bytes,
                )}
                {item.mime_type ===
                "application/pdf"
                  ? " · PDF"
                  : " · File"}
              </p>
            </div>

            <ExternalLink
              size={15}
              className={
                isOwn
                  ? "shrink-0 text-white/65"
                  : "shrink-0 text-[var(--muted)]"
              }
            />
          </a>
        );
      })}
    </div>
  );
}