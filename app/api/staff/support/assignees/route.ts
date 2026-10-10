import { NextResponse } from "next/server";

import { requireSupportStaff } from "@/lib/support/staff-auth";

type SupportStaffRole =
  | "founder"
  | "super_admin"
  | "platform_admin"
  | "support_staff";

type SupportAssigneeRow = {
  user_id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  role: SupportStaffRole;
};

function privateJson(
  payload: unknown,
  status = 200,
) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET() {
  const authorization =
    await requireSupportStaff();

  if (!authorization.ok) {
    return authorization.response;
  }

  const { user, admin } =
    authorization.context;

  const {
    data,
    error,
  } = await admin.rpc(
    "agore_list_support_assignees",
    {
      p_actor_id: user.id,
    },
  );

  if (error) {
    console.error(
      "Failed to load Agore support assignees:",
      error,
    );

    if (error.code === "42501") {
      return privateJson(
        {
          error: "Support staff access required.",
        },
        403,
      );
    }

    return privateJson(
      {
        error: "Unable to load assignable staff.",
      },
      500,
    );
  }

  const rows =
    (data ?? []) as SupportAssigneeRow[];

  const staff = rows.map((member) => ({
    userId: member.user_id,
    username: member.username,
    displayName: member.display_name,
    avatarPath: member.avatar_path,
    role: member.role,
  }));

  return privateJson({
    staff,
    count: staff.length,
  });
}