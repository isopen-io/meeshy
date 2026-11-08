/**
 * #14107 (PRE-07) — `GET /directory/presence` porte `doNotDisturb` jusqu'au FIL :
 * une Connaissance en Ne pas déranger se lit indisponible, un inconnu jamais.
 * Le schéma de réponse le déclare, sans quoi `fast-json-stringify` le retirerait.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { directoryPresenceRoutes } from '../../../../routes/directory/presence';
import { ADULT_BIRTH, messagingWorld, table } from '../../../helpers/messaging-circle-world';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

const LECTEUR = '6600000000000000000000a1';
const CONNAISSANCE = '6600000000000000000000a2';
const INCONNU = '6600000000000000000000a3';
const MIDI = { dndEnabled: true, dndStartTime: '10:00', dndEndTime: '14:00', dndDays: [], dndUtcOffsetMinutes: 0 };
const A_MIDI = new Date('2026-11-02T12:00:00.000Z');

async function lire() {
  jest.useFakeTimers({
    now: A_MIDI,
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'],
  });
  const world = messagingWorld({
    links: [[LECTEUR, CONNAISSANCE, 'ACQUAINTANCE']],
    users: [LECTEUR, CONNAISSANCE, INCONNU].map((id) => ({ id, birthDate: ADULT_BIRTH, lastActiveAt: null })),
  });
  const userPreferences = table([CONNAISSANCE, INCONNU].map((userId) => ({ userId, notification: MIDI, privacy: { showOnlineStatus: true } })));
  const app = Fastify({ logger: false });
  app.decorate('prisma', { ...world.prisma, userPreferences } as never);
  app.decorate('presenceChecker', { bulk: (ids: readonly string[]) => new Map(ids.map((id) => [id, false])) } as never);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, type: 'user', userId: LECTEUR, registeredUser: { id: LECTEUR, role: 'USER' } };
  });
  await app.register(directoryPresenceRoutes, { prefix: '/api/v1/directory' });
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/api/v1/directory/presence?ids=${CONNAISSANCE},${INCONNU}` });
  await app.close();
  jest.useRealTimers();
  return res;
}

describe('GET /directory/presence — Ne pas déranger visible dès Connaissance', () => {
  it('sert doNotDisturb à une Connaissance, false à un inconnu', async () => {
    const res = await lire();
    expect(res.statusCode).toBe(200);
    const users = res.json().data.users as Array<{ userId: string; doNotDisturb: boolean }>;
    expect(users.find((u) => u.userId === CONNAISSANCE)?.doNotDisturb).toBe(true);
    expect(users.find((u) => u.userId === INCONNU)?.doNotDisturb).toBe(false);
  });
});
