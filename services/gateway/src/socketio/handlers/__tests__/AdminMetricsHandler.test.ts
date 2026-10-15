/**
 * Les métriques de l'hôte en direct (#10384) : seul un BIGBOSS ou un ADMIN
 * rejoint la room `admin:host-metrics`, l'accusé porte l'instantané complet, et
 * chaque échantillon part vers la room — seulement si quelqu'un l'écoute.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { HostMetricsSample, HostMetricsSnapshot } from '@meeshy/shared/types/admin-ops';
import { AdminMetricsHandler } from '../AdminMetricsHandler';
import type { HostMetricsProbe } from '../../../services/admin/host-metrics-probe';
import type { MeeshySocket } from '../../typed-socket';

const SAMPLE: HostMetricsSample = {
  at: '2026-10-12T22:00:00.000Z',
  cpu: { usedPercent: 10, cores: 4, load1: 0.1, load5: 0.1, load15: 0.1 },
  memory: { totalBytes: 10, availableBytes: 4, usedBytes: 6 },
  swap: { totalBytes: 0, usedBytes: 0 },
  disk: { mount: '/', totalBytes: 10, freeBytes: 5, usedBytes: 5 },
};

const SNAPSHOT: HostMetricsSnapshot = {
  source: 'host-proc',
  hostname: 'h',
  sharedHost: true,
  environment: 'staging',
  intervalMs: 5000,
  gpu: { kind: 'absent', reason: 'no-compute-gpu' },
  samples: [SAMPLE],
  docker: null,
};

function harness(role: string | null, { roomSize = 1 }: { roomSize?: number } = {}) {
  let listener: ((sample: HostMetricsSample) => void) | null = null;
  const probe: HostMetricsProbe = {
    start: jest.fn(),
    stop: jest.fn(),
    prime: async () => undefined,
    tick: async () => null,
    snapshot: jest.fn(async () => SNAPSHOT),
    onSample: (fn) => {
      listener = fn;
      return () => {
        listener = null;
      };
    },
  };
  const emit = jest.fn<(event: string, payload: unknown) => void>();
  const to = jest.fn((_room: string) => ({ emit }));
  const socket = { id: 's1', join: jest.fn(), leave: jest.fn() } as unknown as MeeshySocket;
  const socketToUser = new Map([['s1', 'u1']]);
  const handler = new AdminMetricsHandler({
    io: { to } as never,
    probe,
    socketToUser,
    roleOf: async () => role,
    roomSize: () => roomSize,
  });
  return { handler, probe, emit, to, socket, socketToUser, fire: (sample: HostMetricsSample) => listener?.(sample) };
}

describe('AdminMetricsHandler.handleSubscribe', () => {
  it.each(['BIGBOSS', 'ADMIN'])('un %s rejoint la room et reçoit l’instantané complet', async (role) => {
    const { handler, socket } = harness(role);
    const ack = jest.fn();
    await handler.handleSubscribe(socket, undefined, ack);
    expect(socket.join).toHaveBeenCalledWith(ROOMS.adminHostMetrics());
    expect(ack).toHaveBeenCalledWith({ ok: true, snapshot: SNAPSHOT });
  });

  it('accepte l’accusé passé en premier argument, comme admin-agent:subscribe', async () => {
    const { handler, socket } = harness('ADMIN');
    const ack = jest.fn();
    await handler.handleSubscribe(socket, ack as never, undefined);
    expect(ack).toHaveBeenCalledWith({ ok: true, snapshot: SNAPSHOT });
  });

  it.each(['MODERATOR', 'AUDIT', 'USER', null])('refuse %s sans rejoindre', async (role) => {
    const { handler, socket } = harness(role);
    const ack = jest.fn();
    await handler.handleSubscribe(socket, undefined, ack);
    expect(socket.join).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ ok: false, code: 'FORBIDDEN' });
  });

  it('refuse un socket non authentifié', async () => {
    const { handler, socket, socketToUser } = harness('BIGBOSS');
    socketToUser.clear();
    const ack = jest.fn();
    await handler.handleSubscribe(socket, undefined, ack);
    expect(socket.join).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ ok: false, code: 'FORBIDDEN' });
  });

  it('quitte la room à la désinscription', () => {
    const { handler, socket } = harness('ADMIN');
    handler.handleUnsubscribe(socket);
    expect(socket.leave).toHaveBeenCalledWith(ROOMS.adminHostMetrics());
  });
});

describe('AdminMetricsHandler.start', () => {
  it('démarre la sonde et diffuse chaque échantillon vers la room écoutée', () => {
    const { handler, probe, emit, to, fire } = harness('ADMIN');
    handler.start();
    expect(probe.start).toHaveBeenCalled();
    fire(SAMPLE);
    expect(to).toHaveBeenCalledWith(ROOMS.adminHostMetrics());
    expect(emit).toHaveBeenCalledWith(SERVER_EVENTS.ADMIN_METRICS_SAMPLE, SAMPLE);
  });

  it('ne diffuse rien quand personne n’écoute', () => {
    const { handler, emit, fire } = harness('ADMIN', { roomSize: 0 });
    handler.start();
    fire(SAMPLE);
    expect(emit).not.toHaveBeenCalled();
  });

  it('s’arrête sans laisser d’abonnement', () => {
    const { handler, emit, fire } = harness('ADMIN');
    handler.start();
    handler.stop();
    fire(SAMPLE);
    expect(emit).not.toHaveBeenCalled();
  });
});
