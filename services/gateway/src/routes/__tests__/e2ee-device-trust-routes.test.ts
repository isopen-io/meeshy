/**
 * Le relais de la confirmation d'un appareil par code, par ses deux transports (#19156) :
 * les routes `/api/v1/e2ee/devices/self/verifications*` (Fastify réel) et la socket
 * `e2ee:send-verification`, contre le même juge et le magasin en mémoire.
 *
 * @jest-environment node
 */
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { DEVICE_TRUST_CAPABILITY, DEVICE_VERIFICATION_ERROR_CODES, type DeviceVerificationSendAck } from '@meeshy/shared/types/e2ee-device-trust';
import { E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';
import { registerE2EEDeviceTrustRoutes } from '../e2ee-device-trust';
import { createE2EEDeviceVerificationRelay, DEVICE_VERIFICATION_RATES } from '../../services/e2ee/E2EEDeviceVerificationRelay';
import { createMemorySlidingWindow } from '../../services/e2ee/sliding-window';
import { handleE2EEDeviceVerification, listenE2EEDeviceVerifications } from '../../socketio/handlers/E2EEDeviceVerificationHandler';
import { SOCKET_SESSION_ID } from '../../socketio/disconnectSession';
import { createFakeE2EEStore, type FakeE2EEStore } from '../../services/e2ee/__tests__/fake-e2ee-store';
import { randomIdentityKey } from '../../services/e2ee/__tests__/fake-signatures';

const ALICE = '6745a1b2c3d4e5f601234567';
const SESSIONS = { phone: 'a'.repeat(24), newcomer: 'b'.repeat(24) } as const;
const TX = Buffer.alloc(16, 1).toString('base64');

type Device = { readonly deviceId: number; readonly registrationId: number; readonly identityKey: string; readonly sessionId: string };

function seed(store: FakeE2EEStore, deviceId: number, sessionId: string): Device {
  const device = { deviceId, registrationId: 500 + deviceId, identityKey: randomIdentityKey(), sessionId };
  store.collections.E2EEDevice.insert({
    userId: ALICE, ...device, platform: 'ios', capabilities: [DEVICE_TRUST_CAPABILITY],
    signedPreKeyId: 1, signedPreKey: 'x', signedPreKeySignature: 'x', kyberLastResortId: 1, kyberLastResort: 'x', kyberLastResortSignature: 'x',
  });
  return device;
}

const requestFrom = (device: Device, tx = TX) => ({
  v: 1, type: 'request', tx,
  from: { userId: ALICE, deviceId: device.deviceId, registrationId: device.registrationId, identityKey: device.identityKey, platform: 'ios' },
  commitment: Buffer.alloc(32, 7).toString('base64'),
  methods: ['emoji', 'decimal'],
});

async function buildApp() {
  const store = createFakeE2EEStore();
  const phone = seed(store, 1, SESSIONS.phone);
  const newcomer = seed(store, 2, SESSIONS.newcomer);
  const relay = createE2EEDeviceVerificationRelay({ prisma: store.prisma as never, counters: createMemorySlidingWindow() });
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const auth = async (request: FastifyRequest) => {
    const who = String(request.headers['x-test-user'] ?? '') as keyof typeof SESSIONS;
    (request as unknown as { authContext: unknown }).authContext = SESSIONS[who]
      ? { isAuthenticated: true, isAnonymous: false, userId: ALICE, sessionId: SESSIONS[who] }
      : { isAuthenticated: true, isAnonymous: false, userId: ALICE };
  };
  registerE2EEDeviceTrustRoutes(app, { auth, relay });
  await app.ready();
  return { app, store, relay, phone, newcomer };
}

describe('POST · GET /e2ee/devices/self/verifications et l’accusé (#19156)', () => {
  it('dépose une demande pour mes autres appareils, la sert à la génération destinataire, puis l’efface à l’accusé', async () => {
    const { app, phone, newcomer } = await buildApp();

    const sent = await app.inject({ method: 'POST', url: '/e2ee/devices/self/verifications', headers: { 'x-test-user': 'newcomer' }, payload: { to: 'others', message: requestFrom(newcomer) } });
    const listed = await app.inject({ method: 'GET', url: '/e2ee/devices/self/verifications', headers: { 'x-test-user': 'phone' } });
    const acked = await app.inject({ method: 'POST', url: '/e2ee/devices/self/verifications/ack', headers: { 'x-test-user': 'phone' }, payload: { ids: sent.json().data.ids } });
    const after = await app.inject({ method: 'GET', url: '/e2ee/devices/self/verifications', headers: { 'x-test-user': 'phone' } });

    expect(sent.statusCode).toBe(201);
    expect(sent.json().data.recipients).toEqual([{ deviceId: phone.deviceId, registrationId: phone.registrationId }]);
    expect(listed.json().data.verifications).toEqual([
      { id: sent.json().data.ids[0], relayedFrom: { deviceId: 2, registrationId: newcomer.registrationId }, message: requestFrom(newcomer), createdAt: expect.any(String) },
    ]);
    expect(listed.json().data.nextCursor).toBe(sent.json().data.ids[0]);
    expect(acked.json().data).toEqual({ acknowledged: 1 });
    expect(after.json().data.verifications).toEqual([]);
  });

  it('refuse un appelant sans session d’appareil (401), une charge invalide, un curseur ou un accusé hors forme (400)', async () => {
    const { app } = await buildApp();

    const noSession = await app.inject({ method: 'GET', url: '/e2ee/devices/self/verifications', headers: { 'x-test-user': 'nobody' } });
    const invalid = await app.inject({ method: 'POST', url: '/e2ee/devices/self/verifications', headers: { 'x-test-user': 'newcomer' }, payload: { to: 'others', message: { v: 1, type: 'request' } } });
    const badCursor = await app.inject({ method: 'GET', url: '/e2ee/devices/self/verifications?after=ZZ', headers: { 'x-test-user': 'phone' } });
    const badAck = await app.inject({ method: 'POST', url: '/e2ee/devices/self/verifications/ack', headers: { 'x-test-user': 'phone' }, payload: { ids: [] } });

    expect(noSession.statusCode).toBe(401);
    expect([invalid.statusCode, invalid.json().code]).toEqual([400, DEVICE_VERIFICATION_ERROR_CODES.INVALID]);
    expect([badCursor.statusCode, badAck.statusCode]).toEqual([400, 400]);
  });

  it('au-delà du débit de la génération émettrice : 429 avec `Retry-After`', async () => {
    const { app, newcomer } = await buildApp();
    const send = (index: number) =>
      app.inject({
        method: 'POST', url: '/e2ee/devices/self/verifications', headers: { 'x-test-user': 'newcomer' },
        payload: { to: 'others', message: requestFrom(newcomer, Buffer.alloc(16, 20 + index).toString('base64')) },
      });
    for (let index = 0; index < DEVICE_VERIFICATION_RATES.requestsPerHour; index += 1) await send(index);

    const limited = await send(99);

    expect([limited.statusCode, limited.json().code]).toEqual([429, DEVICE_VERIFICATION_ERROR_CODES.RATE_LIMITED]);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('`e2ee:send-verification` (#19156)', () => {
  const socketOf = (sessionId?: string) => ({ id: 'socket-1', data: sessionId ? { [SOCKET_SESSION_ID]: sessionId } : {} });
  const caller = () => ({ userId: ALICE, isAnonymous: false });

  it('relaie par le même juge que REST, et l’accusé rend les générations atteintes', async () => {
    const { relay, phone, newcomer } = await buildApp();

    const ack = await handleE2EEDeviceVerification(socketOf(SESSIONS.newcomer), { to: 'others', message: requestFrom(newcomer) }, { relay, callerOf: caller });

    expect(ack).toEqual({ success: true, data: { ids: [expect.any(String)], recipients: [{ deviceId: phone.deviceId, registrationId: phone.registrationId }] } });
  });

  it('refuse un invité, une socket sans session, et rend le code du refus du relais', async () => {
    const { relay, newcomer } = await buildApp();

    const anonymous = await handleE2EEDeviceVerification(socketOf(SESSIONS.newcomer), {}, { relay, callerOf: () => ({ userId: ALICE, isAnonymous: true }) });
    const sessionless = await handleE2EEDeviceVerification(socketOf(), {}, { relay, callerOf: caller });
    const lying = await handleE2EEDeviceVerification(
      socketOf(SESSIONS.newcomer),
      { to: 'others', message: { ...requestFrom(newcomer), from: { ...requestFrom(newcomer).from, identityKey: randomIdentityKey() } } },
      { relay, callerOf: caller },
    );

    expect(anonymous).toEqual({ success: false, error: expect.any(String), code: E2EE_ERROR_CODES.DEVICE_NOT_BOUND });
    expect(sessionless).toEqual({ success: false, error: expect.any(String), code: E2EE_ERROR_CODES.DEVICE_NOT_BOUND });
    expect(lying).toEqual({ success: false, error: expect.any(String), code: DEVICE_VERIFICATION_ERROR_CODES.FROM_MISMATCH });
  });

  it('au-delà de la cadence de la socket, refuse AVANT toute lecture de l’annuaire', async () => {
    const { relay, newcomer, store } = await buildApp();
    const reads = { count: 0 };
    const findFirst = store.prisma.e2EEDevice.findFirst;
    store.prisma.e2EEDevice.findFirst = (async (...args: Parameters<typeof findFirst>) => {
      reads.count += 1;
      return findFirst(...args);
    }) as typeof findFirst;

    const ack = await handleE2EEDeviceVerification(socketOf(SESSIONS.newcomer), { to: 'others', message: requestFrom(newcomer) }, { relay, callerOf: caller, withinRate: async () => false });

    expect(ack).toEqual({ success: false, error: expect.any(String), code: DEVICE_VERIFICATION_ERROR_CODES.RATE_LIMITED });
    expect(reads.count).toBe(0);
  });

  it('écoute `e2ee:send-verification` et répond par l’accusé', async () => {
    const { relay, newcomer } = await buildApp();
    const listeners = new Map<string, (data: unknown, ack?: (response: DeviceVerificationSendAck) => void) => void>();
    const socket = { ...socketOf(SESSIONS.newcomer), on: (event: string, listener: (data: unknown, ack?: (response: DeviceVerificationSendAck) => void) => void) => listeners.set(event, listener) };
    listenE2EEDeviceVerifications(socket, { relay, callerOf: caller });

    const ack = await new Promise<DeviceVerificationSendAck>((resolve) => listeners.get(CLIENT_EVENTS.E2EE_SEND_VERIFICATION)?.({ to: 'others', message: requestFrom(newcomer) }, resolve));

    expect(ack.success).toBe(true);
  });
});
