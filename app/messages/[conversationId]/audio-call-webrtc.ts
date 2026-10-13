"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AudioConnectionStatus =
  | "idle"
  | "requesting-media"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

type SendOffer = (
  callId: string,
  description: RTCSessionDescriptionInit,
) => Promise<boolean>;

type SendAnswer = (
  callId: string,
  description: RTCSessionDescriptionInit,
) => Promise<boolean>;

type SendIceCandidate = (
  callId: string,
  candidate: RTCIceCandidateInit,
) => Promise<boolean>;

type UseAudioCallWebRTCOptions = {
  conversationId?: string;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
};

const CALL_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRTCIceServer(value: unknown): value is RTCIceServer {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const server = value as Record<string, unknown>;
  const urls =
    typeof server.urls === "string"
      ? [server.urls]
      : Array.isArray(server.urls)
        ? server.urls
        : [];

  if (
    urls.length === 0 ||
    !urls.every(
      (url: unknown) =>
        typeof url === "string" &&
        (url.startsWith("stun:") ||
          url.startsWith("turn:") ||
          url.startsWith("turns:")),
    )
  ) {
    return false;
  }

  return (
    (server.username === undefined || typeof server.username === "string") &&
    (server.credential === undefined || typeof server.credential === "string")
  );
}

function getConversationIdFromLocation(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const match = window.location.pathname.match(/^\/messages\/([^/]+)(?:\/|$)/);

  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

async function loadIceServers(conversationId: string): Promise<RTCIceServer[]> {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/calls/ice-servers`,
    {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    },
  );

  const body: unknown = await response.json().catch(() => null);
  const payload =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;

  if (!response.ok) {
    const message =
      payload && typeof payload.error === "string"
        ? payload.error
        : "Agoré could not load audio relay settings. Please try again.";

    throw new Error(message);
  }

  const rawIceServers = payload?.iceServers;

  if (
    !Array.isArray(rawIceServers) ||
    rawIceServers.length === 0 ||
    !rawIceServers.every(isRTCIceServer)
  ) {
    throw new Error("Agoré received an invalid audio relay configuration.");
  }

  const hasTurnRelay = rawIceServers.some((server) => {
    const urls = typeof server.urls === "string" ? [server.urls] : server.urls;
    return urls.some(
      (url) => url.startsWith("turn:") || url.startsWith("turns:"),
    );
  });

  if (!hasTurnRelay) {
    throw new Error(
      "Audio relay is unavailable. Check the Metered TURN configuration and try again.",
    );
  }

  return rawIceServers;
}

function getMediaErrorMessage(error: unknown): string {
  if (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")
  ) {
    return "Microphone access was denied. Allow microphone access in your browser settings and try again.";
  }

  if (
    error instanceof DOMException &&
    (error.name === "NotFoundError" || error.name === "DevicesNotFoundError")
  ) {
    return "No microphone was found on this device.";
  }

  if (
    error instanceof DOMException &&
    (error.name === "NotReadableError" || error.name === "TrackStartError")
  ) {
    return "The microphone is already in use or could not be opened.";
  }

  if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia) {
    return "Audio calling requires a supported browser in a secure context (HTTPS).";
  }

  return "Agoré could not access the microphone. Check your device permissions and try again.";
}

/**
 * Owns browser microphone media and a single peer-to-peer audio connection.
 * Signalling is injected from useAudioCallSignaling so API call-state and
 * Realtime message handling stay outside the media transport layer.
 */
export function useAudioCallWebRTC(
  options: UseAudioCallWebRTCOptions = {},
) {
  const { conversationId } = options;
  const onConnectionStateChangeRef = useRef(options.onConnectionStateChange);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingIceCandidatesRef = useRef<
    Map<string, RTCIceCandidateInit[]>
  >(new Map());

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<AudioConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    onConnectionStateChangeRef.current = options.onConnectionStateChange;
  }, [options.onConnectionStateChange]);

  const getLocalMedia = useCallback(async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      throw new Error(getMediaErrorMessage(null));
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const flushQueuedIceCandidates = useCallback(async (callId: string) => {
    const connection = peerConnectionRef.current;

    if (
      !connection ||
      activeCallIdRef.current !== callId ||
      !connection.remoteDescription
    ) {
      return;
    }

    const queued = pendingIceCandidatesRef.current.get(callId) ?? [];
    pendingIceCandidatesRef.current.delete(callId);

    for (const candidate of queued) {
      try {
        await connection.addIceCandidate(candidate);
      } catch (candidateError) {
        console.warn("Agore could not apply a queued audio ICE candidate.", candidateError);
      }
    }
  }, []);

  const closePeerConnection = useCallback(() => {
    const connection = peerConnectionRef.current;
    peerConnectionRef.current = null;

    if (connection) {
      connection.onicecandidate = null;
      connection.ontrack = null;
      connection.onconnectionstatechange = null;
      connection.close();
    }
  }, []);

  const cleanup = useCallback(() => {
    closePeerConnection();

    const local = localStreamRef.current;
    localStreamRef.current = null;

    local?.getTracks().forEach((track) => {
      track.stop();
    });

    remoteStreamRef.current = null;
    pendingIceCandidatesRef.current.clear();
    activeCallIdRef.current = null;

    setLocalStream(null);
    setRemoteStream(null);
    setConnectionStatus("idle");
    setError(null);
    setIsMuted(false);
  }, [closePeerConnection]);

  const createPeerConnection = useCallback(
    async (callId: string, sendIceCandidate: SendIceCandidate) => {
      if (
        activeCallIdRef.current !== callId ||
        peerConnectionRef.current
      ) {
        throw new Error("An audio connection is already active.");
      }

      const activeConversationId =
        conversationId ?? getConversationIdFromLocation();

      if (!activeConversationId) {
        throw new Error(
          "Open a direct conversation before starting an audio call.",
        );
      }

      // Network configuration and microphone acquisition are independent.
      // Start both together so a slow ICE-config request does not hold up
      // the microphone prompt, and microphone startup does not hold up ICE.
      const [iceResult, mediaResult] = await Promise.allSettled([
        loadIceServers(activeConversationId),
        getLocalMedia(),
      ]);

      const discardPreparedStream = (stream: MediaStream) => {
        stream.getTracks().forEach((track) => {
          track.stop();
        });

        if (localStreamRef.current === stream) {
          localStreamRef.current = null;
          setLocalStream(null);
        }
      };

      if (activeCallIdRef.current !== callId) {
        if (mediaResult.status === "fulfilled") {
          discardPreparedStream(mediaResult.value);
        }

        throw new Error("The call ended before network setup finished.");
      }

      if (iceResult.status === "rejected") {
        if (mediaResult.status === "fulfilled") {
          discardPreparedStream(mediaResult.value);
        }

        throw iceResult.reason;
      }

      if (mediaResult.status === "rejected") {
        throw mediaResult.reason;
      }

      const iceServers = iceResult.value;
      const stream = mediaResult.value;

      const connection = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 4,
      });
      peerConnectionRef.current = connection;

      stream.getAudioTracks().forEach((track) => {
        connection.addTrack(track, stream);
      });

      connection.onicecandidate = (event) => {
        if (
          !event.candidate ||
          activeCallIdRef.current !== callId ||
          peerConnectionRef.current !== connection
        ) {
          return;
        }

        void sendIceCandidate(callId, event.candidate.toJSON()).then((sent) => {
          if (!sent && activeCallIdRef.current === callId) {
            setError("Some network connection details could not be sent.");
          }
        });
      };

      connection.ontrack = (event) => {
        if (
          activeCallIdRef.current !== callId ||
          peerConnectionRef.current !== connection
        ) {
          return;
        }

        let streamForPeer = event.streams[0];

        if (!streamForPeer) {
          streamForPeer = remoteStreamRef.current ?? new MediaStream();
          const alreadyAdded = streamForPeer
            .getTracks()
            .some((track) => track.id === event.track.id);

          if (!alreadyAdded) {
            streamForPeer.addTrack(event.track);
          }
        }

        remoteStreamRef.current = streamForPeer;
        setRemoteStream(streamForPeer);
      };

      connection.onconnectionstatechange = () => {
        if (
          activeCallIdRef.current !== callId ||
          peerConnectionRef.current !== connection
        ) {
          return;
        }

        const state = connection.connectionState;
        onConnectionStateChangeRef.current?.(state);

        switch (state) {
          case "connected":
            setConnectionStatus("connected");
            setError(null);
            break;
          case "connecting":
            setConnectionStatus("connecting");
            break;
          case "disconnected":
            setConnectionStatus("reconnecting");
            setError("The audio connection was interrupted. Trying to recover…");
            break;
          case "failed":
            setConnectionStatus("error");
            setError(
              "A direct audio connection could not be established. Check the network and try again.",
            );
            break;
          case "closed":
            setConnectionStatus("idle");
            break;
          case "new":
            setConnectionStatus("connecting");
            break;
        }
      };

      return connection;
    },
    [conversationId, getLocalMedia],
  );

  const startOutgoingCall = useCallback(
    async (
      callId: string,
      sendOffer: SendOffer,
      sendIceCandidate: SendIceCandidate,
    ): Promise<boolean> => {
      if (!CALL_ID_PATTERN.test(callId)) {
        setError("The call ID is invalid.");
        setConnectionStatus("error");
        return false;
      }

      if (activeCallIdRef.current || peerConnectionRef.current) {
        setError("Finish the current audio call before starting another.");
        return false;
      }

      activeCallIdRef.current = callId;
      setError(null);
      setConnectionStatus("requesting-media");

      try {
        const connection = await createPeerConnection(callId, sendIceCandidate);
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);

        if (
          activeCallIdRef.current !== callId ||
          !connection.localDescription?.sdp
        ) {
          return false;
        }

        const sent = await sendOffer(callId, {
          type: "offer",
          sdp: connection.localDescription.sdp,
        });

        if (!sent) {
          throw new Error("The audio offer could not be delivered.");
        }

        setConnectionStatus("connecting");
        return true;
      } catch (callError) {
        const message =
          callError instanceof DOMException
            ? getMediaErrorMessage(callError)
            : callError instanceof Error
              ? callError.message
              : "The audio call could not be started.";

        cleanup();
        setError(message);
        setConnectionStatus("error");
        return false;
      }
    },
    [cleanup, createPeerConnection],
  );

  const acceptIncomingCall = useCallback(
    async (
      callId: string,
      offerSdp: string,
      sendAnswer: SendAnswer,
      sendIceCandidate: SendIceCandidate,
    ): Promise<boolean> => {
      if (
        !CALL_ID_PATTERN.test(callId) ||
        typeof offerSdp !== "string" ||
        offerSdp.length === 0 ||
        offerSdp.length > 180_000
      ) {
        setError("The incoming audio offer is invalid.");
        setConnectionStatus("error");
        return false;
      }

      if (activeCallIdRef.current || peerConnectionRef.current) {
        setError("Another audio call is already active on this device.");
        return false;
      }

      activeCallIdRef.current = callId;
      setError(null);
      setConnectionStatus("requesting-media");

      try {
        const connection = await createPeerConnection(callId, sendIceCandidate);

        await connection.setRemoteDescription({
          type: "offer",
          sdp: offerSdp,
        });

        await flushQueuedIceCandidates(callId);

        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);

        if (
          activeCallIdRef.current !== callId ||
          !connection.localDescription?.sdp
        ) {
          return false;
        }

        const sent = await sendAnswer(callId, {
          type: "answer",
          sdp: connection.localDescription.sdp,
        });

        if (!sent) {
          throw new Error("The audio answer could not be delivered.");
        }

        setConnectionStatus("connecting");
        return true;
      } catch (callError) {
        const message =
          callError instanceof DOMException
            ? getMediaErrorMessage(callError)
            : callError instanceof Error
              ? callError.message
              : "The incoming audio call could not be accepted.";

        cleanup();
        setError(message);
        setConnectionStatus("error");
        return false;
      }
    },
    [cleanup, createPeerConnection, flushQueuedIceCandidates],
  );

  const receiveAnswer = useCallback(
    async (callId: string, answerSdp: string): Promise<boolean> => {
      const connection = peerConnectionRef.current;

      if (
        activeCallIdRef.current !== callId ||
        !connection ||
        typeof answerSdp !== "string" ||
        answerSdp.length === 0 ||
        answerSdp.length > 180_000
      ) {
        return false;
      }

      try {
        await connection.setRemoteDescription({
          type: "answer",
          sdp: answerSdp,
        });
        await flushQueuedIceCandidates(callId);
        setConnectionStatus("connecting");
        return true;
      } catch (answerError) {
        setError(
          answerError instanceof Error
            ? answerError.message
            : "The audio answer could not be applied.",
        );
        setConnectionStatus("error");
        return false;
      }
    },
    [flushQueuedIceCandidates],
  );

  const receiveIceCandidate = useCallback(
    async (
      callId: string,
      candidate: RTCIceCandidateInit,
    ): Promise<boolean> => {
      if (!CALL_ID_PATTERN.test(callId)) {
        return false;
      }

      if (
        activeCallIdRef.current !== null &&
        activeCallIdRef.current !== callId
      ) {
        return false;
      }

      const connection = peerConnectionRef.current;

      if (!connection || !connection.remoteDescription) {
        const queued = pendingIceCandidatesRef.current.get(callId) ?? [];

        if (
          !pendingIceCandidatesRef.current.has(callId) &&
          pendingIceCandidatesRef.current.size >= 2
        ) {
          return false;
        }

        if (queued.length >= 128) {
          setError("Too many pending network candidates were received.");
          return false;
        }

        queued.push(candidate);
        pendingIceCandidatesRef.current.set(callId, queued);
        return true;
      }

      try {
        await connection.addIceCandidate(candidate);
        return true;
      } catch (candidateError) {
        console.warn("Agore could not apply an audio ICE candidate.", candidateError);
        return false;
      }
    },
    [],
  );

  const setMuted = useCallback((muted: boolean) => {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });

    setIsMuted(muted);
  }, []);

  useEffect(
    () => () => {
      closePeerConnection();

      localStreamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      localStreamRef.current = null;
      remoteStreamRef.current = null;
      pendingIceCandidatesRef.current.clear();
        activeCallIdRef.current = null;
    },
    [closePeerConnection],
  );

  return {
    connectionStatus,
    error,
    isMuted,
    localStream,
    remoteStream,
    startOutgoingCall,
    acceptIncomingCall,
    receiveAnswer,
    receiveIceCandidate,
    setMuted,
    cleanup,
  };
}

