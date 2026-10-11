import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createAdminClient>;

type FounderContext =
  | { ok: true; admin: AdminClient; userId: string }
  | { ok: false; response: NextResponse };

function privateJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

async function requireFounder(): Promise<FounderContext> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      response: privateJson(
        { error: "Authentication required." },
        401,
      ),
    };
  }

  let admin: AdminClient;

  try {
    admin = createAdminClient();
  } catch (error) {
    console.error(
      "Founder tools could not initialize the admin client:",
      error,
    );

    return {
      ok: false,
      response: privateJson(
        { error: "Administration is unavailable." },
        503,
      ),
    };
  }

  const { data: role, error } = await admin.rpc(
    "agore_get_admin_role",
    { candidate_user_id: user.id },
  );

  if (error) {
    console.error("Founder role check failed:", error);

    return {
      ok: false,
      response: privateJson(
        { error: "Unable to verify Founder access." },
        503,
      ),
    };
  }

  if (role !== "founder") {
    return {
      ok: false,
      response: privateJson(
        { error: "Founder access required." },
        403,
      ),
    };
  }

  return {
    ok: true,
    admin,
    userId: user.id,
  };
}

function operationError(error: {
  code?: string;
  message?: string;
}) {
  if (error.code === "42501") {
    return privateJson(
      { error: "Founder access required." },
      403,
    );
  }

  if (error.code === "P0002") {
    return privateJson(
      { error: error.message ?? "Record not found." },
      404,
    );
  }

  if (error.code === "55000") {
    return privateJson(
      { error: error.message ?? "This action is not allowed." },
      409,
    );
  }

  if (error.code === "22023") {
    return privateJson(
      { error: error.message ?? "Invalid action." },
      400,
    );
  }

  console.error("Founder administration operation failed:", error);

  return privateJson(
    { error: "The operation failed." },
    500,
  );
}

const staffRoleSchema = z.enum([
  "super_admin",
  "platform_admin",
  "moderator",
  "support_staff",
  "analyst",
]);

const patchSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("staff"),
      userId: z.uuid(),
      action: z.enum([
        "grant",
        "change_role",
        "revoke",
      ]),
      role: staffRoleSchema.optional(),
      note: z.string().trim().max(1000).optional(),
    })
    .strict()
    .refine(
      (value) =>
        value.action === "revoke" ||
        value.role !== undefined,
      { message: "Choose a staff role." },
    ),

  z
    .object({
      type: z.literal("verification"),
      userId: z.uuid(),
      action: z.enum(["grant", "revoke"]),
      kind: z.enum(["agore_official", "paid"]).optional(),
      expiresAt: z.iso.datetime().nullable().optional(),
      note: z.string().trim().max(1000).optional(),
    })
    .strict()
    .refine(
      (value) =>
        value.action === "revoke" ||
        value.kind !== undefined,
      { message: "Choose a verification type." },
    )
    .refine(
      (value) =>
        value.action !== "grant" ||
        value.kind !== "paid" ||
        (typeof value.expiresAt === "string" &&
          value.expiresAt.length > 0),
      { message: "Paid verification requires an expiry date." },
    )
    .refine(
      (value) =>
        value.action !== "grant" ||
        value.kind !== "agore_official" ||
        value.expiresAt == null,
      {
        message:
          "Agoré Official verification does not expire.",
      },
    ),
]);

export async function GET(request: Request) {
  const access = await requireFounder();

  if (!access.ok) {
    return access.response;
  }

  const { admin, userId } = access;
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "staff";

  if (
    !["staff", "verification", "audit"].includes(view)
  ) {
    return privateJson(
      { error: "Unknown Founder tools view." },
      400,
    );
  }

  try {
    if (view === "staff") {
      const rawQuery = url.searchParams.get("q") ?? "";
      const query = rawQuery
        .replace(/[^a-zA-Z0-9_.@ -]/g, "")
        .trim()
        .slice(0, 60);

      const { data, error } = await admin.rpc(
        "agore_admin_list_staff",
        {
          p_actor_id: userId,
          p_query: query.length >= 2 ? query : null,
        },
      );

      if (error) {
        return operationError(error);
      }

      const result = (data ?? {}) as {
        staff?: unknown[];
        candidates?: unknown[];
      };

      return privateJson({
        view,
        staff: result.staff ?? [],
        candidates: result.candidates ?? [],
      });
    }

    if (view === "verification") {
      const rawQuery = url.searchParams.get("q") ?? "";
      const query = rawQuery
        .replace(/[^a-zA-Z0-9_.@ -]/g, "")
        .trim()
        .slice(0, 60);

      let profileQuery = admin
        .from("profiles")
        .select(
          "id, display_name, username, account_type, account_status, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (query) {
        profileQuery = profileQuery.or(
          `username.ilike.%${query}%,display_name.ilike.%${query}%`,
        );
      }

      const {
        data: profileData,
        error: profileError,
      } = await profileQuery;

      if (profileError) {
        console.error(
          "Verification profile query failed:",
          profileError,
        );

        return privateJson(
          { error: "Unable to load verification accounts." },
          500,
        );
      }

      const profiles = (profileData ?? []) as {
        id: string;
        display_name: string;
        username: string;
        account_type: string;
        account_status: string;
        created_at: string;
      }[];

      if (profiles.length === 0) {
        return privateJson({
          view,
          verifications: [],
        });
      }

      const { data: grantData, error: grantError } =
        await admin
          .from("profile_verifications")
          .select(
            "user_id, verification_kind, verified_at, expires_at, revoked_at, granted_by, internal_note",
          )
          .in(
            "user_id",
            profiles.map((profile) => profile.id),
          );

      if (grantError) {
        console.error(
          "Verification grant query failed:",
          grantError,
        );

        return privateJson(
          { error: "Unable to load verification records." },
          500,
        );
      }

      const grants = (grantData ?? []) as {
        user_id: string;
        verification_kind: "agore_official" | "paid";
        verified_at: string;
        expires_at: string | null;
        revoked_at: string | null;
        granted_by: string | null;
        internal_note: string | null;
      }[];

      const grantsByUser = new Map(
        grants.map((grant) => [grant.user_id, grant]),
      );

      return privateJson({
        view,
        verifications: profiles.map((profile) => ({
          ...profile,
          verification:
            grantsByUser.get(profile.id) ?? null,
        })),
      });
    }

    const { data, error } = await admin.rpc(
      "agore_admin_list_audit_events",
      {
        p_actor_id: userId,
        p_limit: 75,
      },
    );

    if (error) {
      return operationError(error);
    }

    return privateJson({
      view,
      events: Array.isArray(data) ? data : [],
    });
  } catch (error) {
    console.error("Unexpected Founder tools error:", error);

    return privateJson(
      { error: "Unable to load Founder tools." },
      500,
    );
  }
}

export async function PATCH(request: Request) {
  const access = await requireFounder();

  if (!access.ok) {
    return access.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return privateJson(
      { error: "Invalid request body." },
      400,
    );
  }

  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return privateJson(
      { error: "Invalid administrative action." },
      400,
    );
  }

  const { admin, userId } = access;
  const input = parsed.data;

  if (input.type === "staff") {
    const { data, error } = await admin.rpc(
      "agore_admin_manage_staff",
      {
        p_actor_id: userId,
        p_target_user_id: input.userId,
        p_action: input.action,
        p_role: input.role ?? null,
        p_note: input.note ?? null,
      },
    );

    if (error) {
      return operationError(error);
    }

    return privateJson({
      success: true,
      result: data,
      message:
        input.action === "revoke"
          ? "Staff access revoked."
          : input.action === "change_role"
            ? "Staff role updated."
            : "Staff access granted.",
    });
  }

  const { data, error } = await admin.rpc(
    "agore_admin_manage_verification",
    {
      p_actor_id: userId,
      p_target_user_id: input.userId,
      p_action: input.action,
      p_kind: input.kind ?? null,
      p_expires_at: input.expiresAt ?? null,
      p_note: input.note ?? null,
    },
  );

  if (error) {
    return operationError(error);
  }

  return privateJson({
    success: true,
    result: data,
    message:
      input.action === "revoke"
        ? "Verification revoked."
        : "Verification grant saved.",
  });
}