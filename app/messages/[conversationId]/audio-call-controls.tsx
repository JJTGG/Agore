"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronDown,
  GripHorizontal,
  LoaderCircle,
  Maximize2,
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
import {
  startCallRingtone,
  stopCallRingtone,
} from "@/lib/audio/call-ringtones";

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

function formatCallDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const two = (value: number) => String(value).padStart(2, "0");

  if (hours > 0) {
    return two(hours) + ":" + two(minutes) + ":" + two(seconds);
  }

  return two(Math.floor(safeSeconds / 60)) + ":" + two(seconds);
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
  const [isMinimized, setIsMinimized] = useState(false);
  const [widgetPosition, setWidgetPosition] = useState({ x: 0, y: 0 });
  const minimizedWidgetRef = useRef<HTMLElement | null>(null);
  const dragStartRef = useRef<{
    pointerId: number;
    pointerX: number;
    pointerY: number;
    x: number;
    y: number;
  } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isWorking, setIsWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const autoStartAttemptedRef = useRef(false);

  const transport = useAudioCallWebRTC();

  const updateActiveCall = useCallback((call: CallRecord | null) => {
    const previousCall = activeCallRef.current;

    if (call && (!previousCall || previousCall.id !== call.id)) {
      setIsMinimized(false);
      setWidgetPosition({ x: 0, y: 0 });
    }

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
    const isIncomingRingingCall = Boolean(
      activeCall &&
        activeCall.status === "ringing" &&
        activeCall.callee_id === currentUserId,
    );

    if (isIncomingRingingCall) {
      startCallRingtone();
    } else {
      stopCallRingtone();
    }

    return () => {
      stopCallRingtone();
    };
  }, [
    activeCall?.id,
    activeCall?.status,
    activeCall?.callee_id,
    currentUserId,
  ]);

  useEffect(() => {
    if (!activeCall || activeCall.status !== "accepted") {
      setElapsedSeconds(0);
      return;
    }

    const startTime = Date.parse(
      activeCall.answered_at ?? activeCall.created_at,
    );

    const updateElapsed = () => {
      setElapsedSeconds(
        Number.isFinite(startTime)
          ? Math.max(0, Math.floor((Date.now() - startTime) / 1000))
          : 0,
      );
    };

    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    activeCall?.id,
    activeCall?.status,
    activeCall?.answered_at,
    activeCall?.created_at,
  ]);

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

  const handleWidgetPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStartRef.current = {
        pointerId: event.pointerId,
        pointerX: event.clientX,
        pointerY: event.clientY,
        x: widgetPosition.x,
        y: widgetPosition.y,
      };
    },
    [widgetPosition],
  );

  const handleWidgetPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = dragStartRef.current;
      const widget = minimizedWidgetRef.current;
      if (!start || start.pointerId !== event.pointerId || !widget) return;

      const rect = widget.getBoundingClientRect();
      const baseLeft = rect.left - widgetPosition.x;
      const baseTop = rect.top - widgetPosition.y;
      const minX = 8 - baseLeft;
      const maxX = window.innerWidth - rect.width - 8 - baseLeft;
      const minY = 8 - baseTop;
      const maxY = window.innerHeight - rect.height - 8 - baseTop;
      const clamp = (value: number, min: number, max: number) =>
        Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max));

      setWidgetPosition({
        x: clamp(start.x + event.clientX - start.pointerX, minX, maxX),
        y: clamp(start.y + event.clientY - start.pointerY, minY, maxY),
      });
    },
    [widgetPosition],
  );

  const handleWidgetPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragStartRef.current?.pointerId !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      dragStartRef.current = null;
    },
    [],
  );

  const handleWidgetKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 48 : 24;
      let dx = 0;
      let dy = 0;
      switch (event.key) {
        case "ArrowLeft": dx = -step; break;
        case "ArrowRight": dx = step; break;
        case "ArrowUp": dy = -step; break;
        case "ArrowDown": dy = step; break;
        default: return;
      }
      event.preventDefault();
      const widget = minimizedWidgetRef.current;
      if (!widget) return;

      const rect = widget.getBoundingClientRect();
      const baseLeft = rect.left - widgetPosition.x;
      const baseTop = rect.top - widgetPosition.y;
      const minX = 8 - baseLeft;
      const maxX = window.innerWidth - rect.width - 8 - baseLeft;
      const minY = 8 - baseTop;
      const maxY = window.innerHeight - rect.height - 8 - baseTop;
      const clamp = (value: number, min: number, max: number) =>
        Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max));

      setWidgetPosition({
        x: clamp(widgetPosition.x + dx, minX, maxX),
        y: clamp(widgetPosition.y + dy, minY, maxY),
      });
    },
    [widgetPosition],
  );

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
        isMinimized ? (
          <section
            ref={minimizedWidgetRef}
            style={{
              left: `calc(50% + ${widgetPosition.x}px)`,
              transform: `translate(-50%, ${widgetPosition.y}px)`,
            }}
            className="fixed left-1/2 right-auto bottom-[calc(5rem_+_env(safe-area-inset-bottom))] z-[220] flex w-[min(320px,calc(100vw-1rem))] max-w-[320px] items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3 shadow-2xl sm:bottom-3"
            role="region"
            aria-label="Minimized audio call"
            aria-live="polite"
          >
            <div
              className="absolute -top-7 left-1/2 flex -translate-x-1/2 cursor-move touch-none select-none items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-[10px] font-medium text-[var(--muted)] shadow-sm"
              role="group"
              aria-label="Move minimized call widget"
              tabIndex={0}
              title="Drag to move the call widget. Use arrow keys to reposition it."
              onPointerDown={handleWidgetPointerDown}
              onPointerMove={handleWidgetPointerMove}
              onPointerUp={handleWidgetPointerEnd}
              onPointerCancel={handleWidgetPointerEnd}
              onKeyDown={handleWidgetKeyDown}
            >
              <GripHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              Move call
            </div>
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              aria-label="Return to audio call"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-base font-semibold">
                {peerDisplayName.trim().charAt(0).toUpperCase() || "A"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--foreground)]">
                  {peerDisplayName}
                </span>
                <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                  {isConnectedCall
                    ? transport.connectionStatus === "connected"
                      ? "In call · " + formatCallDuration(elapsedSeconds)
                      : connectionLabel
                    : isIncoming
                      ? "Incoming audio call"
                      : "Calling…"}
                </span>
              </span>
              <Maximize2
                className="h-4 w-4 shrink-0 text-[var(--muted)]"
                aria-hidden="true"
              />
            </button>

            <div className="flex shrink-0 items-center gap-2">
              {isIncoming ? (
                <button
                  type="button"
                  onClick={() => void acceptCall()}
                  disabled={
                    isWorking ||
                    signaling.connectionStatus !== "connected"
                  }
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  aria-label="Accept audio call"
                  title="Accept"
                >
                  {isWorking ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <PhoneCall className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              ) : isConnectedCall ? (
                <button
                  type="button"
                  onClick={toggleMute}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] text-[var(--foreground)] transition hover:bg-[var(--surface)]"
                  aria-label={transport.isMuted ? "Unmute microphone" : "Mute microphone"}
                  title={transport.isMuted ? "Unmute" : "Mute"}
                >
                  {transport.isMuted ? (
                    <MicOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Mic className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void finishCall()}
                disabled={isWorking}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white transition hover:bg-red-700 disabled:opacity-50"
                aria-label={isIncoming ? "Decline audio call" : isOutgoing ? "Cancel audio call" : "End audio call"}
                title={isIncoming ? "Decline" : isOutgoing ? "Cancel" : "End call"}
              >
                {isWorking ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <PhoneOff className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </section>
        ) : (
          <section
            className="fixed inset-0 z-[200] flex min-h-[100dvh] flex-col bg-[var(--background)] text-[var(--foreground)]"
            role="dialog"
            aria-modal="true"
            aria-label="Audio call"
            aria-live="polite"
          >
            <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-4 py-4 sm:px-7">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  Agoré · Audio call
                </p>
                <p className="mt-1 truncate text-sm font-semibold">
                  {isIncoming
                    ? "Incoming call"
                    : isOutgoing
                      ? "Calling"
                      : transport.connectionStatus === "connected"
                        ? "Connected"
                        : connectionLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--foreground)] transition hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                aria-label="Minimize audio call"
                title="Minimize call"
              >
                <ChevronDown className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>

            <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <div className="relative flex h-36 w-36 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] sm:h-44 sm:w-44">
                <div className="flex h-28 w-28 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background)] text-4xl font-semibold sm:h-36 sm:w-36 sm:text-5xl">
                  {peerDisplayName.trim().charAt(0).toUpperCase() || "A"}
                </div>
                {isConnectedCall && transport.connectionStatus === "connected" ? (
                  <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-[var(--background)] bg-emerald-500" aria-label="Connected" />
                ) : null}
              </div>

              <h2 className="mt-8 max-w-full truncate text-2xl font-semibold tracking-tight sm:text-3xl">
                {peerDisplayName}
              </h2>
              <p className="mt-3 text-sm text-[var(--muted)]">
                {isConnectedCall
                  ? transport.connectionStatus === "connected"
                    ? "Connected · " + formatCallDuration(elapsedSeconds)
                    : connectionLabel
                  : isIncoming
                    ? "They’re calling you"
                    : "Waiting for them to answer"}
              </p>
              {transport.isMuted && isConnectedCall ? (
                <p className="mt-2 text-xs font-medium text-[var(--muted)]">
                  Your microphone is muted
                </p>
              ) : null}
              {transport.error ? (
                <p className="mt-4 max-w-md rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-500">
                  {transport.error}
                </p>
              ) : null}
              {notice ? (
                <p className="mt-3 max-w-md text-sm text-[var(--muted)]">
                  {notice}
                </p>
              ) : null}
            </main>

            <footer className="border-t border-[var(--border)] px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:px-8">
              <div className="mx-auto flex max-w-sm items-center justify-center gap-4">
                {isIncoming ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void finishCall()}
                      disabled={isWorking}
                      className="flex min-w-28 flex-col items-center gap-2 rounded-2xl px-5 py-3 text-xs font-medium text-[var(--muted-strong)] transition hover:bg-[var(--surface)] disabled:opacity-50"
                    >
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white">
                        <PhoneOff className="h-5 w-5" aria-hidden="true" />
                      </span>
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => void acceptCall()}
                      disabled={
                        isWorking ||
                        signaling.connectionStatus !== "connected"
                      }
                      className="flex min-w-28 flex-col items-center gap-2 rounded-2xl px-5 py-3 text-xs font-medium text-[var(--muted-strong)] transition hover:bg-[var(--surface)] disabled:opacity-50"
                    >
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white">
                        {isWorking ? (
                          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                        ) : (
                          <PhoneCall className="h-5 w-5" aria-hidden="true" />
                        )}
                      </span>
                      Accept
                    </button>
                  </>
                ) : (
                  <>
                    {isConnectedCall ? (
                      <button
                        type="button"
                        onClick={toggleMute}
                        className="flex min-w-28 flex-col items-center gap-2 rounded-2xl px-5 py-3 text-xs font-medium text-[var(--muted-strong)] transition hover:bg-[var(--surface)]"
                        aria-label={transport.isMuted ? "Unmute microphone" : "Mute microphone"}
                      >
                        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]">
                          {transport.isMuted ? (
                            <MicOff className="h-5 w-5" aria-hidden="true" />
                          ) : (
                            <Mic className="h-5 w-5" aria-hidden="true" />
                          )}
                        </span>
                        {transport.isMuted ? "Unmute" : "Mute"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void finishCall()}
                      disabled={isWorking}
                      className="flex min-w-28 flex-col items-center gap-2 rounded-2xl px-5 py-3 text-xs font-medium text-[var(--muted-strong)] transition hover:bg-[var(--surface)] disabled:opacity-50"
                    >
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white">
                        {isWorking ? (
                          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                        ) : (
                          <PhoneOff className="h-5 w-5" aria-hidden="true" />
                        )}
                      </span>
                      {isOutgoing ? "Cancel call" : "End call"}
                    </button>
                  </>
                )}
              </div>
              <p className="mt-5 text-center text-[11px] text-[var(--muted)]">
                Your call stays active while you move around Agoré. Minimize to keep it within reach.
              </p>
            </footer>
          </section>
        )
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

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    let lastDiscoveredCallId: string | null = null;

    type IncomingCallCandidate = {
      id: string;
      conversation_id: string;
      caller_id: string;
      callee_id: string;
      status: string;
      created_at: string;
      direction: string;
      peer: {
        id: string;
        display_name: string | null;
        username: string | null;
      } | null;
    };

    async function discoverIncomingCall() {
      if (
        !active ||
        requestInFlight ||
        callActiveRef.current ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      requestInFlight = true;

      try {
        const response = await fetch("/api/calls?limit=20", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        if (!active || !response.ok) {
          return;
        }

        const body = (await response.json()) as {
          calls?: IncomingCallCandidate[];
        };

        const now = Date.now();
        const incoming = (Array.isArray(body.calls) ? body.calls : []).find(
          (call) => {
            const createdAt = new Date(call.created_at).getTime();
            return (
              call.status === "ringing" &&
              call.direction === "incoming" &&
              Boolean(call.conversation_id) &&
              Boolean(call.caller_id) &&
              Boolean(call.callee_id) &&
              Number.isFinite(createdAt) &&
              now >= createdAt &&
              now - createdAt < 60_000
            );
          },
        );

        if (!active || !incoming || callActiveRef.current) {
          return;
        }

        if (lastDiscoveredCallId === incoming.id) {
          return;
        }

        const nextContext: AudioCallControlsProps = {
          conversationId: incoming.conversation_id,
          currentUserId: incoming.callee_id,
          peerUserId: incoming.caller_id,
          peerDisplayName:
            incoming.peer?.display_name?.trim() ||
            incoming.peer?.username?.trim() ||
            "Agoré user",
        };

        if (
          context?.conversationId === nextContext.conversationId &&
          context?.currentUserId === nextContext.currentUserId &&
          context?.peerUserId === nextContext.peerUserId
        ) {
          lastDiscoveredCallId = incoming.id;
          return;
        }

        lastDiscoveredCallId = incoming.id;
        setContext(nextContext);
        setAutoStart(false);
        setLaunchId((value) => value + 1);
      } catch {
        // The next polling attempt retries discovery without interrupting calls.
      } finally {
        requestInFlight = false;
      }
    }

    void discoverIncomingCall();

    // Push alerts are the fast path; this polling is a visibility-aware fallback.
    const interval = window.setInterval(() => {
      void discoverIncomingCall();
    }, 10_000);

    window.addEventListener("focus", discoverIncomingCall);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", discoverIncomingCall);
    };
  }, [context]);

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
