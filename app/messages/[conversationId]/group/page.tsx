"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowLeft,
  Crown,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  PencilLine,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import AgoreAvatar from "@/components/agore-avatar";
import { createClient } from "@/lib/supabase/browser";
import GroupAvatarEditor from "../group-avatar-editor";
import MessageMediaContent from "../message-media-content";
import VoiceMessagePlayer from "../voice-message-player";

const supabase = createClient();

type Profile = {
  id: string;
  display_name: string;
  username: string;
  avatar_path: string | null;
};

type GroupConversation = {
  id: string;
  type: "direct" | "group";
  created_by: string;
  name: string | null;
  description: string | null;
  image_path: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  membership: {
    role: string;
    joined_at: string;
    last_read_at: string | null;
  };
};

type GroupMember = {
  userId: string;
  role: string;
  joinedAt: string;
  profile: Profile | null;
};

type MemberSearchResult = {
  id: string;
  display_name: string;
  username: string;
  bio: string | null;
  avatar_path: string | null;
  created_at: string;
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

      if (links.length >= 8) return links;
    }
  }

  return links;
}

export default function GroupInfoPage() {
  const params = useParams<{ conversationId: string }>();
  const router = useRouter();
  const conversationId = params.conversationId;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<GroupConversation | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState("member");
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedError, setSharedError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const [editingDetails, setEditingDetails] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  const [memberFilter, setMemberFilter] = useState("");
  const [addingMembers, setAddingMembers] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<MemberSearchResult[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [memberActionLoading, setMemberActionLoading] = useState<string | null>(null);
  const [activeMemberActions, setActiveMemberActions] = useState<string | null>(null);
  const [leavingGroup, setLeavingGroup] = useState(false);

  const isAdmin = currentUserRole === "admin";

  const loadGroup = useCallback(async () => {
    if (!conversationId) return;

    setLoading(true);
    setError("");
    setActionError("");

    try {
      const authResult = await supabase.auth.getUser();

      if (authResult.error || !authResult.data.user) {
        router.replace("/auth");
        return;
      }

      setCurrentUserId(authResult.data.user.id);

      const conversationResponse = await fetch(
        "/api/conversations/" + encodeURIComponent(conversationId),
        { cache: "no-store" },
      );
      const conversationData = await conversationResponse.json();

      if (conversationResponse.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!conversationResponse.ok || !conversationData.conversation) {
        throw new Error(conversationData.error ?? "Unable to load this group.");
      }

      const loadedConversation = conversationData.conversation as GroupConversation;

      if (
        loadedConversation.id !== conversationId ||
        loadedConversation.type !== "group"
      ) {
        throw new Error("This page is only available for group conversations.");
      }

      const membersResponse = await fetch(
        "/api/conversations/" + encodeURIComponent(conversationId) + "/members",
        { cache: "no-store" },
      );
      const membersData = await membersResponse.json();

      if (membersResponse.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!membersResponse.ok) {
        throw new Error(membersData.error ?? "Unable to load group members.");
      }

      setConversation(loadedConversation);
      setNameDraft(loadedConversation.name ?? "");
      setDescriptionDraft(loadedConversation.description ?? "");
      setMembers(Array.isArray(membersData.members) ? membersData.members : []);
      setCurrentUserRole(membersData.currentUserRole ?? "member");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load this group.",
      );
      setConversation(null);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [conversationId, router]);

  useEffect(() => {
    void loadGroup();
  }, [loadGroup]);

  useEffect(() => {
    let active = true;

    async function loadSharedItems() {
      if (!conversationId) return;

      setSharedLoading(true);
      setSharedError("");

      try {
        const response = await fetch(
          "/api/conversations/" + encodeURIComponent(conversationId) + "/messages?limit=100",
          { cache: "no-store" },
        );

        if (response.status === 401) {
          router.replace("/auth");
          return;
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Shared items could not be loaded.");
        }

        if (active) {
          setMessages(Array.isArray(data.messages) ? data.messages as MessageRecord[] : []);
        }
      } catch (requestError) {
        if (active) {
          setSharedError(
            requestError instanceof Error
              ? requestError.message
              : "Shared items could not be loaded.",
          );
        }
      } finally {
        if (active) setSharedLoading(false);
      }
    }

    void loadSharedItems();

    return () => {
      active = false;
    };
  }, [conversationId, router]);

  const sharedMediaMessages = useMemo(
    () =>
      messages
        .filter((message) => Array.isArray(message.media) && message.media.length > 0)
        .slice(-6)
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
          total + (message.media ?? []).filter((item) => item.media_type === "audio").length,
        0,
      ),
    [messages],
  );

  const creator = members.find((member) => member.userId === conversation?.created_by);
  const normalizedMemberFilter = memberFilter.trim().toLowerCase();
  const visibleMembers = members.filter((member) => {
    const name = member.profile?.display_name ?? "";
    const username = member.profile?.username ?? "";
    return (
      name.toLowerCase().includes(normalizedMemberFilter) ||
      username.toLowerCase().includes(normalizedMemberFilter)
    );
  });

  async function saveGroupDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = nameDraft.trim();
    const description = descriptionDraft.trim();

    if (!isAdmin || savingDetails) return;

    if (!name) {
      setActionError("Group name cannot be empty.");
      return;
    }

    setSavingDetails(true);
    setActionError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/conversations/" + encodeURIComponent(conversationId),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description: description || null,
          }),
        },
      );
      const data = await response.json();

      if (response.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        setActionError(data.error ?? "Unable to update group details.");
        return;
      }

      setConversation((current) =>
        current
          ? {
              ...current,
              name: data.conversation?.name ?? name,
              description:
                data.conversation?.description ?? (description || null),
              updated_at: data.conversation?.updated_at ?? current.updated_at,
            }
          : current,
      );
      setNameDraft(name);
      setDescriptionDraft(description);
      setEditingDetails(false);
      setNotice("Group details updated.");
    } catch {
      setActionError("Unable to update group details.");
    } finally {
      setSavingDetails(false);
    }
  }

  async function searchPeople(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = memberQuery.trim();
    if (query.length < 2) {
      setActionError("Enter at least two characters to search for people.");
      return;
    }

    setSearchingMembers(true);
    setActionError("");
    setMemberResults([]);

    try {
      const response = await fetch(
        "/api/users/search?q=" + encodeURIComponent(query) + "&limit=20",
        { cache: "no-store" },
      );
      const data = await response.json();

      if (response.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        setActionError(data.error ?? "Unable to search for people.");
        return;
      }

      const currentMemberIds = new Set(members.map((member) => member.userId));
      setMemberResults(
        (Array.isArray(data.people) ? data.people : []).filter(
          (person: MemberSearchResult) => !currentMemberIds.has(person.id),
        ),
      );

      if ((data.people ?? []).length === 0) {
        setNotice("No matching accounts found.");
      }
    } catch {
      setActionError("Unable to search for people.");
    } finally {
      setSearchingMembers(false);
    }
  }

  const reloadMembers = useCallback(async () => {
    const response = await fetch(
      "/api/conversations/" + encodeURIComponent(conversationId) + "/members",
      { cache: "no-store" },
    );
    const data = await response.json();

    if (response.status === 401) {
      router.replace("/auth");
      return false;
    }

    if (!response.ok) {
      setActionError(data.error ?? "Unable to refresh group members.");
      return false;
    }

    setMembers(Array.isArray(data.members) ? data.members : []);
    setCurrentUserRole(data.currentUserRole ?? "member");
    return true;
  }, [conversationId, router]);

  async function addMember(userId: string) {
    if (!isAdmin || memberActionLoading) return;

    setMemberActionLoading("add:" + userId);
    setActionError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/conversations/" + encodeURIComponent(conversationId) + "/members",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        },
      );
      const data = await response.json();

      if (response.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        setActionError(data.error ?? "Unable to add this person.");
        return;
      }

      setMemberResults((current) => current.filter((person) => person.id !== userId));
      setNotice("Member added to the group.");
      await reloadMembers();
    } catch {
      setActionError("Unable to add this person.");
    } finally {
      setMemberActionLoading(null);
    }
  }

  async function changeMemberRole(member: GroupMember, role: "admin" | "member") {
    if (!isAdmin || member.userId === currentUserId || memberActionLoading) return;

    const displayName = member.profile?.display_name ?? "this member";
    const actionLabel = role === "admin" ? "make " + displayName + " a group admin" : "remove " + displayName + " as an admin";

    if (!window.confirm("Do you want to " + actionLabel + "?")) return;

    setMemberActionLoading("role:" + member.userId);
    setActionError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/conversations/" + encodeURIComponent(conversationId) + "/members",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: member.userId, role }),
        },
      );
      const data = await response.json();

      if (response.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        setActionError(data.error ?? "Unable to update this member's role.");
        return;
      }

      setNotice("Member role updated.");
      setActiveMemberActions(null);
      await reloadMembers();
    } catch {
      setActionError("Unable to update this member's role.");
    } finally {
      setMemberActionLoading(null);
    }
  }

  async function removeMember(member: GroupMember) {
    if (!isAdmin || member.userId === currentUserId || memberActionLoading) return;

    const displayName = member.profile?.display_name ?? "this member";
    if (!window.confirm("Remove " + displayName + " from this group?")) return;

    setMemberActionLoading("remove:" + member.userId);
    setActionError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/conversations/" +
          encodeURIComponent(conversationId) +
          "/members?userId=" +
          encodeURIComponent(member.userId),
        { method: "DELETE" },
      );
      const data = await response.json();

      if (response.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        setActionError(data.error ?? "Unable to remove this member.");
        return;
      }

      setActiveMemberActions(null);
      setNotice("Member removed from the group.");
      await reloadMembers();
    } catch {
      setActionError("Unable to remove this member.");
    } finally {
      setMemberActionLoading(null);
    }
  }

  async function leaveGroup() {
    if (leavingGroup) return;
    if (!window.confirm("Leave this group? You will stop receiving its messages.")) return;

    setLeavingGroup(true);
    setActionError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/conversations/" + encodeURIComponent(conversationId) + "/members",
        { method: "DELETE" },
      );
      const data = await response.json();

      if (response.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        setActionError(data.error ?? "Unable to leave this group.");
        return;
      }

      router.replace("/messages");
    } catch {
      setActionError("Unable to leave this group.");
    } finally {
      setLeavingGroup(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
        <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
          <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
          Loading group info…
        </div>
      </main>
    );
  }

  if (error || !conversation) {
    return (
      <main className="min-h-dvh bg-[var(--background)] px-4 py-6 text-[var(--foreground)]">
        <div className="mx-auto max-w-xl">
          <button
            type="button"
            onClick={() => router.push("/messages/" + encodeURIComponent(conversationId))}
            className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-[var(--muted-strong)] transition hover:bg-[var(--surface-muted)]"
          >
            <ArrowLeft size={17} />
            Back to conversation
          </button>
          <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-sm font-semibold text-[var(--danger)]">
              {error || "This group is unavailable."}
            </p>
            <button
              type="button"
              onClick={() => void loadGroup()}
              className="mt-4 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-muted)]"
            >
              Try again
            </button>
          </section>
        </div>
      </main>
    );
  }

  const groupName = conversation.name?.trim() || "Unnamed group";

  return (
    <main className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto min-h-dvh w-full max-w-3xl border-x border-[var(--border)] bg-[var(--surface)]">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)]/95 px-3 backdrop-blur sm:px-4">
          <button
            type="button"
            onClick={() => router.push("/messages/" + encodeURIComponent(conversationId))}
            className="inline-flex min-h-10 min-w-0 items-center gap-2 rounded-full px-2.5 text-sm font-semibold text-[var(--muted-strong)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft size={17} />
            <span>Back to chat</span>
          </button>
          <h1 className="truncate text-sm font-bold">Group info</h1>
          <Link
            href={"/messages/" + encodeURIComponent(conversationId)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--muted-strong)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
            aria-label="Open conversation"
            title="Open conversation"
          >
            <MessageCircle size={18} />
          </Link>
        </header>

        <div className="space-y-4 px-3 py-4 sm:space-y-5 sm:px-5 sm:py-6">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-6 text-center sm:px-6">
            <div className="mx-auto flex w-full max-w-xl flex-col items-center">
              <AgoreAvatar
                avatarPath={conversation.image_path}
                name={groupName}
                bucketName="group-media"
                refreshKey={conversation.updated_at}
                className="h-24 w-24 sm:h-28 sm:w-28"
                textClassName="text-2xl"
              />
              <h2 className="mt-4 max-w-full break-words text-xl font-bold tracking-tight sm:text-2xl">
                {groupName}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {members.length} {members.length === 1 ? "member" : "members"}
                {" · "}
                {isAdmin ? "You’re a group admin" : "You’re a member"}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link
                  href={"/messages/" + encodeURIComponent(conversationId)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  <MessageCircle size={16} />
                  Open chat
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setAddingMembers((open) => !open);
                    setActionError("");
                    setNotice("");
                  }}
                  disabled={!isAdmin}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-40"
                  title={isAdmin ? "Add people to this group" : "Only group admins can add people"}
                >
                  <UserPlus size={16} />
                  Add people
                </button>
              </div>
            </div>
          </section>

          {notice ? (
            <p className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--foreground)]">
              {notice}
            </p>
          ) : null}
          {actionError ? (
            <p className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
              {actionError}
            </p>
          ) : null}

          {addingMembers && isAdmin ? (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold">Add people</h2>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    Search Agoré accounts by name or username.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAddingMembers(false);
                    setMemberQuery("");
                    setMemberResults([]);
                  }}
                  aria-label="Close add people"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-[var(--surface-muted)]"
                >
                  <X size={17} />
                </button>
              </div>
              <form onSubmit={searchPeople} className="mt-4 flex gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3">
                  <Search size={16} className="shrink-0 text-[var(--muted)]" />
                  <input
                    value={memberQuery}
                    onChange={(event) => setMemberQuery(event.target.value)}
                    placeholder="Name or username"
                    className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
                    aria-label="Search people to add"
                  />
                </label>
                <button
                  type="submit"
                  disabled={searchingMembers || memberQuery.trim().length < 2}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {searchingMembers ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                  Search
                </button>
              </form>
              {memberResults.length > 0 ? (
                <div className="mt-3 divide-y divide-[var(--border)]">
                  {memberResults.map((person) => (
                    <div key={person.id} className="flex min-w-0 items-center gap-3 py-3">
                      <AgoreAvatar
                        avatarPath={person.avatar_path}
                        name={person.display_name}
                        className="h-10 w-10 shrink-0"
                        textClassName="text-xs"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{person.display_name}</p>
                        <p className="truncate text-xs text-[var(--muted)]">@{person.username}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void addMember(person.id)}
                        disabled={memberActionLoading !== null}
                        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-xs font-semibold hover:bg-[var(--surface-muted)] disabled:opacity-45"
                      >
                        {memberActionLoading === "add:" + person.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Plus size={13} />
                        )}
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {!searchingMembers && memberQuery.trim().length >= 2 && memberResults.length === 0 ? (
                <p className="mt-3 text-xs text-[var(--muted)]">
                  No available people are listed. Search another name or username.
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]">
            <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <h2 className="text-sm font-bold">Group details</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {creator?.profile?.display_name
                    ? "Created by " + creator.profile.display_name
                    : "Created " + formatDate(conversation.created_at)}
                  {creator?.profile?.display_name ? " · " + formatDate(conversation.created_at) : ""}
                </p>
              </div>
              {isAdmin && !editingDetails ? (
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(conversation.name ?? "");
                    setDescriptionDraft(conversation.description ?? "");
                    setEditingDetails(true);
                    setActionError("");
                    setNotice("");
                  }}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-xs font-semibold hover:bg-[var(--surface-muted)]"
                >
                  <PencilLine size={14} />
                  Edit
                </button>
              ) : null}
            </div>
            {editingDetails && isAdmin ? (
              <form onSubmit={saveGroupDetails} className="space-y-3 border-t border-[var(--border)] p-4 sm:px-5">
                <label className="block">
                  <span className="text-xs font-semibold text-[var(--muted)]">Group name</span>
                  <input
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    maxLength={80}
                    required
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-[var(--muted)]">Description</span>
                  <textarea
                    value={descriptionDraft}
                    onChange={(event) => setDescriptionDraft(event.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="What is this group about?"
                    className="mt-1.5 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
                  />
                  <span className="mt-1 block text-right text-[11px] text-[var(--muted)]">
                    {descriptionDraft.length}/500
                  </span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingDetails(false);
                      setNameDraft(conversation.name ?? "");
                      setDescriptionDraft(conversation.description ?? "");
                    }}
                    disabled={savingDetails}
                    className="inline-flex min-h-10 flex-1 items-center justify-center rounded-full border border-[var(--border)] px-4 text-sm font-semibold hover:bg-[var(--surface-muted)] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingDetails}
                    className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {savingDetails ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    Save changes
                  </button>
                </div>
              </form>
            ) : (
              <div className="border-t border-[var(--border)] px-4 py-4 sm:px-5">
                <p className="whitespace-pre-wrap break-words text-sm leading-6">
                  {conversation.description?.trim() || "No group description yet."}
                </p>
                {!conversation.description?.trim() && isAdmin && !editingDetails ? (
                  <button
                    type="button"
                    onClick={() => setEditingDetails(true)}
                    className="mt-2 text-xs font-semibold text-[var(--accent)] hover:underline"
                  >
                    Add a description
                  </button>
                ) : null}
              </div>
            )}
          </section>

          {isAdmin ? (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 sm:p-5">
              <h2 className="text-sm font-bold">Group photo</h2>
              <p className="mt-1 mb-4 text-xs leading-5 text-[var(--muted)]">
                Choose the image members will see in their conversation list and chat header.
              </p>
              <GroupAvatarEditor
                conversationId={conversationId}
                groupName={groupName}
                imagePath={conversation.image_path}
                onUpdated={(updated) => {
                  setConversation((current) =>
                    current
                      ? {
                          ...current,
                          image_path: updated.image_path,
                          updated_at: updated.updated_at ?? current.updated_at,
                        }
                      : current,
                  );
                  setNotice("Group photo updated.");
                  setActionError("");
                }}
                disabled={!isAdmin}
              />
            </section>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]">
            <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
              <div>
                <h2 className="text-sm font-bold">Participants</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {members.length} {members.length === 1 ? "person" : "people"} ·{" "}
                  {members.filter((member) => member.role === "admin").length}{" "}
                  {members.filter((member) => member.role === "admin").length === 1 ? "admin" : "admins"}
                </p>
              </div>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setAddingMembers((open) => !open)}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-xs font-semibold hover:bg-[var(--surface-muted)]"
                >
                  <UserPlus size={14} />
                  Add
                </button>
              ) : null}
            </div>
            <div className="border-t border-[var(--border)] p-3 sm:px-4">
              <label className="flex min-h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3">
                <Search size={15} className="shrink-0 text-[var(--muted)]" />
                <input
                  value={memberFilter}
                  onChange={(event) => setMemberFilter(event.target.value)}
                  placeholder="Find a participant"
                  aria-label="Find a participant"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
                />
                {memberFilter ? (
                  <button
                    type="button"
                    onClick={() => setMemberFilter("")}
                    aria-label="Clear participant search"
                    className="text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </label>
            </div>
            {visibleMembers.length > 0 ? (
              <div className="divide-y divide-[var(--border)]">
                {visibleMembers.map((member) => {
                  const displayName = member.profile?.display_name ?? "Agoré member";
                  const isSelf = member.userId === currentUserId;
                  const canManage = isAdmin && !isSelf;
                  const menuOpen = activeMemberActions === member.userId;

                  return (
                    <div key={member.userId} className="px-3 py-3 sm:px-4">
                      <div className="flex min-w-0 items-center gap-3">
                        {member.profile ? (
                          <Link
                            href={"/profile/" + encodeURIComponent(member.profile.id)}
                            className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                            aria-label={"Open " + displayName + " profile"}
                          >
                            <AgoreAvatar
                              avatarPath={member.profile.avatar_path}
                              name={displayName}
                              className="h-11 w-11"
                              textClassName="text-xs"
                            />
                          </Link>
                        ) : (
                          <AgoreAvatar
                            avatarPath={null}
                            name={displayName}
                            className="h-11 w-11"
                            textClassName="text-xs"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          {member.profile ? (
                            <Link
                              href={"/profile/" + encodeURIComponent(member.profile.id)}
                              className="block truncate text-sm font-semibold hover:underline"
                            >
                              {displayName}{isSelf ? " (you)" : ""}
                            </Link>
                          ) : (
                            <p className="truncate text-sm font-semibold">{displayName}{isSelf ? " (you)" : ""}</p>
                          )}
                          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                            {member.profile?.username ? "@" + member.profile.username : "Member"}
                            {" · Joined "}{formatDate(member.joinedAt)}
                          </p>
                        </div>
                        {member.role === "admin" ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--accent)]">
                            <ShieldCheck size={12} />
                            Admin
                          </span>
                        ) : null}
                        {canManage ? (
                          <button
                            type="button"
                            onClick={() => setActiveMemberActions(menuOpen ? null : member.userId)}
                            aria-label={"Manage " + displayName}
                            title="Manage member"
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                          >
                            <MoreHorizontal size={18} />
                          </button>
                        ) : null}
                      </div>
                      {canManage && menuOpen ? (
                        <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-3">
                          <button
                            type="button"
                            onClick={() => void changeMemberRole(member, member.role === "admin" ? "member" : "admin")}
                            disabled={memberActionLoading !== null}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-xs font-semibold hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {memberActionLoading === "role:" + member.userId ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Crown size={13} />
                            )}
                            {member.role === "admin" ? "Remove admin" : "Make admin"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeMember(member)}
                            disabled={memberActionLoading !== null}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--danger)]/25 px-3 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {memberActionLoading === "remove:" + member.userId ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                            Remove member
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="px-4 py-7 text-center text-sm text-[var(--muted)]">
                {memberFilter ? "No participants match that search." : "No active members were found."}
              </p>
            )}
            <div className="border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--muted)]">
              <Users size={14} className="mr-1 inline-block" />
              Admins can invite people and manage member roles. Member access is enforced by the server.
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]">
            <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <h2 className="text-sm font-bold">Media, links and voice notes</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">Shared in the latest 100 messages</p>
              </div>
              {sharedLoading ? <Loader2 size={17} className="shrink-0 animate-spin text-[var(--accent)]" /> : null}
            </div>
            <div className="grid grid-cols-3 border-y border-[var(--border)]">
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
              <p className="px-4 py-3 text-xs text-[var(--muted)]">{sharedError}</p>
            ) : null}
            {sharedMediaMessages.length > 0 ? (
              <div className="space-y-4 p-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Recent attachments</h3>
                {sharedMediaMessages.map((message) => {
                  const visualMedia = message.media.filter(
                    (item) => item.media_type === "image" || item.media_type === "file",
                  );
                  const audioMedia = message.media.filter((item) => item.media_type === "audio");

                  return (
                    <div key={message.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                      {message.content?.trim() ? (
                        <p className="mb-3 whitespace-pre-wrap break-words text-sm">{message.content}</p>
                      ) : null}
                      {visualMedia.length > 0 ? (
                        <MessageMediaContent media={visualMedia} isOwn={message.sender_id === currentUserId} />
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
                        href={"/messages/" + encodeURIComponent(conversationId) + "#agore-message-" + encodeURIComponent(message.id)}
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
                <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Recent links</h3>
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
              <div className="px-4 py-7 text-center">
                <FileText size={22} className="mx-auto text-[var(--muted)]" />
                <p className="mt-2 text-sm font-medium">Nothing shared yet</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Images, files, voice notes and links will appear here when shared.</p>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-[var(--danger)]/20 bg-[var(--surface-raised)] p-4 sm:p-5">
            <h2 className="text-sm font-bold text-[var(--danger)]">Leave group</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              You’ll stop receiving messages from this group. The server will prevent the last admin from leaving until another admin is assigned.
            </p>
            <button
              type="button"
              onClick={() => void leaveGroup()}
              disabled={leavingGroup}
              className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[var(--danger)]/30 px-4 py-2 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:opacity-50"
            >
              {leavingGroup ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
              Leave group
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}

