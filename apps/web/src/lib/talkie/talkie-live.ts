import { createStore, type StoreApi } from 'zustand/vanilla';

import { TALKIE_CODECS, TALKIE_END_REASONS, type TalkieEndReason } from '@meeshy/shared/types/talkie-constants';
import type { TalkieEndedEventData, TalkieIncomingEventData } from '@meeshy/shared/types/talkie';
import { TALKIE_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/talkie-event-names';

import type { SocketClient } from '@/lib/net/socket';

import type { TalkieSink } from './talkie-player';

/**
 * **LES PRISES DE PAROLE REÇUES, SUR CET ONGLET** (#16638, sous-lot
 * `proche-talkie@web`, contrat `packages/shared/types/talkie.ts`).
 *
 * - `talkie:incoming` (room `user:<moi>`) ouvre une prise de parole ; il ne porte
 *   aucun nom : l'hôte nomme l'émetteur par ses propres caches.
 * - `talkie:chunk` se JOUE dès son arrivée ({@link TalkieSink}), dans l'ordre des
 *   `seq` : un doublon ou un fragment en retard ne rejoue rien.
 * - `talkie:ended` ferme : `sender` / `limit` laissent finir ce qui est en file,
 *   `cut` (blocage, réglage, appel) fait taire SUR-LE-CHAMP.
 * - Sans `talkie:ended` (socket coupée), la prise de parole se ferme passé
 *   `maxDurationMs`, comptés à l'horloge de CET onglet depuis la réception —
 *   jamais à `startedAt`, qu'une horloge d'appareil décalée fausserait.
 * - Une prise de parole close ne se rouvre pas : sa trace est gardée, bornée.
 *
 * Le serveur a déjà jugé (niveau ≥ Proche, réception non coupée, hors E2EE) : ce
 * client ne rejuge rien, il ne fait que jouer ce qui lui est adressé.
 */

export type LiveTalkie = Pick<TalkieIncomingEventData, 'talkieId' | 'fromUserId' | 'maxDurationMs'> & {
  /** Horloge locale de la réception (ms epoch) : base de l'expiration. */
  readonly openedAt: number;
};

export type TalkieState = {
  /** Les prises de parole qui sonnent ICI, la plus ancienne d'abord. */
  readonly active: readonly LiveTalkie[];
  open(incoming: TalkieIncomingEventData): void;
  close(talkieId: string): void;
  /** Ferme ce qui a passé sa durée maximale ; rend les prises de parole fermées, que l'hôte fait taire. */
  expire(): readonly string[];
  /** Le délai avant la prochaine expiration (ms), ou `null` sans prise de parole. */
  msUntilExpiry(): number | null;
  /** Le dernier `seq` joué de cette prise de parole, ou `null` si elle n'est pas ouverte ici. */
  lastSeq(talkieId: string): number | null;
  played(talkieId: string, seq: number): void;
};

export type TalkieStoreApi = StoreApi<TalkieState>;

/** Assez pour qu'un événement en retard d'une prise de parole close ne la rouvre pas ; borné, rien ne grossit. */
const CLOSED_MEMORY = 64;
/** La marge au-delà de `maxDurationMs` : le dernier fragment et `talkie:ended` voyagent encore. */
const EXPIRY_GRACE_MS = 3_000;

export function createTalkieStore({ now = Date.now }: { readonly now?: () => number } = {}): TalkieStoreApi {
  let closed: readonly string[] = [];
  const seqs = new Map<string, number>();
  const remember = (talkieId: string): void => {
    closed = [...closed.filter((id) => id !== talkieId), talkieId].slice(-CLOSED_MEMORY);
    seqs.delete(talkieId);
  };
  const deadlineOf = (entry: LiveTalkie): number => entry.openedAt + entry.maxDurationMs + EXPIRY_GRACE_MS;
  const live = (entry: LiveTalkie): boolean => deadlineOf(entry) > now();
  return createStore<TalkieState>((set, get) => ({
    active: [],
    open: (incoming) =>
      set((state) => {
        if (closed.includes(incoming.talkieId) || state.active.some((entry) => entry.talkieId === incoming.talkieId)) return state;
        seqs.set(incoming.talkieId, -1);
        const entry: LiveTalkie = { talkieId: incoming.talkieId, fromUserId: incoming.fromUserId, maxDurationMs: incoming.maxDurationMs, openedAt: now() };
        return { active: [...state.active, entry] };
      }),
    close: (talkieId) =>
      set((state) => {
        remember(talkieId);
        return { active: state.active.filter((entry) => entry.talkieId !== talkieId) };
      }),
    expire: () => {
      const gone = get().active.filter((entry) => !live(entry)).map((entry) => entry.talkieId);
      gone.forEach((talkieId) => get().close(talkieId));
      return gone;
    },
    msUntilExpiry: () => {
      const deadlines = get().active.map(deadlineOf);
      return deadlines.length === 0 ? null : Math.max(0, Math.min(...deadlines) - now());
    },
    lastSeq: (talkieId) => seqs.get(talkieId) ?? null,
    played: (talkieId, seq) => {
      if (seqs.has(talkieId)) seqs.set(talkieId, seq);
    },
  }));
}

type Wire = Readonly<Record<string, unknown>>;

const objectOf = (raw: unknown): Wire | null => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Wire) : null);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const countOf = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null);

const bytesOf = (value: unknown): Uint8Array | null => {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
};

export function decodeTalkieIncoming(raw: unknown): TalkieIncomingEventData | null {
  const wire = objectOf(raw);
  const talkieId = textOf(wire?.talkieId);
  const fromUserId = textOf(wire?.fromUserId);
  const startedAt = textOf(wire?.startedAt);
  const maxDurationMs = countOf(wire?.maxDurationMs);
  const codec = TALKIE_CODECS.find((candidate) => candidate === wire?.codec);
  if (talkieId === null || fromUserId === null || startedAt === null || maxDurationMs === null || codec === undefined) return null;
  return { talkieId, fromUserId, codec, startedAt, maxDurationMs };
}

export type DecodedTalkieChunk = { readonly talkieId: string; readonly fromUserId: string; readonly seq: number; readonly data: Uint8Array };

export function decodeTalkieChunk(raw: unknown): DecodedTalkieChunk | null {
  const wire = objectOf(raw);
  const talkieId = textOf(wire?.talkieId);
  const fromUserId = textOf(wire?.fromUserId);
  const seq = countOf(wire?.seq);
  const data = bytesOf(wire?.data);
  if (talkieId === null || fromUserId === null || seq === null || data === null) return null;
  return { talkieId, fromUserId, seq, data };
}

export function decodeTalkieEnded(raw: unknown): TalkieEndedEventData | null {
  const wire = objectOf(raw);
  const [talkieId, fromUserId, toUserId, endedAt] = [wire?.talkieId, wire?.fromUserId, wire?.toUserId, wire?.endedAt].map(textOf);
  const reason = TALKIE_END_REASONS.find((candidate): candidate is TalkieEndReason => candidate === wire?.reason);
  if (talkieId == null || fromUserId == null || toUserId == null || endedAt == null || reason === undefined) return null;
  return { talkieId, fromUserId, toUserId, reason, endedAt };
}

export const talkieStore: TalkieStoreApi = createTalkieStore();

export function bindTalkieLive({
  socket,
  store,
  sink,
  viewerId,
}: {
  readonly socket: SocketClient;
  readonly store: TalkieStoreApi;
  readonly sink: TalkieSink;
  /** Le compte de cet onglet : sa propre voix (un autre de ses appareils) ne s'ouvre jamais ici. */
  readonly viewerId: () => string | null;
}): () => void {
  const onIncoming = (payload: unknown): void => {
    const incoming = decodeTalkieIncoming(payload);
    if (incoming !== null && incoming.fromUserId !== viewerId()) store.getState().open(incoming);
  };
  const onChunk = (payload: unknown): void => {
    const chunk = decodeTalkieChunk(payload);
    if (chunk === null) return;
    const state = store.getState();
    const owner = state.active.find((entry) => entry.talkieId === chunk.talkieId);
    const last = state.lastSeq(chunk.talkieId);
    if (owner === undefined || owner.fromUserId !== chunk.fromUserId || last === null || chunk.seq <= last) return;
    state.played(chunk.talkieId, chunk.seq);
    sink.play(chunk.talkieId, chunk.data);
  };
  const onEnded = (payload: unknown): void => {
    const ended = decodeTalkieEnded(payload);
    if (ended === null) return;
    store.getState().close(ended.talkieId);
    if (ended.reason === 'cut') sink.silence(ended.talkieId);
    else sink.release(ended.talkieId);
  };
  socket.on(TALKIE_SERVER_EVENTS.TALKIE_INCOMING, onIncoming);
  socket.on(TALKIE_SERVER_EVENTS.TALKIE_CHUNK, onChunk);
  socket.on(TALKIE_SERVER_EVENTS.TALKIE_ENDED, onEnded);
  return () => {
    socket.off(TALKIE_SERVER_EVENTS.TALKIE_INCOMING, onIncoming);
    socket.off(TALKIE_SERVER_EVENTS.TALKIE_CHUNK, onChunk);
    socket.off(TALKIE_SERVER_EVENTS.TALKIE_ENDED, onEnded);
  };
}
