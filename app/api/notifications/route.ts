import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const patchSchema = z
  .object({
    notificationId:
      z.string().uuid().optional(),
    all: z.boolean().optional(),
  })
  .refine(
    (value) =>
      Boolean(
        value.notificationId,
      ) ||
      value.all === true,
    {
      message:
        "Provide a notificationId or set all to true.",
    },
  );

async function getAuthenticatedUser() {
  const supabase =
    await createClient();

  const {
    data: { user },
    error,
  } =
    await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

async function filterNotificationVisibility(
  notifications: Array<{
    actor_id: string | null;
    actor:
      | {
          id: string;
          username: string;
          display_name: string;
          account_status: string;
        }
      | null;
  }>,
  userId: string,
) {
  const actorIds = [
    ...new Set(
      notifications
        .map(
          (notification) =>
            notification.actor_id,
        )
        .filter(
          (
            id,
          ): id is string =>
            Boolean(id),
        ),
    ),
  ];

  if (
    actorIds.length === 0
  ) {
    return notifications;
  }

  const admin =
    createAdminClient();

  const {
    data: blocks,
    error: blockError,
  } =
    await admin
      .from("blocks")
      .select(
        "blocker_id, blocked_id",
      )
      .or(
        `blocker_id.eq.${userId},blocked_id.eq.${userId}`,
      );

  if (blockError) {
    console.error(
      "Failed to load Agore notification block visibility:",
      blockError,
    );

    return notifications.filter(
      (notification) =>
        !notification.actor_id ||
        notification.actor?.account_status ===
          "active",
    );
  }

  const blockedIds =
    new Set<string>();

  for (const block of blocks ??
    []) {
    if (
      block.blocker_id === userId
    ) {
      blockedIds.add(
        block.blocked_id,
      );
    }

    if (
      block.blocked_id === userId
    ) {
      blockedIds.add(
        block.blocker_id,
      );
    }
  }

  return notifications.filter(
    (notification) =>
      !notification.actor_id ||
      (
        notification.actor?.account_status ===
          "active" &&
        !blockedIds.has(
          notification.actor_id,
        )
      ),
  );
}

export async function GET(
  request: Request,
) {
  const user =
    await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Authentication required.",
      },
      {
        status: 401,
      },
    );
  }

  const url =
    new URL(request.url);

  const rawLimit =
    Number(
      url.searchParams.get(
        "limit",
      ) ?? "30",
    );

  const limit =
    Number.isFinite(
      rawLimit,
    )
      ? Math.min(
          Math.max(
            Math.floor(
              rawLimit,
            ),
            1,
          ),
          50,
        )
      : 30;

  const unreadOnly =
    url.searchParams.get(
      "unread",
    ) === "true";

  const notificationId =
    url.searchParams.get(
      "notificationId",
    );

  if (
    notificationId &&
    !z.string().uuid().safeParse(
      notificationId,
    ).success
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid notification ID.",
      },
      {
        status: 400,
      },
    );
  }

  const admin =
    createAdminClient();

  let notificationsQuery =
    admin
      .from("notifications")
      .select(
        `
          id,
          event_id,
          recipient_id,
          actor_id,
          type,
          entity_id,
          data,
          read_at,
          created_at,
          actor:profiles!notifications_actor_id_fkey (
            id,
            username,
            display_name,
            account_status
          )
        `,
        {
          count:
            "exact",
        },
      )
      .eq(
        "recipient_id",
        user.id,
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      );

  if (notificationId) {
    notificationsQuery =
      notificationsQuery.eq(
        "id",
        notificationId,
      );
  } else {
    notificationsQuery =
      notificationsQuery.limit(
        limit,
      );

    if (unreadOnly) {
      notificationsQuery =
        notificationsQuery.is(
          "read_at",
          null,
        );
    }
  }

  if (!notificationId) {
    const [
      {
        data: notifications,
        error:
          notificationsError,
        count,
      },
      {
        count:
          unreadCount,
        error:
          unreadCountError,
      },
    ] = await Promise.all([
      notificationsQuery,
      admin
        .from(
          "notifications",
        )
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq(
          "recipient_id",
          user.id,
        )
        .is(
          "read_at",
          null,
        ),
    ]);

    if (
      notificationsError
    ) {
      console.error(
        "Failed to load Agore notifications:",
        notificationsError,
      );

      return NextResponse.json(
        {
          error:
            "Unable to load notifications.",
        },
        {
          status: 500,
        },
      );
    }

    if (
      unreadCountError
    ) {
      console.error(
        "Failed to count Agore unread notifications:",
        unreadCountError,
      );

      return NextResponse.json(
        {
          error:
            "Unable to load notification count.",
        },
        {
          status: 500,
        },
      );
    }

    const visible =
      await filterNotificationVisibility(
        (notifications ??
          []) as never,
        user.id,
      );

    return NextResponse.json({
      notifications:
        visible,
      unreadCount:
        unreadCount ?? 0,
      totalCount:
        count ?? 0,
    });
  }

  const {
    data: notifications,
    error,
  } =
    await notificationsQuery.limit(
      1,
    );

  if (error) {
    console.error(
      "Failed to load Agore realtime notification:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unable to load notification.",
      },
      {
        status: 500,
      },
    );
  }

  const visible =
    await filterNotificationVisibility(
      (notifications ??
        []) as never,
      user.id,
    );

  return NextResponse.json({
    notifications:
      visible,
    unreadCount: 0,
    totalCount:
      visible.length,
  });
}

export async function PATCH(
  request: Request,
) {
  const user =
    await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Authentication required.",
      },
      {
        status: 401,
      },
    );
  }

  let body: unknown;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid JSON body.",
      },
      {
        status: 400,
      },
    );
  }

  const parsed =
    patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Invalid notification update.",
        details:
          parsed.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  const admin =
    createAdminClient();

  const now =
    new Date().toISOString();

  if (
    parsed.data.all === true
  ) {
    const { error } =
      await admin
        .from(
          "notifications",
        )
        .update({
          read_at: now,
        })
        .eq(
          "recipient_id",
          user.id,
        )
        .is(
          "read_at",
          null,
        );

    if (error) {
      console.error(
        "Failed to mark Agore notifications as read:",
        error,
      );

      return NextResponse.json(
        {
          error:
            "Unable to mark notifications as read.",
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      success: true,
      marked: "all",
    });
  }

  const notificationId =
    parsed.data
      .notificationId;

  if (!notificationId) {
    return NextResponse.json(
      {
        error:
          "Notification ID is required.",
      },
      {
        status: 400,
      },
    );
  }

  const {
    data,
    error,
  } =
    await admin
      .from(
        "notifications",
      )
      .update({
        read_at: now,
      })
      .eq(
        "id",
        notificationId,
      )
      .eq(
        "recipient_id",
        user.id,
      )
      .select(
        "id, read_at",
      )
      .maybeSingle();

  if (error) {
    console.error(
      "Failed to mark Agore notification as read:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unable to mark notification as read.",
      },
      {
        status: 500,
      },
    );
  }

  if (!data) {
    return NextResponse.json(
      {
        error:
          "Notification not found.",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    success: true,
    notification: data,
  });
}