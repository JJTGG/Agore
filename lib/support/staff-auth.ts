import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<
  typeof createAdminClient
>;

export type SupportStaffContext = {
  user: User;
  admin: AdminClient;
};

export type SupportStaffAuthorization =
  | {
      ok: true;
      context: SupportStaffContext;
    }
  | {
      ok: false;
      response: NextResponse;
    };

function privateJson(
  payload: unknown,
  status: number,
) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * Authorizes an authenticated, active Agoré staff member
 * to access support operations.
 *
 * Authorized roles:
 * - founder
 * - super_admin
 * - platform_admin
 * - support_staff
 *
 * The database function independently checks the staff role.
 * Never trust a role or user ID supplied by the client.
 *
 * Use this helper from server-side API routes only.
 */
export async function requireSupportStaff():
  Promise<SupportStaffAuthorization> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      response: privateJson(
        {
          error: "Authentication required.",
        },
        401,
      ),
    };
  }

  let admin: AdminClient;

  try {
    admin = createAdminClient();
  } catch (error) {
    console.error(
      "Unable to initialize support authorization:",
      error,
    );

    return {
      ok: false,
      response: privateJson(
        {
          error: "Support authorization is unavailable.",
        },
        500,
      ),
    };
  }

  const {
    data: profile,
    error: profileError,
  } = await admin
    .from("profiles")
    .select("id, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error(
      "Failed to verify support staff profile:",
      profileError,
    );

    return {
      ok: false,
      response: privateJson(
        {
          error: "Unable to verify support access.",
        },
        500,
      ),
    };
  }

  if (
    !profile ||
    profile.account_status !== "active"
  ) {
    return {
      ok: false,
      response: privateJson(
        {
          error: "Active account required.",
        },
        403,
      ),
    };
  }

  const {
    data: isSupportStaff,
    error: staffCheckError,
  } = await admin.rpc(
    "agore_is_support_staff",
    {
      candidate_user_id: user.id,
    },
  );

  if (staffCheckError) {
    console.error(
      "Failed to verify Agoré support staff role:",
      staffCheckError,
    );

    return {
      ok: false,
      response: privateJson(
        {
          error: "Unable to verify support access.",
        },
        500,
      ),
    };
  }

  if (isSupportStaff !== true) {
    return {
      ok: false,
      response: privateJson(
        {
          error: "Support staff access required.",
        },
        403,
      ),
    };
  }

  return {
    ok: true,
    context: {
      user,
      admin,
    },
  };
}