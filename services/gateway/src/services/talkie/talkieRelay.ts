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
 * ## Ce qui change pendant qu'on parle
 *
 * La prise de parole est REJUGÉE en arrière-plan, au plus toutes les
 * `REJUDGE_EVERY_MS`, sur l'arrivée d'un fragment : préférence coupée, appel
 * décroché, Ne pas déranger, conversation passée en chiffrement de bout en bout,
 * lien redescendu, compte désactivé — elle est coupée (`cut`). La coupure d'un
 * blocage, elle, vaut dès l'instant où le jugement de l'ouverture a COMMENCÉ :
 * un blocage acquitté pendant ce jugement ferme aussi la session qui en naît.
 *
 * ## Un blocage coupe, et ne s'annonce pas
 *
 * La coupure n'est annoncée qu'au DESTINATAIRE de la voix (pour qu'il cesse de
 * jouer) ; l'émetteur n'en reçoit rien, ses fragments suivants sont ignorés.
 */
import { randomBytes } from 'node:crypto';
import {
  TALKIE_ERROR_CODES,
  TALKIE_MAX_CHUNK_BYTES,
  TALKIE_MAX_CHUNKS,
  TALKIE_MAX_DURATION_MS,
  TALKIE_MAX_TOTAL_BYTES,
  talkieChunkPayloadSchema,
  talkieEndPayloadSchema,
  talkieStartPayloadSchema,
  type TalkieCodec,
  type TalkieEndReason,
  type TalkieStartAck,
} from '@meeshy/shared/types/talkie';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ServerEmitArgs, ServerEmitIO } from '../../socketio/serverEmit';
import { TALKIE_NOT_ALLOWED, TALKIE_UNAVAILABLE, type TalkieRefusal, type TalkieVerdict } from './talkieGate';
import { guardedTimeout } from '../../utils/guarded-timer';

/** La marge laissée au dernier fragment, en transit quand la minuterie tombe. */
const DURATION_GRACE_MS = 1_000;
/** Le rejugement d'arrière-plan d'une prise de parole ouverte. */
export const REJUDGE_EVERY_MS = 2_000;

type Session = {
  readonly talkieId: string;
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly socketId: string;
  readonly codec: TalkieCodec;
  readonly startedAt: number;
  /** Une coupure posée à partir de cet instant vise la session : celui où son jugement a COMMENCÉ. */
  readonly cutFrom: number;
  bytes: number;
  chunks: number;
  lastSeq: number;
  judgedAt: number;
  rejudging: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

export type TalkieRelayDeps = {
  readonly io: ServerEmitIO | undefined;
  readonly judge: (fromUserId: string, toUserId: string) => Promise<TalkieVerdict>;
  /** Le débit d'ouverture : `null` quand le compteur est injoignable (fail-closed). */
  readonly withinStartRate: (userId: string) => Promise<boolean | null>;
  /** L'instant de la DERNIÈRE coupure de la paire orientée, ou `null` ; LÈVE quand le cache partagé est injoignable. */
  readonly cutAt: (fromUserId: string, toUserId: string) => Promise<number | null>;
  readonly now: () => number;
  readonly report: (message: string, error: unknown) => void;
};

const refusal = (verdict: TalkieRefusal): TalkieStartAck => ({ success: false, error: verdict.message, code: verdict.code });
const INVALID: TalkieStartAck = { success: false, error: 'Charge illisible', code: TALKIE_ERROR_CODES.INVALID };
const RATE_LIMITED: TalkieStartAck = { success: false, error: 'Trop de prises de parole', code: TALKIE_ERROR_CODES.RATE_LIMITED };

const byteLength = (data: Uint8Array | ArrayBuffer): number => data.byteLength;
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export class TalkieRelay {
  private readonly sessions = new Map<string, Session>();
  private readonly bySocket = new Map<string, string>();
  /** Les sockets dont une ouverture est en cours de jugement, et celles qui sont tombées pendant. */
  private readonly opening = new Map<string, number>();
  private readonly lostWhileOpening = new Set<string>();

  constructor(private readonly deps: TalkieRelayDeps) {}

  /** Le nombre de prises de parole ouvertes sur cette instance (témoins, métriques). */
  get openCount(): number {
    return this.sessions.size;
  }

  async start(socketId: string, fromUserId: string, raw: unknown): Promise<TalkieStartAck> {
    const parsed = talkieStartPayloadSchema.safeParse(raw);
    if (!parsed.success) return INVALID;
    const toUserId = parsed.data.toUserId.toLowerCase();
    const cutFrom = this.deps.now();

    this.opening.set(socketId, (this.opening.get(socketId) ?? 0) + 1);
    try {
      const verdict = await this.admit(fromUserId, toUserId, cutFrom);
      if (verdict !== null) return verdict;
      if (this.lostWhileOpening.has(socketId)) return refusal(TALKIE_UNAVAILABLE);
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
    const session: Session = {
      talkieId: randomBytes(12).toString('hex'),
      fromUserId,
      toUserId,
      socketId,
      codec: parsed.data.codec,
      startedAt,
      cutFrom,
      bytes: 0,
      chunks: 0,
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

    this.sendTo(toUserId, SERVER_EVENTS.TALKIE_INCOMING, {
      talkieId: session.talkieId,
      fromUserId,
      codec: session.codec,
      startedAt: new Date(startedAt).toISOString(),
      maxDurationMs: TALKIE_MAX_DURATION_MS,
    });
    return { success: true, data: { talkieId: session.talkieId, maxDurationMs: TALKIE_MAX_DURATION_MS, maxChunkBytes: TALKIE_MAX_CHUNK_BYTES } };
  }

  /** `null` : admis. Le débit, la porte, puis une relecture de la coupure posée PENDANT le jugement. */
  private async admit(fromUserId: string, toUserId: string, cutFrom: number): Promise<TalkieStartAck | null> {
    try {
      const rate = await this.deps.withinStartRate(fromUserId);
      if (rate === null) return refusal(TALKIE_UNAVAILABLE);
      if (!rate) return RATE_LIMITED;

      const verdict = await this.deps.judge(fromUserId, toUserId);
      if (verdict.ok === false) return refusal(verdict);

      const cut = await this.deps.cutAt(fromUserId, toUserId);
      return cut !== null && cut >= cutFrom ? refusal(TALKIE_NOT_ALLOWED) : null;
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
    if (overTime || session.bytes + size > TALKIE_MAX_TOTAL_BYTES || session.chunks + 1 > TALKIE_MAX_CHUNKS) {
      this.close(session.talkieId, 'limit');
      return;
    }
    // RÉSERVÉ avant toute attente : un fragment de la même rafale voit déjà ces compteurs.
    session.lastSeq = parsed.data.seq;
    session.bytes += size;
    session.chunks += 1;
    this.rejudgeIfDue(session, receivedAt);

    let cut: number | null;
    try {
      cut = await this.deps.cutAt(session.fromUserId, session.toUserId);
    } catch (error) {
      this.deps.report('Talkie cut read failed', error);
      this.close(session.talkieId, 'cut', 'recipient');
      return;
    }
    if (!this.sessions.has(session.talkieId)) return;
    if (cut !== null && cut >= session.cutFrom) {
      this.close(session.talkieId, 'cut', 'recipient');
      return;
    }

    const data = parsed.data.data instanceof ArrayBuffer ? new Uint8Array(parsed.data.data) : parsed.data.data;
    this.sendTo(session.toUserId, SERVER_EVENTS.TALKIE_CHUNK, {
      talkieId: session.talkieId,
      fromUserId: session.fromUserId,
      seq: parsed.data.seq,
      data,
      ...(parsed.data.capturedAt === undefined ? {} : { capturedAt: parsed.data.capturedAt }),
      relayedAt: receivedAt,
    });
  }

  /** Hors du chemin critique : le fragment repart sans l'attendre ; un refus (ou une panne) coupe la suite. */
  private rejudgeIfDue(session: Session, now: number): void {
    if (session.rejudging || now - session.judgedAt < REJUDGE_EVERY_MS) return;
    session.rejudging = true;
    session.judgedAt = now;
    this.deps
      .judge(session.fromUserId, session.toUserId)
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
    if (talkieId) this.close(talkieId, 'cut');
  }

  /** Coupe, SUR CETTE INSTANCE, les prises de parole de `fromUserId` vers `toUserId` — un blocage. Casse libre. */
  cutPair(fromUserId: string, toUserId: string): void {
    [...this.sessions.values()]
      .filter((s) => same(s.fromUserId, fromUserId) && same(s.toUserId, toUserId))
      .forEach((s) => this.close(s.talkieId, 'cut', 'recipient'));
  }

  dispose(): void {
    [...this.sessions.keys()].forEach((talkieId) => this.close(talkieId, 'cut'));
  }

  /** `audience` : `both` prévient aussi l'émetteur (ses autres appareils) ; `recipient` ne prévient que celui qui écoute. */
  private close(talkieId: string, reason: TalkieEndReason, audience: 'both' | 'recipient' = 'both'): void {
    const session = this.sessions.get(talkieId);
    if (!session) return;
    this.sessions.delete(talkieId);
    if (this.bySocket.get(session.socketId) === talkieId) this.bySocket.delete(session.socketId);
    if (session.timer) clearTimeout(session.timer);

    const ended = {
      talkieId,
      fromUserId: session.fromUserId,
      toUserId: session.toUserId,
      reason,
      endedAt: new Date(this.deps.now()).toISOString(),
    };
    this.sendTo(session.toUserId, SERVER_EVENTS.TALKIE_ENDED, ended);
    if (audience === 'both') this.sendTo(session.fromUserId, SERVER_EVENTS.TALKIE_ENDED, ended);
  }

  private sendTo(userId: string, ...args: ServerEmitArgs): void {
    try {
      this.deps.io?.to(ROOMS.user(userId)).emit(...args);
    } catch (error) {
      this.deps.report('Talkie emit failed', error);
    }
  }
}
