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

type Member = { readonly id: string; leave: ReturnType<typeof jest.fn> };

function harness(
  role: string | null,
  { roomSize = 1, admit = async () => true }: { roomSize?: number; admit?: (userId: string) => Promise<boolean> } = {},
) {
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
  const members: Member[] = [];
  const fetchSockets = jest.fn(async () => members);
  const socket = { id: 's1', join: jest.fn(), leave: jest.fn() } as unknown as MeeshySocket;
  const socketToUser = new Map([['s1', 'u1']]);
  const roles = { current: role };
  const roleOf = jest.fn(async () => roles.current);
  const clock = { now: 0 };
  const handler = new AdminMetricsHandler({
    io: { to, local: { in: () => ({ fetchSockets }) } } as never,
    probe,
    socketToUser,
    roleOf,
    roomSize: () => roomSize,
    subscribeGate: admit,
    now: () => clock.now,
  });
  const fire = async (sample: HostMetricsSample) => {
    listener?.(sample);
    await handler.settled();
  };
  return { handler, probe, emit, to, socket, socketToUser, members, fetchSockets, roleOf, roles, clock, fire };
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

  it('l’abonnement est borné AVANT la lecture du rang : refusé RATE_LIMITED sans lecture Prisma ni room (#10459 point 1)', async () => {
    const { handler, socket, roleOf } = harness('ADMIN', { admit: async () => false });
    const ack = jest.fn();
    await handler.handleSubscribe(socket, undefined, ack);
    expect(ack).toHaveBeenCalledWith({ ok: false, code: 'RATE_LIMITED' });
    expect(roleOf).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('la porte compte par utilisateur, pas par socket', async () => {
    const seen: string[] = [];
    const { handler, socket } = harness('ADMIN', { admit: async (userId) => { seen.push(userId); return true; } });
    await handler.handleSubscribe(socket, undefined, jest.fn());
    expect(seen).toEqual(['u1']);
  });
});

describe('un administrateur rétrogradé ne reste pas dans la room (#10459 point 1)', () => {
  const member = (id: string): Member => ({ id, leave: jest.fn() });

  it('le rang est revérifié au plus une fois par minute : un ADMIN passé USER quitte la room AVANT l’échantillon suivant', async () => {
    const { handler, emit, members, roles, clock, fire, fetchSockets } = harness('ADMIN');
    const s1 = member('s1');
    members.push(s1);
    handler.start();
    await fire(SAMPLE);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(fetchSockets).not.toHaveBeenCalled();

    roles.current = 'USER';
    clock.now = 30_000;
    await fire(SAMPLE);
    expect(s1.leave).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(2);

    clock.now = 60_000;
    await fire(SAMPLE);
    expect(s1.leave).toHaveBeenCalledWith(ROOMS.adminHostMetrics());
    expect(emit).toHaveBeenCalledTimes(3);
  });

  it('un socket dont le compte n’est plus connu est évincé ; un ADMIN toujours en rang reste, et le rang se lit une fois par compte', async () => {
    const { handler, members, socketToUser, roleOf, clock, fire } = harness('ADMIN');
    const kept = member('s1');
    const twin = member('s1-bis');
    const orphan = member('s9');
    members.push(kept, twin, orphan);
    socketToUser.set('s1-bis', 'u1');
    handler.start();
    await fire(SAMPLE);
    clock.now = 60_000;
    await fire(SAMPLE);
    expect(kept.leave).not.toHaveBeenCalled();
    expect(twin.leave).not.toHaveBeenCalled();
    expect(orphan.leave).toHaveBeenCalledWith(ROOMS.adminHostMetrics());
    expect(roleOf).toHaveBeenCalledTimes(1);
  });

  it('une lecture de rang qui échoue ne décide rien : la room est gardée et la revérification est retentée à l’échantillon suivant', async () => {
    const { handler, members, roleOf, clock, fire, emit } = harness('ADMIN');
    const s1 = member('s1');
    members.push(s1);
    roleOf.mockRejectedValueOnce(new Error('db down'));
    handler.start();
    await fire(SAMPLE);
    clock.now = 60_000;
    await fire(SAMPLE);
    expect(s1.leave).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(2);
    clock.now = 65_000;
    await fire(SAMPLE);
    expect(roleOf).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledTimes(3);
  });
});

describe('AdminMetricsHandler.start', () => {
  it('démarre la sonde et diffuse chaque échantillon vers la room écoutée', async () => {
    const { handler, probe, emit, to, fire } = harness('ADMIN');
    handler.start();
    expect(probe.start).toHaveBeenCalled();
    await fire(SAMPLE);
    expect(to).toHaveBeenCalledWith(ROOMS.adminHostMetrics());
    expect(emit).toHaveBeenCalledWith(SERVER_EVENTS.ADMIN_METRICS_SAMPLE, SAMPLE);
  });

  it('ne diffuse rien quand personne n’écoute', async () => {
    const { handler, emit, fire } = harness('ADMIN', { roomSize: 0 });
    handler.start();
    await fire(SAMPLE);
    expect(emit).not.toHaveBeenCalled();
  });

  it('s’arrête sans laisser d’abonnement', async () => {
    const { handler, emit, fire } = harness('ADMIN');
    handler.start();
    handler.stop();
    await fire(SAMPLE);
    expect(emit).not.toHaveBeenCalled();
  });
});
