/**
 * LE RELAIS DU TALKIE (#13935, D-4) — chaque fragment repart vers le
 * destinataire À L'INSTANT où il arrive.
 *
 * ## Ce qui est sur le chemin critique, et ce qui n'y est pas
 *
 * L'ouverture (`start`) juge tout (`talkieGate.ts`) et compte le débit (limiteur
 * Redis existant). Un fragment, lui, ne touche jamais la base : il vérifie sa
 * session (en mémoire, sur l'instance qui porte la socket de l'émetteur — les
 * fragments arrivent par cette socket-là), ses bornes, et UNE lecture de cache —
 * la coupure posée par un blocage, quelle que soit l'instance qui l'a reçu
 * (`talkieCut.ts`) — puis il repart. Rien n'est stocké : ni fragment, ni copie,
 * ni transcription. La copie en message vocal est l'affaire du client, par le
 * chemin vocal existant, après la prise de parole.
 *
 * ## Les bornes
 *
 * 30 s par prise de parole (une minuterie la ferme même si l'émetteur se tait),
 * 16 Ko par fragment, 512 Ko au total, numéros de séquence strictement
 * croissants. Un fragment hors bornes est IGNORÉ ; dépasser la durée ou le total
 * ferme la prise de parole (`limit`). Une socket n'a qu'une prise de parole
 * ouverte : en ouvrir une autre ferme la précédente.
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
import type { TalkieVerdict } from './talkieGate';
import { TALKIE_UNAVAILABLE } from './talkieGate';

/** La marge laissée au dernier fragment, en transit quand la minuterie tombe. */
const DURATION_GRACE_MS = 1_000;

type Session = {
  readonly talkieId: string;
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly socketId: string;
  readonly codec: TalkieCodec;
  readonly startedAt: number;
  bytes: number;
  lastSeq: number;
  timer: ReturnType<typeof setTimeout> | null;
};

export type TalkieRelayDeps = {
  readonly io: ServerEmitIO | undefined;
  readonly judge: (fromUserId: string, toUserId: string) => Promise<TalkieVerdict>;
  /** Le débit d'ouverture : `null` quand le compteur est injoignable (fail-closed). */
  readonly withinStartRate: (userId: string) => Promise<boolean | null>;
  /** L'instant de la DERNIÈRE coupure de la paire orientée, ou `null` (`talkieCut.ts`). */
  readonly cutAt: (fromUserId: string, toUserId: string) => Promise<number | null>;
  readonly now: () => number;
  readonly report: (message: string, error: unknown) => void;
};

const refusal = (code: string, error: string): TalkieStartAck => ({ success: false, error, code } as TalkieStartAck);

const byteLength = (data: Uint8Array | ArrayBuffer): number => data.byteLength;

export class TalkieRelay {
  private readonly sessions = new Map<string, Session>();
  private readonly bySocket = new Map<string, string>();

  constructor(private readonly deps: TalkieRelayDeps) {}

  /** Le nombre de prises de parole ouvertes sur cette instance (témoins, métriques). */
  get openCount(): number {
    return this.sessions.size;
  }

  async start(socketId: string, fromUserId: string, raw: unknown): Promise<TalkieStartAck> {
    const parsed = talkieStartPayloadSchema.safeParse(raw);
    if (!parsed.success) return refusal(TALKIE_ERROR_CODES.INVALID, 'Charge illisible');
    const toUserId = parsed.data.toUserId.toLowerCase();

    try {
      const rate = await this.deps.withinStartRate(fromUserId);
      if (rate === null) return refusal(TALKIE_UNAVAILABLE.code, TALKIE_UNAVAILABLE.message);
      if (!rate) return refusal(TALKIE_ERROR_CODES.RATE_LIMITED, 'Trop de prises de parole');

      const verdict = await this.deps.judge(fromUserId, toUserId);
      if (verdict.ok === false) return refusal(verdict.code, verdict.message);
    } catch (error) {
      this.deps.report('Talkie gate failed', error);
      return refusal(TALKIE_UNAVAILABLE.code, TALKIE_UNAVAILABLE.message);
    }

    const previous = this.bySocket.get(socketId);
    if (previous) this.close(previous, 'sender');

    const session: Session = {
      talkieId: randomBytes(12).toString('hex'),
      fromUserId,
      toUserId,
      socketId,
      codec: parsed.data.codec,
      startedAt: this.deps.now(),
      bytes: 0,
      lastSeq: -1,
      timer: null,
    };
    session.timer = setTimeout(() => this.close(session.talkieId, 'limit'), TALKIE_MAX_DURATION_MS + DURATION_GRACE_MS);
    session.timer.unref?.();
    this.sessions.set(session.talkieId, session);
    this.bySocket.set(socketId, session.talkieId);

    this.sendTo(toUserId, SERVER_EVENTS.TALKIE_INCOMING, {
      talkieId: session.talkieId,
      fromUserId,
      codec: session.codec,
      startedAt: new Date(session.startedAt).toISOString(),
      maxDurationMs: TALKIE_MAX_DURATION_MS,
    });
    return { success: true, data: { talkieId: session.talkieId, maxDurationMs: TALKIE_MAX_DURATION_MS, maxChunkBytes: TALKIE_MAX_CHUNK_BYTES } };
  }

  async chunk(socketId: string, fromUserId: string, raw: unknown): Promise<void> {
    const parsed = talkieChunkPayloadSchema.safeParse(raw);
    if (!parsed.success) return;
    const session = this.sessions.get(parsed.data.talkieId);
    if (!session || session.socketId !== socketId || session.fromUserId !== fromUserId) return;

    const size = byteLength(parsed.data.data);
    if (size === 0 || size > TALKIE_MAX_CHUNK_BYTES || parsed.data.seq <= session.lastSeq) return;

    const receivedAt = this.deps.now();
    if (receivedAt - session.startedAt > TALKIE_MAX_DURATION_MS + DURATION_GRACE_MS || session.bytes + size > TALKIE_MAX_TOTAL_BYTES) {
      this.close(session.talkieId, 'limit');
      return;
    }

    let cut: number | null;
    try {
      cut = await this.deps.cutAt(session.fromUserId, session.toUserId);
    } catch (error) {
      this.deps.report('Talkie cut read failed', error);
      this.close(session.talkieId, 'cut', 'recipient');
      return;
    }
    if (!this.sessions.has(session.talkieId)) return;
    if (cut !== null && cut >= session.startedAt) {
      this.close(session.talkieId, 'cut', 'recipient');
      return;
    }

    session.bytes += size;
    session.lastSeq = parsed.data.seq;
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

  end(socketId: string, fromUserId: string, raw: unknown): void {
    const parsed = talkieEndPayloadSchema.safeParse(raw);
    if (!parsed.success) return;
    const session = this.sessions.get(parsed.data.talkieId);
    if (!session || session.socketId !== socketId || session.fromUserId !== fromUserId) return;
    this.close(session.talkieId, 'sender');
  }

  socketGone(socketId: string): void {
    const talkieId = this.bySocket.get(socketId);
    if (talkieId) this.close(talkieId, 'cut');
  }

  /** Coupe, SUR CETTE INSTANCE, les prises de parole de `fromUserId` vers `toUserId` — un blocage. */
  cutPair(fromUserId: string, toUserId: string): void {
    [...this.sessions.values()]
      .filter((s) => s.fromUserId === fromUserId && s.toUserId === toUserId)
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
