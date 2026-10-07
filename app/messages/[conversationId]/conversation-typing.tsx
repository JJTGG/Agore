"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";

const supabase = createClient();

const TYPING_EVENT = "typing";
const TYPING_TTL_MS = 2500;
const TYPING_BROADCAST_THROTTLE_MS = 700;
const TYPING_STOP_DELAY_MS = 1400;

type TypingPayload = {
  userId?: unknown;
  displayName?: unknown;
  typing?: unknown;
};

type TypingUser = {
  userId: string;
  displayName: string;
  expiresAt: number;
};

type UseConversationTypingOptions = {
  conversationId: string;
  currentUserId: string | null;
  currentUserName: string | null;
};

export function useConversationTyping({
  conversationId,
  currentUserId,
  currentUserName,
}: UseConversationTypingOptions) {
  const channelRef =
    useRef<RealtimeChannel | null>(null);

  const subscribedRef = useRef(false);

  const lastBroadcastAtRef =
    useRef(0);

  const stopTypingTimerRef =
    useRef<number | null>(null);

  const [typingUsers, setTypingUsers] =
    useState<TypingUser[]>([]);

  const removeExpiredUsers =
    useCallback(() => {
      const now = Date.now();

      setTypingUsers((current) => {
        const next = current.filter(
          (user) =>
            user.expiresAt > now,
        );

        return next.length ===
          current.length
          ? current
          : next;
      });
    }, []);

  useEffect(() => {
    if (
      !conversationId ||
      !currentUserId
    ) {
      return;
    }

    let active = true;

    subscribedRef.current = false;
    setTypingUsers([]);

    const channel = supabase.channel(
      `conversation:${conversationId}:typing`,
      {
        config: {
          private: true,
        },
      },
    );

    channel.on(
      "broadcast",
      {
        event: TYPING_EVENT,
      },
      (message) => {
        if (!active) {
          return;
        }

        const payload =
          (message?.payload ??
            {}) as TypingPayload;

        const userId =
          typeof payload.userId ===
          "string"
            ? payload.userId
            : "";

        const displayName =
          typeof payload.displayName ===
          "string"
            ? payload.displayName.trim()
            : "";

        const typing =
          payload.typing === true;

        if (
          !userId ||
          userId === currentUserId
        ) {
          return;
        }

        const safeName =
          displayName ||
          "Someone";

        setTypingUsers((current) => {
          const now = Date.now();

          if (!typing) {
            return current.filter(
              (user) =>
                user.userId !==
                userId,
            );
          }

          const nextUser: TypingUser = {
            userId,
            displayName: safeName,
            expiresAt:
              now +
              TYPING_TTL_MS,
          };

          const existingIndex =
            current.findIndex(
              (user) =>
                user.userId ===
                userId,
            );

          if (
            existingIndex === -1
          ) {
            return [
              ...current,
              nextUser,
            ];
          }

          const next = [
            ...current,
          ];

          next[existingIndex] =
            nextUser;

          return next;
        });
      },
    );

    async function connect() {
      try {
        await supabase.realtime.setAuth();

        if (!active) {
          return;
        }

        channel.subscribe(
          (status) => {
            if (!active) {
              return;
            }

            subscribedRef.current =
              status === "SUBSCRIBED";
          },
        );

        channelRef.current =
          channel;
      } catch {
        subscribedRef.current =
          false;
        channelRef.current = null;
      }
    }

    void connect();

    const expiryInterval =
      window.setInterval(
        removeExpiredUsers,
        500,
      );

    return () => {
      active = false;

      subscribedRef.current =
        false;

      if (
        stopTypingTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          stopTypingTimerRef.current,
        );
        stopTypingTimerRef.current =
          null;
      }

      window.clearInterval(
        expiryInterval,
      );

      if (
        channelRef.current === channel
      ) {
        channelRef.current = null;
      }

      void supabase.removeChannel(
        channel,
      );

      setTypingUsers([]);
    };
  }, [
    conversationId,
    currentUserId,
    removeExpiredUsers,
  ]);

  const broadcastTyping =
    useCallback(
      (typing: boolean) => {
        const channel =
          channelRef.current;

        if (
          !channel ||
          !subscribedRef.current ||
          !currentUserId
        ) {
          return;
        }

        const now = Date.now();

        if (
          typing &&
          now -
            lastBroadcastAtRef.current <
            TYPING_BROADCAST_THROTTLE_MS
        ) {
          return;
        }

        lastBroadcastAtRef.current =
          now;

        void channel.send({
          type: "broadcast",
          event: TYPING_EVENT,
          payload: {
            userId:
              currentUserId,
            displayName:
              currentUserName?.trim() ||
              "Someone",
            typing,
          },
        });
      },
      [
        currentUserId,
        currentUserName,
      ],
    );

  const stopTyping =
    useCallback(() => {
      if (
        stopTypingTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          stopTypingTimerRef.current,
        );
        stopTypingTimerRef.current =
          null;
      }

      broadcastTyping(false);
    }, [broadcastTyping]);

  const notifyTyping =
    useCallback(
      (hasText: boolean) => {
        if (!hasText) {
          stopTyping();
          return;
        }

        broadcastTyping(true);

        if (
          stopTypingTimerRef.current !==
          null
        ) {
          window.clearTimeout(
            stopTypingTimerRef.current,
          );
        }

        stopTypingTimerRef.current =
          window.setTimeout(() => {
            stopTypingTimerRef.current =
              null;
            broadcastTyping(false);
          }, TYPING_STOP_DELAY_MS);
      },
      [
        broadcastTyping,
        stopTyping,
      ],
    );

  const typingText = useMemo(() => {
    if (typingUsers.length === 0) {
      return null;
    }

    if (typingUsers.length === 1) {
      return `${typingUsers[0].displayName} is typing…`;
    }

    if (typingUsers.length === 2) {
      return `${typingUsers[0].displayName} and ${typingUsers[1].displayName} are typing…`;
    }

    return `${typingUsers[0].displayName} and ${typingUsers.length - 1} others are typing…`;
  }, [typingUsers]);

  return {
    typingUsers,
    typingText,
    notifyTyping,
    stopTyping,
  };
}