self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data
      ? event.data.json()
      : {};
  } catch {
    payload = {};
  }

  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title
      : "Agoré";

  const body =
    typeof payload.body === "string" && payload.body.trim()
      ? payload.body
      : "You have a new notification.";

  const url =
    typeof payload.url === "string" && payload.url.length > 0
      ? payload.url
      : "/notifications";

  const isIncomingCall =
    title.toLowerCase().startsWith("incoming call from ");

  const conversationMatch = isIncomingCall
    ? url.match(/\/messages\/([0-9a-f-]{36})(?:\/|$)/i)
    : null;

  const options = {
    body,
    icon: "/agore-icon-192.png",
    badge: "/agore-icon-192.png",
    tag: isIncomingCall
      ? `agore-incoming-call-${conversationMatch?.[1] ?? "active"}`
      : typeof payload.tag === "string"
        ? payload.tag
        : undefined,
    renotify: isIncomingCall,
    requireInteraction: isIncomingCall,
    vibrate: isIncomingCall
      ? [250, 100, 250, 100, 450]
      : undefined,
    data: {
      url,
      kind: isIncomingCall
        ? "incoming-call"
        : "notification",
    },
    actions: isIncomingCall
      ? [
          {
            action: "open-call",
            title: "Open call",
          },
          {
            action: "dismiss",
            title: "Dismiss alert",
          },
        ]
      : undefined,
  };

  event.waitUntil(
    self.registration.showNotification(
      title,
      options,
    ),
  );
});

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    if (event.action === "dismiss") {
      return;
    }

    const requestedUrl =
      event.notification.data?.url ||
      "/notifications";

    let url = "/notifications";

    try {
      const parsedUrl = new URL(
        requestedUrl,
        self.location.origin,
      );

      if (parsedUrl.origin === self.location.origin) {
        url = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
      }
    } catch {
      url = "/notifications";
    }

    event.waitUntil(
      self.clients
        .matchAll({
          type: "window",
          includeUncontrolled: true,
        })
        .then((clients) => {
          for (const client of clients) {
            if (
              "focus" in client &&
              client.url.startsWith(self.location.origin)
            ) {
              return client.navigate(url).then(() =>
                client.focus(),
              );
            }
          }

          if (self.clients.openWindow) {
            return self.clients.openWindow(url);
          }

          return undefined;
        }),
    );
  },
);
