"use client";

import { useEffect, useState } from "react";
import {
  AudioLines,
  Download,
  File,
  FileArchive,
  FileCode2,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  PlaySquare,
} from "lucide-react";

import { createClient } from "@/lib/supabase/browser";

export type PostMediaItem = {
  id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  sort_order: number;
  created_at: string;
};

type PostMediaProps = {
  media: PostMediaItem[];
};

const supabase = createClient();

function getFileName(storagePath: string) {
  const rawName =
    storagePath.split("/").pop() ??
    "Attachment";

  const withoutId = rawName.replace(
    /^[0-9a-f-]{36}-/,
    "",
  );

  try {
    return decodeURIComponent(withoutId);
  } catch {
    return withoutId;
  }
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType === "application/pdf") {
    return FileText;
  }

  if (
    mimeType.includes("zip") ||
    mimeType.includes("archive") ||
    mimeType.includes("compressed")
  ) {
    return FileArchive;
  }

  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("javascript") ||
    mimeType.includes("typescript") ||
    mimeType.includes("xml")
  ) {
    return FileCode2;
  }

  return File;
}

function getMediaLabel(mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return "Image";
  }

  if (mimeType.startsWith("video/")) {
    return "Video";
  }

  if (mimeType.startsWith("audio/")) {
    return "Audio";
  }

  if (mimeType === "application/pdf") {
    return "PDF";
  }

  if (
    mimeType.includes("zip") ||
    mimeType.includes("archive") ||
    mimeType.includes("compressed")
  ) {
    return "Archive";
  }

  return "File";
}

export default function PostMedia({
  media,
}: PostMediaProps) {
  const [urls, setUrls] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadUrls() {
      if (media.length === 0) {
        setUrls({});
        setLoading(false);
        return;
      }

      setLoading(true);

      const entries =
        await Promise.all(
          media.map(async (item) => {
            const { data, error } =
              await supabase.storage
                .from("post-media")
                .createSignedUrl(
                  item.storage_path,
                  60 * 60,
                );

            if (error) {
              console.error(
                "Failed to create Agore post media signed URL:",
                error,
              );

              return null;
            }

            return [
              item.id,
              data.signedUrl,
            ] as const;
          }),
        );

      if (!active) {
        return;
      }

      setUrls(
        Object.fromEntries(
          entries.filter(
            (
              entry,
            ): entry is readonly [
              string,
              string,
            ] => entry !== null,
          ),
        ),
      );

      setLoading(false);
    }

    void loadUrls();

    return () => {
      active = false;
    };
  }, [media]);

  if (media.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <div className="mt-5 flex items-center justify-center rounded-[1.5rem] border border-[var(--border)] bg-[var(--background)] px-5 py-8">
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <Loader2
            size={16}
            className="animate-spin"
          />
          Loading attachments…
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      {media.map((item) => {
        const url = urls[item.id];

        if (!url) {
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)] text-[var(--muted)]">
                <File size={18} />
              </span>

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {getFileName(
                    item.storage_path,
                  )}
                </p>

                <p className="mt-1 text-xs text-[var(--muted)]">
                  Attachment unavailable
                </p>
              </div>
            </div>
          );
        }

        const mimeType =
          item.mime_type.toLowerCase();

        if (mimeType.startsWith("image/")) {
          return (
            <a
              key={item.id}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="group block overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--background)]"
            >
              <img
                src={url}
                alt={getFileName(
                  item.storage_path,
                )}
                width={item.width ?? undefined}
                height={
                  item.height ?? undefined
                }
                className="max-h-[620px] w-full object-contain transition duration-300 group-hover:scale-[1.01]"
                loading="lazy"
              />

              <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <ImageIcon
                    size={15}
                    className="shrink-0 text-[var(--accent)]"
                  />

                  <span className="truncate text-xs font-medium text-[var(--muted)]">
                    {getFileName(
                      item.storage_path,
                    )}
                  </span>
                </div>

                <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">
                  Open
                </span>
              </div>
            </a>
          );
        }

        if (mimeType.startsWith("video/")) {
          return (
            <div
              key={item.id}
              className="overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-black"
            >
              <video
                src={url}
                controls
                preload="metadata"
                className="max-h-[620px] w-full"
              />

              <div className="flex items-center justify-between gap-3 bg-[var(--surface)] px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Film
                    size={15}
                    className="shrink-0 text-[var(--accent)]"
                  />

                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      {getFileName(
                        item.storage_path,
                      )}
                    </p>

                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                      {formatFileSize(
                        item.size_bytes,
                      )}
                    </p>
                  </div>
                </div>

                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--background)]"
                >
                  Open
                </a>
              </div>
            </div>
          );
        }

        if (mimeType.startsWith("audio/")) {
          return (
            <div
              key={item.id}
              className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--background)] p-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <AudioLines size={19} />
                </span>

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {getFileName(
                      item.storage_path,
                    )}
                  </p>

                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {getMediaLabel(
                      item.mime_type,
                    )}{" "}
                    ·{" "}
                    {formatFileSize(
                      item.size_bytes,
                    )}
                  </p>
                </div>
              </div>

              <audio
                src={url}
                controls
                preload="metadata"
                className="mt-4 w-full"
              />
            </div>
          );
        }

        if (mimeType === "application/pdf") {
          return (
            <div
              key={item.id}
              className="overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--background)]"
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <FileText size={18} />
                  </span>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {getFileName(
                        item.storage_path,
                      )}
                    </p>

                    <p className="mt-1 text-xs text-[var(--muted)]">
                      PDF ·{" "}
                      {formatFileSize(
                        item.size_bytes,
                      )}
                    </p>
                  </div>
                </div>

                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)]"
                >
                  <PlaySquare size={14} />
                  Open
                </a>
              </div>

              <iframe
                src={url}
                title={getFileName(
                  item.storage_path,
                )}
                className="h-[520px] w-full border-t border-[var(--border)] bg-white"
              />
            </div>
          );
        }

        const Icon =
          getFileIcon(item.mime_type);

        return (
          <div
            key={item.id}
            className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-[var(--border)] bg-[var(--background)] p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface)] text-[var(--accent)]">
                <Icon size={19} />
              </span>

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {getFileName(
                    item.storage_path,
                  )}
                </p>

                <p className="mt-1 truncate text-xs text-[var(--muted)]">
                  {getMediaLabel(
                    item.mime_type,
                  )}{" "}
                  ·{" "}
                  {formatFileSize(
                    item.size_bytes,
                  )}
                </p>
              </div>
            </div>

            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-soft)]"
            >
              <Download size={14} />
              Open
            </a>
          </div>
        );
      })}
    </div>
  );
}