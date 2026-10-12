"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LoaderCircle,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneOff,
  X,
} from "lucide-react";

import {
  useAudioCallSignaling,
  type AudioCallSignal,
  type AudioCallStatus,
} from "./audio-call-signaling";
import { useAudioCallWebRTC } from "./audio-call-webrtc";

type CallRecord = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  status: AudioCallStatus;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  ended_by: string | null;
  failure_reason?: string | null;
  updated_at: string;
};

type AudioCallControlsProps = {
  conversationId: string;
  currentUserId: string | null;
  peerUserId: string | null;
  peerDisplayName: string;
};

type AudioCallControllerProps = AudioCallControlsProps & {
  globalHost?: boolean;
  autoStart?: boolean;
  onSessionActiveChange?: (active: boolean) => void;
};

type AudioCallContextEvent = CustomEvent<AudioCallControlsProps>;

const AUDIO_CALL_CONTEXT_EVENT = "agore:audio-call-context";
const AUDIO_CALL_START_EVENT = "agore:audio-call-start";
const AUDIO_CALL_CONTEXT_CLEAR_EVENT = "agore:audio-call-context-clear";

type SignalHandler = (signal: AudioCallSignal) => void;

const TERMINAL_STATUSES: AudioCallStatus[] = [
  "completed",
  "declined",
  "missed",
  "cancelled",
  "failed",
];

async function readResponse<T>(response: Response): Promise<T> {
  let body: unknown = null;

  try {
    body = await response.json();
  } catch {
    // Treat non-JSON responses as a normal request failure below.
  }

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "The call request could not be completed.";

    throw new Error(message);
  }

  return body as T;
}

function callStatusMessage(
  call: CallRecord,
  currentUserId: string,
): string {
  if (call.status === "ringing") {
    return call.caller_id === currentUserId
      ? "Calling…"
      : "Incoming audio call";
  }

  if (call.status === "accepted") {
    return "Connecting audio…";
  }

  switch (call.status) {
    case "completed":
      return "Call ended";
    case "declined":
      return "Call declined";
    case "missed":
      return "Missed call";
    case "cancelled":
      return "Call cancelled";
    case "failed":
      return "Call failed";
    default:
      return "Audio call";
  }
}

function AudioCallController({
  conversationId,
  currentUserId,
  peerUserId,
  peerDisplayName,
  globalHost = false,
  autoStart = false,
  onSessionActiveChange,
}: AudioCallControllerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeCallRef = useRef<CallRecord | null>(null);
  const acceptedCallIdRef = useRef<string | null>(null);
  const outgoingStartedCallIdRef = useRef<string | null>(null);
  const signalHandlerRef = useRef<SignalHandler>(() => undefined);
  const failureAttemptRef = useRef<string | null>(null);
  const [activeCall, setActiveCall] = useState<CallRecord | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const autoStartAttemptedRef = useRef(false);

  const transport = useAudioCallWebRTC();

  const updateActiveCall = useCallback((call: CallRecord | null) => {
    activeCallRef.current = call;
    setActiveCall(call);
  }, []);

  const getCalls = useCallback(async (): Promise<CallRecord[]> => {
    const response = await fetch(
      `/api/conversations/${encodeURIComponent(conversationId)}/calls?limit=100`,
      {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    );

    const body = await readResponse<{ calls: CallRecord[] }>(response);
    return Array.isArray(body.calls) ? body.calls : [];
  }, [conversationId]);

  const getCall = useCallback(
    async (callId: string): Promise<CallRecord | null> => {
      const calls = await getCalls();
      return calls.find((call) => call.id === callId) ?? null;
    },
    [getCalls],
  );

  const transitionCall = useCallback(
    async (
      callId: string,
      action: "accept" | "decline" | "cancel" | "end" | "fail",
      failureReason?: string,
    ): Promise<CallRecord> => {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/calls/${encodeURIComponent(callId)}`,
        {
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            ...(failureReason ? { failureReason } : {}),
          }),
        },
      );

      const body = await readResponse<{ call: CallRecord }>(response);

      if (!body.call) {
        throw new Error("The server did not return the updated call.");
      }

      return body.call;
    },
    [conversationId],
  );

  const onSignal = useCallback((signal: AudioCallSignal) => {
    signalHandlerRef.current(signal);
  }, []);

  const signaling = useAudioCallSignaling({
    conversationId,
    currentUserId,
    peerUserId,
    onSignal,
  });

  const clearActiveCall = useCallback(
    (message?: string) => {
      transport.cleanup();
      acceptedCallIdRef.current = null;
      outgoingStartedCallIdRef.current = null;
      updateActiveCall(null);

      if (message) {
        setNotice(message);
      }
    },
    [transport.cleanup, updateActiveCall],
  );

  const markCallFailed = useCallback(
    async (callId: string, reason: string) => {
      let finalMessage = reason;

      try {
        await transitionCall(callId, "fail", reason);
        await signaling.sendCallState(callId, "failed");
      } catch (failure) {
        finalMessage =
          failure instanceof Error
            ? `${reason} ${failure.message}`
            : `${reason} The call state could not be updated.`;
      } finally {
        clearActiveCall(finalMessage);
      }
    },
    [clearActiveCall, signaling.sendCallState, transitionCall],
  );

  const handleSignal = useCallback(
    async (signal: AudioCallSignal) => {
      if (!currentUserId || !peerUserId) {
        return;
      }

      if (signal.type === "invite") {
        if (
          signal.calleeId !== currentUserId ||
          signal.callerId !== peerUserId ||
          activeCallRef.current
        ) {
          return;
        }

        try {
          const call = await getCall(signal.callId);

          if (
            !call ||
            call.status !== "ringing" ||
            call.caller_id !== peerUserId ||
            call.callee_id !== currentUserId
          ) {
            return;
          }

          setNotice(null);
          updateActiveCall(call);
        } catch {
          setNotice("An incoming call could not be verified. Refresh the chat and try again.");
        }

        return;
      }

      const current = activeCallRef.current;

      if (!current || current.id !== signal.callId) {
        return;
      }

      if (signal.type === "state") {
        try {
          const call = await getCall(signal.callId);

          if (
            !call ||
            call.conversation_id !== conversationId ||
            !(
              (call.caller_id === currentUserId &&
                call.callee_id === peerUserId) ||
              (call.caller_id === peerUserId &&
                call.callee_id === currentUserId)
            )
          ) {
            return;
          }

          updateActiveCall(call);

          if (TERMINAL_STATUSES.includes(call.status)) {
            const message =
              call.status === "failed" && call.failure_reason
                ? call.failure_reason
                : callStatusMessage(call, currentUserId);

            clearActiveCall(message);
            return;
          }

          if (
            call.status === "accepted" &&
            call.caller_id === currentUserId &&
            outgoingStartedCallIdRef.current !== call.id
          ) {
            outgoingStartedCallIdRef.current = call.id;

            const started = await transport.startOutgoingCall(
              call.id,
              signaling.sendOffer,
              signaling.sendIceCandidate,
            );

            if (!started) {
              await markCallFailed(
                call.id,
                transport.error ?? "Could not establish the audio connection.",
              );
            }
          }
        } catch (failure) {
          setNotice(
            failure instanceof Error
              ? failure.message
              : "The call status could not be refreshed.",
          );
        }

        return;
      }

      if (signal.type === "offer") {
        if (
          currentUserId !== current.callee_id ||
          peerUserId !== current.caller_id ||
          acceptedCallIdRef.current !== signal.callId
        ) {
          return;
        }

        try {
          const call = await getCall(signal.callId);

          if (!call || call.status !== "accepted") {
            return;
          }

          updateActiveCall(call);

          const accepted = await transport.acceptIncomingCall(
            call.id,
            signal.sdp,
            signaling.sendAnswer,
            signaling.sendIceCandidate,
          );

          if (!accepted) {
            await markCallFailed(
              call.id,
              transport.error ?? "Could not accept the audio connection.",
            );
          }
        } catch (failure) {
          await markCallFailed(
            signal.callId,
            failure instanceof Error
              ? failure.message
              : "Could not prepare the incoming audio call.",
          );
        }

        return;
      }

      if (signal.type === "answer") {
        if (
          currentUserId !== current.caller_id ||
          peerUserId !== current.callee_id
        ) {
          return;
        }

        const answered = await transport.receiveAnswer(
          signal.callId,
          signal.sdp,
        );

        if (!answered) {
          setNotice("The other person's audio answer could not be applied.");
        }

        return;
      }

      if (signal.type === "ice-candidate") {
        await transport.receiveIceCandidate(
          signal.callId,
          signal.candidate,
        );
      }
    },
    [
      clearActiveCall,
      conversationId,
      currentUserId,
      getCall,
      markCallFailed,
      peerUserId,
      signaling.sendAnswer,
      signaling.sendIceCandidate,
      signaling.sendOffer,
      transport.acceptIncomingCall,
      transport.error,
      transport.receiveAnswer,
      transport.receiveIceCandidate,
      transport.startOutgoingCall,
      updateActiveCall,
    ],
  );

  signalHandlerRef.current = (signal) => {
    void handleSignal(signal);
  };

  useEffect(() => {
    if (
      !currentUserId ||
      !peerUserId ||
      currentUserId === peerUserId ||
      !conversationId
    ) {
      return;
    }

    let active = true;

    async function restoreRingingCall() {
      try {
        const calls = await getCalls();
        if (!active) {
          return;
        }

        const ringing = calls.find(
          (call) =>
            call.status === "ringing" &&
            ((call.caller_id === currentUserId &&
              call.callee_id === peerUserId) ||
              (call.caller_id === peerUserId &&
                call.callee_id === currentUserId)),
        );

        if (ringing && !activeCallRef.current) {
          updateActiveCall(ringing);
        }
      } catch {
        // Call history is optional while the chat is initially loading.
      }
    }

    void restoreRingingCall();

    return () => {
      active = false;
    };
  }, [conversationId, currentUserId, getCalls, peerUserId, updateActiveCall]);

  useEffect(() => {
    if (!activeCall || activeCall.status !== "ringing") {
      return;
    }

    let active = true;

    const poll = async () => {
      try {
        const call = await getCall(activeCall.id);

        if (
          !active ||
          !call ||
          activeCallRef.current?.id !== call.id
        ) {
          return;
        }

        updateActiveCall(call);

        if (TERMINAL_STATUSES.includes(call.status)) {
          clearActiveCall(callStatusMessage(call, currentUserId ?? ""));
        }
      } catch {
        // Realtime remains the primary update path; retry on the next poll.
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 4_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [
    activeCall,
    clearActiveCall,
    currentUserId,
    getCall,
    updateActiveCall,
  ]);

  useEffect(() => {
    if (!activeCall || activeCall.status !== "accepted") {
      failureAttemptRef.current = null;
      return;
    }

    const callId = activeCall.id;

    if (transport.connectionStatus === "connected") {
      failureAttemptRef.current = null;
      return;
    }

    const isHardFailure = transport.connectionStatus === "error";
    const recoveryWindowMs =
      transport.connectionStatus === "reconnecting" ? 20_000 : 30_000;

    const timeout = window.setTimeout(() => {
      const current = activeCallRef.current;

      if (
        !current ||
        current.id !== callId ||
        current.status !== "accepted" ||
        failureAttemptRef.current === callId ||
        transport.connectionStatus === "connected"
      ) {
        return;
      }

      failureAttemptRef.current = callId;

      const reason =
        transport.connectionStatus === "reconnecting"
          ? "The audio connection was interrupted and could not recover."
          : transport.error ??
            "The audio connection could not be established in time.";

      void markCallFailed(callId, reason);
    }, isHardFailure ? 0 : recoveryWindowMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    activeCall?.id,
    activeCall?.status,
    markCallFailed,
    transport.connectionStatus,
    transport.error,
  ]);

  useEffect(() => {
    const element = audioRef.current;

    if (!element) {
      return;
    }

    element.srcObject = transport.remoteStream;

    if (transport.remoteStream) {
      void element.play().catch(() => {
        setNotice("Tap the speaker control or your device's play prompt to hear the call.");
      });
    }

    return () => {
      element.srcObject = null;
    };
  }, [transport.remoteStream]);

  useEffect(() => {
    onSessionActiveChange?.(Boolean(activeCall));
  }, [activeCall, onSessionActiveChange]);

  const startCall = useCallback(async () => {
    if (
      !currentUserId ||
      !peerUserId ||
      !conversationId ||
      activeCallRef.current ||
      signaling.connectionStatus !== "connected"
    ) {
      return;
    }

    setIsWorking(true);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/calls`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
        },
      );

      const body = await readResponse<{ call: CallRecord }>(response);

      if (
        !body.call ||
        body.call.caller_id !== currentUserId ||
        body.call.callee_id !== peerUserId
      ) {
        throw new Error("The server returned an invalid call record.");
      }

      updateActiveCall(body.call);

      const sent = await signaling.sendInvite(
        body.call.id,
        body.call.created_at,
      );

      if (!sent) {
        await markCallFailed(
          body.call.id,
          "The call invitation could not be delivered.",
        );
        setNotice("The call invitation could not be delivered. Please try again.");
      }
    } catch (failure) {
      setNotice(
        failure instanceof Error
          ? failure.message
          : "Unable to start the audio call.",
      );
    } finally {
      setIsWorking(false);
    }
  }, [
    conversationId,
    currentUserId,
    markCallFailed,
    peerUserId,
    signaling.connectionStatus,
    signaling.sendInvite,
    updateActiveCall,
  ]);

  useEffect(() => {
    if (
      !globalHost ||
      !autoStart ||
      autoStartAttemptedRef.current ||
      activeCall ||
      isWorking ||
      signaling.connectionStatus !== "connected"
    ) {
      return;
    }

    autoStartAttemptedRef.current = true;
    void startCall();
  }, [
    activeCall,
    autoStart,
    globalHost,
    isWorking,
    signaling.connectionStatus,
    startCall,
  ]);

  const acceptCall = useCallback(async () => {
    const call = activeCallRef.current;

    if (
      !call ||
      call.status !== "ringing" ||
      call.callee_id !== currentUserId ||
      isWorking
    ) {
      return;
    }

    setIsWorking(true);
    setNotice(null);

    try {
      const updated = await transitionCall(call.id, "accept");
      if (updated.status !== "accepted") {
        throw new Error("The call could not be accepted.");
      }

      acceptedCallIdRef.current = updated.id;
      updateActiveCall(updated);

      const sent = await signaling.sendCallState(updated.id, "accepted");

      if (!sent) {
        await markCallFailed(
          updated.id,
          "The caller could not be notified that you accepted.",
        );
        setNotice("Could not notify the caller. Please try again.");
      }
    } catch (failure) {
      setNotice(
        failure instanceof Error
          ? failure.message
          : "Unable to accept the audio call.",
      );
    } finally {
      setIsWorking(false);
    }
  }, [
    currentUserId,
    isWorking,
    markCallFailed,
    signaling.sendCallState,
    transitionCall,
    updateActiveCall,
  ]);

  const finishCall = useCallback(async () => {
    const call = activeCallRef.current;

    if (!call || isWorking || !currentUserId) {
      return;
    }

    let action: "decline" | "cancel" | "end";

    if (call.status === "accepted") {
      action = "end";
    } else if (call.status === "ringing" && call.caller_id === currentUserId) {
      action = "cancel";
    } else if (call.status === "ringing" && call.callee_id === currentUserId) {
      action = "decline";
    } else {
      return;
    }

    setIsWorking(true);

    try {
      const updated = await transitionCall(call.id, action);
      updateActiveCall(updated);
      await signaling.sendCallState(call.id, updated.status);
      clearActiveCall(callStatusMessage(updated, currentUserId));
    } catch (failure) {
      setNotice(
        failure instanceof Error
          ? failure.message
          : "Unable to end this call. Try again.",
      );
    } finally {
      setIsWorking(false);
    }
  }, [
    clearActiveCall,
    currentUserId,
    isWorking,
    signaling.sendCallState,
    transitionCall,
    updateActiveCall,
  ]);

  const toggleMute = useCallback(() => {
    transport.setMuted(!transport.isMuted);
  }, [transport.isMuted, transport.setMuted]);

  if (
    !conversationId ||
    !currentUserId ||
    !peerUserId ||
    currentUserId === peerUserId
  ) {
    return null;
  }

  const isIncoming =
    activeCall?.status === "ringing" &&
    activeCall.callee_id === currentUserId;
  const isOutgoing =
    activeCall?.status === "ringing" &&
    activeCall.caller_id === currentUserId;
  const isConnectedCall = activeCall?.status === "accepted";
  const callIsActive = Boolean(activeCall);

  const connectionLabel =
    transport.connectionStatus === "connected"
      ? "Connected"
      : transport.connectionStatus === "reconnecting"
        ? "Reconnecting…"
        : transport.connectionStatus === "requesting-media"
          ? "Requesting microphone…"
          : transport.connectionStatus === "error"
            ? "Audio connection error"
            : "Connecting audio…";

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline className="hidden" />

      {!globalHost ? (
        <button
          type="button"
          onClick={() => void startCall()}
          disabled={
            callIsActive ||
            isWorking ||
            signaling.connectionStatus !== "connected"
          }
          title={
            signaling.connectionStatus === "connected"
              ? "Start an audio call"
              : "Connecting call service…"
          }
          aria-label={`Audio call with ${peerDisplayName}`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--border)] px-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isWorking && !activeCall ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Phone className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">Audio call</span>
        </button>
      ) : null}

      {activeCall ? (
        <div
          className="fixed inset-x-3 bottom-3 z-[120] mx-auto max-w-md rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 shadow-2xl sm:bottom-5"
          role="dialog"
          aria-label="Audio call controls"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-lg font-semibold">
              {peerDisplayName.trim().charAt(0).toUpperCase() || "A"}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                {peerDisplayName}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {isConnectedCall ? connectionLabel : callStatusMessage(activeCall, currentUserId)}
              </p>
              {transport.error ? (
                <p className="mt-2 text-xs text-red-500">{transport.error}</p>
              ) : null}
              {notice ? (
                <p className="mt-2 text-xs text-[var(--muted)]">{notice}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => clearActiveCall()}
              className="rounded-full p-1.5 text-[var(--muted)] transition hover:bg-[var(--surface)]"
              aria-label="Dismiss call panel"
              title="Dismiss"
              disabled={isConnectedCall || isIncoming || isOutgoing}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            {isIncoming ? (
              <>
                <button
                  type="button"
                  onClick={() => void acceptCall()}
                  disabled={
                    isWorking ||
                    signaling.connectionStatus !== "connected"
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isWorking ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <PhoneCall className="h-4 w-4" aria-hidden="true" />
                  )}
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => void finishCall()}
                  disabled={isWorking}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  <PhoneOff className="h-4 w-4" aria-hidden="true" />
                  Decline
                </button>
              </>
            ) : (
              <>
                {isConnectedCall ? (
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] text-[var(--foreground)] transition hover:bg-[var(--surface)]"
                    aria-label={transport.isMuted ? "Unmute microphone" : "Mute microphone"}
                    title={transport.isMuted ? "Unmute" : "Mute"}
                  >
                    {transport.isMuted ? (
                      <MicOff className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Mic className="h-5 w-5" aria-hidden="true" />
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void finishCall()}
                  disabled={isWorking}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  {isWorking ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <PhoneOff className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isOutgoing ? "Cancel call" : "End call"}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {!activeCall && notice ? (
        <div
          className="fixed bottom-4 left-1/2 z-[120] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--foreground)] shadow-xl"
          role="status"
        >
          <p className="min-w-0 flex-1">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss message"
            className="rounded-full p-1 text-[var(--muted)] hover:bg-[var(--surface)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * Persistent host scaffold. The conversation page will publish context/start
 * events; the root layout will mount this host so the WebRTC controller
 * remains alive while route content changes.
 */
export function AudioCallHost() {
  const [context, setContext] = useState<AudioCallControlsProps | null>(null);
  const [autoStart, setAutoStart] = useState(false);
  const [launchId, setLaunchId] = useState(0);
  const callActiveRef = useRef(false);

  const handleSessionActiveChange = useCallback((active: boolean) => {
    callActiveRef.current = active;
  }, []);

  useEffect(() => {
    const handleContext = (event: Event) => {
      const next = (event as AudioCallContextEvent).detail;

      if (
        !next ||
        !next.conversationId ||
        !next.currentUserId ||
        !next.peerUserId ||
        next.currentUserId === next.peerUserId ||
        callActiveRef.current
      ) {
        return;
      }

      setContext(next);
      setAutoStart(false);
    };

    const handleStart = (event: Event) => {
      const next = (event as AudioCallContextEvent).detail;

      if (
        !next ||
        !next.conversationId ||
        !next.currentUserId ||
        !next.peerUserId ||
        next.currentUserId === next.peerUserId ||
        callActiveRef.current
      ) {
        return;
      }

      setContext(next);
      setAutoStart(true);
      setLaunchId((value) => value + 1);
    };

    const handleContextClear = (event: Event) => {
      const detail = (event as AudioCallContextEvent).detail;

      if (
        callActiveRef.current ||
        (detail?.conversationId &&
          detail.conversationId !== context?.conversationId)
      ) {
        return;
      }

      setContext(null);
      setAutoStart(false);
    };

    window.addEventListener(AUDIO_CALL_CONTEXT_EVENT, handleContext);
    window.addEventListener(AUDIO_CALL_START_EVENT, handleStart);
    window.addEventListener(AUDIO_CALL_CONTEXT_CLEAR_EVENT, handleContextClear);

    return () => {
      window.removeEventListener(AUDIO_CALL_CONTEXT_EVENT, handleContext);
      window.removeEventListener(AUDIO_CALL_START_EVENT, handleStart);
      window.removeEventListener(
        AUDIO_CALL_CONTEXT_CLEAR_EVENT,
        handleContextClear,
      );
    };
  }, [context?.conversationId]);

  if (!context) {
    return null;
  }

  return (
    <AudioCallController
      key={`${context.conversationId}:${context.currentUserId}:${context.peerUserId}:${launchId}`}
      {...context}
      globalHost
      autoStart={autoStart}
      onSessionActiveChange={handleSessionActiveChange}
    />
  );
}

export default function AudioCallControls({
  conversationId,
  currentUserId,
  peerUserId,
  peerDisplayName,
}: AudioCallControlsProps) {
  useEffect(() => {
    let cancelled = false;
    const detail: AudioCallControlsProps = {
      conversationId,
      currentUserId,
      peerUserId,
      peerDisplayName,
    };

    // Let the root host attach its listeners before publishing the first context.
    const timer = window.setTimeout(() => {
      if (!cancelled) {
        window.dispatchEvent(
          new CustomEvent<AudioCallControlsProps>(AUDIO_CALL_CONTEXT_EVENT, {
            detail,
          }),
        );
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.dispatchEvent(
        new CustomEvent<AudioCallControlsProps>(AUDIO_CALL_CONTEXT_CLEAR_EVENT, {
          detail,
        }),
      );
    };
  }, [conversationId, currentUserId, peerUserId, peerDisplayName]);

  const canCall = Boolean(
    conversationId &&
      currentUserId &&
      peerUserId &&
      currentUserId !== peerUserId,
  );

  const startCall = () => {
    if (!canCall) {
      return;
    }

    const detail: AudioCallControlsProps = {
      conversationId,
      currentUserId,
      peerUserId,
      peerDisplayName,
    };

    window.dispatchEvent(
      new CustomEvent<AudioCallControlsProps>(AUDIO_CALL_CONTEXT_EVENT, {
        detail,
      }),
    );
    window.dispatchEvent(
      new CustomEvent<AudioCallControlsProps>(AUDIO_CALL_START_EVENT, {
        detail,
      }),
    );
  };

  return (
    <button
      type="button"
      onClick={startCall}
      disabled={!canCall}
      title={canCall ? "Start an audio call" : "Audio calling is unavailable"}
      aria-label={`Audio call with ${peerDisplayName}`}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--border)] px-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      <Phone className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Audio call</span>
    </button>
  );
}
