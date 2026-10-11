
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AdminRole =
  | "founder"
  | "super_admin"
  | "platform_admin"
  | "moderator"
  | "analyst";

export type AdminCapability =
  | "overview"
  | "reports"
  | "moderation"
  | "users";

type AdminClient = ReturnType<typeof createAdminClient>;

export type AdminAuthorization =
  | {
      ok: true;
      context: {
        user: User;
        admin: AdminClient;
        role: AdminRole;
      };
    }
  | {
      ok: false;
      response: NextResponse;
    };

const rolesByCapability: Record<
  AdminCapability,
  readonly AdminRole[]
> = {
  overview: [
    "founder",
    "super_admin",
    "platform_admin",
    "moderator",
    "analyst",
  ],
  reports: [
    "founder",
    "super_admin",
    "platform_admin",
    "moderator",
    "analyst",
  ],
  moderation: [
    "founder",
    "super_admin",
    "platform_admin",
    "moderator",
  ],
  users: [
    "founder",
    "super_admin",
    "platform_admin",
  ],
};

function privateJson(payload: unknown, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

function isAdminRole(value: unknown): value is AdminRole {
  return (
    value === "founder" ||
    value === "super_admin" ||
    value === "platform_admin" ||
    value === "moderator" ||
    value === "analyst"
  );
}

export async function requireAdminAccess(
  capability: AdminCapability,
): Promise<AdminAuthorization> {
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
      "Unable to initialize Agore admin authorization:",
      error,
    );

    return {
      ok: false,
      response: privateJson(
        { error: "Admin authorization is unavailable." },
        503,
      ),
    };
  }

  const { data: roleData, error: roleError } =
    await admin.rpc("agore_get_admin_role", {
      candidate_user_id: user.id,
    });

  if (roleError) {
    console.error(
      "Failed to verify Agore administrative access:",
      roleError,
    );

    return {
      ok: false,
      response: privateJson(
        { error: "Unable to verify administrative access." },
        503,
      ),
    };
  }

  if (
    !isAdminRole(roleData) ||
    !rolesByCapability[capability].includes(roleData)
  ) {
    return {
      ok: false,
      response: privateJson(
        { error: "Administrative access required." },
        403,
      ),
    };
  }

  return {
    ok: true,
    context: {
      user,
      admin,
      role: roleData,
    },
  };
}
