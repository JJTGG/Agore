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
    payload.title ||
    "Agoré";

  const body =
    payload.body ||
    "You have a new notification.";

  const url =
    typeof payload.url ===
      "string" &&
    payload.url.length > 0
      ? payload.url
      : "/notifications";

  event.waitUntil(
    self.registration.showNotification(
      title,
      {
        body,
        tag:
          typeof payload.tag ===
          "string"
            ? payload.tag
            : undefined,
        data: {
          url,
        },
      },
    ),
  );
});

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    const url =
      event.notification.data
        ?.url ||
      "/notifications";

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
              client.url.includes(
                self.location.origin,
              )
            ) {
              return client.navigate(
                url,
              ).then(() =>
                client.focus(),
              );
            }
          }

          if (
            self.clients.openWindow
          ) {
            return self.clients.openWindow(
              url,
            );
          }

          return undefined;
        }),
    );
  },
);