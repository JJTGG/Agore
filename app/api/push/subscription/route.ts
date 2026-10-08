import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const subscriptionSchema =
  z.object({
    endpoint: z
      .string()
      .url()
      .max(4000),
    expirationTime:
      z
        .number()
        .int()
        .nonnegative()
        .nullable()
        .optional(),
    keys: z.object({
      p256dh: z
        .string()
        .min(1)
        .max(1000),
      auth: z
        .string()
        .min(1)
        .max(1000),
    }),
  });

async function getUser() {
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

export async function POST(
  request: Request,
) {
  const user =
    await getUser();

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
    subscriptionSchema.safeParse(
      body,
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Invalid push subscription.",
      },
      {
        status: 400,
      },
    );
  }

  const admin =
    createAdminClient();

  const {
    data: subscription,
    error,
  } = await admin
    .from(
      "push_subscriptions",
    )
    .upsert(
      {
        user_id:
          user.id,
        endpoint:
          parsed.data.endpoint,
        p256dh_key:
          parsed.data.keys
            .p256dh,
        auth_key:
          parsed.data.keys.auth,
        expiration_time:
          parsed.data
            .expirationTime ??
          null,
        user_agent:
          request.headers.get(
            "user-agent",
          ),
        updated_at:
          new Date().toISOString(),
      },
      {
        onConflict:
          "endpoint",
      },
    )
    .select(
      "id, endpoint, expiration_time, created_at, updated_at",
    )
    .single();

  if (error) {
    console.error(
      "Failed to store Agore push subscription:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unable to enable push notifications.",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    subscription,
    enabled:
      true,
  });
}

export async function DELETE(
  request: Request,
) {
  const user =
    await getUser();

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
    z
      .object({
        endpoint: z
          .string()
          .url()
          .max(4000),
      })
      .safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "A valid push endpoint is required.",
      },
      {
        status: 400,
      },
    );
  }

  const admin =
    createAdminClient();

  const { error } =
    await admin
      .from(
        "push_subscriptions",
      )
      .delete()
      .eq(
        "user_id",
        user.id,
      )
      .eq(
        "endpoint",
        parsed.data.endpoint,
      );

  if (error) {
    console.error(
      "Failed to remove Agore push subscription:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unable to disable push notifications.",
      },
      {
        status: 500,
      },
    );
  }

  return new NextResponse(
    null,
    {
      status: 204,
    },
  );
}