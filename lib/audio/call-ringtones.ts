export type CallRingtoneId =
  | "agore-pulse"
  | "soft-chime"
  | "orbit"
  | "classic-ring";

export type CallRingtoneSettings = {
  ringtone: CallRingtoneId;
  volume: number;
  enabled: boolean;
};

export const CALL_RINGTONE_OPTIONS: {
  id: CallRingtoneId;
  name: string;
  description: string;
}[] = [
  {
    id: "agore-pulse",
    name: "Agoré Pulse",
    description: "A warm, two-note signature motif.",
  },
  {
    id: "soft-chime",
    name: "Soft Chime",
    description: "A gentle, bright chime with a light finish.",
  },
  {
    id: "orbit",
    name: "Orbit",
    description: "A rounded pattern that moves between low and high notes.",
  },
  {
    id: "classic-ring",
    name: "Classic Ring",
    description: "A familiar alternating double tone.",
  },
];

export const DEFAULT_CALL_RINGTONE_SETTINGS: CallRingtoneSettings = {
  ringtone: "agore-pulse",
  volume: 65,
  enabled: true,
};

const SETTINGS_KEY = "agore:call-ringtone-settings:v1";
const RING_INTERVAL_MS = 2_100;

type ToneNote = {
  frequency: number;
  offset: number;
  duration: number;
  wave: OscillatorType;
};

type ActivePlayback = {
  context: AudioContext;
  timer: number | null;
  oscillators: Set<OscillatorNode>;
  stopped: boolean;
};

let activePlayback: ActivePlayback | null = null;

const TONE_PATTERNS: Record<CallRingtoneId, ToneNote[]> = {
  "agore-pulse": [
    { frequency: 587.33, offset: 0, duration: 0.2, wave: "sine" },
    { frequency: 783.99, offset: 0.24, duration: 0.3, wave: "sine" },
    { frequency: 587.33, offset: 0.62, duration: 0.2, wave: "sine" },
    { frequency: 783.99, offset: 0.86, duration: 0.3, wave: "sine" },
  ],
  "soft-chime": [
    { frequency: 659.25, offset: 0, duration: 0.42, wave: "sine" },
    { frequency: 830.61, offset: 0.3, duration: 0.46, wave: "sine" },
    { frequency: 987.77, offset: 0.68, duration: 0.62, wave: "sine" },
  ],
  orbit: [
    { frequency: 440, offset: 0, duration: 0.24, wave: "triangle" },
    { frequency: 587.33, offset: 0.28, duration: 0.24, wave: "triangle" },
    { frequency: 739.99, offset: 0.56, duration: 0.28, wave: "triangle" },
    { frequency: 493.88, offset: 0.9, duration: 0.38, wave: "triangle" },
  ],
  "classic-ring": [
    { frequency: 659.25, offset: 0, duration: 0.14, wave: "square" },
    { frequency: 523.25, offset: 0.18, duration: 0.14, wave: "square" },
    { frequency: 659.25, offset: 0.36, duration: 0.14, wave: "square" },
    { frequency: 523.25, offset: 0.54, duration: 0.22, wave: "square" },
  ],
};

function isRingtoneId(value: unknown): value is CallRingtoneId {
  return (
    value === "agore-pulse" ||
    value === "soft-chime" ||
    value === "orbit" ||
    value === "classic-ring"
  );
}

function normalizeSettings(
  value: Partial<CallRingtoneSettings> | null | undefined,
): CallRingtoneSettings {
  const defaultSettings = DEFAULT_CALL_RINGTONE_SETTINGS;
  const volume =
    typeof value?.volume === "number" && Number.isFinite(value.volume)
      ? Math.min(100, Math.max(0, Math.round(value.volume)))
      : defaultSettings.volume;

  return {
    ringtone: isRingtoneId(value?.ringtone)
      ? value.ringtone
      : defaultSettings.ringtone,
    volume,
    enabled:
      typeof value?.enabled === "boolean"
        ? value.enabled
        : defaultSettings.enabled,
  };
}

export function getCallRingtoneSettings(): CallRingtoneSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_CALL_RINGTONE_SETTINGS };
  }

  try {
    const stored = window.localStorage.getItem(SETTINGS_KEY);
    if (!stored) {
      return { ...DEFAULT_CALL_RINGTONE_SETTINGS };
    }

    return normalizeSettings(
      JSON.parse(stored) as Partial<CallRingtoneSettings>,
    );
  } catch {
    return { ...DEFAULT_CALL_RINGTONE_SETTINGS };
  }
}

export function saveCallRingtoneSettings(
  patch: Partial<CallRingtoneSettings>,
): CallRingtoneSettings {
  const next = normalizeSettings({
    ...getCallRingtoneSettings(),
    ...patch,
  });

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Audio can still work for this session if browser storage is unavailable.
    }
  }

  return next;
}

function createAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const browserWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextConstructor =
    window.AudioContext ?? browserWindow.webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  try {
    return new AudioContextConstructor();
  } catch {
    return null;
  }
}

function schedulePattern(
  playback: ActivePlayback,
  ringtone: CallRingtoneId,
  volume: number,
  startAt: number,
) {
  const gainLevel = Math.max(0, Math.min(1, volume / 100)) * 0.16;

  for (const note of TONE_PATTERNS[ringtone]) {
    if (playback.stopped) {
      return;
    }

    const oscillator = playback.context.createOscillator();
    const envelope = playback.context.createGain();
    const noteStart = startAt + note.offset;
    const noteEnd = noteStart + note.duration;

    oscillator.type = note.wave;
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);

    envelope.gain.setValueAtTime(0.0001, noteStart);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, gainLevel),
      noteStart + Math.min(0.025, note.duration / 4),
    );
    envelope.gain.setValueAtTime(
      Math.max(0.0002, gainLevel),
      Math.max(noteStart + 0.03, noteEnd - 0.055),
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    oscillator.connect(envelope);
    envelope.connect(playback.context.destination);
    playback.oscillators.add(oscillator);

    oscillator.onended = () => {
      playback.oscillators.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };

    oscillator.start(noteStart);
    oscillator.stop(noteEnd);
  }
}

export function stopCallRingtone() {
  const playback = activePlayback;
  activePlayback = null;

  if (!playback) {
    return;
  }

  playback.stopped = true;

  if (playback.timer !== null) {
    window.clearTimeout(playback.timer);
    playback.timer = null;
  }

  for (const oscillator of playback.oscillators) {
    try {
      oscillator.stop();
    } catch {
      // The oscillator may already have finished.
    }
  }

  playback.oscillators.clear();

  if (playback.context.state !== "closed") {
    void playback.context.close().catch(() => undefined);
  }
}

function beginPlayback(
  ringtone: CallRingtoneId,
  volume: number,
  repeating: boolean,
) {
  stopCallRingtone();

  if (volume <= 0 || typeof window === "undefined") {
    return;
  }

  const context = createAudioContext();
  if (!context) {
    return;
  }

  const playback: ActivePlayback = {
    context,
    timer: null,
    oscillators: new Set<OscillatorNode>(),
    stopped: false,
  };
  activePlayback = playback;

  void context.resume().then(() => {
    if (playback.stopped) {
      return;
    }

    const scheduleNext = () => {
      if (playback.stopped || activePlayback !== playback) {
        return;
      }

      schedulePattern(
        playback,
        ringtone,
        volume,
        playback.context.currentTime + 0.04,
      );

      if (repeating) {
        playback.timer = window.setTimeout(scheduleNext, RING_INTERVAL_MS);
      }
    };

    scheduleNext();

    if (!repeating) {
      playback.timer = window.setTimeout(
        stopCallRingtone,
        RING_INTERVAL_MS * 2,
      );
    }
  }).catch(() => {
    stopCallRingtone();
  });
}

export function startCallRingtone() {
  const settings = getCallRingtoneSettings();

  if (!settings.enabled) {
    stopCallRingtone();
    return;
  }

  beginPlayback(settings.ringtone, settings.volume, true);
}

export function previewCallRingtone(
  ringtone: CallRingtoneId,
  volume: number,
) {
  beginPlayback(ringtone, Math.min(100, Math.max(0, volume)), false);
}
