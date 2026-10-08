import { NextResponse } from "next/server";

import {
  getPushPublicKey,
} from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

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

  const publicKey =
    getPushPublicKey();

  return NextResponse.json({
    enabled:
      Boolean(publicKey),
    publicKey,
  });
}