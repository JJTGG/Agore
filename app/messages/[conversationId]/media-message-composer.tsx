"use client";

import {
  Camera,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  X,
} from "lucide-react";
import {
  ChangeEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/browser";
import { useConversationTyping } from "./conversation-typing";
import GifStickerPicker from "./gif-sticker-picker";

const supabase = createClient();

const MAX_FILE_SIZE = 15 * 1024 * 1024;

const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/3gpp",
] as const;

type SupportedMimeType =
  (typeof ACCEPTED_MIME_TYPES)[number];

type AttachmentSource =
  | "gallery"
  | "camera"
  | "video"
  | "document";

type SelectedFile = {
  file: File;
  previewUrl: string | null;
};

type MediaMessageComposerProps = {
  conversationId: string;
  disabled?: boolean;
  onSent?: () => void;
  onError?: (message: string) => void;
};

function isSupportedMimeType(
  value: string,
): value is SupportedMimeType {
  return (
    ACCEPTED_MIME_TYPES as readonly string[]
  ).includes(value.toLowerCase());
}

function getFileExtension(file: File) {
  const rawName = file.name.trim();
  const dotIndex = rawName.lastIndexOf(".");

  if (
    dotIndex > 0 &&
    dotIndex < rawName.length - 1
  ) {
    const extension = rawName
      .slice(dotIndex + 1)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (extension) {
      return extension;
    }
  }

  switch (file.type.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "application/pdf":
      return "pdf";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    case "video/3gpp":
      return "3gp";
    default:
      return "bin";
  }
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(0)} KB`;
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

async function getImageDimensions(
  file: File,
): Promise<{
  width: number | null;
  height: number | null;
}> {
  if (!file.type.startsWith("image/")) {
    return {
      width: null,
      height: null,
    };
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const dimensions = await new Promise<{
      width: number;
      height: number;
    }>((resolve, reject) => {
      const image = new Image();

      image.onload = () => {
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      };

      image.onerror = () => {
        reject(
          new Error(
            "Unable to read image dimensions.",
          ),
        );
      };

      image.src = objectUrl;
    });

    return dimensions;
  } catch {
    return {
      width: null,
      height: null,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function MediaMessageComposer({
  conversationId,
  disabled = false,
  onSent,
  onError,
}: MediaMessageComposerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] =
    useState<SelectedFile | null>(null);

  const [uploading, setUploading] = useState(false);

  const [attachmentMenuOpen, setAttachmentMenuOpen] =
    useState(false);

  const [
    conversationIdRef,
    setConversationIdRef,
  ] = useState(conversationId);

  const [currentUserId, setCurrentUserId] =
    useState<string | null>(null);

  const [currentUserName, setCurrentUserName] =
    useState<string | null>(null);

  const {
    typingText,
    notifyTyping,
    stopTyping,
  } = useConversationTyping({
    conversationId: conversationIdRef,
    currentUserId,
    currentUserName,
  });

  useEffect(() => {
    setConversationIdRef(conversationId);
  }, [conversationId]);

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      setCurrentUserId(user?.id ?? null);

      const displayName =
        typeof user?.user_metadata?.display_name === "string"
          ? user.user_metadata.display_name.trim()
          : "";

      setCurrentUserName(
        displayName || user?.email || null,
      );
    }

    void loadCurrentUser();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!conversationIdRef || !currentUserId) {
      return;
    }

    let cancelled = false;
    let cleanup: (() => void) | undefined;
    let retryTimer: number | undefined;

    function attachTypingListener() {
      if (cancelled) {
        return;
      }

      const textarea =
        document.querySelector<HTMLTextAreaElement>(
          'textarea[placeholder="Write a message…"]',
        );

      if (!textarea) {
        retryTimer = window.setTimeout(
          attachTypingListener,
          100,
        );

        return;
      }

      const handleInput = () => {
        notifyTyping(textarea.value.trim().length > 0);
      };

      const handleBlur = () => {
        stopTyping();
      };

      textarea.addEventListener("input", handleInput);
      textarea.addEventListener("blur", handleBlur);

      cleanup = () => {
        textarea.removeEventListener("input", handleInput);
        textarea.removeEventListener("blur", handleBlur);
      };
    }

    attachTypingListener();

    return () => {
      cancelled = true;

      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
      }

      cleanup?.();
      stopTyping();
    };
  }, [
    conversationIdRef,
    currentUserId,
    notifyTyping,
    stopTyping,
  ]);

  useEffect(() => {
    return () => {
      if (selectedFile?.previewUrl) {
        URL.revokeObjectURL(selectedFile.previewUrl);
      }
    };
  }, [selectedFile]);

  function reportError(message: string) {
    onError?.(message);
  }

  function selectFile(file: File): boolean {
    if (!isSupportedMimeType(file.type)) {
      reportError(
        "Unsupported file type. Choose an image, GIF, supported video, or PDF.",
      );

      return false;
    }

    if (file.size <= 0) {
      reportError(
        "That file is empty and cannot be sent.",
      );

      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      reportError(
        "That file exceeds the 15 MB message attachment limit.",
      );

      return false;
    }

    const needsPreview =
      file.type.startsWith("image/") ||
      file.type.startsWith("video/");

    const previewUrl = needsPreview
      ? URL.createObjectURL(file)
      : null;

    setSelectedFile({
      file,
      previewUrl,
    });

    return true;
  }

  function handlePickerFileSelected(file: File) {
    if (disabled || uploading) {
      return;
    }

    selectFile(file);
  }

  function openPicker() {
    if (disabled || uploading) {
      return;
    }

    setAttachmentMenuOpen((current) => !current);
  }

  function chooseAttachment(source: AttachmentSource) {
    if (disabled || uploading) {
      return;
    }

    const input = inputRef.current;

    if (!input) {
      reportError(
        "The attachment picker is unavailable.",
      );

      return;
    }

    setAttachmentMenuOpen(false);

    input.removeAttribute("capture");

    switch (source) {
      case "gallery":
        input.accept = ACCEPTED_MIME_TYPES
          .filter((type) => type.startsWith("image/"))
          .join(",");

        break;

      case "camera":
        input.accept = "image/*";
        input.setAttribute("capture", "environment");
        break;

      case "video":
        input.accept = ACCEPTED_MIME_TYPES
          .filter((type) => type.startsWith("video/"))
          .join(",");

        break;

      case "document":
        input.accept = "application/pdf";
        break;
    }

    input.click();
  }

  function clearSelection() {
    if (uploading) {
      return;
    }

    setSelectedFile(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (file) {
      selectFile(file);
    }

    input.value = "";
  }

  async function cleanupPreparedMessage(
    messageId: string,
  ) {
    try {
      await fetch(
        `/api/conversations/${encodeURIComponent(
          conversationIdRef,
        )}/media?messageId=${encodeURIComponent(
          messageId,
        )}`,
        {
          method: "DELETE",
        },
      );
    } catch {
      // Best-effort cleanup.
    }
  }

  async function sendSelectedFile() {
    if (
      disabled ||
      uploading ||
      !selectedFile ||
      !conversationIdRef
    ) {
      return;
    }

    const file = selectedFile.file;

    setUploading(true);

    let preparedMessageId: string | null = null;

    try {
      const extension = getFileExtension(file);

      const prepareResponse = await fetch(
        `/api/conversations/${encodeURIComponent(
          conversationIdRef,
        )}/media`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "prepare",
            mime_type: file.type,
            file_name: file.name,
          }),
        },
      );

      const prepareData = await prepareResponse.json();

      if (prepareResponse.status === 401) {
        reportError(
          "Your session has expired. Please sign in again.",
        );

        return;
      }

      if (!prepareResponse.ok) {
        reportError(
          prepareData.error ??
            "Unable to prepare the attachment.",
        );

        return;
      }

      const messageId =
        prepareData.message?.id as string | undefined;

      const storagePath =
        prepareData.storage_path as string | undefined;

      if (!messageId || !storagePath) {
        reportError(
          "The attachment could not be prepared correctly.",
        );

        return;
      }

      preparedMessageId = messageId;

      const { width, height } =
        await getImageDimensions(file);

      const { error: uploadError } =
        await supabase.storage
          .from("message-media")
          .upload(storagePath, file, {
            contentType: file.type,
            cacheControl: "3600",
            upsert: false,
          });

      if (uploadError) {
        console.error(
          "Agore media upload failed:",
          uploadError,
        );

        reportError(
          "The attachment could not be uploaded.",
        );

        await cleanupPreparedMessage(messageId);
        return;
      }

      const finalizeResponse = await fetch(
        `/api/conversations/${encodeURIComponent(
          conversationIdRef,
        )}/media`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "finalize",
            message_id: messageId,
            storage_path: storagePath,
            file_name: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            width,
            height,
            extension,
          }),
        },
      );

      const finalizeData = await finalizeResponse.json();

      if (finalizeResponse.status === 401) {
        reportError(
          "Your session has expired. Please sign in again.",
        );

        await cleanupPreparedMessage(messageId);
        return;
      }

      if (!finalizeResponse.ok) {
        reportError(
          finalizeData.error ??
            "Unable to finish the attachment.",
        );

        await cleanupPreparedMessage(messageId);
        return;
      }

      setSelectedFile(null);

      if (inputRef.current) {
        inputRef.current.value = "";
      }

      onSent?.();
    } catch (error) {
      console.error(
        "Agore media message processing failed:",
        error,
      );

      reportError(
        "Something went wrong while sending the attachment.",
      );

      if (preparedMessageId) {
        await cleanupPreparedMessage(preparedMessageId);
      }
    } finally {
      setUploading(false);
    }
  }

  const selectedIsImage =
    selectedFile?.file.type.startsWith("image/") ?? false;

  const selectedIsVideo =
    selectedFile?.file.type.startsWith("video/") ?? false;

  return (
    <div className="relative flex shrink-0 items-center gap-1">
      {typingText ? (
        <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 max-w-[min(82vw,360px)]">
          <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-xs font-medium text-[var(--muted-strong)] shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
            <span className="flex items-center gap-0.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:240ms]" />
            </span>

            <span className="truncate">{typingText}</span>
          </div>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_MIME_TYPES.join(",")}
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || uploading}
      />

      <GifStickerPicker
        disabled={disabled || uploading}
        onSelect={handlePickerFileSelected}
        onError={reportError}
      />

      {attachmentMenuOpen ? (
        <>
          <button
            type="button"
            aria-label="Close attachment menu"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setAttachmentMenuOpen(false)}
          />

          <div
            role="menu"
            aria-label="Choose an attachment"
            className="absolute bottom-full left-0 z-30 mb-3 max-h-[min(60dvh,420px)] w-[min(82vw,300px)] overflow-x-hidden overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-2 shadow-[0_16px_44px_rgba(0,0,0,0.16)]"
          >
            <div className="px-3 pb-2 pt-2">
              <p className="text-xs font-semibold text-[var(--foreground)]">
                Attach to conversation
              </p>

              <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
                Choose what you want to share.
              </p>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => chooseAttachment("gallery")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[var(--surface-muted)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <ImageIcon size={19} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--foreground)]">
                  Photos & GIFs
                </span>

                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  Choose an image from your device
                </span>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => chooseAttachment("camera")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[var(--surface-muted)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Camera size={19} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--foreground)]">
                  Camera
                </span>

                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  Capture a new photo
                </span>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => chooseAttachment("video")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[var(--surface-muted)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Film size={19} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--foreground)]">
                  Video
                </span>

                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  Share an MP4, WebM, MOV, or 3GP video
                </span>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => chooseAttachment("document")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[var(--surface-muted)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <FileText size={19} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--foreground)]">
                  Document (PDF)
                </span>

                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  Share a PDF document
                </span>
              </span>
            </button>
          </div>
        </>
      ) : null}

      {selectedFile ? (
        <div className="absolute bottom-full left-0 z-20 mb-3 max-h-[min(55dvh,420px)] w-[min(88vw,360px)] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 shadow-[0_12px_36px_rgba(0,0,0,0.1)] sm:left-auto sm:w-[360px]">
          <div className="flex items-center gap-3">
            {selectedIsImage && selectedFile.previewUrl ? (
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]">
                <img
                  src={selectedFile.previewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            ) : selectedIsVideo && selectedFile.previewUrl ? (
              <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-black">
                <video
                  src={selectedFile.previewUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-contain"
                  aria-label="Selected video preview"
                />

                <span className="absolute bottom-1 right-1 rounded-md bg-black/70 p-1 text-white">
                  <Film size={12} />
                </span>
              </div>
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--accent)]">
                <FileText size={24} />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                {selectedFile.file.name}
              </p>

              <p className="mt-1 text-xs text-[var(--muted)]">
                {formatFileSize(selectedFile.file.size)}
                {selectedIsVideo ? " · Video" : ""}
              </p>
            </div>

            <button
              type="button"
              onClick={clearSelection}
              disabled={uploading}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Remove attachment"
            >
              <X size={17} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => void sendSelectedFile()}
            disabled={uploading || disabled}
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2
                  size={15}
                  className="animate-spin"
                />
                Sending…
              </>
            ) : (
              <>Send attachment</>
            )}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={openPicker}
        disabled={disabled || uploading}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--muted-strong)] transition hover:border-[var(--accent)]/45 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-11"
        aria-label="Open attachment menu"
        aria-haspopup="menu"
        aria-expanded={attachmentMenuOpen}
        title="Attach media"
      >
        {uploading ? (
          <Loader2
            size={17}
            className="animate-spin"
          />
        ) : (
          <Paperclip size={17} />
        )}
      </button>
    </div>
  );
}