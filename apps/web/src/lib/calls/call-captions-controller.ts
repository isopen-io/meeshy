import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import {
  captureAction,
  decodeChannelMessage,
  decodeTranscriptionActive,
  decodeTranslatedSegment,
  mergeCaption,
  nextCaptionsMode,
  segmentEvent,
  someoneListens,
  transcriptEntryMessage,
  type CallCaption,
  type TranscriptionState,
  type Utterance,
} from './call-captions';
import type { ActiveCall } from './call-store';

/**
 * **LES SOUS-TITRES D'UN APPEL, VIVANTS** (#8048) — un contrôleur par appel,
 * construit par le moteur au premier besoin (`engine.ts` › `captions()`), chargé
 * à la demande (`call-captions-runtime.ts`, `budgets.json` › `call_captions`).
 *
 * Il tient les deux sens :
 *  - **recevoir** — `call:translated-segment` (traduit par la passerelle pour CE
 *    lecteur, `call-transcription-relay.ts`) et les entrées P2P du canal de
 *    données `transcription`, fusionnés en un journal ; `call:transcription-active`
 *    d'un pair ;
 *  - **émettre** — la reconnaissance vocale du navigateur transcrit MON micro
 *    dès que quelqu'un écoute ; chaque révision part en P2P, chaque final part
 *    AUSSI par `call:transcription-segment` (la passerelle le traduit, le relaie
 *    et le grave pour la transcription d'après l'appel). Même partage qu'iOS
 *    (`CallTranscriptionService.emitFinalSegment` / `emitPartialEntry`) : le
 *    socket, borné par la passerelle, ne porte jamais un partiel.
 */

export const CHANNEL_PING_MS = 15_000;

export type SpeechResult = { readonly text: string; readonly isFinal: boolean; readonly confidence: number };

export type SpeechCapture = { readonly stop: () => void };

/** La reconnaissance vocale : rend la capture en cours ; `onFailure` la dit perdue (refus, langue ou service indisponible). */
export type SpeechSource = (options: {
  readonly language: string;
  readonly onResult: (result: SpeechResult) => void;
  readonly onFailure: (reason: 'denied' | 'unavailable') => void;
}) => SpeechCapture;

/** Ce que le moteur prête à un contrôleur : l'appel, son magasin, le socket, l'horloge. */
export type CaptionsContext = {
  readonly callId: string;
  readonly read: () => ActiveCall | null;
  readonly update: (fn: (call: ActiveCall) => ActiveCall) => void;
  readonly emit: (event: string, payload: unknown) => void;
  readonly viewerId: () => string;
  readonly now: () => number;
  readonly repeat: (fn: () => void, ms: number) => unknown;
  readonly stopRepeat: (handle: unknown) => void;
  /** Des sous-titres ont été AFFICHÉS — `call:analytics` › `transcriptionUsed` (#8047). */
  readonly shown: () => void;
  /** Le pair a raccroché EN BANDE (`{"type":"bye"}`), avant le `call:ended` de la passerelle. */
  readonly bye: () => void;
};

export type CaptionsPort = {
  readonly receive: (event: string, payload: unknown) => void;
  readonly toggle: () => void;
  /** Le canal de données `transcription` d'un lien — créé par l'offrant, reçu par l'autre. */
  readonly attach: (userId: string, channel: RTCDataChannel) => void;
  /** Fin de l'appel ; `bye` prévient les pairs en bande (raccroché local). */
  readonly stop: (bye: boolean) => void;
};

export type CaptionsDeps = {
  /** `null` : le navigateur ne transcrit pas — on reçoit quand même. */
  readonly speech: SpeechSource | null;
  /** La langue parlée : le rang 1 du Prisme du lecteur. */
  readonly language: () => string;
  readonly viewerName: () => string;
  readonly newId: () => string;
};

export function createCaptions(ctx: CaptionsContext, deps: CaptionsDeps): CaptionsPort {
  const channels = new Map<string, RTCDataChannel>();
  let capture: SpeechCapture | null = null;
  let captureStartedAt = 0;
  let utterance: { readonly id: string; readonly startMs: number; readonly at: number } | null = null;
  let ping: unknown = null;
  let stopped = false;

  const live = (): ActiveCall | null => {
    const call = ctx.read();
    return call !== null && call.callId === ctx.callId && call.phase.kind !== 'ended' ? call : null;
  };
  const patch = (fn: (call: ActiveCall) => ActiveCall): void => ctx.update((call) => (call.callId === ctx.callId ? fn(call) : call));
  const setState = (transcription: TranscriptionState): void => patch((call) => (call.transcription === transcription ? call : { ...call, transcription }));

  const add = (caption: CallCaption): void => {
    patch((call) => ({ ...call, captions: mergeCaption(call.captions, caption) }));
    if (!caption.mine && live()?.captionsMode !== 'off') ctx.shown();
  };

  const broadcast = (message: unknown): void => {
    const raw = JSON.stringify(message);
    for (const channel of channels.values()) {
      if (channel.readyState !== 'open') continue;
      try {
        channel.send(raw);
      } catch {
        /* Un canal qui se ferme sous la main : le relais socket porte le final. */
      }
    }
  };

  const onResult = (result: SpeechResult): void => {
    const said = result.text.trim();
    if (stopped || capture === null || said === '') return;
    const now = ctx.now();
    const current = utterance ?? { id: deps.newId(), startMs: now - captureStartedAt, at: now };
    utterance = result.isFinal ? null : current;
    const spoken: Utterance = {
      id: current.id,
      callId: ctx.callId,
      speakerId: ctx.viewerId(),
      speakerName: deps.viewerName(),
      text: said,
      language: deps.language(),
      confidence: result.confidence,
      startMs: current.startMs,
      endMs: now - captureStartedAt,
      capturedAtMs: current.at,
      isFinal: result.isFinal,
    };
    add({ id: spoken.id, speakerId: spoken.speakerId, speakerName: spoken.speakerName, original: said, translated: null, isFinal: result.isFinal, at: current.at, mine: true });
    broadcast(transcriptEntryMessage(spoken));
    if (result.isFinal) ctx.emit(CLIENT_EVENTS.CALL_TRANSCRIPTION_SEGMENT, segmentEvent(spoken));
  };

  const stopCapture = (): void => {
    capture?.stop();
    capture = null;
    utterance = null;
  };

  const reconcile = (): void => {
    const call = live();
    const listening = call !== null && !stopped && someoneListens({ mode: call.captionsMode, peers: call.captionPeers, members: call.members });
    const action = captureAction(listening, capture !== null);
    if (action === 'stop') {
      stopCapture();
      setState('idle');
      return;
    }
    if (action !== 'start' || call === null) return;
    if (deps.speech === null || call.transcription === 'denied' || call.transcription === 'unsupported') {
      if (deps.speech === null) setState('unsupported');
      return;
    }
    captureStartedAt = ctx.now();
    let started: SpeechCapture | null = null;
    let failed = false;
    started = deps.speech({
      language: deps.language(),
      onResult,
      onFailure: (reason) => {
        failed = true;
        if (started !== null && capture === started) stopCapture();
        setState(reason === 'denied' ? 'denied' : 'unsupported');
      },
    });
    if (failed) return;
    capture = started;
    setState('listening');
  };

  const onChannel = (userId: string, raw: unknown): void => {
    const message = decodeChannelMessage(raw);
    if (message === null || stopped) return;
    if (message.kind === 'bye') {
      ctx.bye();
      return;
    }
    const call = live();
    if (call === null || message.callId !== ctx.callId) return;
    add({ id: message.id, speakerId: userId, speakerName: call.members[userId]?.name || message.speakerName, original: message.text, translated: null, isFinal: message.isFinal, at: message.at > 0 ? message.at : ctx.now(), mine: false });
  };

  const onTranslated = (payload: unknown): void => {
    const decoded = decodeTranslatedSegment(payload);
    const call = live();
    if (decoded === null || call === null || decoded.callId !== ctx.callId || decoded.caption.speakerId === ctx.viewerId()) return;
    const speakerName = decoded.speakerName ?? call.members[decoded.caption.speakerId]?.name ?? '';
    add({ ...decoded.caption, speakerName, at: decoded.caption.at > 0 ? decoded.caption.at : ctx.now(), mine: false });
  };

  const onActive = (payload: unknown): void => {
    const signal = decodeTranscriptionActive(payload);
    if (signal === null || signal.callId !== ctx.callId || signal.speakerId === ctx.viewerId()) return;
    patch((call) => {
      const others = call.captionPeers.filter((peer) => peer !== signal.speakerId);
      return { ...call, captionPeers: signal.active ? [...others, signal.speakerId] : others };
    });
    reconcile();
  };

  if (deps.speech === null) setState('unsupported');

  return {
    receive: (event, payload) => {
      if (stopped) return;
      if (event === SERVER_EVENTS.CALL_TRANSLATED_SEGMENT) onTranslated(payload);
      if (event === SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE) onActive(payload);
    },
    toggle: () => {
      const call = live();
      if (call === null || stopped) return;
      const next = nextCaptionsMode(call.captionsMode);
      patch((current) => ({ ...current, captionsMode: next }));
      if ((call.captionsMode === 'off') !== (next === 'off')) ctx.emit(CLIENT_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: ctx.callId, active: next !== 'off' });
      if (next !== 'off' && call.captions.some((caption) => !caption.mine)) ctx.shown();
      reconcile();
    },
    attach: (userId, channel) => {
      if (stopped) return;
      channels.set(userId, channel);
      channel.onmessage = (event: MessageEvent) => onChannel(userId, event.data);
      channel.onclose = () => {
        if (channels.get(userId) === channel) channels.delete(userId);
      };
      ping ??= ctx.repeat(() => broadcast({ type: 'ping' }), CHANNEL_PING_MS);
    },
    stop: (bye) => {
      if (stopped) return;
      if (bye) broadcast({ type: 'bye', reason: 'completed' });
      stopped = true;
      stopCapture();
      if (ping !== null) ctx.stopRepeat(ping);
      ping = null;
      for (const channel of channels.values()) {
        channel.onmessage = null;
        channel.onclose = null;
      }
      channels.clear();
    },
  };
}
