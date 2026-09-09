import { useCallback, useEffect, useRef, useState } from 'react';

import { pendingAttachmentOf, type PendingAttachment } from '@/lib/send/attachments';

/**
 * LE MICRO, DERRIÈRE UNE INTERFACE BOUCHONNABLE (#5668) — miroir
 * `AudioRecorderManager.swift`. `idle → requesting → recording → idle`, ou
 * `refused`/`unsupported` sur un échec de permission/environnement. Le
 * moteur RÉEL (`createBrowserRecorderEngine`) n'est appelé par AUCUN témoin :
 * ils injectent un `RecorderEngine` de test.
 */
export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'refused' | 'unsupported';

export type RecorderState = {
  readonly status: RecorderStatus;
  /** ms écoulées depuis `start()` — 0 hors `recording`. */
  readonly durationMs: number;
  /** Les 15 DERNIERS niveaux [0..1] — miroir `AudioRecorderManager.swift:12`
   * (15 valeurs, `RMS` temporel), `aria-hidden` côté vue. */
  readonly levels: readonly number[];
};

export const RECORDER_IDLE_STATE: RecorderState = { status: 'idle', durationMs: 0, levels: [] };

/**
 * `stopRecordingToAttachment`/`+AttachmentHandlers.swift:118-121` — sous ce
 * seuil, ARRÊTER ANNULE : jamais un enregistrement de 0,2 s joint au message.
 */
export const MIN_SENDABLE_DURATION_MS = 500;
const TICK_MS = 100;
const MAX_LEVELS = 15;

export type RecorderEngineResult =
  | { readonly ok: true; readonly stream: MediaStream }
  | { readonly ok: false; readonly reason: 'refused' | 'unsupported' };

export type RecorderEngine = {
  readonly requestStream: () => Promise<RecorderEngineResult>;
  readonly start: (stream: MediaStream, onLevel: (level: number) => void) => void;
  readonly stop: () => Promise<{ readonly blob: Blob; readonly mimeType: string }>;
  readonly release: (stream: MediaStream) => void;
};

/** Ce que `MediaRecorder.isTypeSupported` accepte, DANS L'ORDRE (§ 0 de la
 * spécification #5668) — `audio/webm;codecs=opus` (Chrome/Android) puis
 * `audio/mp4` (WebKit) ; les DEUX sont dans `ACCEPTED_MIME_TYPES.AUDIO`
 * (`@meeshy/shared/types/attachment.ts:47`). */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4'] as const;

function chosenMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

/**
 * LE MOTEUR NAVIGATEUR RÉEL — `getUserMedia` + `MediaRecorder` +
 * `AnalyserNode` (RMS temporel échantillonné toutes les 50 ms, miroir
 * `AudioRecorderManager.swift:128-130`). Jamais appelé par un témoin.
 */
export function createBrowserRecorderEngine(): RecorderEngine {
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let audioContext: AudioContext | null = null;
  let meterHandle: number | undefined;

  return {
    async requestStream() {
      if (
        typeof navigator === 'undefined' ||
        navigator.mediaDevices?.getUserMedia === undefined ||
        typeof MediaRecorder === 'undefined'
      ) {
        return { ok: false, reason: 'unsupported' };
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        return { ok: true, stream };
      } catch {
        return { ok: false, reason: 'refused' };
      }
    },
    start(stream, onLevel) {
      chunks = [];
      const mimeType = chosenMimeType();
      recorder = mimeType === undefined ? new MediaRecorder(stream) : new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.start();

      const AudioContextCtor =
        window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor !== undefined) {
        audioContext = new AudioContextCtor();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const sample = () => {
          analyser.getByteTimeDomainData(data);
          let sumSquares = 0;
          for (const value of data) {
            const normalized = (value - 128) / 128;
            sumSquares += normalized * normalized;
          }
          onLevel(Math.min(1, Math.sqrt(sumSquares / data.length) * 4));
          meterHandle = window.setTimeout(sample, 50);
        };
        sample();
      }
    },
    stop() {
      return new Promise((resolve) => {
        if (meterHandle !== undefined) {
          window.clearTimeout(meterHandle);
          meterHandle = undefined;
        }
        if (audioContext !== null) {
          void audioContext.close();
          audioContext = null;
        }
        if (recorder === null) {
          resolve({ blob: new Blob([], { type: 'audio/webm' }), mimeType: 'audio/webm' });
          return;
        }
        const mimeType = recorder.mimeType || 'audio/webm';
        recorder.onstop = () => resolve({ blob: new Blob(chunks, { type: mimeType }), mimeType });
        recorder.stop();
      });
    },
    release(stream) {
      for (const track of stream.getTracks()) track.stop();
    },
  };
}

function extensionFor(mimeType: string): string {
  return mimeType.includes('mp4') ? 'm4a' : 'webm';
}

/**
 * L'ENVIRONNEMENT PEUT-IL ENREGISTRER ? (revue-correction #5668) — la
 * question se pose AVANT de rendre le micro, pas après l'avoir tapé : sans
 * `MediaRecorder` ni `getUserMedia` (contexte non sécurisé, navigateur
 * ancien), la porte ne mène nulle part, donc elle ne se rend pas — loi 4,
 * et la lettre de la spécification #5668 (« le micro n'est PAS rendu »).
 * `unsupported` reste un état du hook pour le cas RÉSIDUEL où la sonde passe
 * et le moteur échoue quand même.
 */
export function recordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices?.getUserMedia !== undefined
  );
}

export function useRecorder(params?: {
  readonly engine?: RecorderEngine;
  readonly now?: () => number;
  /** Injectable — le défaut pose un VRAI `setInterval`. Un témoin passe une
   * fonction qui capture le callback et le rejoue manuellement, plutôt que
   * d'attendre un délai réel (déterministe, aucun `sleep`). */
  readonly interval?: (callback: () => void, ms: number) => () => void;
}): {
  readonly state: RecorderState;
  readonly start: () => void;
  readonly cancel: () => void;
  /**
   * FERME la bande de refus (revue-correction #5668) — un état `refused` /
   * `unsupported` restait affiché POUR TOUJOURS : aucun geste ne le levait,
   * et la bande mangeait une ligne au-dessus du champ jusqu'au rechargement
   * de la page. Le miroir iOS est un TOAST, qui expire de lui-même
   * (`AudioRecorderManager.swift:136-157`) ; sur le web, la sortie est
   * EXPLICITE — « Fermer », comme la spécification #5668 § 0 le demandait.
   */
  readonly reset: () => void;
  /** Arrête l'enregistrement et rend le `PendingAttachment` — `null` si la
   * durée est SOUS le seuil (§0 : « ARRÊTER ANNULE », jamais un
   * enregistrement fantôme). */
  readonly stop: () => Promise<PendingAttachment | null>;
} {
  /**
   * MOTEUR CONSTRUIT UNE FOIS, PAS À CHAQUE RENDU (revue-correction #5668) —
   * l'argument de `useRef` est ÉVALUÉ à chaque rendu même si seule la
   * première valeur est retenue : `createBrowserRecorderEngine()` fabriquait
   * donc quatre fermetures et un objet à CHAQUE frappe de touche du
   * composeur, jetés dans la foulée. La construction paresseuse est le motif
   * qu'iront copier les trente écrans suivants ; l'écriture naïve, non.
   */
  const engineRef = useRef<RecorderEngine | null>(null);
  if (engineRef.current === null) engineRef.current = params?.engine ?? createBrowserRecorderEngine();
  const engine = engineRef.current;
  const now = params?.now ?? Date.now;
  const intervalRef = useRef<((callback: () => void, ms: number) => () => void) | null>(null);
  if (intervalRef.current === null) {
    intervalRef.current =
      params?.interval ??
      ((callback: () => void, ms: number) => {
        const id = window.setInterval(callback, ms);
        return () => window.clearInterval(id);
      });
  }
  const scheduleInterval = intervalRef.current;

  const [state, setState] = useState<RecorderState>(RECORDER_IDLE_STATE);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const cancelIntervalRef = useRef<(() => void) | null>(null);

  const stopMetering = useCallback(() => {
    cancelIntervalRef.current?.();
    cancelIntervalRef.current = null;
  }, []);

  // Nettoyage au DÉMONTAGE — un composeur fermé pendant un enregistrement ne
  // laisse ni minuteur ni piste micro ouverte derrière lui.
  useEffect(() => {
    return () => {
      stopMetering();
      if (streamRef.current !== null) engine.release(streamRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nettoyage de démontage seul, volontairement sans dépendance.
  }, []);

  const start = useCallback(() => {
    setState({ status: 'requesting', durationMs: 0, levels: [] });
    void (async () => {
      const result = await engine.requestStream();
      if (!result.ok) {
        setState({ status: result.reason, durationMs: 0, levels: [] });
        return;
      }
      streamRef.current = result.stream;
      startedAtRef.current = now();
      setState({ status: 'recording', durationMs: 0, levels: [] });
      engine.start(result.stream, (level) => {
        setState((current) =>
          current.status === 'recording' ? { ...current, levels: [...current.levels, level].slice(-MAX_LEVELS) } : current,
        );
      });
      cancelIntervalRef.current = scheduleInterval(() => {
        setState((current) =>
          current.status === 'recording' ? { ...current, durationMs: now() - startedAtRef.current } : current,
        );
      }, TICK_MS);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now`/`scheduleInterval` sont des refs stables (injection de test).
  }, []);

  const teardown = useCallback(() => {
    stopMetering();
    if (streamRef.current !== null) {
      engine.release(streamRef.current);
      streamRef.current = null;
    }
  }, [engine, stopMetering]);

  const cancel = useCallback(() => {
    if (state.status === 'recording') {
      void engine.stop();
      teardown();
    }
    setState(RECORDER_IDLE_STATE);
  }, [engine, state.status, teardown]);

  const stop = useCallback(async (): Promise<PendingAttachment | null> => {
    if (state.status !== 'recording') return null;
    const durationMs = now() - startedAtRef.current;
    const { blob, mimeType } = await engine.stop();
    teardown();
    setState(RECORDER_IDLE_STATE);
    if (durationMs < MIN_SENDABLE_DURATION_MS) return null; // ARRÊTER ANNULE.
    const file = new File([blob], `Message vocal.${extensionFor(mimeType)}`, { type: mimeType });
    return pendingAttachmentOf(file, { durationMs });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now`/`teardown` stables.
  }, [state.status]);

  const reset = useCallback(() => setState(RECORDER_IDLE_STATE), []);

  return { state, start, cancel, stop, reset };
}
