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
/** `sealed` : la conversation est chiffrée de bout en bout, ou son régime ne se lit pas — rien ne se capte ni ne part (#13720). */
export type TranscriptionState = 'idle' | 'listening' | 'unsupported' | 'denied' | 'sealed';

export type CaptionLanguagePair = { readonly from: string; readonly to: string };

/**
 * La langue D'ORIGINE d'une phrase d'un autre (miroir d'iOS `CallCaptionLine.originLanguage`
 * / `awaitingUntil`) : `foreign` dit qu'elle est HORS du Prisme du lecteur — donc étiquetée
 * (« EN ») —, `awaitingUntil` l'heure (horloge locale) où l'attente d'une traduction retombe.
 */
export type CaptionOrigin = { readonly language: string; readonly foreign: boolean; readonly awaitingUntil: number | null };

/** Le temps que la passerelle a pour rendre une traduction : passé ce délai, la phrase reste dans sa langue (miroir d'iOS `CallCaptionTranslationWait`). */
export const TRANSLATION_WAIT_MS = 8_000;

export type CallCaption = {
  readonly id: string;
  readonly speakerId: string;
  readonly speakerName: string;
  readonly original: string;
  /** La traduction servie par la passerelle dans la langue du lecteur — `null` tant qu'aucune n'est arrivée. */
  readonly translated: string | null;
  /** Les langues de cette traduction (`sourceLanguage` → `targetLanguage`), arrivées avec elle — `null` sans traduction (#8393). */
  readonly pair: CaptionLanguagePair | null;
  /** La langue dite par un AUTRE (`null` : la mienne, ou inconnue) — arrivée avec l'original, avant toute traduction. */
  readonly origin?: CaptionOrigin | null;
  readonly isFinal: boolean;
  /** L'horloge murale de capture chez le locuteur — la clé d'ordre du journal. */
  readonly at: number;
  readonly mine: boolean;
};

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

const sameLanguage = (a: string, b: string): boolean => languageCode(a) === languageCode(b);

/**
 * La langue d'une phrase d'un autre, au regard du Prisme du lecteur (`prism`, la descente
 * de `resolveReaderLanguages`) : étrangère quand aucune langue du lecteur n'est la sienne,
 * et alors une traduction est attendue si la phrase est FINALE et sans traduction encore.
 * Un Prisme vide n'attend rien (rien ne dit vers quelle langue traduire).
 */
export function captionOrigin(params: { readonly language: string | null; readonly isFinal: boolean; readonly translated: string | null; readonly prism: readonly string[]; readonly now: number }): CaptionOrigin | null {
  const { language, isFinal, translated, prism, now } = params;
  if (language === null) return null;
  const foreign = !prism.some((spoken) => sameLanguage(spoken, language));
  const awaiting = foreign && isFinal && translated === null && prism.length > 0;
  return { language, foreign, awaitingUntil: awaiting ? now + TRANSLATION_WAIT_MS : null };
}

/** Une traduction est-elle encore attendue à l'instant `now` ? L'attente retombe à son échéance, l'étiquette de la langue reste. */
export function isAwaitingTranslation(caption: CallCaption, now: number): boolean {
  const until = caption.origin?.awaitingUntil ?? null;
  return !caption.mine && caption.translated === null && until !== null && now < until;
}

/**
 * La petite étiquette de langue d'une ligne (#8393, planche P3-P5) : « EN → FR » quand la
 * ligne LUE est une traduction — le Prisme reste discret mais dit qu'il a agi —, « EN »
 * seule quand elle est l'original d'une langue hors du Prisme. Rien pour ma parole, une
 * langue que je lis déjà, ni une traduction arrivée sans ses langues.
 */
export function captionLanguageLabel(caption: CallCaption, mode: CaptionsMode): string | null {
  if (caption.pair !== null && captionText(caption, mode) !== caption.original) return `${languageCode(caption.pair.from)} → ${languageCode(caption.pair.to)}`;
  const origin = caption.origin ?? null;
  return caption.mine || origin === null || !origin.foreign ? null : languageCode(origin.language);
}

/** Range une ligne à sa place par l'heure de capture — le plus souvent à la fin, sans retrier tout le journal. */
function placed(journal: readonly CallCaption[], line: CallCaption): readonly CallCaption[] {
  const after = journal.findIndex((caption) => caption.at > line.at);
  return after === -1 ? [...journal, line] : [...journal.slice(0, after), line, ...journal.slice(after)];
}

/** Une traduction arrivée met fin à l'attente ; une répétition ne la prolonge pas ; le final d'une phrase d'abord partielle prend celle du final. */
function mergedOrigin(existing: CallCaption, incoming: CallCaption): CaptionOrigin | null {
  const base = incoming.origin ?? existing.origin ?? null;
  if (base === null) return null;
  const translated = incoming.translated ?? existing.translated;
  return { ...base, awaitingUntil: translated !== null ? null : (existing.origin?.awaitingUntil ?? incoming.origin?.awaitingUntil ?? null) };
}

/**
 * Fusion par identifiant d'énoncé : une révision partielle remplace la
 * précédente, un final ne redevient jamais partiel, une traduction arrivée
 * une fois reste, et le journal se range par l'heure de capture.
 *
 * Le journal garde TOUT l'appel (#8579) : il est le Journal qu'on relit
 * pendant l'appel, sans rien tronquer. Une ligne ne coûte que son texte ;
 * une révision se remplace EN PLACE, une ligne nouvelle s'insère à sa place
 * (en fin, le plus souvent), sans retrier.
 */
export function mergeCaption(journal: readonly CallCaption[], incoming: CallCaption): readonly CallCaption[] {
  const index = journal.findIndex((caption) => caption.id === incoming.id);
  const existing = index === -1 ? undefined : journal[index];
  const merged: CallCaption =
    existing === undefined
      ? incoming
      : {
          ...existing,
          speakerName: incoming.speakerName !== '' ? incoming.speakerName : existing.speakerName,
          original: existing.isFinal && !incoming.isFinal ? existing.original : incoming.original,
          translated: incoming.translated ?? existing.translated,
          pair: incoming.translated === null ? existing.pair : incoming.pair,
          origin: mergedOrigin(existing, incoming),
          isFinal: existing.isFinal || incoming.isFinal,
          at: Math.min(existing.at, incoming.at),
        };
  if (existing === undefined) return placed(journal, merged);
  if (merged.at === existing.at) return journal.map((caption, at) => (at === index ? merged : caption));
  return placed([...journal.slice(0, index), ...journal.slice(index + 1)], merged);
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
export function decodeTranslatedSegment(payload: unknown): { readonly callId: string; readonly caption: Omit<CallCaption, 'mine' | 'origin'>; readonly speakerName: string | null; readonly language: string | null } | null {
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
    language: from,
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
  | { readonly kind: 'entry'; readonly id: string; readonly callId: string; readonly text: string; readonly speakerName: string; readonly language: string | null; readonly at: number; readonly isFinal: boolean };

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
  return { kind: 'entry', id, callId, text: said, speakerName: text(entry.speakerDisplayName) ?? '', language: text(entry.language), at: finite(entry.capturedAtMs) ?? 0, isFinal: entry.isFinal !== false };
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
