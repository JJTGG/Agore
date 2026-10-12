"use client";

import { useEffect, useState } from "react";
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Download,
  File,
  FileArchive,
  FileCode2,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  PlaySquare,
  X,
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
  const rawName = storagePath.split("/").pop() ?? "Attachment";

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
  if (bytes < 1024) return `${bytes} B`;

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
  if (mimeType.startsWith("audio/")) return "Audio";
  if (mimeType === "application/pdf") return "PDF";

  if (
    mimeType.includes("zip") ||
    mimeType.includes("archive") ||
    mimeType.includes("compressed")
  ) {
    return "Archive";
  }

  return "File";
}

export default function PostMedia({ media }: PostMediaProps) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeImageId, setActiveImageId] = useState<string | null>(
    null,
  );

  const imageMedia = media.filter(
    (item) =>
      item.mime_type.toLowerCase().startsWith("image/") &&
      Boolean(urls[item.id]),
  );

  const activeImage = imageMedia.find(
    (item) => item.id === activeImageId,
  );

  const activeImageUrl = activeImage
    ? urls[activeImage.id]
    : undefined;

  useEffect(() => {
    let active = true;

    async function loadUrls() {
      if (media.length === 0) {
        setUrls({});
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const entries = await Promise.all(
          media.map(async (item) => {
            const { data, error } = await supabase.storage
              .from("post-media")
              .createSignedUrl(item.storage_path, 60 * 60);

            if (error || !data?.signedUrl) {
              console.error(
                "Failed to create Agoré post media URL:",
                error,
              );

              return null;
            }

            return [item.id, data.signedUrl] as const;
          }),
        );

        if (!active) return;

        setUrls(
          Object.fromEntries(
            entries.filter(
              (
                entry,
              ): entry is readonly [string, string] =>
                entry !== null,
            ),
          ),
        );
      } catch (error) {
        console.error(
          "Unable to load Agoré post media:",
          error,
        );

        if (active) setUrls({});
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadUrls();

    return () => {
      active = false;
    };
  }, [media]);

  useEffect(() => {
    if (!activeImageId) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveImageId(null);
        return;
      }

      if (
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight"
      ) {
        return;
      }

      const availableImages = media.filter(
        (item) =>
          item.mime_type.toLowerCase().startsWith("image/") &&
          Boolean(urls[item.id]),
      );

      if (availableImages.length < 2) return;

      const currentIndex = availableImages.findIndex(
        (item) => item.id === activeImageId,
      );

      if (currentIndex < 0) return;

      event.preventDefault();

      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex =
        (currentIndex + direction + availableImages.length) %
        availableImages.length;

      setActiveImageId(availableImages[nextIndex].id);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeImageId, media, urls]);

  function moveImage(direction: -1 | 1) {
    if (!activeImage || imageMedia.length < 2) return;

    const currentIndex = imageMedia.findIndex(
      (item) => item.id === activeImage.id,
    );

    if (currentIndex < 0) return;

    const nextIndex =
      (currentIndex + direction + imageMedia.length) %
      imageMedia.length;

    setActiveImageId(imageMedia[nextIndex].id);
  }

  if (media.length === 0) return null;

  if (loading) {
    return (
      <div className="mt-4 flex items-center justify-center py-6">
        <Loader2
          size={18}
          className="animate-spin text-[var(--muted)]"
          aria-label="Loading post media"
        />
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 space-y-3">
        {media.map((item) => {
          const url = urls[item.id];
          const mimeType = item.mime_type.toLowerCase();
          const isImage = mimeType.startsWith("image/");
          const isVideo = mimeType.startsWith("video/");
          const isAudio = mimeType.startsWith("audio/");

          if (!url) {
            if (isImage || isVideo) {
              return (
                <div
                  key={item.id}
                  role="status"
                  className="flex min-h-24 items-center justify-center gap-2 rounded-2xl bg-[var(--surface-muted)] px-4 text-sm text-[var(--muted)]"
                >
                  {isImage ? (
                    <ImageIcon size={17} />
                  ) : (
                    <Film size={17} />
                  )}
                  <span>
                    {isImage
                      ? "Photo unavailable"
                      : "Video unavailable"}
                  </span>
                </div>
              );
            }

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
                    Attachment
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    This file could not be loaded.
                  </p>
                </div>
              </div>
            );
          }

          // Photos appear directly in the post.
          // No storage filename or separate "View image" footer.
          if (isImage) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveImageId(item.id)}
                aria-label="Open photo"
                aria-haspopup="dialog"
                className="group block w-full cursor-zoom-in overflow-hidden rounded-2xl bg-[var(--surface-muted)] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <img
                  src={url}
                  alt="Photo attached to post"
                  width={item.width ?? undefined}
                  height={item.height ?? undefined}
                  loading="lazy"
                  decoding="async"
                  className="block max-h-[620px] w-full object-contain transition-opacity duration-200 group-hover:opacity-95"
                />
              </button>
            );
          }

          // Videos are also rendered as native post media,
          // without filename or file-information panels.
          if (isVideo) {
            return (
              <video
                key={item.id}
                src={url}
                controls
                playsInline
                preload="metadata"
                aria-label="Video attached to post"
                className="block max-h-[620px] w-full rounded-2xl bg-black"
              />
            );
          }

          if (isAudio) {
            return (
              <div
                key={item.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <AudioLines size={19} />
                  </span>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {getFileName(item.storage_path)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Audio · {formatFileSize(item.size_bytes)}
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
                className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)]"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                      <FileText size={18} />
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {getFileName(item.storage_path)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        PDF · {formatFileSize(item.size_bytes)}
                      </p>
                    </div>
                  </div>

                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)]">
                    <PlaySquare size={14} />
                    Preview
                  </span>
                </div>

                <iframe
                  src={url}
                  title={getFileName(item.storage_path)}
                  className="h-[520px] w-full border-t border-[var(--border)] bg-white"
                />
              </div>
            );
          }

          const Icon = getFileIcon(mimeType);

          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface)] text-[var(--accent)]">
                  <Icon size={19} />
                </span>

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {getFileName(item.storage_path)}
                  </p>
                  <p className="mt-1 truncate text-xs text-[var(--muted)]">
                    {getMediaLabel(mimeType)} ·{" "}
                    {formatFileSize(item.size_bytes)}
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
                Open file
              </a>
            </div>
          );
        })}
      </div>

      {activeImage && activeImageUrl ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-0 sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setActiveImageId(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Photo viewer"
            className="flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-[#08090D] text-white sm:h-[92dvh] sm:rounded-2xl sm:border sm:border-white/10 sm:shadow-2xl"
          >
            <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-white/10 px-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Photo</p>
                <p className="mt-0.5 text-xs text-white/55">
                  Agoré
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveImageId(null)}
                aria-label="Close photo viewer"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
              >
                <X size={21} />
              </button>
            </header>

            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
              <img
                key={activeImage.id}
                src={activeImageUrl}
                alt="Photo"
                draggable={false}
                className="max-h-full max-w-full select-none object-contain"
              />

              {imageMedia.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => moveImage(-1)}
                    aria-label="Previous photo"
                    className="absolute left-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white"
                  >
                    <ChevronLeft size={25} />
                  </button>

                  <button
                    type="button"
                    onClick={() => moveImage(1)}
                    aria-label="Next photo"
                    className="absolute right-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white"
                  >
                    <ChevronRight size={25} />
                  </button>
                </>
              ) : null}
            </div>

            {imageMedia.length > 1 ? (
              <footer className="flex min-h-12 shrink-0 items-center justify-end border-t border-white/10 px-4 text-xs tabular-nums text-white/60">
                {imageMedia.findIndex(
                  (item) => item.id === activeImage.id,
                ) + 1}
                {" / "}
                {imageMedia.length}
              </footer>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}