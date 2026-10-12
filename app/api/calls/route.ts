import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

const CALL_FIELDS = [
  "id",
  "conversation_id",
  "caller_id",
  "callee_id",
  "status",
  "created_at",
  "answered_at",
  "ended_at",
  "duration_seconds",
  "ended_by",
  "failure_reason",
  "updated_at",
].join(", ");

type CallRow = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  status:
    | "ringing"
    | "accepted"
    | "completed"
    | "declined"
    | "missed"
    | "cancelled"
    | "failed";
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  ended_by: string | null;
  failure_reason: string | null;
  updated_at: string;
};

type PeerProfile = {
  id: string;
  display_name: string;
  username: string;
  avatar_path: string | null;
};

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);

  const parsedQuery = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "The call history limit must be between 1 and 100." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: calls, error: callsError } = await admin
    .from("conversation_calls")
    .select(CALL_FIELDS)
    .or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(parsedQuery.data.limit);

  if (callsError) {
    console.error("Failed to load Agoré call history:", callsError);

    return NextResponse.json(
      { error: "Unable to load your call history." },
      { status: 500 },
    );
  }

  // The generated Supabase types don't infer this query's row shape.
  // Validate the local TypeScript contract explicitly instead.
  const records = (calls ?? []) as unknown as CallRow[];

  const peerIds = [
    ...new Set(
      records.map((call) =>
        call.caller_id === user.id
          ? call.callee_id
          : call.caller_id,
      ),
    ),
  ];

  const profiles = new Map<string, PeerProfile>();

  if (peerIds.length > 0) {
    const {
      data: peerProfiles,
      error: profilesError,
    } = await admin
      .from("profiles")
      .select("id, display_name, username, avatar_path")
      .in("id", peerIds);

    if (profilesError) {
      console.error(
        "Failed to load call-history participant profiles:",
        profilesError,
      );

      return NextResponse.json(
        { error: "Unable to load call participants." },
        { status: 500 },
      );
    }

    for (const profile of peerProfiles ?? []) {
      profiles.set(profile.id, profile);
    }
  }

  const history = records.map((call) => {
    const outgoing = call.caller_id === user.id;
    const peerId = outgoing
      ? call.callee_id
      : call.caller_id;

    return {
      ...call,
      direction: outgoing ? "outgoing" : "incoming",
      peer: profiles.get(peerId) ?? null,
    };
  });

  return NextResponse.json(
    { calls: history },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}