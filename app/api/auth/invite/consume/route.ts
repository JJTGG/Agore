import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Invite codes are no longer required. Public registration is enabled.",
    },
    { status: 410 },
  );
}