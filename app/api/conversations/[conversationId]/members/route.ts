import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const addMemberSchema = z.object({
  userId: z.string().uuid(),
});

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

type Conversation = {
  id: string;
  type: "direct" | "group";
  created_by: string;
};

type Membership = {
  conversation_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  left_at: string | null;
  last_read_at: string | null;
};

function invalidConversationId() {
  return NextResponse.json(
    { error: "A valid conversation ID is required." },
    { status: 400 },
  );
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
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

  const { conversationId } = await context.params;

  if (!z.string().uuid().safeParse(conversationId).success) {
    return invalidConversationId();
  }

  const admin = createAdminClient();

  const { data: membership, error: membershipError } = await admin
    .from("conversation_members")
    .select(
      `
        conversation_id,
        user_id,
        role,
        joined_at,
        left_at,
        last_read_at
      `,
    )
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .is("left_at", null)
    .maybeSingle();

  if (membershipError) {
    console.error(
      "Failed to verify Agore group membership:",
      membershipError,
    );

    return NextResponse.json(
      { error: "Unable to load group members." },
      { status: 500 },
    );
  }

  if (!membership) {
    return NextResponse.json(
      { error: "You are not a member of this conversation." },
      { status: 403 },
    );
  }

  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
    .select("id, type, created_by")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError || !conversation) {
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 },
    );
  }

  if ((conversation as Conversation).type !== "group") {
    return NextResponse.json(
      { error: "Member management is only available for groups." },
      { status: 400 },
    );
  }

  const { data: members, error: membersError } = await admin
    .from("conversation_members")
    .select(
      `
        conversation_id,
        user_id,
        role,
        joined_at,
        left_at,
        last_read_at
      `,
    )
    .eq("conversation_id", conversationId)
    .is("left_at", null)
    .order("joined_at", { ascending: true });

  if (membersError) {
    console.error(
      "Failed to load Agore group members:",
      membersError,
    );

    return NextResponse.json(
      { error: "Unable to load group members." },
      { status: 500 },
    );
  }

  const userIds = [
    ...new Set(
      (members ?? []).map(
        (member: Membership) => member.user_id,
      ),
    ),
  ];

  let profiles: Array<{
    id: string;
    display_name: string;
    username: string;
    avatar_path: string | null;
  }> = [];

  if (userIds.length > 0) {
    const { data: profileRows, error: profilesError } = await admin
      .from("profiles")
      .select("id, display_name, username, avatar_path")
      .in("id", userIds)
      .eq("account_status", "active");

    if (profilesError) {
      console.error(
        "Failed to load Agore group member profiles:",
        profilesError,
      );

      return NextResponse.json(
        { error: "Unable to load group members." },
        { status: 500 },
      );
    }

    profiles = profileRows ?? [];
  }

  const profileMap = new Map(
    profiles.map((profile) => [profile.id, profile]),
  );

  const result = (members ?? []).map((member: Membership) => ({
    userId: member.user_id,
    role: member.role,
    joinedAt: member.joined_at,
    profile: profileMap.get(member.user_id) ?? null,
  }));

  return NextResponse.json({
    conversation: {
      id: (conversation as Conversation).id,
      type: (conversation as Conversation).type,
      createdBy: (conversation as Conversation).created_by,
    },
    members: result,
    currentUserRole: membership.role,
  });
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
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

  const { conversationId } = await context.params;

  if (!z.string().uuid().safeParse(conversationId).success) {
    return invalidConversationId();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsedBody = addMemberSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "A valid user ID is required." },
      { status: 400 },
    );
  }

  const targetUserId = parsedBody.data.userId;

  const admin = createAdminClient();

  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
    .select("id, type, created_by")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError) {
    console.error(
      "Failed to load Agore group conversation:",
      conversationError,
    );

    return NextResponse.json(
      { error: "Unable to add the member." },
      { status: 500 },
    );
  }

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 },
    );
  }

  if ((conversation as Conversation).type !== "group") {
    return NextResponse.json(
      { error: "Members can only be added to groups." },
      { status: 400 },
    );
  }

  const { data: callerMembership, error: callerMembershipError } =
    await admin
      .from("conversation_members")
      .select("role")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .is("left_at", null)
      .maybeSingle();

  if (callerMembershipError) {
    console.error(
      "Failed to verify Agore group admin membership:",
      callerMembershipError,
    );

    return NextResponse.json(
      { error: "Unable to add the member." },
      { status: 500 },
    );
  }

  if (!callerMembership || callerMembership.role !== "admin") {
    return NextResponse.json(
      { error: "Only group admins can add members." },
      { status: 403 },
    );
  }

  const { data: targetProfile, error: targetProfileError } = await admin
    .from("profiles")
    .select("id, display_name, username, avatar_path, account_status")
    .eq("id", targetUserId)
    .eq("account_status", "active")
    .maybeSingle();

  if (targetProfileError) {
    console.error(
      "Failed to load Agore group member target:",
      targetProfileError,
    );

    return NextResponse.json(
      { error: "Unable to add the member." },
      { status: 500 },
    );
  }

  if (!targetProfile) {
    return NextResponse.json(
      { error: "User not found or unavailable." },
      { status: 404 },
    );
  }

  const { data: blockRelationship, error: blockError } = await admin
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(
      `and(blocker_id.eq.${user.id},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${user.id})`,
    )
    .limit(1);

  if (blockError) {
    console.error(
      "Failed to check Agore group member block relationship:",
      blockError,
    );

    return NextResponse.json(
      { error: "Unable to add the member." },
      { status: 500 },
    );
  }

  if (blockRelationship && blockRelationship.length > 0) {
    return NextResponse.json(
      { error: "You cannot add this user because of an active block." },
      { status: 403 },
    );
  }

  const { data: existingMembership, error: existingMembershipError } =
    await admin
      .from("conversation_members")
      .select("user_id, role, left_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", targetUserId)
      .maybeSingle();

  if (existingMembershipError) {
    console.error(
      "Failed to check existing Agore group membership:",
      existingMembershipError,
    );

    return NextResponse.json(
      { error: "Unable to add the member." },
      { status: 500 },
    );
  }

  if (existingMembership && existingMembership.left_at === null) {
    return NextResponse.json(
      {
        error: "That user is already a member of this group.",
      },
      { status: 409 },
    );
  }

  const { data: activeMembers, error: memberCountError } = await admin
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .is("left_at", null);

  if (memberCountError) {
    console.error(
      "Failed to count Agore group members:",
      memberCountError,
    );

    return NextResponse.json(
      { error: "Unable to add the member." },
      { status: 500 },
    );
  }

  if ((activeMembers?.length ?? 0) >= 50) {
    return NextResponse.json(
      { error: "This group has reached its 50-member limit." },
      { status: 400 },
    );
  }

  let membership;

  if (existingMembership) {
    const { data, error } = await admin
      .from("conversation_members")
      .update({
        role: "member",
        joined_at: new Date().toISOString(),
        left_at: null,
        last_read_at: null,
      })
      .eq("conversation_id", conversationId)
      .eq("user_id", targetUserId)
      .select(
        "conversation_id, user_id, role, joined_at, left_at, last_read_at",
      )
      .single();

    membership = data;

    if (error) {
      console.error(
        "Failed to re-add Agore group member:",
        error,
      );

      return NextResponse.json(
        { error: "Unable to add the member." },
        { status: 500 },
      );
    }
  } else {
    const { data, error } = await admin
      .from("conversation_members")
      .insert({
        conversation_id: conversationId,
        user_id: targetUserId,
        role: "member",
      })
      .select(
        "conversation_id, user_id, role, joined_at, left_at, last_read_at",
      )
      .single();

    membership = data;

    if (error) {
      console.error(
        "Failed to add Agore group member:",
        error,
      );

      return NextResponse.json(
        { error: "Unable to add the member." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    {
      member: {
        ...membership,
        profile: targetProfile,
      },
    },
    { status: 201 },
  );
}

export async function DELETE(
  request: Request,
  context: RouteContext,
) {
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

  const { conversationId } = await context.params;

  if (!z.string().uuid().safeParse(conversationId).success) {
    return invalidConversationId();
  }

  let targetUserId = user.id;

  try {
    const url = new URL(request.url);
    const requestedUserId = url.searchParams.get("userId");

    if (requestedUserId) {
      if (!z.string().uuid().safeParse(requestedUserId).success) {
        return NextResponse.json(
          { error: "Invalid member user ID." },
          { status: 400 },
        );
      }

      targetUserId = requestedUserId;
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid member request." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
    .select("id, type, created_by")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError || !conversation) {
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 },
    );
  }

  if ((conversation as Conversation).type !== "group") {
    return NextResponse.json(
      { error: "Members can only be removed from groups." },
      { status: 400 },
    );
  }

  const { data: callerMembership, error: callerMembershipError } =
    await admin
      .from("conversation_members")
      .select("role")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .is("left_at", null)
      .maybeSingle();

  if (callerMembershipError) {
    console.error(
      "Failed to verify Agore group member removal permissions:",
      callerMembershipError,
    );

    return NextResponse.json(
      { error: "Unable to update group membership." },
      { status: 500 },
    );
  }

  if (!callerMembership) {
    return NextResponse.json(
      { error: "You are not a member of this group." },
      { status: 403 },
    );
  }

  const removingSomeoneElse = targetUserId !== user.id;

  if (removingSomeoneElse && callerMembership.role !== "admin") {
    return NextResponse.json(
      { error: "Only group admins can remove other members." },
      { status: 403 },
    );
  }

  const { data: targetMembership, error: targetMembershipError } =
    await admin
      .from("conversation_members")
      .select("user_id, role, left_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", targetUserId)
      .is("left_at", null)
      .maybeSingle();

  if (targetMembershipError) {
    console.error(
      "Failed to load Agore target group membership:",
      targetMembershipError,
    );

    return NextResponse.json(
      { error: "Unable to update group membership." },
      { status: 500 },
    );
  }

  if (!targetMembership) {
    return NextResponse.json(
      { error: "That user is not an active member of this group." },
      { status: 404 },
    );
  }

  if (targetMembership.role === "admin") {
    const { count: adminCount, error: adminCountError } = await admin
      .from("conversation_members")
      .select("user_id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("role", "admin")
      .is("left_at", null);

    if (adminCountError) {
      console.error(
        "Failed to count Agore group admins:",
        adminCountError,
      );

      return NextResponse.json(
        { error: "Unable to update group membership." },
        { status: 500 },
      );
    }

    if ((adminCount ?? 0) <= 1) {
      return NextResponse.json(
        {
          error:
            "The last group admin cannot leave or be removed. Assign another admin first.",
        },
        { status: 400 },
      );
    }
  }

  const { data: updatedMembership, error: updateError } = await admin
    .from("conversation_members")
    .update({
      left_at: new Date().toISOString(),
      last_read_at: null,
    })
    .eq("conversation_id", conversationId)
    .eq("user_id", targetUserId)
    .is("left_at", null)
    .select(
      "conversation_id, user_id, role, joined_at, left_at, last_read_at",
    )
    .single();

  if (updateError || !updatedMembership) {
    console.error(
      "Failed to update Agore group membership:",
      updateError,
    );

    return NextResponse.json(
      { error: "Unable to update group membership." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    member: updatedMembership,
    left: targetUserId === user.id,
  });
}