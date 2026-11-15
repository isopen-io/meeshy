import { createStore, type StoreApi } from 'zustand/vanilla';

import {
  TALKIE_ERROR_CODES,
  TALKIE_MAX_CHUNK_BYTES,
  TALKIE_MAX_CHUNKS,
  TALKIE_MAX_DURATION_MS,
  TALKIE_MAX_TOTAL_BYTES,
  type TalkieCodec,
} from '@meeshy/shared/types/talkie-constants';
import { TALKIE_CLIENT_EVENTS, TALKIE_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/talkie-event-names';

import type { SocketClient } from '@/lib/net/socket';

import { decodeTalkieEnded } from './talkie-live';

/**
 * **ÉMETTRE LE TALKIE DEPUIS LE WEB** (#16641, sous-lot `proche-talkie@web`,
 * contrat `packages/shared/types/talkie.ts`).
 *
 * - **Appuyer** ouvre `talkie:start` ET le micro EN MÊME TEMPS : ce qui est capté
 *   avant l'accusé est gardé (borné par les plafonds du contrat) et part dès
 *   l'ouverture — le premier mot n'est jamais mangé par l'aller-retour.
 * - Chaque trame AAC ADTS (~21 ms) rejoint un fragment de ~250 ms ; un fragment
 *   part dès qu'il est plein (en durée ou en octets) : `talkie:send-chunk`,
 *   binaire natif, `seq` croissant, `capturedAt` pour mesurer la latence.
 * - **Relâcher** arrête le micro, vide ce qui reste, puis `talkie:end`.
 * - La durée maximale SERVIE ferme seule ; les plafonds d'octets et de fragments
 *   aussi, AVANT que le serveur ne coupe.
 * - Un `talkie:ended` qui porte MON `talkieId` (limite, coupure) arrête le micro.
 *   Un blocage posé par le destinataire ne prévient PAS l'émetteur (la passerelle
 *   ne lui dit rien) : ses fragments se perdent en silence, et c'est voulu.
 * - Les refus se rendent sans fuite : un blocage et un repli rendent le MÊME
 *   résultat (`voice`), l'interface ne propose que le message vocal.
 */

export const TALKIE_WEB_CODEC: TalkieCodec = 'aac-adts';
/** Un fragment part toutes les ~250 ms : assez court pour la voix « en direct », assez long pour peu d'événements. */
export const TALKIE_FRAGMENT_MS = 250;
/** Un accusé de `talkie:start` qui tarde au-delà : la socket est tenue pour tombée. */
export const TALKIE_START_ACK_MS = 5_000;

export type TalkieCapture = {
  /** Arrête le micro ; rend la main une fois les dernières trames remises à `onFrame`. */
  stop(): Promise<void>;
};

export type TalkieCaptureFactory = (params: { readonly onFrame: (bytes: Uint8Array, durationMs: number) => void }) => Promise<TalkieCapture>;

export type TalkieSendOutcome = 'not-allowed' | 'voice' | 'e2ee' | 'rate-limited' | 'offline' | 'failed' | 'mic-denied' | 'limit';

export type TalkieSendPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'starting'; readonly toUserId: string }
  /** Le talkie ne passe pas (#16698, #17141) : la voix continue de s'enregistrer et partira en message vocal au relâcher. */
  | { readonly kind: 'recording-copy'; readonly toUserId: string }
  | { readonly kind: 'talking'; readonly toUserId: string; readonly talkieId: string; readonly delivery: TalkieDelivery };

/**
 * `live` : le destinataire est connecté, sa voix sort tout de suite. `waking` (#17144) : il ne l'est pas mais il est
 * joignable par push — la passerelle garde la voix et le réveille (« Réveil de X… »). Absent (passerelle antérieure) :
 * `live`.
 */
export type TalkieDelivery = 'live' | 'waking';

export type TalkieSenderState = { readonly phase: TalkieSendPhase };

export type TalkieSender = {
  readonly store: StoreApi<TalkieSenderState>;
  press(toUserId: string): void;
  release(): Promise<void>;
  /**
   * La passerelle a fermé une prise de parole : si c'est la mienne, tout s'arrête. `joined` (voix réveillée seulement) :
   * `false` ⇒ personne ne l'a entendue, elle part en copie vocale.
   */
  ended(talkieId: string, reason: 'sender' | 'limit' | 'cut', joined?: boolean): void;
};

/**
 * La copie vocale d'un talkie qui n'a pas été entendu (#16698) : les trames AAC ADTS captées, leur durée, le
 * destinataire, et la conversation que la passerelle a nommée (`TalkieStartAck.conversationId`) — `null` : le client
 * choisit la conversation partagée la plus récente.
 */
export type TalkieVoiceCopy = {
  readonly frames: readonly Uint8Array[];
  readonly durationMs: number;
  readonly toUserId: string;
  readonly conversationId: string | null;
};

/** Envoie la copie en message vocal ; rend `false` si elle n'est pas partie. */
export type TalkieVoiceCopier = (copy: TalkieVoiceCopy) => Promise<boolean>;

/** Les voix réveillées closes dont on attend encore le verdict `joined` : au-delà, la plus ancienne est oubliée. */
const AWAITING_JOIN_CAP = 4;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const REFUSALS: Readonly<Record<string, TalkieSendOutcome>> = {
  [TALKIE_ERROR_CODES.NOT_ALLOWED]: 'not-allowed',
  [TALKIE_ERROR_CODES.BLOCKED]: 'voice',
  [TALKIE_ERROR_CODES.FALLBACK_VOICE]: 'voice',
  [TALKIE_ERROR_CODES.E2EE_CONVERSATION]: 'e2ee',
  [TALKIE_ERROR_CODES.RATE_LIMITED]: 'rate-limited',
};

export const outcomeOfRefusal = (code: unknown): TalkieSendOutcome => (typeof code === 'string' ? REFUSALS[code] : undefined) ?? 'failed';

type Opened = { readonly talkieId: string; readonly maxDurationMs: number; readonly maxChunkBytes: number; readonly delivery: TalkieDelivery };

type Wire = Readonly<Record<string, unknown>>;
const objectOf = (raw: unknown): Wire | null => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Wire) : null);
const positive = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback);

type Refused = { readonly refused: TalkieSendOutcome; readonly conversationId: string | null };

function decodeStartAck(raw: unknown): Opened | Refused {
  const ack = objectOf(raw);
  const data = objectOf(ack?.data);
  if (ack?.success !== true || data === null || typeof data.talkieId !== 'string' || data.talkieId === '') {
    const conversationId = typeof ack?.conversationId === 'string' && OBJECT_ID.test(ack.conversationId) ? ack.conversationId : null;
    return { refused: outcomeOfRefusal(ack?.code), conversationId };
  }
  return {
    talkieId: data.talkieId,
    maxDurationMs: Math.min(positive(data.maxDurationMs, TALKIE_MAX_DURATION_MS), TALKIE_MAX_DURATION_MS),
    maxChunkBytes: Math.min(positive(data.maxChunkBytes, TALKIE_MAX_CHUNK_BYTES), TALKIE_MAX_CHUNK_BYTES),
    delivery: data.delivery === 'waking' ? 'waking' : 'live',
  };
}

type Fragment = { readonly frames: readonly Uint8Array[]; readonly bytes: number; readonly durationMs: number; readonly capturedAt: number };

const EMPTY_FRAGMENT: Fragment = { frames: [], bytes: 0, durationMs: 0, capturedAt: 0 };

const joined = (fragment: Fragment): Uint8Array => {
  const out = new Uint8Array(fragment.bytes);
  fragment.frames.reduce((offset, frame) => {
    out.set(frame, offset);
    return offset + frame.byteLength;
  }, 0);
  return out;
};

/** Une prise de parole, de l'appui à sa fin : ses fragments, ses compteurs, son micro. */
type Session = {
  readonly toUserId: string;
  opened: Opened | null;
  capture: TalkieCapture | null;
  /** Le micro remet encore ses trames (vrai jusqu'à son arrêt complet). */
  accepting: boolean;
  released: boolean;
  finishing: boolean;
  /** Fragments pleins, en attente de l'accusé. */
  queue: readonly Fragment[];
  current: Fragment;
  seq: number;
  sentBytes: number;
  cancelLimit: (() => void) | null;
  /** Le talkie est refusé en voix : on n'émet plus, on enregistre pour la copie vocale. */
  copying: boolean;
  conversationId: string | null;
  /** Toutes les trames captées, gardées tant qu'une copie peut être demandée (repli ou réveil). */
  kept: readonly Uint8Array[];
  keptBytes: number;
  keptMs: number;
};

type Kept = { readonly frames: readonly Uint8Array[]; readonly durationMs: number; readonly toUserId: string };

export function createTalkieSender({
  socket,
  capture,
  now = Date.now,
  schedule = (run, ms) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
  onOutcome,
  copier,
}: {
  readonly socket: () => SocketClient | null;
  readonly capture: TalkieCaptureFactory;
  readonly now?: () => number;
  readonly schedule?: (run: () => void, ms: number) => () => void;
  readonly onOutcome: (outcome: TalkieSendOutcome) => void;
  readonly copier: TalkieVoiceCopier;
}): TalkieSender {
  const store = createStore<TalkieSenderState>(() => ({ phase: { kind: 'idle' } }));
  let session: Session | null = null;
  /** Voix réveillées closes, en attente de `joined`. */
  const awaitingJoin = new Map<string, Kept>();
  /** Verdicts `joined` arrivés avant que la prise de parole n'ait fini de se fermer. */
  const earlyVerdicts = new Map<string, boolean>();

  const sendCopy = async (copy: TalkieVoiceCopy): Promise<void> => {
    const sent = copy.frames.length > 0 && (await copier(copy).catch(() => false));
    onOutcome(sent ? 'voice' : 'failed');
  };

  const limitOf = (s: Session): number => s.opened?.maxChunkBytes ?? TALKIE_MAX_CHUNK_BYTES;

  const transmit = (s: Session, fragment: Fragment): boolean => {
    const live = socket();
    if (s.opened === null || live === null || fragment.bytes === 0) return true;
    if (s.seq + 1 > TALKIE_MAX_CHUNKS || s.sentBytes + fragment.bytes > TALKIE_MAX_TOTAL_BYTES) return false;
    live.emit(TALKIE_CLIENT_EVENTS.TALKIE_SEND_CHUNK, { talkieId: s.opened.talkieId, seq: s.seq, capturedAt: fragment.capturedAt, data: joined(fragment) });
    s.seq += 1;
    s.sentBytes += fragment.bytes;
    return true;
  };

  const dispatch = (s: Session, fragment: Fragment): void => {
    if (s.opened === null) {
      const queued = s.queue.reduce((total, f) => total + f.bytes, 0);
      if (queued + fragment.bytes <= TALKIE_MAX_TOTAL_BYTES) s.queue = [...s.queue, fragment];
      return;
    }
    if (!transmit(s, fragment)) void finish(s, 'limit');
  };

  const onFrame =
    (s: Session) =>
    (bytes: Uint8Array, durationMs: number): void => {
      if (!s.accepting || bytes.byteLength === 0) return;
      if (s.keptBytes + bytes.byteLength <= TALKIE_MAX_TOTAL_BYTES) {
        s.kept = [...s.kept, bytes];
        s.keptBytes += bytes.byteLength;
        s.keptMs += durationMs;
      }
      if (s.copying) return;
      if (s.current.bytes > 0 && s.current.bytes + bytes.byteLength > limitOf(s)) {
        dispatch(s, s.current);
        s.current = EMPTY_FRAGMENT;
      }
      const capturedAt = s.current.bytes === 0 ? now() : s.current.capturedAt;
      s.current = { frames: [...s.current.frames, bytes], bytes: s.current.bytes + bytes.byteLength, durationMs: s.current.durationMs + durationMs, capturedAt };
      if (s.current.durationMs >= TALKIE_FRAGMENT_MS) {
        dispatch(s, s.current);
        s.current = EMPTY_FRAGMENT;
      }
    };

  /** Arrête le micro : ses dernières trames rejoignent le fragment courant, puis plus rien n'entre. */
  const stopMic = async (s: Session): Promise<void> => {
    const mic = s.capture;
    s.capture = null;
    await mic?.stop().catch(() => undefined);
    s.accepting = false;
  };

  const settleIdle = (s: Session, outcome: TalkieSendOutcome | null): void => {
    s.cancelLimit?.();
    if (session === s) {
      session = null;
      store.setState({ phase: { kind: 'idle' } });
    }
    if (outcome !== null) onOutcome(outcome);
  };

  /** Ferme une prise de parole OUVERTE : micro arrêté, reste vidé, `talkie:end` (sauf si le serveur l'a déjà close), repos. */
  async function finish(s: Session, outcome: TalkieSendOutcome | null, { notify = true }: { readonly notify?: boolean } = {}): Promise<void> {
    if (s.finishing) return;
    s.finishing = true;
    s.cancelLimit?.();
    if (!notify) s.accepting = false;
    await stopMic(s);
    if (s.opened !== null && notify) {
      transmit(s, s.current);
      socket()?.emit(TALKIE_CLIENT_EVENTS.TALKIE_END, { talkieId: s.opened.talkieId });
    }
    s.current = EMPTY_FRAGMENT;
    settleIdle(s, outcome);
    if (s.opened?.delivery === 'waking') await awaitVerdict(s.opened.talkieId, { frames: s.kept, durationMs: s.keptMs, toUserId: s.toUserId });
  }

  /** Une voix réveillée close : son verdict est peut-être déjà là, sinon elle l'attend (bornée). */
  async function awaitVerdict(talkieId: string, kept: Kept): Promise<void> {
    const verdict = earlyVerdicts.get(talkieId);
    earlyVerdicts.delete(talkieId);
    if (verdict === true) return;
    if (verdict === false) return sendCopy({ ...kept, conversationId: null });
    awaitingJoin.set(talkieId, kept);
    if (awaitingJoin.size > AWAITING_JOIN_CAP) {
      const oldest = awaitingJoin.keys().next().value;
      if (oldest !== undefined) awaitingJoin.delete(oldest);
    }
    return undefined;
  }

  /** Ferme l'enregistrement de repli : micro arrêté, repos, puis la voix part en message vocal. */
  async function finishCopy(s: Session): Promise<void> {
    if (s.finishing) return;
    s.finishing = true;
    s.cancelLimit?.();
    await stopMic(s);
    settleIdle(s, null);
    await sendCopy({ frames: s.kept, durationMs: s.keptMs, toUserId: s.toUserId, conversationId: s.conversationId });
  }

  const startCopy = (s: Session, conversationId: string | null): Promise<void> | undefined => {
    s.copying = true;
    s.conversationId = conversationId;
    s.queue = [];
    s.current = EMPTY_FRAGMENT;
    if (s.released) return finishCopy(s);
    store.setState({ phase: { kind: 'recording-copy', toUserId: s.toUserId } });
    s.cancelLimit = schedule(() => void finishCopy(s), TALKIE_MAX_DURATION_MS);
    return undefined;
  };

  const refuse = async (s: Session, outcome: TalkieSendOutcome): Promise<void> => {
    s.finishing = true;
    s.accepting = false;
    await stopMic(s);
    settleIdle(s, outcome);
  };

  const opened = (s: Session, ack: Opened): void => {
    s.opened = ack;
    if (s.finishing) return;
    store.setState({ phase: { kind: 'talking', toUserId: s.toUserId, talkieId: ack.talkieId, delivery: ack.delivery } });
    s.cancelLimit = schedule(() => void finish(s, 'limit'), ack.maxDurationMs);
    const pending = s.queue;
    s.queue = [];
    pending.forEach((fragment) => dispatch(s, fragment));
    if (s.released) void finish(s, null);
  };

  const press = (toUserId: string): void => {
    if (session !== null) return;
    const live = socket();
    if (live === null || !live.connected || live.emitWithAck === undefined) {
      onOutcome('offline');
      return;
    }
    const s: Session = {
      toUserId,
      opened: null,
      capture: null,
      accepting: true,
      released: false,
      finishing: false,
      queue: [],
      current: EMPTY_FRAGMENT,
      seq: 0,
      sentBytes: 0,
      cancelLimit: null,
      copying: false,
      conversationId: null,
      kept: [],
      keptBytes: 0,
      keptMs: 0,
    };
    session = s;
    store.setState({ phase: { kind: 'starting', toUserId } });

    const mic: Promise<boolean> = capture({ onFrame: onFrame(s) }).then(
      (handle) => {
        if (s.finishing || s.released) {
          s.accepting = false;
          void handle.stop().catch(() => undefined);
        } else s.capture = handle;
        return true;
      },
      () => false,
    );

    void live
      .emitWithAck(TALKIE_CLIENT_EVENTS.TALKIE_START, { toUserId, codec: TALKIE_WEB_CODEC }, TALKIE_START_ACK_MS)
      .then(
        (raw): Opened | Refused => decodeStartAck(raw),
        (): Refused => ({ refused: 'offline', conversationId: null }),
      )
      .then(async (verdict) => {
        const micReady = await mic;
        if ('refused' in verdict && verdict.refused === 'voice') return micReady ? startCopy(s, verdict.conversationId) : refuse(s, 'mic-denied');
        if ('refused' in verdict) return refuse(s, verdict.refused);
        if (!micReady) {
          s.opened = verdict;
          return finish(s, 'mic-denied');
        }
        return opened(s, verdict);
      });
  };

  const release = async (): Promise<void> => {
    const s = session;
    if (s === null || s.released) return;
    s.released = true;
    if (s.copying) return finishCopy(s);
    if (s.opened !== null) return finish(s, null);
    await stopMic(s);
    if (s.current.bytes > 0) {
      s.queue = [...s.queue, s.current];
      s.current = EMPTY_FRAGMENT;
    }
    return undefined;
  };

  const ended = (talkieId: string, reason: 'sender' | 'limit' | 'cut', joined?: boolean): void => {
    const waiting = awaitingJoin.get(talkieId);
    if (waiting !== undefined && joined !== undefined) {
      awaitingJoin.delete(talkieId);
      if (!joined) void sendCopy({ ...waiting, conversationId: null });
      return;
    }
    const s = session;
    if (s === null || s.opened?.talkieId !== talkieId) return;
    if (joined !== undefined && s.opened.delivery === 'waking') earlyVerdicts.set(talkieId, joined);
    void finish(s, reason === 'sender' ? null : reason === 'limit' ? 'limit' : 'failed', { notify: false });
  };

  return { store, press, release, ended };
}

/** Écoute la socket vivante : une fin servie pour MA prise de parole arrête le micro. */
export function bindTalkieSender({ socket, sender }: { readonly socket: SocketClient; readonly sender: TalkieSender }): () => void {
  const onEnded = (payload: unknown): void => {
    const ended = decodeTalkieEnded(payload);
    if (ended !== null) sender.ended(ended.talkieId, ended.reason, ended.joined);
  };
  socket.on(TALKIE_SERVER_EVENTS.TALKIE_ENDED, onEnded);
  return () => socket.off(TALKIE_SERVER_EVENTS.TALKIE_ENDED, onEnded);
}
