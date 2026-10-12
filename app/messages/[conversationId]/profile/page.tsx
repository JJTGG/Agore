"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Flag,
  Image as ImageIcon,
  Link2,
  Loader2,
  MapPin,
  MessageCircle,
  ShieldAlert,
  UserRoundX,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import AgoreAvatar from "@/components/agore-avatar";
import UserIdentity from "@/components/user-identity";
import ProfileReportDialog from "@/app/profile/[userId]/profile-report-dialog";
import { createClient } from "@/lib/supabase/browser";
import MessageMediaContent from "../message-media-content";
import VoiceMessagePlayer from "../voice-message-player";

const supabase = createClient();

type Participant = {
  id: string;
  display_name: string;
  username: string;
  avatar_path: string | null;
};

type Profile = Participant & {
  bio: string | null;
  location: string | null;
  account_type: "personal" | "creator" | "business" | "organization" | "institution";
  verification: {
    status: "verified" | "unverified";
    kind: "agore_official" | "official" | "paid" | null;
  };
  is_self: boolean;
  is_blocked: boolean;
};

type Conversation = {
  id: string;
  type: "direct" | "group";
  participant: Participant | null;
};

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

type MessageRecord = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  content: string | null;
  created_at: string;
  media: MessageMedia[];
};

type SharedLink = {
  url: string;
  hostname: string;
  createdAt: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function extractLinks(messages: MessageRecord[]): SharedLink[] {
  const seen = new Set<string>();
  const links: SharedLink[] = [];

  for (const message of [...messages].reverse()) {
    const matches = message.content?.match(/https?:\/\/[^\s<>"']+/gi) ?? [];

    for (const match of matches) {
      const cleaned = match.replace(/[),.!?;:]+$/, "");

      try {
        const parsed = new URL(cleaned);

        if (
          (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
          parsed.username ||
          parsed.password ||
          seen.has(parsed.href)
        ) {
          continue;
        }

        seen.add(parsed.href);
        links.push({
          url: parsed.href,
          hostname: parsed.hostname.replace(/^www\./, ""),
          createdAt: message.created_at,
        });
      } catch {
        // Ignore malformed links in message text.
      }

      if (links.length >= 6) return links;
    }
  }

  return links;
}

export default function MessageProfilePage() {
  const params = useParams<{ conversationId: string }>();
  const router = useRouter();
  const conversationId = params.conversationId;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [error, setError] = useState("");
  const [sharedError, setSharedError] = useState("");
  const [blockLoading, setBlockLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockError, setBlockError] = useState("");
  const [blockConfirmationOpen, setBlockConfirmationOpen] = useState(false);

  const loadPage = useCallback(async () => {
    if (!conversationId) return;

    setLoading(true);
    setError("");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      router.replace("/auth");
      return;
    }

    setCurrentUserId(user.id);

    try {
      const conversationResponse = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}`,
        { cache: "no-store" },
      );
      const conversationData = await conversationResponse.json();

      if (conversationResponse.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!conversationResponse.ok) {
        throw new Error(
          conversationData.error ?? "Unable to open this conversation.",
        );
      }

      const loadedConversation = conversationData.conversation as Conversation;

      if (
        !loadedConversation ||
        loadedConversation.id !== conversationId ||
        loadedConversation.type !== "direct" ||
        !loadedConversation.participant?.id
      ) {
        throw new Error(
          "Message profile is only available for direct conversations.",
        );
      }

      setConversation(loadedConversation);

      const profileResponse = await fetch(
        `/api/users/${encodeURIComponent(loadedConversation.participant.id)}`,
        { cache: "no-store" },
      );
      const profileData = await profileResponse.json();

      if (profileResponse.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!profileResponse.ok || !profileData.profile) {
        throw new Error(profileData.error ?? "Unable to load this contact.");
      }

      const loadedProfile = profileData.profile as Profile;

      if (loadedProfile.id !== loadedConversation.participant.id) {
        throw new Error("The conversation contact could not be verified.");
      }

      setProfile(loadedProfile);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load this message profile.",
      );
      setConversation(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [conversationId, router]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    let active = true;

    async function loadSharedItems() {
      if (!profile?.id || !conversationId) return;

      setSharedLoading(true);

      try {
        const response = await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`,
          { cache: "no-store" },
        );

        if (response.status === 401) {
          router.replace("/auth");
          return;
        }

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          if (active) {
            setSharedError(data?.error ?? "Shared items could not be loaded.");
          }
          return;
        }

        const data = await response.json();

        if (active) {
          setMessages(
            Array.isArray(data.messages)
              ? (data.messages as MessageRecord[])
              : [],
          );
          setSharedError("");
        }
      } catch {
        if (active) setSharedError("Shared items could not be loaded.");
      } finally {
        if (active) setSharedLoading(false);
      }
    }

    void loadSharedItems();

    return () => {
      active = false;
    };
  }, [conversationId, profile?.id, router]);

  const sharedMediaMessages = useMemo(
    () =>
      messages
        .filter((message) => Array.isArray(message.media) && message.media.length > 0)
        .slice(-4)
        .reverse(),
    [messages],
  );

  const sharedLinks = useMemo(() => extractLinks(messages), [messages]);

  const visualMediaCount = useMemo(
    () =>
      messages.reduce(
        (total, message) =>
          total +
          (message.media ?? []).filter(
            (item) => item.media_type === "image" || item.media_type === "file",
          ).length,
        0,
      ),
    [messages],
  );

  const voiceNoteCount = useMemo(
    () =>
      messages.reduce(
        (total, message) =>
          total +
          (message.media ?? []).filter((item) => item.media_type === "audio").length,
        0,
      ),
    [messages],
  );

  async function blockContact() {
    if (!profile || blockLoading || profile.is_self) return;

    setBlockLoading(true);
    setBlockError("");

    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(profile.id)}/block`,
        { method: "POST" },
      );
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to block this contact.");
      }

      router.replace("/messages");
    } catch (requestError) {
      setBlockError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to block this contact.",
      );
      setBlockConfirmationOpen(false);
    } finally {
      setBlockLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
        <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
          <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
          Loading message profile…
        </div>
      </main>
    );
  }

  if (error || !conversation || !profile) {
    return (
      <main className="min-h-dvh bg-[var(--background)] px-4 py-6 text-[var(--foreground)]">
        <div className="mx-auto max-w-xl">
          <button
            type="button"
            onClick={() => router.push(`/messages/${encodeURIComponent(conversationId)}`)}
            className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-[var(--muted-strong)] transition hover:bg-[var(--surface-muted)]"
          >
            <ArrowLeft size={17} />
            Back to conversation
          </button>
          <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-sm font-semibold text-[var(--danger)]">
              {error || "This contact is unavailable."}
            </p>
          </section>
        </div>
      </main>
    );
  }

  const publicProfileHref = `/profile/${encodeURIComponent(profile.id)}`;

  return (
    <main className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto min-h-dvh w-full max-w-3xl border-x border-[var(--border)] bg-[var(--surface)]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/95 px-4 backdrop-blur">
          <button
            type="button"
            onClick={() => router.push(`/messages/${encodeURIComponent(conversationId)}`)}
            aria-label="Back to conversation"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--muted-strong)] transition hover:bg-[var(--surface-muted)]"
          >
            <ArrowLeft size={19} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold tracking-[-0.02em]">
              Contact info
            </h1>
            <p className="truncate text-xs text-[var(--muted)]">
              Conversation details
            </p>
          </div>
        </header>

        <div className="space-y-4 px-4 py-5 sm:px-6">
          <section className="flex flex-col items-center rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] px-5 py-7 text-center">
            <AgoreAvatar
              avatarPath={profile.avatar_path}
              name={profile.display_name}
              className="h-24 w-24"
              textClassName="text-2xl"
            />

            <h2 className="mt-4 max-w-full text-2xl font-bold tracking-[-0.04em]">
              <UserIdentity
                userId={profile.id}
                displayName={profile.display_name}
                accountType={profile.account_type}
                verificationKind={profile.verification?.kind ?? null}
                nameClassName="break-words"
                badgeSize={19}
              />
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">@{profile.username}</p>

            {profile.bio?.trim() ? (
              <p className="mt-4 max-w-lg whitespace-pre-wrap break-words text-sm leading-6 text-[var(--muted-strong)]">
                {profile.bio}
              </p>
            ) : null}

            {profile.location?.trim() ? (
              <div className="mt-3 flex items-center gap-1.5 text-sm text-[var(--muted)]">
                <MapPin size={15} />
                <span>{profile.location}</span>
              </div>
            ) : null}

            <div className="mt-6 grid w-full max-w-md grid-cols-2 gap-3">
              <Link
                href={`/messages/${encodeURIComponent(conversationId)}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
              >
                <MessageCircle size={16} />
                Message
              </Link>
              <Link
                href={publicProfileHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-muted)]"
              >
                <ExternalLink size={16} />
                View profile
              </Link>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]">
            <div className="flex items-center justify-between gap-3 px-4 py-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Shared in this conversation</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Recent items from the latest 100 messages
                </p>
              </div>
              {sharedLoading ? (
                <Loader2 size={17} className="shrink-0 animate-spin text-[var(--accent)]" />
              ) : null}
            </div>

            <div className="grid grid-cols-3 border-t border-[var(--border)]">
              <div className="flex flex-col items-center gap-1 px-2 py-4">
                <ImageIcon size={18} className="text-[var(--accent)]" />
                <span className="text-lg font-bold tabular-nums">{visualMediaCount}</span>
                <span className="text-[11px] text-[var(--muted)]">Media/files</span>
              </div>
              <div className="flex flex-col items-center gap-1 border-x border-[var(--border)] px-2 py-4">
                <MessageCircle size={18} className="text-[var(--accent)]" />
                <span className="text-lg font-bold tabular-nums">{voiceNoteCount}</span>
                <span className="text-[11px] text-[var(--muted)]">Voice notes</span>
              </div>
              <div className="flex flex-col items-center gap-1 px-2 py-4">
                <Link2 size={18} className="text-[var(--accent)]" />
                <span className="text-lg font-bold tabular-nums">{sharedLinks.length}</span>
                <span className="text-[11px] text-[var(--muted)]">Links</span>
              </div>
            </div>

            {sharedError ? (
              <p className="border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--muted)]">
                {sharedError}
              </p>
            ) : null}

            {sharedMediaMessages.length > 0 ? (
              <div className="space-y-4 border-t border-[var(--border)] p-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Recent attachments
                </h3>
                {sharedMediaMessages.map((message) => {
                  const visualMedia = message.media.filter(
                    (item) => item.media_type === "image" || item.media_type === "file",
                  );
                  const audioMedia = message.media.filter(
                    (item) => item.media_type === "audio",
                  );

                  return (
                    <div key={message.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                      {message.content?.trim() ? (
                        <p className="mb-3 whitespace-pre-wrap break-words text-sm">
                          {message.content}
                        </p>
                      ) : null}
                      {visualMedia.length > 0 ? (
                        <MessageMediaContent
                          media={visualMedia}
                          isOwn={message.sender_id === currentUserId}
                        />
                      ) : null}
                      {audioMedia.length > 0 ? (
                        <div className="space-y-2">
                          {audioMedia.map((item) => (
                            <VoiceMessagePlayer
                              key={item.id}
                              storagePath={item.storage_path}
                              durationMs={item.duration_ms}
                              isOwn={message.sender_id === currentUserId}
                            />
                          ))}
                        </div>
                      ) : null}
                      <Link
                        href={`/messages/${encodeURIComponent(conversationId)}#agore-message-${encodeURIComponent(message.id)}`}
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:underline"
                      >
                        Open in conversation
                        <ExternalLink size={13} />
                      </Link>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {sharedLinks.length > 0 ? (
              <div className="space-y-1 border-t border-[var(--border)] p-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Recent links
                </h3>
                {sharedLinks.map((item) => (
                  <a
                    key={item.url}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-[var(--surface-muted)]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                      <Link2 size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{item.hostname}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">{item.url}</span>
                      <span className="mt-1 block text-[11px] text-[var(--muted)]">{formatDate(item.createdAt)}</span>
                    </span>
                    <ExternalLink size={15} className="shrink-0 text-[var(--muted)]" />
                  </a>
                ))}
              </div>
            ) : null}

            {!sharedLoading && !sharedError && sharedMediaMessages.length === 0 && sharedLinks.length === 0 ? (
              <div className="border-t border-[var(--border)] px-4 py-7 text-center">
                <FileText size={22} className="mx-auto text-[var(--muted)]" />
                <p className="mt-2 text-sm font-medium">Nothing shared recently</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Images, files and links will appear here when shared.
                </p>
              </div>
            ) : null}
          </section>

          {!profile.is_self ? (
            <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]">
              <h2 className="px-4 py-4 text-sm font-semibold">Privacy and safety</h2>
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="flex w-full items-center gap-3 border-t border-[var(--border)] px-4 py-4 text-left transition hover:bg-[var(--surface-muted)]"
              >
                <Flag size={18} className="text-[var(--muted-strong)]" />
                <span className="flex-1">
                  <span className="block text-sm font-medium">Report account</span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    Report abuse or an account safety concern
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setBlockError("");
                  setBlockConfirmationOpen(true);
                }}
                disabled={blockLoading}
                className="flex w-full items-center gap-3 border-t border-[var(--border)] px-4 py-4 text-left transition hover:bg-[var(--surface-muted)] disabled:opacity-50"
              >
                <UserRoundX size={18} className="text-[var(--danger)]" />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-[var(--danger)]">Block contact</span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    Stop direct messaging with this account
                  </span>
                </span>
              </button>
              {blockError ? (
                <p className="border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--danger)]">
                  {blockError}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      <ProfileReportDialog
        userId={profile.id}
        displayName={profile.display_name}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />

      {blockConfirmationOpen && !profile.is_self ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="block-contact-title"
        >
          <section className="w-full max-w-md rounded-t-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl sm:rounded-3xl">
            <h2 id="block-contact-title" className="text-lg font-bold">
              Block {profile.display_name}?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              This will prevent direct messaging with this person until you unblock them.
            </p>
            {blockError ? (
              <p className="mt-3 text-sm text-[var(--danger)]">{blockError}</p>
            ) : null}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setBlockConfirmationOpen(false)}
                disabled={blockLoading}
                className="min-h-11 flex-1 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-muted)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void blockContact()}
                disabled={blockLoading}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {blockLoading ? <Loader2 size={15} className="animate-spin" /> : <ShieldAlert size={16} />}
                Block contact
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

