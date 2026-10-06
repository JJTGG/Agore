import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const searchSchema = z.object({
  q: z.string().trim().min(2).max(50),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

function escapeSearchTerm(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const searchParams = new URL(request.url).searchParams;

  const parsedQuery = searchSchema.safeParse({
    q: searchParams.get("q") ?? "",
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        error:
          parsedQuery.error.issues[0]?.message ??
          "Invalid search query.",
      },
      { status: 400 },
    );
  }

  const searchTerm = escapeSearchTerm(parsedQuery.data.q);
  const limit = parsedQuery.data.limit;

  const admin = createAdminClient();

  const { data: blockRelationships, error: blockError } = await admin
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(
      `blocker_id.eq.${user.id},blocked_id.eq.${user.id}`,
    );

  if (blockError) {
    console.error(
      "Failed to load Agore block relationships for search:",
      blockError,
    );

    return NextResponse.json(
      { error: "Unable to search people." },
      { status: 500 },
    );
  }

  const blockedUserIds = new Set<string>([user.id]);

  for (const relationship of blockRelationships ?? []) {
    blockedUserIds.add(relationship.blocker_id);
    blockedUserIds.add(relationship.blocked_id);
  }

  const excludedUserIds = Array.from(blockedUserIds);

  const excludeFromQuery = <T extends { not: Function }>(query: T) => {
    if (excludedUserIds.length === 0) {
      return query;
    }

    return query.not(
      "id",
      "in",
      `(${excludedUserIds.join(",")})`,
    );
  };

  const usernameQuery = excludeFromQuery(
    supabase
      .from("profiles")
      .select(
        "id, display_name, username, bio, avatar_path, created_at",
      )
      .eq("account_status", "active")
      .ilike("username", `${searchTerm}%`)
      .order("username", { ascending: true })
      .limit(limit),
  );

  const displayNameQuery = excludeFromQuery(
    supabase
      .from("profiles")
      .select(
        "id, display_name, username, bio, avatar_path, created_at",
      )
      .eq("account_status", "active")
      .ilike("display_name", `%${searchTerm}%`)
      .order("display_name", { ascending: true })
      .limit(limit),
  );

  const [usernameResult, displayNameResult] = await Promise.all([
    usernameQuery,
    displayNameQuery,
  ]);

  if (usernameResult.error || displayNameResult.error) {
    console.error(
      "Failed to search Agore profiles:",
      {
        usernameError: usernameResult.error,
        displayNameError: displayNameResult.error,
      },
    );

    return NextResponse.json(
      { error: "Unable to search people." },
      { status: 500 },
    );
  }

  const mergedProfiles = new Map<
    string,
    NonNullable<typeof usernameResult.data>[number]
  >();

  for (const profile of usernameResult.data ?? []) {
    mergedProfiles.set(profile.id, profile);
  }

  for (const profile of displayNameResult.data ?? []) {
    mergedProfiles.set(profile.id, profile);
  }

  const profiles = Array.from(mergedProfiles.values()).slice(0, limit);

  return NextResponse.json({
    people: profiles,
  });
}