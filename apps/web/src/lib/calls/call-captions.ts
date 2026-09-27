import type { CallTranscriptDataChannelMessage, CallTranscriptionSegmentEvent } from '@meeshy/shared/types/video-call';

/**
 * **LES SOUS-TITRES D'UN APPEL, EN LOIS PURES** (#8048) — ce que lisent le
 * contrôleur (`call-captions-controller.ts`), le panneau
 * (`components/call-captions-panel.tsx`) et le moteur, sans DOM ni WebRTC.
 *
 * Miroirs d'iOS : le cycle du bouton (`CaptionsMode.swift` : off → traduit →
 * original → off), la politique de capture (`TranscriptionCapturePolicy` : ce
 * device transcrit SON micro dès que QUELQU'UN écoute — son propre panneau ou
 * un pair qui l'a signalé par `call:transcription-active`), la fusion du
 * journal par identifiant d'énoncé (`wireId` : le même énoncé arrive en P2P
 * par le canal de données PUIS traduit par la passerelle, et ses révisions
 * partielles le remplacent en place).
 */

export type CaptionsMode = 'off' | 'translated' | 'original';

/** `idle` : rien à capter · `listening` : mon micro est transcrit · `unsupported` : le navigateur ne sait pas · `denied` : refusé. */
export type TranscriptionState = 'idle' | 'listening' | 'unsupported' | 'denied';

export type CaptionLanguagePair = { readonly from: string; readonly to: string };

export type CallCaption = {
  readonly id: string;
  readonly speakerId: string;
  readonly speakerName: string;
  readonly original: string;
  /** La traduction servie par la passerelle dans la langue du lecteur — `null` tant qu'aucune n'est arrivée. */
  readonly translated: string | null;
  /** Les langues de cette traduction (`sourceLanguage` → `targetLanguage`), arrivées avec elle — `null` sans traduction (#8393). */
  readonly pair: CaptionLanguagePair | null;
  readonly isFinal: boolean;
  /** L'horloge murale de capture chez le locuteur — la clé d'ordre du journal. */
  readonly at: number;
  readonly mine: boolean;
};

/** Le journal est borné : un appel de dix heures ne grossit pas la mémoire au-delà. */
export const CAPTIONS_JOURNAL_KEPT = 200;

export const CAPTIONS_OVERLAY_LINES = 2;

export const TRANSCRIPT_CHANNEL = 'transcription';

export function nextCaptionsMode(mode: CaptionsMode): CaptionsMode {
  if (mode === 'off') return 'translated';
  if (mode === 'translated') return 'original';
  return 'off';
}

/** Ce que le lecteur lit d'une ligne : ma parole est toujours la mienne ; celle d'un autre, traduite en mode traduit quand la traduction est là. */
export function captionText(caption: CallCaption, mode: CaptionsMode): string {
  return mode === 'translated' && !caption.mine && caption.translated !== null ? caption.translated : caption.original;
}

const languageCode = (tag: string): string => (tag.split('-')[0] ?? tag).toUpperCase();

/**
 * La petite étiquette « EN → FR » d'une ligne LUE traduite (#8393) — le Prisme
 * reste discret mais dit qu'il a agi. Rien quand la ligne servie est
 * l'original, ni quand la traduction est arrivée sans ses langues.
 */
export function captionLanguageLabel(caption: CallCaption, mode: CaptionsMode): string | null {
  if (caption.pair === null || captionText(caption, mode) === caption.original) return null;
  return `${languageCode(caption.pair.from)} → ${languageCode(caption.pair.to)}`;
}

/**
 * Fusion par identifiant d'énoncé : une révision partielle remplace la
 * précédente, un final ne redevient jamais partiel, une traduction arrivée
 * une fois reste, et le journal se trie par l'heure de capture.
 */
export function mergeCaption(journal: readonly CallCaption[], incoming: CallCaption): readonly CallCaption[] {
  const existing = journal.find((caption) => caption.id === incoming.id);
  const merged: CallCaption =
    existing === undefined
      ? incoming
      : {
          ...existing,
          speakerName: incoming.speakerName !== '' ? incoming.speakerName : existing.speakerName,
          original: existing.isFinal && !incoming.isFinal ? existing.original : incoming.original,
          translated: incoming.translated ?? existing.translated,
          pair: incoming.translated === null ? existing.pair : incoming.pair,
          isFinal: existing.isFinal || incoming.isFinal,
          at: Math.min(existing.at, incoming.at),
        };
  const others = journal.filter((caption) => caption.id !== incoming.id);
  return [...others, merged].sort((left, right) => left.at - right.at).slice(-CAPTIONS_JOURNAL_KEPT);
}

/** Les lignes du bandeau : les dernières dites, quel que soit le locuteur. */
export function overlayCaptions(journal: readonly CallCaption[]): readonly CallCaption[] {
  return journal.slice(-CAPTIONS_OVERLAY_LINES);
}

/**
 * `TranscriptionCapturePolicy` d'iOS : quelqu'un écoute quand MON panneau est
 * ouvert ou qu'un pair ENCORE dans l'appel a signalé le sien.
 */
export function someoneListens(params: { readonly mode: CaptionsMode; readonly peers: readonly string[]; readonly members: Readonly<Record<string, unknown>> }): boolean {
  return params.mode !== 'off' || params.peers.some((peer) => params.members[peer] !== undefined);
}

export function captureAction(listening: boolean, capturing: boolean): 'start' | 'stop' | 'none' {
  if (listening && !capturing) return 'start';
  if (!listening && capturing) return 'stop';
  return 'none';
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** `call:translated-segment` (`CallTranslatedSegmentEvent`) — le locuteur est estampillé par la passerelle. */
export function decodeTranslatedSegment(payload: unknown): { readonly callId: string; readonly caption: Omit<CallCaption, 'mine'>; readonly speakerName: string | null } | null {
  if (!isRecord(payload) || !isRecord(payload.segment)) return null;
  const segment = payload.segment;
  const callId = text(payload.callId);
  const speakerId = text(segment.speakerId);
  const original = text(segment.text);
  if (callId === null || speakerId === null || original === null) return null;
  const startMs = finite(segment.startMs) ?? 0;
  const translated = text(segment.translatedText);
  const served = translated !== null && translated !== original ? translated : null;
  const from = text(segment.sourceLanguage);
  const to = text(segment.targetLanguage);
  return {
    callId,
    speakerName: text(segment.speakerDisplayName),
    caption: {
      id: text(segment.id) ?? `${speakerId}:${startMs}`,
      speakerId,
      speakerName: text(segment.speakerDisplayName) ?? '',
      original,
      translated: served,
      pair: served !== null && from !== null && to !== null ? { from, to } : null,
      isFinal: segment.isFinal !== false,
      at: finite(segment.capturedAtMs) ?? 0,
    },
  };
}

/** `call:transcription-active` (`CallTranscriptionActiveBroadcast`). */
export function decodeTranscriptionActive(payload: unknown): { readonly callId: string; readonly speakerId: string; readonly active: boolean } | null {
  if (!isRecord(payload)) return null;
  const callId = text(payload.callId);
  const speakerId = text(payload.speakerId);
  if (callId === null || speakerId === null || typeof payload.active !== 'boolean') return null;
  return { callId, speakerId, active: payload.active };
}

export type ChannelInbound =
  | { readonly kind: 'bye' }
  | { readonly kind: 'entry'; readonly id: string; readonly callId: string; readonly text: string; readonly speakerName: string; readonly at: number; readonly isFinal: boolean };

/**
 * Un message du canal de données `transcription` (`DataChannelInbound` d'iOS) :
 * `bye` (raccroché du pair), `transcript-entry` (une ligne du journal), le
 * reste — `ping`, une version future — est du bruit.
 */
export function decodeChannelMessage(raw: unknown): ChannelInbound | null {
  if (typeof raw !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.type === 'bye') return { kind: 'bye' };
  if (parsed.type !== 'transcript-entry' || !isRecord(parsed.entry)) return null;
  const entry = parsed.entry;
  const id = text(entry.id);
  const callId = text(entry.callId);
  const said = text(entry.text);
  if (id === null || callId === null || said === null) return null;
  return { kind: 'entry', id, callId, text: said, speakerName: text(entry.speakerDisplayName) ?? '', at: finite(entry.capturedAtMs) ?? 0, isFinal: entry.isFinal !== false };
}

export type Utterance = {
  readonly id: string;
  readonly callId: string;
  readonly speakerId: string;
  readonly speakerName: string;
  readonly text: string;
  readonly language: string;
  readonly confidence: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly capturedAtMs: number;
  readonly isFinal: boolean;
};

const SEGMENT_TEXT_MAX = 5000;

const bounded = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** La charge de `call:transcription-segment`, aux bornes de `socketTranscriptionSegmentSchema`. */
export function segmentEvent(utterance: Utterance): CallTranscriptionSegmentEvent {
  const startMs = Math.max(0, Math.round(utterance.startMs));
  return {
    callId: utterance.callId,
    segment: {
      id: utterance.id,
      text: utterance.text.slice(0, SEGMENT_TEXT_MAX),
      speakerId: utterance.speakerId,
      startMs,
      endMs: Math.max(startMs, Math.round(utterance.endMs)),
      isFinal: utterance.isFinal,
      confidence: bounded(utterance.confidence),
      language: utterance.language,
      capturedAtMs: Math.max(0, Math.round(utterance.capturedAtMs)),
    },
  };
}

/** L'entrée P2P du canal de données (`CallTranscriptDataChannelMessage`). */
export function transcriptEntryMessage(utterance: Utterance): CallTranscriptDataChannelMessage {
  return {
    type: 'transcript-entry',
    entry: {
      id: utterance.id,
      callId: utterance.callId,
      speakerId: utterance.speakerId,
      speakerDisplayName: utterance.speakerName,
      text: utterance.text.slice(0, SEGMENT_TEXT_MAX),
      language: utterance.language,
      capturedAtMs: Math.max(0, Math.round(utterance.capturedAtMs)),
      isFinal: utterance.isFinal,
      confidence: bounded(utterance.confidence),
    },
  };
}
