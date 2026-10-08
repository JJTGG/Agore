import webpush from "web-push";

import { createAdminClient } from "@/lib/supabase/admin";

type PushPresentation = {
  title: string;
  body: string;
  url: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
};

function getVapidConfig() {
  const subject =
    process.env.VAPID_SUBJECT?.trim();

  const publicKey =
    process.env.VAPID_PUBLIC_KEY?.trim();

  const privateKey =
    process.env.VAPID_PRIVATE_KEY?.trim();

  if (
    !subject ||
    !publicKey ||
    !privateKey
  ) {
    return null;
  }

  return {
    subject,
    publicKey,
    privateKey,
  };
}

export function isPushConfigured() {
  return Boolean(
    getVapidConfig(),
  );
}

export function getPushPublicKey() {
  return (
    getVapidConfig()
      ?.publicKey ?? null
  );
}

export async function sendPushNotification(
  {
    recipientId,
  }: {
    recipientId: string;
  },
  presentation: PushPresentation,
) {
  const vapid =
    getVapidConfig();

  if (!vapid) {
    return false;
  }

  const admin =
    createAdminClient();

  const {
    data: subscriptions,
    error,
  } = await admin
    .from(
      "push_subscriptions",
    )
    .select(
      "id, endpoint, p256dh_key, auth_key",
    )
    .eq(
      "user_id",
      recipientId,
    );

  if (error) {
    console.error(
      "Failed to load Agore push subscriptions:",
      error,
    );

    return false;
  }

  if (
    !subscriptions ||
    subscriptions.length === 0
  ) {
    return false;
  }

  webpush.setVapidDetails(
    vapid.subject,
    vapid.publicKey,
    vapid.privateKey,
  );

  const payload =
    JSON.stringify({
      title:
        presentation.title,
      body:
        presentation.body,
      url:
        presentation.url,
    });

  let delivered = false;

  await Promise.allSettled(
    (
      subscriptions as PushSubscriptionRow[]
    ).map(
      async (
        subscription,
      ) => {
        try {
          await webpush.sendNotification(
            {
              endpoint:
                subscription.endpoint,
              keys: {
                p256dh:
                  subscription.p256dh_key,
                auth:
                  subscription.auth_key,
              },
            },
            payload,
            {
              TTL: 60,
              urgency:
                "high",
            },
          );

          delivered = true;
        } catch (pushError) {
          const statusCode =
            (
              pushError as {
                statusCode?: number;
              }
            ).statusCode;

          if (
            statusCode === 404 ||
            statusCode === 410
          ) {
            await admin
              .from(
                "push_subscriptions",
              )
              .delete()
              .eq(
                "id",
                subscription.id,
              );
          }

          console.error(
            "Agore push delivery failed:",
            pushError,
          );
        }
      },
    ),
  );

  return delivered;
}