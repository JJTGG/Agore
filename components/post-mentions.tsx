
"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";

type MentionPerson = {
  id: string;
  display_name: string;
  username: string;
};

type MentionSearchResponse = {
  people?: MentionPerson[];
  error?: string;
};

type MentionContext = {
  start: number;
  end: number;
  query: string;
};

type MentionTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  maxLength?: number;
  rows?: number;
  id?: string;
};

function getMentionContext(
  value: string,
  caret: number,
): MentionContext | null {
  const beforeCaret = value.slice(0, caret);

  // Do not treat the @ in an email address or @@ as a mention.
  const match = /(^|[^\w@])@([A-Za-z0-9_]{2,30})$/.exec(
    beforeCaret,
  );

  if (!match) {
    return null;
  }

  const query = match[2];
  const start = caret - query.length - 1;
  const suffix =
    value.slice(caret).match(/^[A-Za-z0-9_]*/)?.[0] ?? "";

  return {
    start,
    end: caret + suffix.length,
    query,
  };
}

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "A"
  );
}

export function MentionTextarea({
  value,
  onChange,
  disabled = false,
  placeholder,
  className,
  maxLength,
  rows = 4,
  id,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [context, setContext] =
    useState<MentionContext | null>(null);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<MentionPerson[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  function updateContext(
    textarea: HTMLTextAreaElement,
  ) {
    const caret =
      textarea.selectionStart ?? textarea.value.length;

    const nextContext = getMentionContext(
      textarea.value,
      caret,
    );

    setContext(nextContext);
    setQuery(nextContext?.query ?? "");
    setOpen(Boolean(nextContext));
    setActiveIndex(0);
  }

  useEffect(() => {
    if (!open || query.length < 2) {
      setPeople([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();

    setPeople([]);
    setActiveIndex(0);

    const timeout = window.setTimeout(async () => {
      setSearching(true);

      try {
        const response = await fetch(
          `/api/users/search?q=${encodeURIComponent(query)}&limit=6`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );

        const data = (await response
          .json()
          .catch(() => ({}))) as MentionSearchResponse;

        if (!response.ok) {
          throw new Error(
            data.error ?? "Unable to search for people.",
          );
        }

        if (!controller.signal.aborted) {
          const nextPeople = Array.isArray(data.people)
            ? data.people
            : [];

          setPeople(nextPeople);
          setActiveIndex(0);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(
            "Agoré mention search failed:",
            error,
          );
          setPeople([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, open]);

  function selectPerson(person: MentionPerson) {
    if (!context || disabled) {
      return;
    }

    const insertion = `@${person.username} `;
    const nextValue =
      value.slice(0, context.start) +
      insertion +
      value.slice(context.end);

    const nextCaret = context.start + insertion.length;

    onChange(nextValue);
    setOpen(false);
    setContext(null);
    setQuery("");
    setPeople([]);

    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;

      if (!textarea) {
        return;
      }

      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (!open || people.length === 0) {
      if (event.key === "Escape") {
        setOpen(false);
      }

      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        current >= people.length - 1 ? 0 : current + 1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0 ? people.length - 1 : current - 1,
      );
      return;
    }

    if (
      (event.key === "Enter" || event.key === "Tab") &&
      people[activeIndex]
    ) {
      event.preventDefault();
      selectPerson(people[activeIndex]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div
      className={[
        "relative",
        open ? "z-40" : "",
      ].join(" ")}
    >
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          updateContext(event.currentTarget);
        }}
        onClick={(event) => updateContext(event.currentTarget)}
        onKeyUp={(event) => updateContext(event.currentTarget)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Keep pointer selection usable while closing the menu
          // when focus moves somewhere else.
          window.setTimeout(() => setOpen(false), 120);
        }}
        aria-autocomplete="list"
        aria-expanded={open && query.length >= 2}
        aria-activedescendant={
          people[activeIndex]
            ? `agore-mention-${people[activeIndex].id}`
            : undefined
        }
        maxLength={maxLength}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
      />

      {open && query.length >= 2 ? (
        <div
          role="listbox"
          aria-label="Mention a person"
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl"
        >
          {searching ? (
            <p className="px-3 py-4 text-sm text-[var(--muted)]">
              Searching people…
            </p>
          ) : people.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--muted)]">
              No matching active accounts found.
            </p>
          ) : (
            people.map((person, index) => (
              <button
                key={person.id}
                id={`agore-mention-${person.id}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectPerson(person)}
                className={[
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition",
                  index === activeIndex
                    ? "bg-[var(--accent-soft)]"
                    : "hover:bg-[var(--background)]",
                ].join(" ")}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)]">
                  {getInitials(person.display_name)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {person.display_name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                    @{person.username}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function MentionText({
  content,
}: {
  content: string;
}) {
  const matches = [
    ...content.matchAll(
      /(^|[^\w@])@([A-Za-z0-9_]{2,30})\b/g,
    ),
  ];

  if (matches.length === 0) {
    return content;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of matches) {
    const matchIndex = match.index ?? 0;
    const prefixLength = match[1].length;
    const username = match[2];
    const mentionStart = matchIndex + prefixLength;
    const mentionEnd = matchIndex + match[0].length;

    if (mentionStart > cursor) {
      parts.push(content.slice(cursor, mentionStart));
    }

    parts.push(
      <Link
        key={`${mentionStart}-${username}`}
        href={`/u/${encodeURIComponent(username.toLowerCase())}`}
        className="font-medium text-[var(--accent)] underline decoration-[var(--accent)]/30 underline-offset-2 hover:decoration-current"
      >
        @{username}
      </Link>,
    );

    cursor = mentionEnd;
  }

  if (cursor < content.length) {
    parts.push(content.slice(cursor));
  }

  return <>{parts}</>;
}
