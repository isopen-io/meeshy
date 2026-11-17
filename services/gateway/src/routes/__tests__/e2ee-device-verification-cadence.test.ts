/** @jest-environment node */
/**
 * La cadence des dépôts de comparaison (#19156, spec § 5.2) se compte par SESSION, sur les deux
 * transports : une session du compte qui n'a aucun appareil chiffré (un mot de passe volé) ne
 * prive pas le vrai nouvel appareil de sa comparaison. Témoin rapporté de l'audit de la PR #19170.
 */
import Fastify, { type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { DEVICE_TRUST_CAPABILITY, DEVICE_VERIFICATION_ERROR_CODES } from '@meeshy/shared/types/e2ee-device-trust';
import { registerE2EEDeviceTrustRoutes } from '../e2ee-device-trust';
import { createE2EEDeviceVerificationRelay } from '../../services/e2ee/E2EEDeviceVerificationRelay';
import { createMemorySlidingWindow } from '../../services/e2ee/sliding-window';
import { handleE2EEDeviceVerification, E2EE_VERIFICATION_SOCKET_RATE_LIMIT } from '../../socketio/handlers/E2EEDeviceVerificationHandler';
import { SocketRateLimiter } from '../../utils/socket-rate-limiter';
import { SOCKET_SESSION_ID } from '../../socketio/disconnectSession';
import { createFakeE2EEStore } from '../../services/e2ee/__tests__/fake-e2ee-store';
import { randomIdentityKey } from '../../services/e2ee/__tests__/fake-signatures';

const ALICE = '6745a1b2c3d4e5f601234567';
const SESSIONS = { phone: 'a'.repeat(24), newcomer: 'b'.repeat(24), thief: 'c'.repeat(24) } as const;
const CADENCE = E2EE_VERIFICATION_SOCKET_RATE_LIMIT.maxRequests;

function world() {
  const store = createFakeE2EEStore();
  const seed = (deviceId: number, sessionId: string) => {
    const device = { deviceId, registrationId: 500 + deviceId, identityKey: randomIdentityKey(), sessionId };
    store.collections.E2EEDevice.insert({
      userId: ALICE,
      ...device,
      platform: 'ios',
      capabilities: [DEVICE_TRUST_CAPABILITY],
      signedPreKeyId: 1,
      signedPreKey: 'x',
      signedPreKeySignature: 'x',
      kyberLastResortId: 1,
      kyberLastResort: 'x',
      kyberLastResortSignature: 'x',
    });
    return device;
  };
  seed(1, SESSIONS.phone);
  const newcomer = seed(2, SESSIONS.newcomer);
  const relay = createE2EEDeviceVerificationRelay({ prisma: store.prisma as never, counters: createMemorySlidingWindow() });
  const legit = {
    to: 'others',
    message: {
      v: 1,
      type: 'request',
      tx: Buffer.alloc(16, 1).toString('base64'),
      from: { userId: ALICE, deviceId: newcomer.deviceId, registrationId: newcomer.registrationId, identityKey: newcomer.identityKey, platform: 'ios' },
      commitment: Buffer.alloc(32, 7).toString('base64'),
      methods: ['emoji', 'decimal'],
    },
  };
  return { relay, legit };
}

describe('la cadence des dépôts de comparaison se compte par session', () => {
  it('REST : une session sans appareil chiffré qui épuise SA cadence ne prive pas le nouvel appareil, et elle-même reste bornée', async () => {
    const { relay, legit } = world();
    const app = Fastify({ logger: false });
    await app.register(rateLimit, { global: false });
    const auth = async (request: FastifyRequest) => {
      const who = String(request.headers['x-who']) as keyof typeof SESSIONS;
      (request as unknown as { authContext: unknown }).authContext = { isAuthenticated: true, isAnonymous: false, userId: ALICE, sessionId: SESSIONS[who] };
    };
    registerE2EEDeviceTrustRoutes(app, { auth, relay });
    await app.ready();
    const fromThief = (index: number) => app.inject({ method: 'POST', url: '/e2ee/devices/self/verifications', headers: { 'x-who': 'thief' }, payload: { junk: index } });
    for (let index = 0; index < CADENCE; index += 1) await fromThief(index);

    const thiefAgain = await fromThief(CADENCE);
    const victim = await app.inject({ method: 'POST', url: '/e2ee/devices/self/verifications', headers: { 'x-who': 'newcomer' }, payload: legit });

    expect(thiefAgain.statusCode).toBe(429);
    expect(victim.statusCode).toBe(201);
    await app.close();
  });

  it('socket : même effet par e2ee:send-verification, avec le câblage de E2EEDeviceChannels', async () => {
    const { relay, legit } = world();
    const limiter = new SocketRateLimiter();
    const deps = { relay, callerOf: () => ({ userId: ALICE, isAnonymous: false }), withinRate: (key: string) => limiter.checkLimit(key, E2EE_VERIFICATION_SOCKET_RATE_LIMIT) };
    const socketOf = (id: string, sessionId: string) => ({ id, data: { [SOCKET_SESSION_ID]: sessionId }, on: () => undefined });
    const thief = socketOf('t', SESSIONS.thief);
    for (let index = 0; index < CADENCE; index += 1) await handleE2EEDeviceVerification(thief as never, { junk: index }, deps);

    const thiefAgain = await handleE2EEDeviceVerification(thief as never, { junk: CADENCE }, deps);
    const victim = await handleE2EEDeviceVerification(socketOf('n', SESSIONS.newcomer) as never, legit, deps);

    expect(thiefAgain).toEqual(expect.objectContaining({ success: false, code: DEVICE_VERIFICATION_ERROR_CODES.RATE_LIMITED }));
    expect(victim).toEqual(expect.objectContaining({ success: true }));
  });
});
