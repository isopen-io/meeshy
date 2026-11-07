import { CALL_SCREEN_CAPTURE_DEDUPE_MS, type CallCaptureEventKind } from '@meeshy/shared/types/call-capture';
import { CALL_RECORDING_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/call-recording-event-names';

import { CAPTIONS_OVERLAY_LINES, type CallCaption } from './call-captions';
import type { ActiveCall } from './call-store';

/**
 * **CE QUE LE JOURNAL D'UN APPEL GARDE À CÔTÉ DE LA PAROLE** (#16665, loi 13
 * de `docs/product/appels-vue-finale.md`) — une capture d'écran d'un pair
 * (`call:screen-capture-alert`) et les deux moments de l'enregistrement consenti
 * (`call:recording-started` / `-stopped`). Écrites par le moteur seul, comme le
 * reste de l'appel, elles se rangent à leur heure parmi les phrases : dans le
 * bandeau des sous-titres (R1), dans le Journal, et dans celui d'après l'appel
 * que la passerelle relit (`captures`).
 */

export type CallJournalNote = {
  readonly id: string;
  readonly kind: CallCaptureEventKind;
  /** L'auteur — `null` pour un moment d'enregistrement que personne n'a demandé. */
  readonly userId: string | null;
  /** Son nom à l'heure de la note : il survit à son départ de l'appel. */
  readonly name: string | null;
  readonly at: number;
};

export type CallJournalEntry =
  | { readonly type: 'caption'; readonly caption: CallCaption; readonly at: number }
  | { readonly type: 'note'; readonly note: CallJournalNote; readonly at: number };

/** Un appel de trois heures ne garde pas mille captures en mémoire. */
const MAX_NOTES = 200;

const isScreenCapture = (kind: CallCaptureEventKind): boolean => kind === 'recording' || kind === 'screenshot';

const repeats = (notes: readonly CallJournalNote[], note: CallJournalNote): boolean =>
  notes.some(
    (known) =>
      known.id === note.id ||
      (isScreenCapture(note.kind) && known.kind === note.kind && known.userId === note.userId && Math.abs(note.at - known.at) < CALL_SCREEN_CAPTURE_DEDUPE_MS),
  );

export function withJournalNote(call: ActiveCall, note: CallJournalNote): ActiveCall {
  const notes = call.journalNotes ?? [];
  if (repeats(notes, note)) return call;
  const name = note.name ?? (note.userId === null ? null : (call.members[note.userId]?.name ?? null));
  return { ...call, journalNotes: [...notes, { ...note, name }].slice(-MAX_NOTES) };
}

type Payload = Readonly<Record<string, unknown>>;

const recordOf = (value: unknown): Payload | null => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Payload) : null);

const text = (payload: Payload, key: string): string | null => {
  const value = payload[key];
  return typeof value === 'string' && value !== '' ? value : null;
};

/** La note d'un moment de l'enregistrement consenti ; un arrêt avant tout démarrage n'en laisse aucune. */
export function recordingNote(event: string, raw: unknown, at: number): { readonly callId: string; readonly note: CallJournalNote } | null {
  const payload = recordOf(raw);
  const callId = payload === null ? null : text(payload, 'callId');
  const recordingId = payload === null ? null : text(payload, 'recordingId');
  if (payload === null || callId === null || recordingId === null) return null;
  if (event === CALL_RECORDING_SERVER_EVENTS.CALL_RECORDING_STARTED) {
    return { callId, note: { id: `rec-start:${recordingId}`, kind: 'call-recording-started', userId: text(payload, 'recorderId'), name: null, at } };
  }
  if (event === CALL_RECORDING_SERVER_EVENTS.CALL_RECORDING_STOPPED && payload.wasRecording === true) {
    return { callId, note: { id: `rec-stop:${recordingId}`, kind: 'call-recording-stopped', userId: text(payload, 'byUserId'), name: null, at } };
  }
  return null;
}

/** Les phrases et les notes à leur heure ; à heure égale, l'ordre d'arrivée. */
export function journalEntries(captions: readonly CallCaption[], notes: readonly CallJournalNote[]): readonly CallJournalEntry[] {
  const entries: readonly CallJournalEntry[] = [
    ...captions.map((caption): CallJournalEntry => ({ type: 'caption', caption, at: caption.at })),
    ...notes.map((note): CallJournalEntry => ({ type: 'note', note, at: note.at })),
  ];
  return [...entries].sort((left, right) => left.at - right.at);
}

/** Ce que montre le bandeau : les dernières entrées du journal, phrases et notes mêlées. */
export function overlayEntries(captions: readonly CallCaption[], notes: readonly CallJournalNote[]): readonly CallJournalEntry[] {
  return journalEntries(captions, notes).slice(-CAPTIONS_OVERLAY_LINES);
}
