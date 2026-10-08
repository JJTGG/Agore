"use client";

import {
  useRef,
  useState,
} from "react";
import {
  Camera,
  ImagePlus,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import AgoreAvatar from "@/components/agore-avatar";

const MAX_IMAGE_SIZE =
  5 * 1024 * 1024;

const ALLOWED_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

type GroupAvatarConversation = {
  id: string;
  image_path: string | null;
  updated_at?: string;
};

type GroupAvatarEditorProps = {
  conversationId: string;
  groupName: string;
  imagePath: string | null;
  onUpdated: (
    conversation: GroupAvatarConversation,
  ) => void;
  disabled?: boolean;
};

export default function GroupAvatarEditor({
  conversationId,
  groupName,
  imagePath,
  onUpdated,
  disabled = false,
}: GroupAvatarEditorProps) {
  const inputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  const [
    uploading,
    setUploading,
  ] = useState(false);

  const [
    removing,
    setRemoving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);

  const busy =
    disabled ||
    uploading ||
    removing;

  function openPicker() {
    if (busy) {
      return;
    }

    setError("");
    inputRef.current?.click();
  }

  async function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    setError("");

    if (file.size <= 0) {
      setError(
        "The selected image is empty.",
      );
      return;
    }

    if (
      file.size >
      MAX_IMAGE_SIZE
    ) {
      setError(
        "Group image must be 5 MB or smaller.",
      );
      return;
    }

    if (
      !ALLOWED_TYPES.has(
        file.type,
      )
    ) {
      setError(
        "Group image must be a JPEG, PNG, or WebP image.",
      );
      return;
    }

    setUploading(true);

    try {
      const formData =
        new FormData();

      formData.append(
        "file",
        file,
      );

      const response =
        await fetch(
          `/api/conversations/${encodeURIComponent(
            conversationId,
          )}/group-image`,
          {
            method: "POST",
            body: formData,
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ??
            "Unable to update the group image.",
        );
        return;
      }

      if (
        !data.conversation
      ) {
        setError(
          "The group image was uploaded, but the group response was incomplete.",
        );
        return;
      }

      setRefreshKey(
        (current) =>
          current + 1,
      );

      onUpdated(
        data.conversation,
      );
    } catch {
      setError(
        "Unable to update the group image.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function removeImage() {
    if (
      busy ||
      !imagePath
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "Remove the group image?",
      );

    if (!confirmed) {
      return;
    }

    setRemoving(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/conversations/${encodeURIComponent(
            conversationId,
          )}/group-image`,
          {
            method: "DELETE",
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ??
            "Unable to remove the group image.",
        );
        return;
      }

      setRefreshKey(
        (current) =>
          current + 1,
      );

      onUpdated(
        data.conversation ?? {
          id: conversationId,
          image_path: null,
        },
      );
    } catch {
      setError(
        "Unable to remove the group image.",
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={busy}
        onChange={
          handleFileChange
        }
      />

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={openPicker}
          disabled={busy}
          aria-label="Change group image"
          title="Change group image"
          className="group relative shrink-0 rounded-full outline-none ring-offset-2 transition focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <AgoreAvatar
            avatarPath={
              imagePath
            }
            name={groupName}
            bucketName="group-media"
            refreshKey={
              refreshKey
            }
            className="h-20 w-20"
            textClassName="text-lg"
          />

          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-transparent transition group-hover:bg-black/35 group-hover:text-white">
            {uploading ||
            removing ? (
              <Loader2
                size={21}
                className="animate-spin"
              />
            ) : (
              <Camera
                size={21}
              />
            )}
          </span>

          <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--surface)] bg-[var(--accent)] text-white shadow-sm">
            <Camera size={14} />
          </span>
        </button>

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
            Group image
          </p>

          <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
            Tap the photo to choose a new image.
          </p>

          <p className="mt-1 text-[10px] text-[var(--muted)]">
            JPEG, PNG, or WebP · max 5 MB
          </p>

          {imagePath ? (
            <button
              type="button"
              onClick={() =>
                void removeImage()
              }
              disabled={busy}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {removing ? (
                <Loader2
                  size={12}
                  className="animate-spin"
                />
              ) : (
                <Trash2
                  size={12}
                />
              )}
              Remove image
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-3 py-2.5">
          <X
            size={14}
            className="mt-0.5 shrink-0 text-[var(--danger)]"
          />

          <p className="text-xs font-semibold leading-5 text-[var(--danger)]">
            {error}
          </p>
        </div>
      ) : null}

      {!imagePath &&
      !error ? (
        <button
          type="button"
          onClick={openPicker}
          disabled={busy}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ImagePlus size={14} />
          Add group image
        </button>
      ) : null}
    </div>
  );
}