import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { AdminMetricsSubscribeAck, HostMetricsSample } from '@meeshy/shared/types/admin-ops';
import type { HostMetricsProbe } from '../../services/admin/host-metrics-probe';
import type { ServerEmitIO } from '../serverEmit';
import type { MeeshySocket as Socket } from '../typed-socket';
import { isAdminRank } from '../evictFromAdminRooms';
import { logger } from '../../utils/logger';
import { SOCKET_RATE_LIMITS, getSocketRateLimiter } from '../../utils/socket-rate-limiter';

type Ack = (response: AdminMetricsSubscribeAck) => void;

/** Un socket de la room, tel que `fetchSockets()` le rend : son id (pour retrouver son compte) et `leave`. */
type RoomMember = { readonly id: string; leave(room: string): unknown };

/**
 * La relecture du rang ne regarde que les sockets de CE nœud (`io.local`) : `socketToUser`
 * est une carte locale, et sous l'adaptateur Redis un `fetchSockets()` global rendrait
 * les sockets des autres nœuds, qu'elle ne connaît pas — ils seraient évincés à tort.
 * Chaque nœud revérifie les siens.
 */
export interface AdminMetricsIO extends ServerEmitIO {
  readonly local: { in(room: string): { fetchSockets(): Promise<readonly RoomMember[]> } };
}

/** Le rang d'un membre de la room est relu au plus une fois par minute (#10459 point 1). */
export const ADMIN_METRICS_RANK_RECHECK_MS = 60_000;

export interface AdminMetricsHandlerDeps {
  readonly io: AdminMetricsIO;
  readonly probe: HostMetricsProbe;
  readonly socketToUser: Map<string, string>;
  readonly roleOf: (userId: string) => Promise<string | null>;
  readonly roomSize: (room: string) => number;
  /**
   * La porte de l'abonnement (#10459 point 1) : chaque `admin-metrics:subscribe` coûte
   * une lecture Prisma, et elle se compte PAR COMPTE avant cette lecture. `false` ⇒
   * `RATE_LIMITED`, sans rien lire ni rejoindre. Absente ⇒ le limiteur partagé des
   * sockets, `SOCKET_RATE_LIMITS.ADMIN_METRICS_SUBSCRIBE`.
   */
  readonly subscribeGate?: (userId: string) => Promise<boolean>;
  readonly now?: () => number;
}

/**
 * Les métriques de l'hôte en direct pour l'administration (#10384).
 *
 * `admin-metrics:subscribe` vérifie le rang (BIGBOSS ou ADMIN, mêmes rangs que
 * `GET /admin/ops/host-metrics`), rejoint la room `admin:host-metrics` et rend
 * dans l'accusé l'instantané COMPLET : l'écran dessine l'heure écoulée d'un coup,
 * puis reçoit `admin-metrics:sample` toutes les cinq secondes. Aucun échantillon
 * ne part tant que la room est vide.
 *
 * Le rang n'est pas vérifié qu'une fois (#10459 point 1) : avant un échantillon, au
 * plus une fois par minute, chaque membre de la room est relu, et un compte qui n'a
 * plus le rang — ou qu'aucun socket authentifié ne porte — quitte la room AVANT que
 * l'échantillon parte. C'est le second verrou ; le premier est l'éviction immédiate
 * par la route qui rétrograde (`evictFromAdminRooms`). Une lecture de rang qui
 * ÉCHOUE ne décide rien : la room est gardée telle quelle, et la relecture est
 * retentée à l'échantillon suivant — un secret n'est pas en jeu (des métriques
 * d'hôte), une panne de base ne doit pas vider la salle, et un rétrogradé sort à la
 * première lecture qui aboutit.
 */
export class AdminMetricsHandler {
  private unsubscribeProbe: (() => void) | null = null;
  private rankVerifiedAt: number | null = null;
  private chain: Promise<void> = Promise.resolve();

  private readonly subscribeGate: (userId: string) => Promise<boolean>;

  constructor(private readonly deps: AdminMetricsHandlerDeps) {
    this.subscribeGate =
      deps.subscribeGate ?? ((userId) => getSocketRateLimiter().checkLimit(userId, SOCKET_RATE_LIMITS.ADMIN_METRICS_SUBSCRIBE));
  }

  start(): void {
    if (this.unsubscribeProbe) return;
    this.deps.probe.start();
    this.unsubscribeProbe = this.deps.probe.onSample((sample) => this.enqueue(sample));
  }

  stop(): void {
    this.unsubscribeProbe?.();
    this.unsubscribeProbe = null;
    this.deps.probe.stop();
  }

  /** La diffusion en cours, pour qui doit l'attendre (les témoins) — jamais un échantillon ne double le précédent. */
  settled(): Promise<void> {
    return this.chain;
  }

  async handleSubscribe(socket: Socket, data: unknown, ack: unknown): Promise<void> {
    const respond = [ack, data].find((candidate): candidate is Ack => typeof candidate === 'function');
    const userId = this.deps.socketToUser.get(socket.id);
    if (!userId) {
      respond?.({ ok: false, code: 'FORBIDDEN' });
      return;
    }
    if (!(await this.subscribeGate(userId).catch(() => false))) {
      respond?.({ ok: false, code: 'RATE_LIMITED' });
      return;
    }
    const role = await this.deps.roleOf(userId).catch(() => null);
    if (!isAdminRank(role)) {
      respond?.({ ok: false, code: 'FORBIDDEN' });
      return;
    }
    Promise.resolve(socket.join(ROOMS.adminHostMetrics())).catch(() => undefined);
    const snapshot = await this.deps.probe.snapshot();
    respond?.({ ok: true, snapshot });
  }

  handleUnsubscribe(socket: Socket): void {
    Promise.resolve(socket.leave(ROOMS.adminHostMetrics())).catch(() => undefined);
  }

  private enqueue(sample: HostMetricsSample): void {
    this.chain = this.chain
      .then(() => this.broadcast(sample))
      .catch((error) => logger.warn('admin metrics broadcast failed', { error }));
  }

  private async broadcast(sample: HostMetricsSample): Promise<void> {
    const room = ROOMS.adminHostMetrics();
    if (this.deps.roomSize(room) === 0) return;
    await this.reverifyRanks(room);
    if (this.deps.roomSize(room) === 0) return;
    this.deps.io.to(room).emit(SERVER_EVENTS.ADMIN_METRICS_SAMPLE, sample);
  }

  private async reverifyRanks(room: string): Promise<void> {
    const at = (this.deps.now ?? Date.now)();
    // Le premier échantillon suit un abonnement qui vient de lire le rang : l'horloge part de là.
    if (this.rankVerifiedAt === null) {
      this.rankVerifiedAt = at;
      return;
    }
    if (at - this.rankVerifiedAt < ADMIN_METRICS_RANK_RECHECK_MS) return;
    const members = await this.deps.io.local.in(room).fetchSockets();
    const userIds = [...new Set(members.map((member) => this.deps.socketToUser.get(member.id)).filter((id): id is string => !!id))];
    let roles: readonly (string | null)[];
    try {
      roles = await Promise.all(userIds.map((userId) => this.deps.roleOf(userId)));
    } catch (error) {
      logger.warn('admin metrics room: rank recheck failed, retried on next sample', { error });
      return;
    }
    this.rankVerifiedAt = at;
    const admitted = new Set(userIds.filter((_, index) => isAdminRank(roles[index])));
    const evicted = members.filter((member) => {
      const userId = this.deps.socketToUser.get(member.id);
      return !userId || !admitted.has(userId);
    });
    await Promise.all(evicted.map((member) => Promise.resolve(member.leave(room)).catch(() => undefined)));
    if (evicted.length > 0) logger.info('admin metrics room: rank no longer held, sockets evicted', { count: evicted.length });
  }
}
