"use client";

import {
  Check,
  Copy,
  CornerUpLeft,
  Edit3,
  Loader2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type MessageActionMenuProps = {
  isOwn: boolean;
  content: string | null;
  disabled?: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
};

export default function MessageActionMenu({
  isOwn,
  content,
  disabled = false,
  onReply,
  onEdit,
  onDelete,
}: MessageActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  const menuRef =
    useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(
      event: MouseEvent,
    ) {
      const target = event.target;

      if (
        target instanceof Node &&
        menuRef.current?.contains(target)
      ) {
        return;
      }

      setOpen(false);
    }

    document.addEventListener(
      "mousedown",
      handlePointerDown,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointerDown,
      );
    };
  }, [open]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout =
      window.setTimeout(() => {
        setCopied(false);
      }, 1400);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copied]);

  async function handleCopy() {
    const value = content?.trim();

    if (
      !value ||
      copying ||
      deleting
    ) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard?.writeText
    ) {
      setOpen(false);
      return;
    }

    setCopying(true);

    try {
      await navigator.clipboard.writeText(
        value,
      );

      setCopied(true);
      setOpen(false);
    } catch (error) {
      console.error(
        "Agore message copy failed:",
        error,
      );
    } finally {
      setCopying(false);
    }
  }

  async function handleDelete() {
    if (
      deleting ||
      copying ||
      disabled
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "Delete this message? It will be removed from the conversation.",
      );

    if (!confirmed) {
      return;
    }

    setDeleting(true);

    try {
      await onDelete();
      setOpen(false);
    } catch (error) {
      console.error(
        "Agore message delete action failed:",
        error,
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      ref={menuRef}
      className="relative"
    >
      <button
        type="button"
        onClick={() =>
          setOpen(
            (current) => !current,
          )
        }
        disabled={
          disabled || deleting
        }
        aria-label="Message actions"
        aria-expanded={open}
        title="Message actions"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--muted-strong)] shadow-sm transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
      >
        {deleting ? (
          <Loader2
            size={15}
            className="animate-spin"
          />
        ) : (
          <MoreHorizontal size={16} />
        )}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Message actions"
          className={`absolute bottom-full z-30 mb-2 w-44 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-1.5 shadow-2xl ${
            isOwn
              ? "right-0"
              : "left-0"
          }`}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onReply();
            }}
            disabled={
              deleting || copying
            }
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CornerUpLeft size={15} />
            Reply
          </button>

          {content?.trim() ? (
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                void handleCopy()
              }
              disabled={
                copying || deleting
              }
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copying ? (
                <Loader2
                  size={15}
                  className="animate-spin"
                />
              ) : copied ? (
                <Check size={15} />
              ) : (
                <Copy size={15} />
              )}

              {copied
                ? "Copied"
                : "Copy"}
            </button>
          ) : null}

          {isOwn ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
                disabled={
                  deleting ||
                  copying ||
                  !content?.trim()
                }
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Edit3 size={15} />
                Edit
              </button>

              <div className="my-1 h-px bg-[var(--border)]" />

              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  void handleDelete()
                }
                disabled={
                  deleting || copying
                }
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleting ? (
                  <Loader2
                    size={15}
                    className="animate-spin"
                  />
                ) : (
                  <Trash2 size={15} />
                )}

                Delete
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}