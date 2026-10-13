"use client";

import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import type { SyntheticEvent } from "react";

import { createClient } from "@/lib/supabase/browser";
import { recordAgorePerformanceMetric } from "@/lib/performance/monitor";

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

type ImageTiming = {
  urlReadyAt: number;
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

function isVideoMedia(item: MessageMedia) {
  return (
    item.media_type === "file" &&
    Boolean(item.mime_type?.toLowerCase().startsWith("video/"))
  );
}

export default function MessageMediaContent({
  media,
  isOwn,
}: MessageMediaContentProps) {
  const [signedUrls, setSignedUrls] = useState<
    Record<string, string>
  >({});

  const [loading, setLoading] = useState(false);

  const [activeViewerId, setActiveViewerId] = useState<
    string | null
  >(null);

  // These references remain in memory only. They are not included
  // in diagnostic reports or persisted as identifying information.
  const imageTimingRef = useRef<
    Record<string, ImageTiming>
  >({});

  const completedImageLoadsRef = useRef<Set<string>>(
    new Set(),
  );

  const pendingImageLoadsRef = useRef<Set<string>>(
    new Set(),
  );

  const visualMedia = media.filter(
    (item) =>
      item.media_type === "image" ||
      item.media_type === "file",
  );

  const imageMedia = visualMedia.filter(
    (item) =>
      item.media_type === "image" &&
      Boolean(signedUrls[item.id]),
  );

  const activeMedia = visualMedia.find(
    (item) => item.id === activeViewerId,
  );

  const activeUrl = activeMedia
    ? signedUrls[activeMedia.id]
    : undefined;

  function recordSigningMetric(
    item: MessageMedia,
    durationMs: number,
    success: boolean,
  ) {
    const isImage = item.media_type === "image";

    recordAgorePerformanceMetric(
      isImage ? "image" : "resource",
      isImage
        ? "Message image URL signing"
        : "Message attachment URL signing",
      durationMs,
      "ms",
      {
        success,
        isImage,
      },
    );
  }

  function recordImageLoadFailure(
    mediaId: string,
    stage: "load" | "decode",
  ) {
    const timing = imageTimingRef.current[mediaId];

    if (!timing) {
      return;
    }

    const key = `${mediaId}:inline`;

    if (completedImageLoadsRef.current.has(key)) {
      return;
    }

    completedImageLoadsRef.current.add(key);
    pendingImageLoadsRef.current.delete(key);

    recordAgorePerformanceMetric(
      "image",
      stage === "decode"
        ? "Message image decode failed"
        : "Message image failed to load",
      Math.max(0, performance.now() - timing.urlReadyAt),
      "ms",
      {
        success: false,
        stageDecode: stage === "decode",
        includesLazyLoadingWait: true,
      },
    );
  }

  async function handleImageLoad(
    mediaId: string,
    event: SyntheticEvent<HTMLImageElement>,
  ) {
    const key = `${mediaId}:inline`;

    if (
      completedImageLoadsRef.current.has(key) ||
      pendingImageLoadsRef.current.has(key)
    ) {
      return;
    }

    const image = event.currentTarget;
    const timing = imageTimingRef.current[mediaId];

    if (!timing) {
      return;
    }

    pendingImageLoadsRef.current.add(key);

    try {
      if (typeof image.decode === "function") {
        await image.decode();
      }

      if (completedImageLoadsRef.current.has(key)) {
        return;
      }

      completedImageLoadsRef.current.add(key);
      pendingImageLoadsRef.current.delete(key);

      // Resource entries stay in browser memory. The signed URL
      // itself is never attached to a metric or diagnostic report.
      const source = image.currentSrc;
      const entries = source
        ? performance
            .getEntriesByName(source, "resource")
            .filter(
              (entry) =>
                entry.startTime >= timing.urlReadyAt - 1,
            )
        : [];

      const resource = entries.length > 0
        ? entries[entries.length - 1] as PerformanceResourceTiming
        : null;

      recordAgorePerformanceMetric(
        "image",
        "Message image ready (load + decode)",
        Math.max(0, performance.now() - timing.urlReadyAt),
        "ms",
        {
          success: true,
          includesLazyLoadingWait: true,
          resourceTimingAvailable: resource !== null,
          resourceDurationMs: resource
            ? resource.duration
            : 0,
          transferSizeBytes: resource
            ? resource.transferSize
            : 0,
        },
      );
    } catch {
      recordImageLoadFailure(mediaId, "decode");
    }
  }

  useEffect(() => {
    let active = true;

    async function loadSignedUrls() {
      if (visualMedia.length === 0) {
        setSignedUrls({});
        setLoading(false);
        imageTimingRef.current = {};
        completedImageLoadsRef.current.clear();
        pendingImageLoadsRef.current.clear();
        return;
      }

      setLoading(true);

      try {
        const results = await Promise.all(
          visualMedia.map(async (item) => {
            const startedAt = performance.now();

            try {
              const { data, error } = await supabase.storage
                .from("message-media")
                .createSignedUrl(
                  item.storage_path,
                  60 * 60,
                );

              if (error || !data?.signedUrl) {
                recordSigningMetric(
                  item,
                  performance.now() - startedAt,
                  false,
                );

                console.error(
                  "Failed to load Agoré message media:",
                  error,
                );

                return null;
              }

              const urlReadyAt = performance.now();

              recordSigningMetric(
                item,
                urlReadyAt - startedAt,
                true,
              );

              if (item.media_type === "image") {
                imageTimingRef.current[item.id] = {
                  urlReadyAt,
                };

                completedImageLoadsRef.current.delete(
                  `${item.id}:inline`,
                );

                pendingImageLoadsRef.current.delete(
                  `${item.id}:inline`,
                );
              }

              return {
                id: item.id,
                url: data.signedUrl,
              };
            } catch (error) {
              recordSigningMetric(
                item,
                performance.now() - startedAt,
                false,
              );

              console.error(
                "Failed to sign Agoré message media:",
                error,
              );

              return null;
            }
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
      } catch (error) {
        console.error(
          "Unable to load Agoré message attachments:",
          error,
        );
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

  useEffect(() => {
    if (!activeViewerId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveViewerId(null);
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
          item.media_type === "image" &&
          Boolean(signedUrls[item.id]),
      );

      if (availableImages.length < 2) {
        return;
      }

      const currentIndex = availableImages.findIndex(
        (item) => item.id === activeViewerId,
      );

      if (currentIndex < 0) {
        return;
      }

      const direction =
        event.key === "ArrowRight" ? 1 : -1;

      const nextIndex =
        (
          currentIndex +
          direction +
          availableImages.length
        ) % availableImages.length;

      event.preventDefault();

      setActiveViewerId(
        availableImages[nextIndex].id,
      );
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeViewerId, media, signedUrls]);

  function moveViewer(direction: -1 | 1) {
    if (
      !activeMedia ||
      activeMedia.media_type !== "image"
    ) {
      return;
    }

    if (imageMedia.length < 2) {
      return;
    }

    const currentIndex = imageMedia.findIndex(
      (item) => item.id === activeMedia.id,
    );

    if (currentIndex < 0) {
      return;
    }

    const nextIndex =
      (
        currentIndex +
        direction +
        imageMedia.length
      ) % imageMedia.length;

    setActiveViewerId(imageMedia[nextIndex].id);
  }

  if (visualMedia.length === 0) {
    return null;
  }

  return (
    <>
      <div className="space-y-3">
        {visualMedia.map((item) => {
          const signedUrl = signedUrls[item.id];

          const isImage =
            item.media_type === "image";

          const isVideo = isVideoMedia(item);

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
                  ) : isVideo ? (
                    <Film size={18} />
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
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  setActiveViewerId(item.id)
                }
                aria-label={`View ${item.file_name}`}
                aria-haspopup="dialog"
                className="group/media block max-w-full overflow-hidden rounded-2xl border border-black/5 bg-black/5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <img
                  src={signedUrl}
                  alt={item.file_name}
                  loading="lazy"
                  decoding="async"
                  onLoad={(event) => {
                    void handleImageLoad(item.id, event);
                  }}
                  onError={() => {
                    recordImageLoadFailure(item.id, "load");
                  }}
                  className="max-h-[26rem] w-auto max-w-full object-contain transition duration-200 group-hover/media:opacity-90"
                />
              </button>
            );
          }

          if (isVideo) {
            return (
              <div
                key={item.id}
                className="max-w-full overflow-hidden rounded-2xl border border-black/5 bg-black"
              >
                <video
                  src={signedUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-[26rem] w-full bg-black object-contain"
                  aria-label={`Play ${item.file_name}`}
                />

                <div className="flex items-center gap-2 px-3 py-2">
                  <Film
                    size={14}
                    className="shrink-0 text-[var(--muted)]"
                  />

                  <p className="truncate text-[11px] text-[var(--muted)]">
                    {item.file_name}
                  </p>

                  <span className="ml-auto shrink-0 text-[10px] text-[var(--muted)]">
                    {formatFileSize(item.size_bytes)}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                setActiveViewerId(item.id)
              }
              aria-label={`Preview ${item.file_name}`}
              aria-haspopup="dialog"
              className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                isOwn
                  ? "border-white/15 bg-white/10 hover:bg-white/15"
                  : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-soft)]"
              }`}
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
                  {formatFileSize(item.size_bytes)}
                  {item.mime_type === "application/pdf"
                    ? " · PDF"
                    : " · File"}
                </p>
              </div>

              <span
                className={`shrink-0 text-xs font-semibold ${
                  isOwn
                    ? "text-white/70"
                    : "text-[var(--accent)]"
                }`}
              >
                Preview
              </span>
            </button>
          );
        })}
      </div>

      {activeMedia && activeUrl ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-0 sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setActiveViewerId(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Media viewer: ${activeMedia.file_name}`}
            className="flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-[#08090D] text-white sm:h-[92dvh] sm:rounded-2xl sm:border sm:border-white/10 sm:shadow-2xl"
          >
            <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-white/10 px-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {activeMedia.file_name}
                </p>

                <p className="mt-0.5 text-xs text-white/55">
                  {activeMedia.media_type === "image"
                    ? "Image"
                    : isVideoMedia(activeMedia)
                      ? "Video"
                      : activeMedia.mime_type ===
                          "application/pdf"
                        ? "PDF document"
                        : "Attachment"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveViewerId(null)}
                aria-label="Close media viewer"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
              >
                <X size={21} />
              </button>
            </header>

            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
              {activeMedia.media_type === "image" ? (
                <>
                  <img
                    key={activeMedia.id}
                    src={activeUrl}
                    alt={activeMedia.file_name}
                    draggable={false}
                    className="max-h-full max-w-full select-none object-contain"
                  />

                  {imageMedia.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => moveViewer(-1)}
                        aria-label="Previous image"
                        className="absolute left-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white"
                      >
                        <ChevronLeft size={25} />
                      </button>

                      <button
                        type="button"
                        onClick={() => moveViewer(1)}
                        aria-label="Next image"
                        className="absolute right-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white"
                      >
                        <ChevronRight size={25} />
                      </button>
                    </>
                  ) : null}
                </>
              ) : isVideoMedia(activeMedia) ? (
                <video
                  key={activeMedia.id}
                  src={activeUrl}
                  controls
                  playsInline
                  autoPlay={false}
                  preload="metadata"
                  className="max-h-full max-w-full"
                />
              ) : activeMedia.mime_type ===
                "application/pdf" ? (
                <iframe
                  key={activeMedia.id}
                  src={activeUrl}
                  title={activeMedia.file_name}
                  className="h-full w-full border-0 bg-white"
                />
              ) : (
                <div className="mx-auto max-w-md px-6 text-center">
                  <FileText
                    size={42}
                    className="mx-auto text-white/60"
                  />

                  <p className="mt-4 text-sm font-semibold">
                    Preview unavailable
                  </p>

                  <p className="mt-2 text-sm leading-6 text-white/60">
                    Agoré cannot preview this attachment type
                    inside the conversation yet.
                  </p>

                  <a
                    href={activeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex min-h-10 items-center justify-center rounded-full border border-white/20 px-4 text-sm font-semibold transition hover:bg-white/10"
                  >
                    Open attachment
                  </a>
                </div>
              )}
            </div>

            <footer className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-t border-white/10 px-4 text-xs text-white/60">
              <span>
                {isVideoMedia(activeMedia)
                  ? "Agoré video player"
                  : activeMedia.media_type === "image"
                    ? "Agoré media viewer"
                    : "Attachment preview"}
              </span>

              {activeMedia.media_type === "image" &&
              imageMedia.length > 1 ? (
                <span className="tabular-nums">
                  {imageMedia.findIndex(
                    (item) => item.id === activeMedia.id,
                  ) + 1}{" "}
                  / {imageMedia.length}
                </span>
              ) : null}
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}