
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  requireAdminAccess,
  type AdminCapability,
} from "@/lib/admin/admin-auth";

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

const reportStatuses = [
  "pending",
  "reviewed",
  "actioned",
  "dismissed",
] as const;

const accountStatuses = [
  "active",
  "disabled",
  "deleted",
] as const;

const patchSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("report"),
      reportId: z.uuid(),
      action: z.enum([
        "review",
        "dismiss",
        "remove_content",
        "disable_account",
      ]),
      note: z.string().trim().max(1000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("user_status"),
      userId: z.uuid(),
      status: z.enum(["active", "disabled"]),
      note: z.string().trim().max(1000).optional(),
    })
    .strict(),
]);

type ReportRow = {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type IdentityRow = {
  id: string;
  display_name: string;
  username: string;
  account_status: string;
  created_at?: string;
};

type ProfileTargetRow = IdentityRow;

type ContentTargetRow = {
  id: string;
  content: string | null;
  author_id?: string;
  sender_id?: string | null;
  conversation_id?: string;
  post_id?: string;
  created_at: string;
  deleted_at: string | null;
};

type GroupTargetRow = {
  id: string;
  type: string;
  name: string | null;
  description: string | null;
  created_by: string;
  created_at: string;
};

type AdminTarget = {
  id: string;
  type: string;
  label: string;
  excerpt: string;
  actorId: string | null;
  deleted: boolean;
  accountStatus: string | null;
};

function privateJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function safeIds(values: string[]) {
  return values.length > 0 ? values : [EMPTY_UUID];
}

function contentExcerpt(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || "[No text content — possibly media-only]";
}

function actionError(error: { code?: string; message?: string }) {
  const code = error.code;

  if (code === "42501") {
    return privateJson(
      { error: "You do not have permission to perform this action." },
      403,
    );
  }

  if (code === "P0002") {
    return privateJson(
      { error: "The requested record could not be found." },
      404,
    );
  }

  if (code === "55000") {
    return privateJson(
      { error: error.message ?? "This action is not allowed." },
      409,
    );
  }

  if (code === "22023") {
    return privateJson(
      { error: error.message ?? "Invalid administrative action." },
      400,
    );
  }

  console.error("Agore admin operation failed:", error);

  return privateJson(
    { error: "The administrative operation failed." },
    500,
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "overview";

  if (!["overview", "reports", "users"].includes(view)) {
    return privateJson({ error: "Unknown admin view." }, 400);
  }

  const capability: AdminCapability =
    view === "users"
      ? "users"
      : view === "reports"
        ? "reports"
        : "overview";

  const authorization = await requireAdminAccess(capability);

  if (!authorization.ok) {
    return authorization.response;
  }

  const { admin, role } = authorization.context;

  try {
    if (view === "overview") {
      const [
        profiles,
        activeProfiles,
        disabledProfiles,
        posts,
        pendingReports,
        openCases,
      ] = await Promise.all([
        admin
          .from("profiles")
          .select("id", { count: "exact", head: true }),
        admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("account_status", "active"),
        admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("account_status", "disabled"),
        admin
          .from("posts")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null),
        admin
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        admin
          .from("support_cases")
          .select("id", { count: "exact", head: true })
          .in("status", ["open", "in_progress", "waiting_on_user"]),
      ]);

      const queryResults = [
        profiles,
        activeProfiles,
        disabledProfiles,
        posts,
        pendingReports,
        openCases,
      ];

      if (queryResults.some((result) => result.error)) {
        console.error(
          "Failed to load Agore admin overview:",
          queryResults
            .map((result) => result.error)
            .filter(Boolean),
        );

        return privateJson(
          { error: "Unable to load the administration overview." },
          500,
        );
      }

      return privateJson({
        view,
        role,
        overview: {
          totalAccounts: profiles.count ?? 0,
          activeAccounts: activeProfiles.count ?? 0,
          disabledAccounts: disabledProfiles.count ?? 0,
          visiblePosts: posts.count ?? 0,
          pendingReports: pendingReports.count ?? 0,
          openSupportCases: openCases.count ?? 0,
        },
      });
    }

    if (view === "users") {
      const rawQuery = url.searchParams.get("q") ?? "";
      const query = rawQuery
        .replace(/[^a-zA-Z0-9_.@ -]/g, "")
        .trim()
        .slice(0, 60);

      const rawStatus = url.searchParams.get("status") ?? "all";

      if (!accountStatuses.includes(rawStatus as (typeof accountStatuses)[number]) &&
          rawStatus !== "all") {
        return privateJson(
          { error: "Invalid account status filter." },
          400,
        );
      }

      let userQuery = admin
        .from("profiles")
        .select(
          "id, display_name, username, account_type, account_status, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (rawStatus !== "all") {
        userQuery = userQuery.eq("account_status", rawStatus);
      }

      if (query) {
        userQuery = userQuery.or(
          `username.ilike.%${query}%,display_name.ilike.%${query}%`,
        );
      }

      const { data, error } = await userQuery;

      if (error) {
        console.error("Failed to load Agore admin users:", error);
        return privateJson(
          { error: "Unable to load the user directory." },
          500,
        );
      }

      return privateJson({
        view,
        role,
        users: data ?? [],
      });
    }

    const rawStatus = url.searchParams.get("status") ?? "pending";
    const status = rawStatus === "all" ? "all" : rawStatus;

    if (
      status !== "all" &&
      !reportStatuses.includes(status as (typeof reportStatuses)[number])
    ) {
      return privateJson({ error: "Invalid report status filter." }, 400);
    }

    const rawLimit = Number(url.searchParams.get("limit") ?? "30");

    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
      return privateJson(
        { error: "Limit must be an integer from 1 to 50." },
        400,
      );
    }

    let reportQuery = admin
      .from("reports")
      .select(
        "id, reporter_id, target_type, target_id, reason, details, status, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(rawLimit);

    if (status !== "all") {
      reportQuery = reportQuery.eq("status", status);
    }

    const { data: reportData, error: reportError } = await reportQuery;

    if (reportError) {
      console.error("Failed to load Agore moderation reports:", reportError);
      return privateJson(
        { error: "Unable to load moderation reports." },
        500,
      );
    }

    const reportRows = asRows<ReportRow>(reportData);

    const idsFor = (targetType: string) =>
      reportRows
        .filter((report) => report.target_type === targetType)
        .map((report) => report.target_id);

    const [
      profileTargetsResult,
      postTargetsResult,
      commentTargetsResult,
      messageTargetsResult,
      groupTargetsResult,
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("id, display_name, username, account_status, created_at")
        .in("id", safeIds(idsFor("profile"))),
      admin
        .from("posts")
        .select("id, content, author_id, created_at, deleted_at")
        .in("id", safeIds(idsFor("post"))),
      admin
        .from("comments")
        .select("id, content, author_id, post_id, created_at, deleted_at")
        .in("id", safeIds(idsFor("comment"))),
      admin
        .from("messages")
        .select("id, content, sender_id, conversation_id, created_at, deleted_at")
        .in("id", safeIds(idsFor("message"))),
      admin
        .from("conversations")
        .select("id, type, name, description, created_by, created_at")
        .eq("type", "group")
        .in("id", safeIds(idsFor("group"))),
    ]);

    const targetResults = [
      profileTargetsResult,
      postTargetsResult,
      commentTargetsResult,
      messageTargetsResult,
      groupTargetsResult,
    ];

    if (targetResults.some((result) => result.error)) {
      console.error(
        "Failed to load Agore report targets:",
        targetResults.map((result) => result.error).filter(Boolean),
      );

      return privateJson(
        { error: "Unable to load report target details." },
        500,
      );
    }

    const profileTargets = asRows<ProfileTargetRow>(profileTargetsResult.data);
    const postTargets = asRows<ContentTargetRow>(postTargetsResult.data);
    const commentTargets = asRows<ContentTargetRow>(commentTargetsResult.data);
    const messageTargets = asRows<ContentTargetRow>(messageTargetsResult.data);
    const groupTargets = asRows<GroupTargetRow>(groupTargetsResult.data);

    const targets = new Map<string, AdminTarget>();
    const identityIds = new Set<string>(
      reportRows.map((report) => report.reporter_id),
    );

    for (const profile of profileTargets) {
      targets.set(`profile:${profile.id}`, {
        id: profile.id,
        type: "profile",
        label: `${profile.display_name} (@${profile.username})`,
        excerpt: `Account status: ${profile.account_status}`,
        actorId: null,
        deleted: profile.account_status === "deleted",
        accountStatus: profile.account_status,
      });
      identityIds.add(profile.id);
    }

    for (const post of postTargets) {
      targets.set(`post:${post.id}`, {
        id: post.id,
        type: "post",
        label: "Post",
        excerpt: contentExcerpt(post.content),
        actorId: post.author_id ?? null,
        deleted: post.deleted_at !== null,
        accountStatus: null,
      });
      if (post.author_id) identityIds.add(post.author_id);
    }

    for (const comment of commentTargets) {
      targets.set(`comment:${comment.id}`, {
        id: comment.id,
        type: "comment",
        label: "Comment",
        excerpt: contentExcerpt(comment.content),
        actorId: comment.author_id ?? null,
        deleted: comment.deleted_at !== null,
        accountStatus: null,
      });
      if (comment.author_id) identityIds.add(comment.author_id);
    }

    for (const message of messageTargets) {
      targets.set(`message:${message.id}`, {
        id: message.id,
        type: "message",
        label: "Message",
        excerpt: contentExcerpt(message.content),
        actorId: message.sender_id ?? null,
        deleted: message.deleted_at !== null,
        accountStatus: null,
      });
      if (message.sender_id) identityIds.add(message.sender_id);
    }

    for (const group of groupTargets) {
      targets.set(`group:${group.id}`, {
        id: group.id,
        type: "group",
        label: group.name || "Unnamed group",
        excerpt: group.description || "Group conversation",
        actorId: group.created_by,
        deleted: false,
        accountStatus: null,
      });
      identityIds.add(group.created_by);
    }

    const { data: identityData, error: identityError } = await admin
      .from("profiles")
      .select("id, display_name, username, account_status")
      .in("id", safeIds([...identityIds]));

    if (identityError) {
      console.error("Failed to load Agore report identities:", identityError);
      return privateJson(
        { error: "Unable to load report identity details." },
        500,
      );
    }

    const identityMap = new Map(
      asRows<IdentityRow>(identityData).map((identity) => [
        identity.id,
        identity,
      ]),
    );

    const reports = reportRows.map((report) => {
      const target = targets.get(
        `${report.target_type}:${report.target_id}`,
      );

      const actor = target?.actorId
        ? identityMap.get(target.actorId) ?? null
        : null;

      return {
        ...report,
        reporter: identityMap.get(report.reporter_id) ?? null,
        target: target
          ? {
              ...target,
              actor: actor
                ? {
                    id: actor.id,
                    display_name: actor.display_name,
                    username: actor.username,
                    account_status: actor.account_status,
                  }
                : null,
            }
          : null,
      };
    });

    return privateJson({
      view,
      role,
      reports,
    });
  } catch (error) {
    console.error("Unexpected Agore admin API error:", error);
    return privateJson(
      { error: "An unexpected administration error occurred." },
      500,
    );
  }
}

export async function PATCH(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return privateJson({ error: "Invalid request body." }, 400);
  }

  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return privateJson(
      { error: "Invalid administrative action." },
      400,
    );
  }

  const input = parsed.data;
  const capability: AdminCapability =
    input.type === "report"
      ? "moderation"
      : "users";

  const authorization = await requireAdminAccess(capability);

  if (!authorization.ok) {
    return authorization.response;
  }

  const { admin, user } = authorization.context;

  if (input.type === "report") {
    const { data, error } = await admin.rpc(
      "agore_admin_apply_report_action",
      {
        p_actor_id: user.id,
        p_report_id: input.reportId,
        p_action: input.action,
        p_note: input.note ?? null,
      },
    );

    if (error) {
      return actionError(error);
    }

    return privateJson({
      success: true,
      result: data,
      message: "Report action completed.",
    });
  }

  const { data, error } = await admin.rpc(
    "agore_admin_set_account_status",
    {
      p_actor_id: user.id,
      p_target_user_id: input.userId,
      p_new_status: input.status,
      p_reason: input.note ?? null,
    },
  );

  if (error) {
    return actionError(error);
  }

  return privateJson({
    success: true,
    result: data,
    message: "Account status updated.",
  });
}
