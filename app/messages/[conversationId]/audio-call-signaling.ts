"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/browser";

const SIGNAL_EVENT = "audio_call_signal";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SDP_LENGTH = 180_000;
const MAX_ICE_CANDIDATE_LENGTH = 4_096;

const CALL_STATUSES = [
  "ringing",
  "accepted",
  "completed",
  "declined",
  "missed",
  "cancelled",
  "failed",
] as const;

export type AudioCallStatus = (typeof CALL_STATUSES)[number];

export type AudioCallSignal =
  | {
      type: "invite";
      callId: string;
      callerId: string;
      calleeId: string;
      createdAt: string;
      fromUserId: string;
      toUserId: string;
      sentAt: string;
    }
  | {
      type: "state";
      callId: string;
      status: AudioCallStatus;
      fromUserId: string;
      toUserId: string;
      sentAt: string;
    }
  | {
      type: "offer" | "answer";
      callId: string;
      sdp: string;
      fromUserId: string;
      toUserId: string;
      sentAt: string;
    }
  | {
      type: "ice-candidate";
      callId: string;
      candidate: RTCIceCandidateInit;
      fromUserId: string;
      toUserId: string;
      sentAt: string;
    };

type OutgoingSignal =
  | {
      type: "invite";
      callId: string;
      createdAt: string;
    }
  | {
      type: "state";
      callId: string;
      status: AudioCallStatus;
    }
  | {
      type: "offer" | "answer";
      callId: string;
      sdp: string;
    }
  | {
      type: "ice-candidate";
      callId: string;
      candidate: RTCIceCandidateInit;
    };

type SignalConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error";

type UseAudioCallSignalingOptions = {
  conversationId: string;
  currentUserId: string | null;
  peerUserId: string | null;
  onSignal?: (signal: AudioCallSignal) => void;
};

const supabase = createClient();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isCallStatus(value: unknown): value is AudioCallStatus {
  return (
    typeof value === "string" &&
    CALL_STATUSES.some((status) => status === value)
  );
}

function parseSignal(value: unknown): AudioCallSignal | null {
  if (!isRecord(value)) {
    return null;
  }

  const { type, callId, fromUserId, toUserId, sentAt } = value;

  if (
    !isUuid(callId) ||
    !isUuid(fromUserId) ||
    !isUuid(toUserId) ||
    typeof sentAt !== "string"
  ) {
    return null;
  }

  const common = {
    callId,
    fromUserId,
    toUserId,
    sentAt,
  };

  switch (type) {
    case "invite":
      if (
        !isUuid(value.callerId) ||
        !isUuid(value.calleeId) ||
        typeof value.createdAt !== "string" ||
        value.callerId !== fromUserId ||
        value.calleeId !== toUserId
      ) {
        return null;
      }

      return {
        ...common,
        type,
        callerId: value.callerId,
        calleeId: value.calleeId,
        createdAt: value.createdAt,
      };

    case "state":
      if (!isCallStatus(value.status)) {
        return null;
      }

      return {
        ...common,
        type,
        status: value.status,
      };

    case "offer":
    case "answer":
      if (
        typeof value.sdp !== "string" ||
        value.sdp.length === 0 ||
        value.sdp.length > MAX_SDP_LENGTH
      ) {
        return null;
      }

      return {
        ...common,
        type,
        sdp: value.sdp,
      };

    case "ice-candidate": {
      if (!isRecord(value.candidate)) {
        return null;
      }

      const candidate = value.candidate;
      if (
        typeof candidate.candidate !== "string" ||
        candidate.candidate.length > MAX_ICE_CANDIDATE_LENGTH ||
        !(
          candidate.sdpMid === undefined ||
          candidate.sdpMid === null ||
          typeof candidate.sdpMid === "string"
        ) ||
        !(
          candidate.sdpMLineIndex === undefined ||
          candidate.sdpMLineIndex === null ||
          (typeof candidate.sdpMLineIndex === "number" &&
            Number.isInteger(candidate.sdpMLineIndex))
        ) ||
        !(
          candidate.usernameFragment === undefined ||
          candidate.usernameFragment === null ||
          typeof candidate.usernameFragment === "string"
        )
      ) {
        return null;
      }

      return {
        ...common,
        type,
        candidate: {
          candidate: candidate.candidate,
          sdpMid:
            typeof candidate.sdpMid === "string" ||
            candidate.sdpMid === null
              ? candidate.sdpMid
              : undefined,
          sdpMLineIndex:
            typeof candidate.sdpMLineIndex === "number" ||
            candidate.sdpMLineIndex === null
              ? candidate.sdpMLineIndex
              : undefined,
          usernameFragment:
            typeof candidate.usernameFragment === "string" ||
            candidate.usernameFragment === null
              ? candidate.usernameFragment
              : undefined,
        },
      };
    }

    default:
      return null;
  }
}

/**
 * Provides private, addressed broadcasts for one-to-one WebRTC signalling.
 * Call state must always be confirmed against the authenticated call API;
 * Realtime payloads are notifications, not an authoritative call record.
 */
export function useAudioCallSignaling({
  conversationId,
  currentUserId,
  peerUserId,
  onSignal,
}: UseAudioCallSignalingOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const onSignalRef = useRef(onSignal);
  const [connectionStatus, setConnectionStatus] =
    useState<SignalConnectionStatus>("idle");

  useEffect(() => {
    onSignalRef.current = onSignal;
  }, [onSignal]);

  useEffect(() => {
    if (
      !isUuid(conversationId) ||
      !currentUserId ||
      !isUuid(currentUserId) ||
      !peerUserId ||
      !isUuid(peerUserId) ||
      currentUserId === peerUserId
    ) {
      channelRef.current = null;
      subscribedRef.current = false;
      setConnectionStatus("idle");
      return;
    }

    let active = true;
    subscribedRef.current = false;
    setConnectionStatus("connecting");

    const channel = supabase.channel(
      `conversation:${conversationId}:call`,
      {
        config: {
          private: true,
        },
      },
    );

    channelRef.current = channel;

    channel.on("broadcast", { event: SIGNAL_EVENT }, (message) => {
      if (!active) {
        return;
      }

      const signal = parseSignal(message?.payload);

      if (
        !signal ||
        signal.fromUserId !== peerUserId ||
        signal.toUserId !== currentUserId
      ) {
        return;
      }

      onSignalRef.current?.(signal);
    });

    async function connect() {
      try {
        await supabase.realtime.setAuth();

        if (!active) {
          return;
        }

        channel.subscribe((status) => {
          if (!active) {
            return;
          }

          if (status === "SUBSCRIBED") {
            subscribedRef.current = true;
            setConnectionStatus("connected");
            return;
          }

          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            subscribedRef.current = false;
            setConnectionStatus("error");
          }
        });
      } catch {
        if (active) {
          subscribedRef.current = false;
          setConnectionStatus("error");
        }
      }
    }

    void connect();

    return () => {
      active = false;
      subscribedRef.current = false;

      if (channelRef.current === channel) {
        channelRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, peerUserId]);

  const sendSignal = useCallback(
    async (signal: OutgoingSignal): Promise<boolean> => {
      const channel = channelRef.current;

      if (
        !channel ||
        !subscribedRef.current ||
        !currentUserId ||
        !peerUserId ||
        currentUserId === peerUserId ||
        !isUuid(signal.callId)
      ) {
        return false;
      }

      if (
        (signal.type === "offer" || signal.type === "answer") &&
        (!signal.sdp || signal.sdp.length > MAX_SDP_LENGTH)
      ) {
        return false;
      }

      if (
        signal.type === "ice-candidate" &&
        (typeof signal.candidate.candidate !== "string" ||
          signal.candidate.candidate.length > MAX_ICE_CANDIDATE_LENGTH)
      ) {
        return false;
      }

      const payload = {
        ...signal,
        fromUserId: currentUserId,
        toUserId: peerUserId,
        sentAt: new Date().toISOString(),
        ...(signal.type === "invite"
          ? {
              callerId: currentUserId,
              calleeId: peerUserId,
            }
          : {}),
      };

      try {
        const result = await channel.send({
          type: "broadcast",
          event: SIGNAL_EVENT,
          payload,
        });

        return result === "ok";
      } catch {
        return false;
      }
    },
    [currentUserId, peerUserId],
  );

  const sendInvite = useCallback(
    (callId: string, createdAt = new Date().toISOString()) =>
      sendSignal({ type: "invite", callId, createdAt }),
    [sendSignal],
  );

  const sendCallState = useCallback(
    (callId: string, status: AudioCallStatus) =>
      sendSignal({ type: "state", callId, status }),
    [sendSignal],
  );

  const sendOffer = useCallback(
    (callId: string, description: RTCSessionDescriptionInit) => {
      if (description.type !== "offer" || !description.sdp) {
        return Promise.resolve(false);
      }

      return sendSignal({
        type: "offer",
        callId,
        sdp: description.sdp,
      });
    },
    [sendSignal],
  );

  const sendAnswer = useCallback(
    (callId: string, description: RTCSessionDescriptionInit) => {
      if (description.type !== "answer" || !description.sdp) {
        return Promise.resolve(false);
      }

      return sendSignal({
        type: "answer",
        callId,
        sdp: description.sdp,
      });
    },
    [sendSignal],
  );

  const sendIceCandidate = useCallback(
    (callId: string, candidate: RTCIceCandidateInit) =>
      sendSignal({ type: "ice-candidate", callId, candidate }),
    [sendSignal],
  );

  return {
    connectionStatus,
    sendInvite,
    sendCallState,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
  };
}
