/**
 * L'annonce de mes appareils chiffrés (#19156, spec 2026-11-17 § 5.3, § 9 2 ter, § 7.6) :
 * un enrôlement fait par l'API SEULE — un client modifié qui ne se présente jamais — produit
 * l'événement vers mes autres appareils capables et le push visible, dont la charge ne porte
 * ni libellé, ni clé, ni `tx`, ni identifiant de regroupement qui le nomme.
 *
 * @jest-environment node
 */
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { DEVICE_TRUST_CAPABILITY } from '@meeshy/shared/types/e2ee-device-trust';
import { enrolmentHook, registerE2EERoutes } from '../../../routes/e2ee';
import { createE2EEDirectory } from '../E2EEDirectory';
import { createE2EEEnvelopeRelay } from '../E2EEEnvelopeRelay';
import { retireDevicesAfterSessionEnd } from '../device-retirement';
import { setE2EEEnvelopeIOProvider } from '../envelope-delivery';
import {
  announceRetiredGenerations,
  createOwnDeviceAnnouncements,
  deviceVerificationPush,
  E2EE_DEVICE_VERIFICATION_COLLAPSE_ID,
} from '../own-device-announcements';
import { createMemorySlidingWindow } from '../sliding-window';
import { tokenRoutesPushType } from '../../push-type-routing';
import type { PushNotificationPayload } from '../../PushNotificationService';
import { createFakeE2EEStore, type FakeE2EEStore } from './fake-e2ee-store';
import { fakeDeviceKeys, fakeVerifier } from './fake-signatures';

const ALICE = 'a1'.repeat(12);
const BOB = 'b2'.repeat(12);
const SESSIONS: Record<string, string> = { phone: 'c3'.repeat(12), tablet: 'c7'.repeat(12), intruder: 'c8'.repeat(12), laptop: 'c9'.repeat(12), bob: 'd4'.repeat(12) };
const USERS: Record<string, string> = { phone: ALICE, tablet: ALICE, intruder: ALICE, laptop: ALICE, bob: BOB };

type Emitted = { readonly room: string; readonly event: string; readonly payload: unknown };

function fakeIo() {
  const emitted: Emitted[] = [];
  const io = {
    to: (room: string) => ({ emit: (event: string, payload: unknown) => { emitted.push({ room, event, payload }); return true; } }),
    in: () => ({ fetchSockets: async () => [], socketsLeave: () => undefined }),
  };
  return { io, emitted };
}

async function buildApp() {
  const store = createFakeE2EEStore();
  Object.values(SESSIONS).forEach((id) => store.collections.UserSession.insert({ id }));
  const users = { findUnique: async () => ({ systemLanguage: 'en', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null }) };
  const { io, emitted } = fakeIo();
  const pushes: { userId: string; payload: PushNotificationPayload }[] = [];
  const announcements = createOwnDeviceAnnouncements({
    prisma: { ...store.prisma, user: users } as never,
    counters: createMemorySlidingWindow(),
    io: () => io,
    push: async (sent) => {
      pushes.push(sent);
    },
  });
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const auth = async (request: FastifyRequest) => {
    const who = String(request.headers['x-test-user'] ?? '');
    (request as unknown as { authContext: unknown }).authContext = USERS[who]
      ? { isAuthenticated: true, isAnonymous: false, userId: USERS[who], sessionId: SESSIONS[who] }
      : { isAuthenticated: false, isAnonymous: true };
  };
  registerE2EERoutes(app, {
    auth,
    directory: createE2EEDirectory({ prisma: store.prisma as never, verifier: fakeVerifier }),
    relay: createE2EEEnvelopeRelay({ prisma: store.prisma as never }),
    mayReadKeysOf: async () => true,
    closeSession: async () => true,
    onEnrolled: enrolmentHook({ io: () => io, announcements }),
  });
  await app.ready();
  return { app, store, emitted, pushes, io };
}

const enrol = (app: FastifyInstance, who: string, options: { capable?: boolean; label?: string; keys?: ReturnType<typeof fakeDeviceKeys>; at?: number } = {}) => {
  const keys = options.keys ?? fakeDeviceKeys();
  return app.inject({
    method: 'POST',
    url: '/e2ee/devices',
    headers: { 'x-test-user': who },
    payload: {
      binding: keys.binding(USERS[who] ?? '', options.at),
      registrationId: keys.registrationId,
      identityKey: keys.identityKey,
      signedPreKey: keys.signedPreKey,
      kyberLastResort: keys.kyberLastResort,
      platform: 'ios',
      ...(options.label ? { label: options.label } : {}),
      ...(options.capable === false ? {} : { capabilities: [DEVICE_TRUST_CAPABILITY] }),
    },
  });
};

const deviceRoom = (store: FakeE2EEStore, sessionId: string): string => {
  const row = store.collections.E2EEDevice.rows.find((device) => device.sessionId === sessionId && device.retiredAt === null);
  return `device:${String(row?.userId)}:${String(row?.deviceId)}:${String(row?.registrationId)}`;
};

describe('l’annonce de mes appareils chiffrés (#19156)', () => {
  afterEach(() => setE2EEEnvelopeIOProvider(() => null));

  it('un enrôlement fait par l’API seule s’annonce à mes AUTRES appareils capables, et pousse une bannière générique', async () => {
    const { app, store, emitted, pushes } = await buildApp();
    await enrol(app, 'phone');
    await enrol(app, 'tablet', { capable: false });
    emitted.splice(0);
    pushes.splice(0);

    const intrusion = await enrol(app, 'intruder', { label: 'iPhone de Zoé' });

    expect(intrusion.statusCode).toBe(201);
    expect(emitted).toEqual([
      {
        room: deviceRoom(store, SESSIONS.phone),
        event: SERVER_EVENTS.E2EE_OWN_DEVICE_ENROLLED,
        payload: {
          deviceId: 3,
          registrationId: expect.any(Number),
          platform: 'ios',
          label: 'iPhone de Zoé',
          enrolledAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          capabilities: [DEVICE_TRUST_CAPABILITY],
          returning: false,
          announcedInLastHour: 3,
        },
      },
    ]);
    expect(pushes).toEqual([
      { userId: ALICE, payload: { title: 'New device on your account', body: 'Open Meeshy to confirm it.', data: { type: 'e2ee_device_verification', fromDeviceId: '3' } } },
    ]);
    expect(JSON.stringify(pushes)).not.toMatch(/Zoé|identityKey|tx|thread|collapse|tag/i);
  });

  it('un compte voisin n’entend rien, et un réenrôlement d’un appareil déjà actif ne s’annonce pas', async () => {
    const { app, emitted, pushes } = await buildApp();
    const keys = fakeDeviceKeys();
    await enrol(app, 'phone', { keys, at: Date.now() - 1000 });
    emitted.splice(0);
    pushes.splice(0);

    await enrol(app, 'bob');
    const bobPushes = pushes.splice(0);
    const again = await enrol(app, 'phone', { keys, at: Date.now() });

    expect(again.statusCode).toBe(200);
    expect(emitted).toEqual([]);
    expect(bobPushes.map((sent) => sent.userId)).toEqual([BOB]);
    expect(pushes).toEqual([]);
  });

  it('le retour d’une génération retirée (session finie puis reconnexion) s’annonce `returning`', async () => {
    const { app, store, emitted } = await buildApp();
    const keys = fakeDeviceKeys({ registrationId: 4242 });
    await enrol(app, 'phone');
    await enrol(app, 'tablet', { keys, at: Date.now() - 5000 });
    store.collections.UserSession.rows.forEach((session) => {
      if (session.id === SESSIONS.tablet) Object.assign(session, { isValid: false, invalidatedReason: 'expired' });
    });
    await retireDevicesAfterSessionEnd(store.prisma as never, { sessionId: SESSIONS.tablet }, (error) => {
      throw error;
    });
    emitted.splice(0);

    const back = await app.inject({
      method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'intruder' },
      payload: {
        binding: keys.binding(ALICE), registrationId: keys.registrationId, identityKey: keys.identityKey,
        signedPreKey: keys.signedPreKey, kyberLastResort: keys.kyberLastResort, platform: 'ios', capabilities: [DEVICE_TRUST_CAPABILITY],
      },
    });

    expect(back.json().data).toEqual({ deviceId: 2, created: false });
    expect(emitted.map((entry) => [entry.event, (entry.payload as { returning: boolean }).returning])).toEqual([[SERVER_EVENTS.E2EE_OWN_DEVICE_ENROLLED, true]]);
  });

  it('au-delà de trois annonces dans l’heure, le push se regroupe : passif, et il REMPLACE le précédent sans nommer d’appareil', async () => {
    const { app, pushes, emitted } = await buildApp();
    await enrol(app, 'phone');
    await enrol(app, 'tablet');
    await enrol(app, 'intruder');
    pushes.splice(0);
    emitted.splice(0);

    await enrol(app, 'laptop');

    expect(pushes.map((sent) => sent.payload)).toEqual([
      {
        title: '4 new devices on your account',
        body: 'Open Meeshy to check them.',
        data: { type: 'e2ee_device_verification', fromDeviceId: '4' },
        collapseId: E2EE_DEVICE_VERIFICATION_COLLAPSE_ID,
        interruptionLevel: 'passive',
      },
    ]);
    expect(emitted.map((entry) => (entry.payload as { announcedInLastHour: number }).announcedInLastHour)).toEqual([4, 4, 4]);
    const grouped = deviceVerificationPush({ language: 'fr', fromDeviceId: 5, announcedInLastHour: 4 });

    expect(grouped).toEqual({
      title: '4 nouveaux appareils sur votre compte',
      body: 'Ouvrez Meeshy pour les vérifier.',
      data: { type: 'e2ee_device_verification', fromDeviceId: '5' },
      collapseId: E2EE_DEVICE_VERIFICATION_COLLAPSE_ID,
      interruptionLevel: 'passive',
    });
    expect(deviceVerificationPush({ language: 'fr', fromDeviceId: 5, announcedInLastHour: 3 })).toEqual({
      title: 'Nouvel appareil sur votre compte',
      body: 'Ouvrez Meeshy pour le confirmer.',
      data: { type: 'e2ee_device_verification', fromDeviceId: '5' },
    });
  });

  it('une demande ne repousse que si aucun push n’est parti pour sa génération depuis dix minutes', async () => {
    const store = createFakeE2EEStore();
    store.collections.E2EEDevice.insert({ userId: ALICE, deviceId: 2, registrationId: 22, sessionId: 's', identityKey: 'k', platform: 'ios', capabilities: [DEVICE_TRUST_CAPABILITY] });
    const clock = { now: new Date('2026-11-17T10:00:00Z') };
    const pushes: unknown[] = [];
    const announcements = createOwnDeviceAnnouncements({
      prisma: { ...store.prisma, user: { findUnique: async () => null } } as never,
      counters: createMemorySlidingWindow(),
      now: () => clock.now,
      io: () => null,
      push: async (sent) => {
        pushes.push(sent);
      },
    });
    const sender = { userId: ALICE, deviceId: 2, registrationId: 22 };

    await announcements.enrolled({ ...sender, returning: false });
    await announcements.requested(sender);
    clock.now = new Date(clock.now.getTime() + 10 * 60_000 + 1);
    await announcements.requested(sender);

    expect(pushes).toHaveLength(2);
  });

  it('un retrait s’annonce `e2ee:own-device-retired` à mes autres appareils capables, et à eux seuls', async () => {
    const store = createFakeE2EEStore();
    const device = (deviceId: number, capabilities: string[], userId = ALICE) =>
      store.collections.E2EEDevice.insert({ userId, deviceId, registrationId: 100 + deviceId, sessionId: `s${deviceId}`, identityKey: `k${deviceId}`, platform: 'ios', capabilities });
    device(1, [DEVICE_TRUST_CAPABILITY]);
    device(2, []);
    device(3, [DEVICE_TRUST_CAPABILITY], BOB);
    const { io, emitted } = fakeIo();

    await announceRetiredGenerations(store.prisma as never, [{ userId: ALICE, deviceId: 4, registrationId: 104 }], () => io);

    expect(emitted).toEqual([{ room: `device:${ALICE}:1:101`, event: SERVER_EVENTS.E2EE_OWN_DEVICE_RETIRED, payload: { deviceId: 4, registrationId: 104 } }]);
  });

  it('aucun client publié ne reçoit encore ce type de push : ses planchers sont `null` partout', () => {
    const tokens = [
      { platform: 'ios', appVersion: '9.9.9', bundleId: 'me.meeshy.app' },
      { platform: 'android', appVersion: '9.9.9', bundleId: 'me.meeshy.app' },
      { platform: 'android', appVersion: '9.9.9', bundleId: 'me.meeshy.webapp' },
      { platform: 'web', appVersion: '9.9.9', bundleId: null },
    ];
    expect(tokens.map((token) => tokenRoutesPushType(token, 'e2ee_device_verification'))).toEqual([false, false, false, false]);
  });
});
