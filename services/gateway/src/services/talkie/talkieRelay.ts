/**
 * LE RELAIS DU TALKIE (#13935, D-4) — chaque fragment repart vers le
 * destinataire À L'INSTANT où il arrive.
 *
 * ## Ce qui est sur le chemin critique, et ce qui n'y est pas
 *
 * L'ouverture (`start`) juge tout (`talkieGate.ts`) et compte le débit (limiteur
 * Redis existant). Un fragment, lui, ne touche jamais la base : il vérifie sa
 * session (en mémoire, sur l'instance qui porte la socket de l'émetteur — les
 * fragments arrivent par cette socket-là), RÉSERVE sa place dans les bornes, fait
 * UNE lecture de cache — la coupure posée par un blocage, quelle que soit
 * l'instance qui l'a reçu (`talkieCut.ts`) — puis repart. Rien n'est stocké : ni
 * fragment, ni copie, ni transcription. La copie en message vocal est l'affaire du
 * client, par le chemin vocal existant, après la prise de parole.
 *
 * ## Les bornes, tenues même en rafale
 *
 * 30 s par prise de parole (une minuterie la ferme même si l'émetteur se tait),
 * 16 Ko par fragment, 512 Ko et 300 fragments au total, numéros de séquence
 * strictement croissants. Séquence, octets et nombre sont RÉSERVÉS avant toute
 * attente : une rafale arrivée dans le même tour de boucle ne passe pas le
 * contrôle tout entière. Un fragment hors bornes est IGNORÉ ; dépasser la durée,
 * le total ou le nombre ferme la prise de parole (`limit`).
 *
 * ## Une voix scellée (#13949)
 *
 * Une voix scellée n'ouvre QUE si la passerelle l'accepte (`sealedVoiceAccepted`, éteint par défaut) :
 * tant qu'aucun client ne déchiffre, elle est refusée comme illisible, avant tout jugement. Acceptée, un
 * fragment scellé est relayé comme tout fragment, c'est-à-dire comme des octets que le relais ne lit pas
 * (ni transcription, ni normalisation, ni forme exigée). L'identifiant de clé de l'ouverture repart tel
 * quel dans `talkie:incoming`, sous l'encodage scellé (la clé, elle, voyage par le relais des signaux
 * E2EE), et le rejugement garde le sceau : une paire chiffrée ne coupe pas une voix scellée. Le dernier
 * fragment déclaré (`last`) repart déclaré.
 *
 * ## Ce qui change pendant qu'on parle
 *
 * La prise de parole est REJUGÉE en arrière-plan, au plus toutes les
 * `REJUDGE_EVERY_MS`, sur l'arrivée d'un fragment : préférence coupée, appel
 * décroché, Ne pas déranger, conversation passée en chiffrement de bout en bout,
 * lien redescendu, compte désactivé — elle est coupée (`cut`). Un rejugement qui ne
 * rend pas dans `REJUDGE_TIMEOUT_MS` coupe aussi (#14490). Le passage d'un tête-à-tête
 * en bout en bout n'attend pas ce rejugement : la route qui l'écrit pose la coupure
 * partagée (`cutTalkiesOnEndToEnd`, `talkieCut.ts`). La coupure d'un
 * blocage, elle, vaut dès l'instant où le jugement de l'ouverture a COMMENCÉ :
 * un blocage acquitté pendant ce jugement ferme aussi la session qui en naît.
 *
 * ## Un blocage coupe, et ne s'annonce pas
 *
 * La coupure n'est annoncée qu'au DESTINATAIRE de la voix (pour qu'il cesse de
 * jouer) ; l'émetteur n'en reçoit rien, ses fragments suivants sont ignorés.
 *
 * ## La voix qui réveille (#17142)
 *
 * Quand la porte rend `waking`, la session GARDE ses fragments en mémoire — bornés
 * par les mêmes plafonds, et par `TALKIE_WAKING_PROCESS_MAX_BYTES` pour tout le
 * processus — et UN réveil part (`wake`). Rien n'est émis vers le destinataire tant
 * qu'il n'a pas émis `talkie:join` : il reçoit alors, sur SA socket, `talkie:incoming`,
 * tous les fragments gardés dans l'ordre, puis le direct, puis `talkie:ended`. Une
 * voix finie (relâchée, au plafond, ou socket émettrice tombée — jamais coupée) reste rejoignable
 * `TALKIE_JOIN_WINDOW_MS`, puis son tampon est libéré ; finie sans que personne l'ait
 * rejointe, elle envoie un push de SUIVI (`followUp`) qui porte l'audio, et sa fin dit à
 * l'émetteur `joined: false` — son client crée alors la copie vocale. Au plus deux voix
 * réveillées par émetteur à la fois ; au-delà, ou processus plein, le repli. Le join, et
 * la lecture HTTP du tampon (`audioFor`), passent la MÊME garde : le destinataire seul,
 * aucune coupure depuis l'ouverture, et la porte rejugée. Rien n'est persisté.
 */
import { randomBytes } from 'node:crypto';
import {
  TALKIE_ERROR_CODES,
  TALKIE_FALLBACK_VOICE_MESSAGE,
  TALKIE_JOIN_WINDOW_MS,
  TALKIE_MAX_CHUNK_BYTES,
  TALKIE_MAX_CHUNKS,
  TALKIE_MAX_DURATION_MS,
  TALKIE_MAX_TOTAL_BYTES,
  TALKIE_SEALED_CODEC,
  talkieChunkPayloadSchema,
  talkieEndPayloadSchema,
  talkieJoinPayloadSchema,
  talkieStartPayloadSchema,
  type TalkieChunkEventData,
  type TalkieCodec,
  type TalkieDelivery,
  type TalkieEndedEventData,
  type TalkieSeal,
  type TalkieWireCodec,
  type TalkieEndReason,
  type TalkieIncomingEventData,
  type TalkieStartAck,
} from '@meeshy/shared/types/talkie';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ServerEmitArgs, ServerEmitIO } from '../../socketio/serverEmit';
import { TALKIE_NOT_ALLOWED, TALKIE_UNAVAILABLE, type TalkieRefusal, type TalkieVerdict, type TalkieWakeChannel, type TalkieWaking } from './talkieGate';
import { guardedTimeout } from '../../utils/guarded-timer';

/** La marge laissée au dernier fragment, en transit quand la minuterie tombe. */
const DURATION_GRACE_MS = 1_000;
/** Le rejugement d'arrière-plan d'une prise de parole ouverte. */
export const REJUDGE_EVERY_MS = 2_000;
/** Un rejugement qui n'a pas rendu dans ce délai coupe la voix (#14490) : un jugement muet ne la laisse pas filer. */
export const REJUDGE_TIMEOUT_MS = 2_000;
/** Tout ce que les voix réveillées de CE processus gardent en mémoire, ensemble. */
export const TALKIE_WAKING_PROCESS_MAX_BYTES = 32 * 1024 * 1024;
/** Les voix réveillées qu'un même émetteur garde à la fois : le réveil n'est pas une rafale de pushs. */
export const TALKIE_WAKING_PER_SENDER = 2;

type Waiting = {
  readonly buffer: TalkieChunkEventData[];
  readonly listeners: Set<string>;
  joined: boolean;
  ended: TalkieEndedEventData | null;
  expiry: ReturnType<typeof setTimeout> | null;
};

type Session = {
  readonly talkieId: string;
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly socketId: string;
  readonly codec: TalkieWireCodec;
  /** Voix scellée (#13949) : l'identifiant de clé, relayé sans être lu ; son absence ⇒ voix en clair. */
  readonly sealed: TalkieSeal | undefined;
  readonly startedAt: number;
  readonly delivery: TalkieDelivery;
  /** Les fragments gardés et les sockets qui ont rejoint : une voix réveillée seulement. */
  readonly waiting: Waiting | null;
  /** Une coupure posée à partir de cet instant vise la session : celui où son jugement a COMMENCÉ. */
  readonly cutFrom: number;
  bytes: number;
  chunks: number;
  /** Les fragments dont l'émission vers le destinataire n'a pas levé (#17252). */
  relayed: number;
  lastSeq: number;
  judgedAt: number;
  rejudging: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

export type TalkieRelayDeps = {
  readonly io: ServerEmitIO | undefined;
  /** `sealed` : la voix est scellée sur l'appareil (#13949) — seule elle passe dans une paire chiffrée. */
  readonly judge: (fromUserId: string, toUserId: string, sealed: boolean) => Promise<TalkieVerdict>;
  /**
   * La passerelle accepte-t-elle une voix scellée (#13949) ? Absent ⇒ NON (fail-closed) : tant qu'aucun client
   * déployé ne refuse une voix de paire chiffrée qui n'est pas scellée ET déchiffrable, aucune n'ouvre.
   */
  readonly sealedVoiceAccepted?: () => boolean;
  /** Le débit d'ouverture : `null` quand le compteur est injoignable (fail-closed). */
  readonly withinStartRate: (userId: string) => Promise<boolean | null>;
  /** L'instant de la DERNIÈRE coupure de la paire orientée, ou `null` ; LÈVE quand le cache partagé est injoignable. */
  readonly cutAt: (fromUserId: string, toUserId: string) => Promise<number | null>;
  readonly now: () => number;
  readonly report: (message: string, error: unknown) => void;
  /** Le push de réveil d'une voix `waking`, envoyé une fois à l'ouverture (#17142). */
  readonly wake?: (params: { readonly talkieId: string; readonly fromUserId: string; readonly toUserId: string; readonly channel: TalkieWakeChannel }) => Promise<void>;
  /** Le push de suivi d'une voix réveillée finie sans que personne l'ait rejointe : il porte l'audio. */
  readonly followUp?: (params: TalkieFollowUp) => Promise<void>;
  /** La conversation la plus récente de la paire, où le client émetteur enverra la copie vocale d'un repli (#17141). */
  readonly fallbackConversation?: (fromUserId: string, toUserId: string) => Promise<string | null>;
  /** Identifiants et compteurs seulement, jamais un octet de voix (#17252) : une perte se localise dans le journal. */
  readonly trace?: (event: TalkieTraceEvent, fields: Readonly<Record<string, unknown>>) => void;
};

export type TalkieTraceEvent = '[TALKIE_STARTED]' | '[TALKIE_RELAYED]' | '[TALKIE_ENDED]' | '[TALKIE_WAKING]' | '[TALKIE_JOINED]';

export type TalkieFollowUp = {
  readonly talkieId: string;
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly availableUntil: Date;
  readonly bytes: number;
  readonly durationMs: number;
};

export type TalkieJoinOutcome = 'joined' | 'unknown' | 'refused';
export type TalkieAudio =
  | { readonly ok: true; readonly codec: TalkieCodec; readonly data: Uint8Array }
  | { readonly ok: false; readonly reason: 'unknown' | 'refused' };

const refusal = (verdict: TalkieRefusal): TalkieStartAck => ({ success: false, error: verdict.message, code: verdict.code });
const INVALID: TalkieStartAck = { success: false, error: 'Charge illisible', code: TALKIE_ERROR_CODES.INVALID };
const WAKING_FULL: TalkieStartAck = { success: false, error: TALKIE_FALLBACK_VOICE_MESSAGE, code: TALKIE_ERROR_CODES.FALLBACK_VOICE };
const RATE_LIMITED: TalkieStartAck = { success: false, error: 'Trop de prises de parole', code: TALKIE_ERROR_CODES.RATE_LIMITED };

const byteLength = (data: Uint8Array | ArrayBuffer): number => data.byteLength;
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export class TalkieRelay {
  private readonly sessions = new Map<string, Session>();
  private readonly bySocket = new Map<string, string>();
  /** Les sockets dont une ouverture est en cours de jugement, et celles qui sont tombées pendant. */
  private readonly opening = new Map<string, number>();
  private readonly lostWhileOpening = new Set<string>();
  /** Les voix réveillées finies, rejoignables jusqu'à l'expiration de leur fenêtre. */
  private readonly finished = new Map<string, Session>();
  private buffered = 0;

  constructor(private readonly deps: TalkieRelayDeps) {}

  /** Le nombre de prises de parole ouvertes sur cette instance (témoins, métriques). */
  get openCount(): number {
    return this.sessions.size;
  }

  /** Les octets que les voix réveillées gardent en mémoire sur cette instance. */
  get bufferedBytes(): number {
    return this.buffered;
  }

  /** Le destinataire d'une voix réveillée encore rejoignable, ou `null`. */
  recipientOf(talkieId: string): string | null {
    const session = this.waitingSession(talkieId);
    return session ? session.toUserId : null;
  }

  async start(socketId: string, fromUserId: string, raw: unknown): Promise<TalkieStartAck> {
    const parsed = talkieStartPayloadSchema.safeParse(raw);
    if (!parsed.success) return INVALID;
    if (parsed.data.sealed !== undefined && this.deps.sealedVoiceAccepted?.() !== true) return INVALID;
    const toUserId = parsed.data.toUserId.toLowerCase();
    const cutFrom = this.deps.now();

    this.opening.set(socketId, (this.opening.get(socketId) ?? 0) + 1);
    let admitted: TalkieVerdict;
    try {
      const verdict = await this.admit(fromUserId, toUserId, cutFrom, parsed.data.sealed !== undefined);
      if ('success' in verdict) return verdict;
      if (this.lostWhileOpening.has(socketId)) return refusal(TALKIE_UNAVAILABLE);
      admitted = verdict;
    } finally {
      const left = (this.opening.get(socketId) ?? 1) - 1;
      if (left > 0) this.opening.set(socketId, left);
      else {
        this.opening.delete(socketId);
        this.lostWhileOpening.delete(socketId);
      }
    }

    const previous = this.bySocket.get(socketId);
    if (previous) this.close(previous, 'sender');

    const startedAt = this.deps.now();
    const waking: TalkieWaking | null = admitted.ok === true && admitted.delivery === 'waking' ? (admitted as TalkieWaking) : null;
    if (waking && !this.mayHoldAnotherVoice(fromUserId)) return this.withFallbackConversation(WAKING_FULL, fromUserId, toUserId);
    // Une voix scellée ne se met pas en tampon pour un réveil (#13949) : le push de suivi et sa lecture HTTP déclarent
    // de l'AAC, qu'elle n'est pas. Elle se replie en message vocal, qui suit le chemin vocal E2EE du client.
    if (waking && parsed.data.sealed !== undefined) return this.withFallbackConversation(WAKING_FULL, fromUserId, toUserId);
    const session: Session = {
      talkieId: randomBytes(12).toString('hex'),
      fromUserId,
      toUserId,
      socketId,
      codec: parsed.data.codec,
      sealed: parsed.data.sealed,
      startedAt,
      delivery: waking ? 'waking' : 'live',
      waiting: waking ? { buffer: [], listeners: new Set(), joined: false, ended: null, expiry: null } : null,
      cutFrom,
      bytes: 0,
      chunks: 0,
      relayed: 0,
      lastSeq: -1,
      judgedAt: startedAt,
      rejudging: false,
      timer: null,
    };
    session.timer = guardedTimeout({
      name: 'talkie-max-duration',
      run: () => this.close(session.talkieId, 'limit'),
      afterMs: TALKIE_MAX_DURATION_MS + DURATION_GRACE_MS,
      logger: { error: (message, error) => this.deps.report(message, error) },
    });
    session.timer.unref?.();
    this.sessions.set(session.talkieId, session);
    this.bySocket.set(socketId, session.talkieId);
    this.deps.trace?.('[TALKIE_STARTED]', {
      ...pairOf(session), delivery: session.delivery, codec: session.codec, sealed: session.sealed !== undefined,
    });

    if (waking) this.wakeRecipient(session, waking.channel);
    else this.sendTo(toUserId, SERVER_EVENTS.TALKIE_INCOMING, incomingOf(session));
    return {
      success: true,
      data: { talkieId: session.talkieId, maxDurationMs: TALKIE_MAX_DURATION_MS, maxChunkBytes: TALKIE_MAX_CHUNK_BYTES, delivery: session.delivery },
    };
  }

  /**
   * Une voix réveillée tient de la mémoire et envoie des pushs : au plus `TALKIE_WAKING_PER_SENDER` à la fois par
   * émetteur (en cours ou en rattrapage), et jamais quand le processus ne peut plus en garder une entière — la voix
   * suivante se replie en message vocal au lieu d'évincer celles des autres.
   */
  private mayHoldAnotherVoice(fromUserId: string): boolean {
    if (this.buffered + TALKIE_MAX_TOTAL_BYTES > TALKIE_WAKING_PROCESS_MAX_BYTES) return false;
    const held = [...this.sessions.values(), ...this.finished.values()].filter((s) => s.waiting !== null && same(s.fromUserId, fromUserId));
    return held.length < TALKIE_WAKING_PER_SENDER;
  }

  private async withFallbackConversation(ack: TalkieStartAck, fromUserId: string, toUserId: string): Promise<TalkieStartAck> {
    if (ack.success !== false || ack.code !== TALKIE_ERROR_CODES.FALLBACK_VOICE || !this.deps.fallbackConversation) return ack;
    const refused = ack;
    const conversationId = await this.deps.fallbackConversation(fromUserId, toUserId).catch((error: unknown) => {
      this.deps.report('Talkie fallback conversation failed', error);
      return null;
    });
    return conversationId ? { ...refused, conversationId } : ack;
  }

  private wakeRecipient(session: Session, channel: TalkieWakeChannel): void {
    const pair = { talkieId: session.talkieId, fromUserId: session.fromUserId, toUserId: session.toUserId };
    this.deps.trace?.('[TALKIE_WAKING]', { channel, ...pair });
    const wake = this.deps.wake;
    if (!wake) return;
    void wake({ ...pair, channel }).catch((error: unknown) => this.deps.report('Talkie wake failed', error));
  }

  /** Le verdict de la porte quand elle admet ; sinon l'accusé de refus. Le débit, la porte, puis la coupure posée PENDANT le jugement. */
  private async admit(fromUserId: string, toUserId: string, cutFrom: number, sealed: boolean): Promise<TalkieStartAck | TalkieVerdict> {
    try {
      const rate = await this.deps.withinStartRate(fromUserId);
      if (rate === null) return refusal(TALKIE_UNAVAILABLE);
      if (!rate) return RATE_LIMITED;

      const verdict = await this.deps.judge(fromUserId, toUserId, sealed);
      if (verdict.ok === false) return this.withFallbackConversation(refusal(verdict), fromUserId, toUserId);

      const cut = await this.deps.cutAt(fromUserId, toUserId);
      return cut !== null && cut >= cutFrom ? refusal(TALKIE_NOT_ALLOWED) : verdict;
    } catch (error) {
      this.deps.report('Talkie gate failed', error);
      return refusal(TALKIE_UNAVAILABLE);
    }
  }

  async chunk(socketId: string, fromUserId: string, raw: unknown): Promise<void> {
    const parsed = talkieChunkPayloadSchema.safeParse(raw);
    if (!parsed.success) return;
    const session = this.sessions.get(parsed.data.talkieId);
    if (!session || session.socketId !== socketId || session.fromUserId !== fromUserId) return;

    const size = byteLength(parsed.data.data);
    if (size === 0 || size > TALKIE_MAX_CHUNK_BYTES || parsed.data.seq <= session.lastSeq) return;

    const receivedAt = this.deps.now();
    const overTime = receivedAt - session.startedAt > TALKIE_MAX_DURATION_MS + DURATION_GRACE_MS;
    const overProcess = session.waiting !== null && this.buffered + size > TALKIE_WAKING_PROCESS_MAX_BYTES;
    if (overTime || overProcess || session.bytes + size > TALKIE_MAX_TOTAL_BYTES || session.chunks + 1 > TALKIE_MAX_CHUNKS) {
      this.close(session.talkieId, 'limit');
      return;
    }
    // RÉSERVÉ avant toute attente : un fragment de la même rafale voit déjà ces compteurs.
    session.lastSeq = parsed.data.seq;
    session.bytes += size;
    session.chunks += 1;
    if (session.waiting) this.buffered += size;
    this.rejudgeIfDue(session, receivedAt);

    let cut: number | null;
    try {
      cut = await this.deps.cutAt(session.fromUserId, session.toUserId);
    } catch (error) {
      this.deps.report('Talkie cut read failed', error);
      this.close(session.talkieId, 'cut', 'recipient');
      return;
    }
    // #17255 — relâchée pendant cette lecture, une voix réveillée reste gardée : son dernier fragment aussi.
    const live = this.sessions.has(session.talkieId);
    if (!live && this.finished.get(session.talkieId) !== session) return;
    if (cut !== null && cut >= session.cutFrom) {
      if (live) this.close(session.talkieId, 'cut', 'recipient');
      else this.forget(session);
      return;
    }

    const data = parsed.data.data instanceof ArrayBuffer ? new Uint8Array(parsed.data.data) : parsed.data.data;
    const event: TalkieChunkEventData = {
      talkieId: session.talkieId,
      fromUserId: session.fromUserId,
      seq: parsed.data.seq,
      data,
      ...(parsed.data.capturedAt === undefined ? {} : { capturedAt: parsed.data.capturedAt }),
      ...(parsed.data.last === true ? { last: true as const } : {}),
      relayedAt: receivedAt,
    };
    if (!session.waiting) {
      this.noteRelayed(session, event.seq, this.sendTo(session.toUserId, SERVER_EVENTS.TALKIE_CHUNK, event));
      return;
    }
    keepInOrder(session.waiting.buffer, event);
    const reached = [...session.waiting.listeners].filter((socket) => this.sendToSocket(socket, SERVER_EVENTS.TALKIE_CHUNK, event));
    this.noteRelayed(session, event.seq, reached.length > 0);
  }

  /** Le premier fragment relayé se journalise une fois, avec son délai depuis l'ouverture (#17252). */
  private noteRelayed(session: Session, seq: number, reached: boolean): void {
    if (!reached) return;
    session.relayed += 1;
    if (session.relayed === 1) {
      this.deps.trace?.('[TALKIE_RELAYED]', { talkieId: session.talkieId, seq, afterMs: Math.max(0, this.deps.now() - session.startedAt) });
    }
  }

  /**
   * `talkie:join` (#17142) : le destinataire réveillé rejoint une voix `waking`, pendant ou dans la fenêtre qui
   * suit sa fin. Sa socket reçoit l'ouverture, les fragments gardés dans l'ordre, puis le direct (ou la fin).
   */
  async join(socketId: string, userId: string, raw: unknown): Promise<TalkieJoinOutcome> {
    const parsed = talkieJoinPayloadSchema.safeParse(raw);
    if (!parsed.success) return 'unknown';
    const admitted = await this.admitListener(parsed.data.talkieId, userId);
    if (admitted === 'unknown' || admitted === 'refused') return admitted;
    const session = admitted;
    const waiting = session.waiting as Waiting;
    if (waiting.listeners.has(socketId)) return 'joined';
    waiting.joined = true;

    this.sendToSocket(socketId, SERVER_EVENTS.TALKIE_INCOMING, incomingOf(session));
    waiting.buffer.forEach((event) => this.sendToSocket(socketId, SERVER_EVENTS.TALKIE_CHUNK, event));
    if (waiting.ended) this.sendToSocket(socketId, SERVER_EVENTS.TALKIE_ENDED, waiting.ended);
    else waiting.listeners.add(socketId);
    this.deps.trace?.('[TALKIE_JOINED]', {
      talkieId: session.talkieId, fromUserId: session.fromUserId, toUserId: session.toUserId, chunks: waiting.buffer.length, afterEnd: waiting.ended !== null,
    });
    return 'joined';
  }

  /** La voix gardée, concaténée, pour une lecture sans socket (l'extension de notification) — la garde du join. */
  async audioFor(talkieId: string, userId: string): Promise<TalkieAudio> {
    const admitted = await this.admitListener(talkieId, userId);
    if (admitted === 'unknown' || admitted === 'refused') return { ok: false, reason: admitted };
    if (admitted.codec === TALKIE_SEALED_CODEC) return { ok: false, reason: 'refused' };
    const buffer = (admitted.waiting as Waiting).buffer;
    const data = new Uint8Array(buffer.reduce((total, event) => total + event.data.byteLength, 0));
    buffer.reduce((offset, event) => {
      data.set(event.data, offset);
      return offset + event.data.byteLength;
    }, 0);
    return { ok: true, codec: admitted.codec, data };
  }

  private waitingSession(talkieId: string): Session | null {
    const session = this.sessions.get(talkieId) ?? this.finished.get(talkieId);
    return session && session.waiting ? session : null;
  }

  /** Le destinataire seul, aucune coupure depuis l'ouverture, la porte rejugée — une panne refuse. */
  private async admitListener(talkieId: string, userId: string): Promise<Session | 'unknown' | 'refused'> {
    const session = this.waitingSession(talkieId);
    if (!session) return 'unknown';
    if (!same(session.toUserId, userId)) return 'refused';
    try {
      const [cut, verdict] = await Promise.all([
        this.deps.cutAt(session.fromUserId, session.toUserId),
        this.deps.judge(session.fromUserId, session.toUserId, session.sealed !== undefined),
      ]);
      if ((cut !== null && cut >= session.cutFrom) || verdict.ok === false) return 'refused';
    } catch (error) {
      this.deps.report('Talkie join gate failed', error);
      return 'refused';
    }
    return this.waitingSession(talkieId) === session ? session : 'unknown';
  }

  /** Hors du chemin critique : le fragment repart sans l'attendre ; un refus (ou une panne) coupe la suite. */
  private rejudgeIfDue(session: Session, now: number): void {
    if (session.rejudging || now - session.judgedAt < REJUDGE_EVERY_MS) return;
    session.rejudging = true;
    session.judgedAt = now;
    const timeout = guardedTimeout({
      name: 'talkie-rejudge-timeout',
      run: () => {
        if (!this.sessions.has(session.talkieId)) return;
        this.deps.report('Talkie rejudge timed out', new Error(`no verdict within ${REJUDGE_TIMEOUT_MS} ms`));
        this.close(session.talkieId, 'cut', 'recipient');
      },
      afterMs: REJUDGE_TIMEOUT_MS,
      logger: { error: (message, error) => this.deps.report(message, error) },
    });
    timeout.unref?.();
    this.deps
      .judge(session.fromUserId, session.toUserId, session.sealed !== undefined)
      .then(
        (verdict) => {
          if (verdict.ok === false) this.close(session.talkieId, 'cut', 'recipient');
        },
        (error: unknown) => {
          this.deps.report('Talkie rejudge failed', error);
          this.close(session.talkieId, 'cut', 'recipient');
        },
      )
      .finally(() => {
        clearTimeout(timeout);
        session.rejudging = false;
      });
  }

  end(socketId: string, fromUserId: string, raw: unknown): void {
    const parsed = talkieEndPayloadSchema.safeParse(raw);
    if (!parsed.success) return;
    const session = this.sessions.get(parsed.data.talkieId);
    if (!session || session.socketId !== socketId || session.fromUserId !== fromUserId) return;
    this.close(session.talkieId, 'sender');
  }

  socketGone(socketId: string): void {
    if (this.opening.has(socketId)) this.lostWhileOpening.add(socketId);
    const talkieId = this.bySocket.get(socketId);
    if (talkieId) this.close(talkieId, 'cut', 'both', true);
  }

  /** Coupe, SUR CETTE INSTANCE, les prises de parole de `fromUserId` vers `toUserId` — un blocage. Casse libre. */
  cutPair(fromUserId: string, toUserId: string): void {
    const ofPair = (s: Session) => same(s.fromUserId, fromUserId) && same(s.toUserId, toUserId);
    [...this.sessions.values()].filter(ofPair).forEach((s) => this.close(s.talkieId, 'cut', 'recipient'));
    [...this.finished.values()].filter(ofPair).forEach((s) => this.forget(s));
  }

  dispose(): void {
    [...this.sessions.keys()].forEach((talkieId) => this.close(talkieId, 'cut'));
    [...this.finished.values()].forEach((s) => this.forget(s));
  }

  /** `audience` : `both` prévient aussi l'émetteur (ses autres appareils) ; `recipient` ne prévient que celui qui écoute. */
  /**
   * `keep` : une voix réveillée reste rejoignable après sa fin — relâchée, au plafond, ou dont la socket émettrice est
   * tombée ; jamais une voix coupée par un blocage, un réglage ou une panne de garde.
   */
  private close(talkieId: string, reason: TalkieEndReason, audience: 'both' | 'recipient' = 'both', keep = reason !== 'cut'): void {
    const session = this.sessions.get(talkieId);
    if (!session) return;
    this.sessions.delete(talkieId);
    if (this.bySocket.get(session.socketId) === talkieId) this.bySocket.delete(session.socketId);
    if (session.timer) clearTimeout(session.timer);

    const waiting = session.waiting;
    const ended: TalkieEndedEventData = {
      talkieId,
      fromUserId: session.fromUserId,
      toUserId: session.toUserId,
      reason,
      endedAt: new Date(this.deps.now()).toISOString(),
      ...(waiting ? { joined: waiting.joined } : {}),
    };
    if (waiting) waiting.listeners.forEach((socket) => this.sendToSocket(socket, SERVER_EVENTS.TALKIE_ENDED, ended));
    else this.sendTo(session.toUserId, SERVER_EVENTS.TALKIE_ENDED, ended);
    if (audience === 'both') this.sendTo(session.fromUserId, SERVER_EVENTS.TALKIE_ENDED, ended);
    this.deps.trace?.('[TALKIE_ENDED]', {
      ...pairOf(session),
      delivery: session.delivery,
      reason,
      chunks: session.chunks,
      relayedChunks: session.relayed,
      bytes: session.bytes,
      durationMs: Math.max(0, this.deps.now() - session.startedAt),
      ...(waiting ? { joined: waiting.joined } : {}),
    });
    if (waiting) this.keepForLateJoin(session, ended, keep);
  }

  /** Une voix relâchée ou au plafond reste rejoignable la fenêtre durant ; une voix coupée est oubliée sur-le-champ. */
  private keepForLateJoin(session: Session, ended: TalkieEndedEventData, keep: boolean): void {
    const waiting = session.waiting as Waiting;
    waiting.listeners.clear();
    if (!keep) {
      this.forget(session);
      return;
    }
    waiting.ended = ended;
    this.finished.set(session.talkieId, session);
    waiting.expiry = guardedTimeout({
      name: 'talkie-join-window',
      run: () => this.forget(session),
      afterMs: TALKIE_JOIN_WINDOW_MS,
      logger: { error: (message, error) => this.deps.report(message, error) },
    });
    waiting.expiry.unref?.();
    // Les octets RÉSERVÉS comptent : un fragment encore en lecture de coupure rejoint le tampon avant que le push
    // n'atteigne l'appareil et que son extension ne lise la voix (#17255).
    if (waiting.joined || session.chunks === 0 || !this.deps.followUp) return;
    const endedAt = this.deps.now();
    void this.deps
      .followUp({
        talkieId: session.talkieId,
        fromUserId: session.fromUserId,
        toUserId: session.toUserId,
        availableUntil: new Date(endedAt + TALKIE_JOIN_WINDOW_MS),
        bytes: session.bytes,
        durationMs: Math.max(0, endedAt - session.startedAt),
      })
      .catch((error: unknown) => this.deps.report('Talkie follow-up failed', error));
  }

  /** Libère le tampon d'une voix réveillée. */
  private forget(session: Session): void {
    const waiting = session.waiting;
    if (!waiting) return;
    if (waiting.expiry) clearTimeout(waiting.expiry);
    waiting.expiry = null;
    if (this.finished.get(session.talkieId) === session) this.finished.delete(session.talkieId);
    this.buffered = Math.max(0, this.buffered - session.bytes);
    waiting.buffer.length = 0;
    session.bytes = 0;
  }

  /** `true` quand l'émission est partie sans lever — ce que le journal compte comme relayé. */
  private sendToSocket(socketId: string, ...args: ServerEmitArgs): boolean {
    return this.emitTo(socketId, args);
  }

  private sendTo(userId: string, ...args: ServerEmitArgs): boolean {
    return this.emitTo(ROOMS.user(userId), args);
  }

  private emitTo(room: string, args: ServerEmitArgs): boolean {
    if (!this.deps.io) return false;
    try {
      this.deps.io.to(room).emit(...args);
      return true;
    } catch (error) {
      this.deps.report('Talkie emit failed', error);
      return false;
    }
  }
}

const pairOf = (session: Session) => ({ talkieId: session.talkieId, fromUserId: session.fromUserId, toUserId: session.toUserId });

function incomingOf(session: Session): TalkieIncomingEventData {
  return {
    talkieId: session.talkieId,
    fromUserId: session.fromUserId,
    codec: session.codec,
    startedAt: new Date(session.startedAt).toISOString(),
    maxDurationMs: TALKIE_MAX_DURATION_MS,
    ...(session.sealed ? { sealed: session.sealed } : {}),
  };
}

/** Les fragments gardés restent triés par numéro de séquence, quel que soit l'ordre où leurs lectures de coupure rendent. */
function keepInOrder(buffer: TalkieChunkEventData[], event: TalkieChunkEventData): void {
  const at = buffer.findIndex((kept) => kept.seq > event.seq);
  if (at === -1) buffer.push(event);
  else buffer.splice(at, 0, event);
}
