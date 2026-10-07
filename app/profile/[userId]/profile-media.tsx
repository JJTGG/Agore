"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import {
  AudioLines,
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
import type { PostMediaItem } from "@/components/post-media";

type MediaPost = {
  id: string;
  content: string;
  created_at: string;
  post_media: PostMediaItem[];
};

type ProfileMediaProps = {
  posts: MediaPost[];
};

type MediaEntry = {
  postId: string;
  content: string;
  createdAt: string;
  item: PostMediaItem;
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
    return decodeURIComponent(
      withoutId,
    );
  } catch {
    return withoutId;
  }
}

function getFileIcon(mimeType: string) {
  const type =
    mimeType.toLowerCase();

  if (type === "application/pdf") {
    return FileText;
  }

  if (
    type.includes("zip") ||
    type.includes("archive") ||
    type.includes("compressed")
  ) {
    return FileArchive;
  }

  if (
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("javascript") ||
    type.includes("typescript") ||
    type.includes("xml")
  ) {
    return FileCode2;
  }

  return File;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  ).format(new Date(value));
}

export default function ProfileMedia({
  posts,
}: ProfileMediaProps) {
  const entries = useMemo<MediaEntry[]>(
    () =>
      posts.flatMap((post) =>
        post.post_media.map(
          (item) => ({
            postId: post.id,
            content: post.content,
            createdAt:
              post.created_at,
            item,
          }),
        ),
      ),
    [posts],
  );

  const [urls, setUrls] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let active = true;

    async function loadUrls() {
      if (entries.length === 0) {
        setUrls({});
        setLoading(false);
        return;
      }

      setLoading(true);

      const results =
        await Promise.all(
          entries.map(
            async ({ item }) => {
              const {
                data,
                error,
              } =
                await supabase.storage
                  .from("post-media")
                  .createSignedUrl(
                    item.storage_path,
                    60 * 60,
                  );

              if (error) {
                console.error(
                  "Failed to create Agore profile media signed URL:",
                  error,
                );

                return null;
              }

              return [
                item.id,
                data.signedUrl,
              ] as const;
            },
          ),
        );

      if (!active) {
        return;
      }

      setUrls(
        Object.fromEntries(
          results.filter(
            (
              entry,
            ): entry is readonly [
              string,
              string,
            ] =>
              entry !== null,
          ),
        ),
      );

      setLoading(false);
    }

    void loadUrls();

    return () => {
      active = false;
    };
  }, [entries]);

  if (loading) {
    return (
      <div className="flex min-h-60 items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <Loader2
            size={17}
            className="animate-spin"
          />
          Loading media…
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <ImageIcon size={20} />
        </span>

        <p className="mt-4 text-sm font-medium">
          No media yet.
        </p>

        <p className="mt-1 text-sm text-[var(--muted)]">
          Photos, videos, audio, and files from this profile will appear
          here.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {entries.map(
          ({
            postId,
            content,
            createdAt,
            item,
          }) => {
            const url =
              urls[item.id];

            const mimeType =
              item.mime_type.toLowerCase();

            if (!url) {
              return (
                <Link
                  key={item.id}
                  href={`/post/${encodeURIComponent(
                    postId,
                  )}`}
                  className="flex min-h-40 flex-col items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 text-center transition hover:border-[var(--accent)]/40"
                >
                  <File
                    size={24}
                    className="text-[var(--muted)]"
                  />

                  <span className="mt-2 max-w-full truncate text-xs font-semibold">
                    {getFileName(
                      item.storage_path,
                    )}
                  </span>

                  <span className="mt-1 text-[10px] text-[var(--muted)]">
                    Open post
                  </span>
                </Link>
              );
            }

            if (
              mimeType.startsWith(
                "image/",
              )
            ) {
              return (
                <Link
                  key={item.id}
                  href={`/post/${encodeURIComponent(
                    postId,
                  )}`}
                  className="group relative aspect-square overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)]"
                >
                  <img
                    src={url}
                    alt={getFileName(
                      item.storage_path,
                    )}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    loading="lazy"
                  />

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8 opacity-0 transition duration-200 group-hover:opacity-100">
                    <p className="truncate text-[11px] font-semibold text-white">
                      {formatDate(
                        createdAt,
                      )}
                    </p>

                    <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/75">
                      {content}
                    </p>
                  </div>
                </Link>
              );
            }

            if (
              mimeType.startsWith(
                "video/",
              )
            ) {
              return (
                <Link
                  key={item.id}
                  href={`/post/${encodeURIComponent(
                    postId,
                  )}`}
                  className="group relative aspect-square overflow-hidden rounded-2xl border border-[var(--border)] bg-black"
                >
                  <video
                    src={url}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />

                  <span className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur">
                    <Film size={16} />
                  </span>

                  <span className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur">
                    <PlaySquare size={15} />
                  </span>
                </Link>
              );
            }

            if (
              mimeType.startsWith(
                "audio/",
              )
            ) {
              return (
                <Link
                  key={item.id}
                  href={`/post/${encodeURIComponent(
                    postId,
                  )}`}
                  className="group flex aspect-square flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface-muted)]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <AudioLines size={19} />
                  </span>

                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      {getFileName(
                        item.storage_path,
                      )}
                    </p>

                    <p className="mt-1 text-[10px] text-[var(--muted)]">
                      Audio ·{" "}
                      {formatFileSize(
                        item.size_bytes,
                      )}
                    </p>
                  </div>
                </Link>
              );
            }

            if (
              mimeType ===
              "application/pdf"
            ) {
              return (
                <Link
                  key={item.id}
                  href={`/post/${encodeURIComponent(
                    postId,
                  )}`}
                  className="group flex aspect-square flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface-muted)]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <FileText size={19} />
                  </span>

                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      {getFileName(
                        item.storage_path,
                      )}
                    </p>

                    <p className="mt-1 text-[10px] text-[var(--muted)]">
                      PDF ·{" "}
                      {formatFileSize(
                        item.size_bytes,
                      )}
                    </p>
                  </div>
                </Link>
              );
            }

            const Icon =
              getFileIcon(
                item.mime_type,
              );

            return (
              <Link
                key={item.id}
                href={`/post/${encodeURIComponent(
                  postId,
                )}`}
                className="group flex aspect-square flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface-muted)]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface)] text-[var(--accent)]">
                  <Icon size={19} />
                </span>

                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">
                    {getFileName(
                      item.storage_path,
                    )}
                  </p>

                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    {formatFileSize(
                      item.size_bytes,
                    )}
                  </p>
                </div>
              </Link>
            );
          },
        )}
      </div>
    </div>
  );
}