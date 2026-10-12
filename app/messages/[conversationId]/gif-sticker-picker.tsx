"use client";

import {
  Image as ImageIcon,
  Loader2,
  Search,
  Smile,
  Sparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

const ACCEPTED_IMAGE_TYPES = [
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

type PickerMode = "gifs" | "stickers";

type GiphyImage = {
  url?: string;
  width?: string;
  height?: string;
  size?: string;
};

type GiphyImageCollection = {
  original?: GiphyImage;
  downsized?: GiphyImage;
  fixed_width?: GiphyImage;
  fixed_width_small?: GiphyImage;
  preview_gif?: GiphyImage;
};

type GiphyResult = {
  id: string;
  title?: string;
  images?: GiphyImageCollection;
};

type GiphyResponse = {
  data?: GiphyResult[];
  meta?: {
    status?: number;
    msg?: string;
  };
};

type GifStickerPickerProps = {
  disabled?: boolean;
  onSelect: (file: File) => void;
  onError?: (message: string) => void;
};

function getPreviewUrl(result: GiphyResult) {
  return (
    result.images?.fixed_width_small?.url ??
    result.images?.preview_gif?.url ??
    result.images?.fixed_width?.url ??
    result.images?.original?.url ??
    ""
  );
}

function getDownloadUrl(result: GiphyResult) {
  return (
    result.images?.downsized?.url ??
    result.images?.original?.url ??
    result.images?.fixed_width?.url ??
    ""
  );
}

function getImageMimeType(
  blobType: string,
  assetUrl: string,
): string | null {
  const normalizedType = blobType
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (
    ACCEPTED_IMAGE_TYPES.includes(
      normalizedType as (typeof ACCEPTED_IMAGE_TYPES)[number],
    )
  ) {
    return normalizedType;
  }

  let pathname = "";

  try {
    pathname = new URL(assetUrl).pathname.toLowerCase();
  } catch {
    return null;
  }

  if (pathname.endsWith(".gif")) {
    return "image/gif";
  }

  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (pathname.endsWith(".png")) {
    return "image/png";
  }

  if (pathname.endsWith(".webp")) {
    return "image/webp";
  }

  return null;
}

function getExtension(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
    default:
      return "gif";
  }
}

export default function GifStickerPicker({
  disabled = false,
  onSelect,
  onError,
}: GifStickerPickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PickerMode>("gifs");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GiphyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const controller = new AbortController();

    const apiKey = (
      process.env.NEXT_PUBLIC_GIPHY_API_KEY ?? ""
    ).trim();

    if (!apiKey) {
      setResults([]);
      setLoading(false);
      setError(
        "GIF search is not configured yet. Add NEXT_PUBLIC_GIPHY_API_KEY to the app's environment settings.",
      );

      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    setLoading(true);
    setError("");

    const timer = window.setTimeout(
      async () => {
        try {
          const baseUrl =
            mode === "gifs"
              ? "https://api.giphy.com/v1/gifs"
              : "https://api.giphy.com/v1/stickers";

          const searchTerm = query.trim().slice(0, 50);

          const endpoint = searchTerm
            ? `${baseUrl}/search`
            : `${baseUrl}/trending`;

          const params = new URLSearchParams({
            api_key: apiKey,
            limit: "24",
            rating: "pg",
          });

          if (searchTerm) {
            params.set("q", searchTerm);
            params.set("lang", "en");
          }

          const response = await fetch(
            `${endpoint}?${params.toString()}`,
            {
              signal: controller.signal,
              cache: "no-store",
            },
          );

          const payload =
            (await response.json()) as GiphyResponse;

          if (!response.ok) {
            throw new Error(
              payload.meta?.msg ??
                "Unable to load GIFs right now.",
            );
          }

          if (cancelled) {
            return;
          }

          const nextResults = Array.isArray(payload.data)
            ? payload.data.filter(
                (item) =>
                  typeof item.id === "string" &&
                  Boolean(getPreviewUrl(item)) &&
                  Boolean(getDownloadUrl(item)),
              )
            : [];

          setResults(nextResults);
        } catch (requestError) {
          if (
            cancelled ||
            (requestError instanceof Error &&
              requestError.name === "AbortError")
          ) {
            return;
          }

          setResults([]);

          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load GIFs. Check your connection and try again.",
          );
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      },
      query.trim() ? 350 : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, mode, query]);

  function closePicker() {
    if (downloadingId) {
      return;
    }

    setOpen(false);
  }

  async function selectResult(result: GiphyResult) {
    if (disabled || downloadingId) {
      return;
    }

    const assetUrl = getDownloadUrl(result);

    if (!assetUrl) {
      setError("This item has no downloadable image.");
      return;
    }

    setDownloadingId(result.id);
    setError("");

    try {
      const parsedUrl = new URL(assetUrl);

      const trustedHost =
        parsedUrl.hostname === "giphy.com" ||
        parsedUrl.hostname.endsWith(".giphy.com");

      if (
        parsedUrl.protocol !== "https:" ||
        !trustedHost
      ) {
        throw new Error(
          "The selected GIF has an invalid media address.",
        );
      }

      const response = await fetch(assetUrl);

      if (!response.ok) {
        throw new Error(
          "Unable to prepare this GIF. Please choose another one.",
        );
      }

      const blob = await response.blob();

      const mimeType = getImageMimeType(
        blob.type,
        assetUrl,
      );

      if (!mimeType) {
        throw new Error(
          "This GIF uses an unsupported image format.",
        );
      }

      if (blob.size <= 0) {
        throw new Error(
          "This image is empty. Please choose another one.",
        );
      }

      if (blob.size > MAX_FILE_SIZE) {
        throw new Error(
          "This image exceeds Agoré's 15 MB message limit. Choose a smaller one.",
        );
      }

      const safeId = result.id.replace(
        /[^a-zA-Z0-9_-]/g,
        "",
      );

      const file = new File(
        [blob],
        `agore-${mode}-${safeId || "media"}.${getExtension(mimeType)}`,
        {
          type: mimeType,
          lastModified: Date.now(),
        },
      );

      onSelect(file);
      setOpen(false);
    } catch (selectionError) {
      const message =
        selectionError instanceof Error
          ? selectionError.message
          : "Unable to prepare this item.";

      setError(message);
      onError?.(message);
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled || Boolean(downloadingId)}
        aria-label="Open GIF and sticker picker"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="GIFs and stickers"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--muted-strong)] transition hover:border-[var(--accent)]/45 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Smile size={19} />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close GIF and sticker picker"
            onClick={closePicker}
            disabled={Boolean(downloadingId)}
            className="fixed inset-0 z-40 cursor-default bg-black/10"
          />

          <section
            role="dialog"
            aria-modal="false"
            aria-label="GIF and sticker picker"
            className="absolute bottom-full left-0 z-50 mb-3 flex max-h-[min(72vh,560px)] w-[min(92vw,390px)] flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-[0_20px_60px_rgba(0,0,0,0.2)] sm:w-[390px]"
          >
            <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Sparkles size={18} />
                </span>

                <div>
                  <h2 className="text-sm font-bold text-[var(--foreground)]">
                    Express yourself
                  </h2>

                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    GIFs and animated stickers
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closePicker}
                disabled={Boolean(downloadingId)}
                aria-label="Close picker"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:opacity-40"
              >
                <X size={17} />
              </button>
            </header>

            <div className="border-b border-[var(--border)] px-3 pb-3 pt-3">
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-muted)] p-1">
                <button
                  type="button"
                  onClick={() => setMode("gifs")}
                  className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition ${
                    mode === "gifs"
                      ? "bg-[var(--surface-raised)] text-[var(--foreground)] shadow-sm"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <ImageIcon size={15} />
                  GIFs
                </button>

                <button
                  type="button"
                  onClick={() => setMode("stickers")}
                  className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition ${
                    mode === "stickers"
                      ? "bg-[var(--surface-raised)] text-[var(--foreground)] shadow-sm"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <Smile size={15} />
                  Stickers
                </button>
              </div>

              <div className="relative mt-3">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />

                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(event.target.value)
                  }
                  maxLength={50}
                  placeholder={
                    mode === "gifs"
                      ? "Search GIFs…"
                      : "Search stickers…"
                  }
                  aria-label={
                    mode === "gifs"
                      ? "Search GIFs"
                      : "Search stickers"
                  }
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] pl-10 pr-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/10"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {error ? (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4">
                  <p className="text-xs leading-5 text-[var(--muted-strong)]">
                    {error}
                  </p>

                  {!process.env.NEXT_PUBLIC_GIPHY_API_KEY ? (
                    <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                      Create a GIPHY developer app and add its
                      API key as NEXT_PUBLIC_GIPHY_API_KEY,
                      then rebuild the app.
                    </p>
                  ) : null}
                </div>
              ) : loading ? (
                <div className="flex min-h-44 items-center justify-center">
                  <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                    <Loader2
                      size={18}
                      className="animate-spin"
                    />
                    Loading {mode}…
                  </div>
                </div>
              ) : results.length === 0 ? (
                <div className="flex min-h-44 flex-col items-center justify-center px-5 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-muted)] text-[var(--muted)]">
                    <Search size={20} />
                  </span>

                  <p className="mt-3 text-sm font-semibold text-[var(--foreground)]">
                    No results found
                  </p>

                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    Try another search term.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {results.map((result) => {
                    const previewUrl =
                      getPreviewUrl(result);

                    const isDownloading =
                      downloadingId === result.id;

                    return (
                      <button
                        type="button"
                        key={result.id}
                        onClick={() =>
                          void selectResult(result)
                        }
                        disabled={
                          disabled ||
                          Boolean(downloadingId)
                        }
                        aria-label={`Send ${result.title?.trim() || (mode === "gifs" ? "GIF" : "sticker")}`}
                        title={
                          result.title?.trim() ||
                          (mode === "gifs"
                            ? "Send GIF"
                            : "Send sticker")
                        }
                        className="group relative flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] transition hover:border-[var(--accent)]/60 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <img
                          src={previewUrl}
                          alt=""
                          loading="lazy"
                          className={`h-full w-full object-cover transition ${
                            isDownloading
                              ? "opacity-30"
                              : "opacity-100 group-hover:scale-[1.04]"
                          }`}
                        />

                        {isDownloading ? (
                          <span className="absolute inset-0 flex items-center justify-center text-[var(--accent)]">
                            <Loader2
                              size={23}
                              className="animate-spin"
                            />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}

              {downloadingId ? (
                <p className="mt-3 text-center text-[11px] text-[var(--muted)]">
                  Preparing media for Agoré…
                </p>
              ) : null}
            </div>

            <footer className="flex shrink-0 items-center justify-between border-t border-[var(--border)] px-4 py-2.5">
              <span className="text-[10px] text-[var(--muted)]">
                Powered by GIPHY
              </span>

              <span className="text-[10px] text-[var(--muted)]">
                Select an item to send
              </span>
            </footer>
          </section>
        </>
      ) : null}
    </div>
  );
}