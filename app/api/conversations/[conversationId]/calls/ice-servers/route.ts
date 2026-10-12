import { NextResponse } from "next/server";
import { z } from "zod";

import { getConversationMessagingAccess } from "@/lib/messaging/conversation-access";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({
  conversationId: z.string().uuid(),
});

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

function jsonError(error: string, status: number, code?: string) {
  return NextResponse.json(
    { error, ...(code ? { code } : {}) },
    {
      status,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    },
  );
}

function isIceServer(value: unknown): value is IceServer {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const urlsValue = record.urls;
  const urls =
    typeof urlsValue === "string"
      ? [urlsValue]
      : Array.isArray(urlsValue) &&
          urlsValue.length > 0 &&
          urlsValue.every((url): url is string =>
            typeof url === "string" && url.length > 0,
          )
        ? urlsValue
        : null;

  if (!urls || urls.length === 0) {
    return false;
  }

  if (
    record.username !== undefined &&
    typeof record.username !== "string"
  ) {
    return false;
  }

  if (
    record.credential !== undefined &&
    typeof record.credential !== "string"
  ) {
    return false;
  }

  return urls.every(
    (url) => url.startsWith("stun:") || url.startsWith("turn:") || url.startsWith("turns:"),
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonError("Authentication required.", 401);
  }

  const parsedParams = paramsSchema.safeParse(await context.params);

  if (!parsedParams.success) {
    return jsonError("A valid conversation ID is required.", 400);
  }

  const access = await getConversationMessagingAccess(
    parsedParams.data.conversationId,
    user.id,
  );

  if (!access.ok) {
    return jsonError(access.error, access.status);
  }

  if (
    access.conversation.type !== "direct" ||
    !access.conversation.direct_participant_a ||
    !access.conversation.direct_participant_b
  ) {
    return jsonError(
      "TURN configuration is available only in direct conversations.",
      400,
    );
  }

  const isParticipant =
    access.conversation.direct_participant_a === user.id ||
    access.conversation.direct_participant_b === user.id;

  if (!isParticipant) {
    return jsonError("Conversation not found.", 404);
  }

  const appName = process.env.METERED_APP_NAME?.trim();
  const apiKey = process.env.METERED_TURN_API_KEY?.trim();

  if (
    !appName ||
    !/^[a-zA-Z0-9-]+$/.test(appName) ||
    !apiKey
  ) {
    return jsonError(
      "Audio relay is not configured yet. Add the Metered TURN app name and credential API key in the server environment.",
      503,
      "turn_not_configured",
    );
  }

  const endpoint = new URL(
    `https://${appName}.metered.live/api/v1/turn/credentials`,
  );
  endpoint.searchParams.set("apiKey", apiKey);

  let providerResponse: Response;

  try {
    providerResponse = await fetch(endpoint, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });
  } catch {
    return jsonError(
      "The audio relay provider could not be reached. Please retry.",
      502,
      "turn_provider_unavailable",
    );
  }

  if (!providerResponse.ok) {
    // Do not expose the provider response or its credential-related details.
    console.error(
      "Metered TURN credential request failed with status:",
      providerResponse.status,
    );

    return jsonError(
      "The audio relay credentials could not be loaded. Check the TURN app configuration.",
      502,
      "turn_credentials_unavailable",
    );
  }

  let payload: unknown;

  try {
    payload = await providerResponse.json();
  } catch {
    return jsonError(
      "The audio relay provider returned an invalid response.",
      502,
      "turn_invalid_response",
    );
  }

  if (
    !Array.isArray(payload) ||
    payload.length === 0 ||
    !payload.every(isIceServer)
  ) {
    return jsonError(
      "The audio relay provider returned an invalid ICE server list.",
      502,
      "turn_invalid_response",
    );
  }

  const hasTurnRelay = payload.some((server) => {
    const urls =
      typeof server.urls === "string" ? [server.urls] : server.urls;
    return urls.some((url) => url.startsWith("turn:") || url.startsWith("turns:"));
  });

  if (!hasTurnRelay) {
    return jsonError(
      "The configured ICE server list does not include a TURN relay.",
      502,
      "turn_relay_missing",
    );
  }

  return NextResponse.json(
    { iceServers: payload },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Cookie",
      },
    },
  );
}
