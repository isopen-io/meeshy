import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { AdminMetricsSubscribeAck, HostMetricsSample } from '@meeshy/shared/types/admin-ops';
import type { HostMetricsProbe } from '../../services/admin/host-metrics-probe';
import type { ServerEmitIO } from '../serverEmit';
import type { MeeshySocket as Socket } from '../typed-socket';
import { logger } from '../../utils/logger';

const ADMIN_ROLES: readonly string[] = ['BIGBOSS', 'ADMIN'];

type Ack = (response: AdminMetricsSubscribeAck) => void;

export interface AdminMetricsHandlerDeps {
  readonly io: ServerEmitIO;
  readonly probe: HostMetricsProbe;
  readonly socketToUser: Map<string, string>;
  readonly roleOf: (userId: string) => Promise<string | null>;
  readonly roomSize: (room: string) => number;
}

/**
 * Les métriques de l'hôte en direct pour l'administration (#10384).
 *
 * `admin-metrics:subscribe` vérifie le rang (BIGBOSS ou ADMIN, mêmes rangs que
 * `GET /admin/ops/host-metrics`), rejoint la room `admin:host-metrics` et rend
 * dans l'accusé l'instantané COMPLET : l'écran dessine l'heure écoulée d'un coup,
 * puis reçoit `admin-metrics:sample` toutes les cinq secondes. Aucun échantillon
 * ne part tant que la room est vide.
 */
export class AdminMetricsHandler {
  private unsubscribeProbe: (() => void) | null = null;

  constructor(private readonly deps: AdminMetricsHandlerDeps) {}

  start(): void {
    if (this.unsubscribeProbe) return;
    this.deps.probe.start();
    this.unsubscribeProbe = this.deps.probe.onSample((sample) => this.broadcast(sample));
  }

  stop(): void {
    this.unsubscribeProbe?.();
    this.unsubscribeProbe = null;
    this.deps.probe.stop();
  }

  async handleSubscribe(socket: Socket, data: unknown, ack: unknown): Promise<void> {
    const respond = [ack, data].find((candidate): candidate is Ack => typeof candidate === 'function');
    const userId = this.deps.socketToUser.get(socket.id);
    const role = userId ? await this.deps.roleOf(userId).catch(() => null) : null;
    if (!role || !ADMIN_ROLES.includes(role)) {
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

  private broadcast(sample: HostMetricsSample): void {
    const room = ROOMS.adminHostMetrics();
    if (this.deps.roomSize(room) === 0) return;
    try {
      this.deps.io.to(room).emit(SERVER_EVENTS.ADMIN_METRICS_SAMPLE, sample);
    } catch (error) {
      logger.warn('admin metrics broadcast failed', { error });
    }
  }
}
