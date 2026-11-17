/** @jest-environment node */
/**
 * Ce qu'un dépôt REFUSÉ coûte (#19156, spec § 5.2) : rien. Ni le budget de demandes de sa
 * génération, ni une clé de transaction dans le repli mémoire quand Redis est en panne — et le
 * repli lui-même reste borné en nombre de clés. Témoins rapportés de l'audit de la PR #19170.
 */
import { DEVICE_TRUST_CAPABILITY } from '@meeshy/shared/types/e2ee-device-trust';
import { createE2EEDeviceVerificationRelay, DEVICE_VERIFICATION_RATES } from '../E2EEDeviceVerificationRelay';
import { createMemorySlidingWindow, createSlidingWindow, type SlidingWindowCounter } from '../sliding-window';
import { createFakeE2EEStore } from './fake-e2ee-store';
import { randomIdentityKey } from './fake-signatures';

const ALICE = '6745a1b2c3d4e5f601234567';
const HOUR_MS = 60 * 60 * 1000;

function world(counters: SlidingWindowCounter) {
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
  const phone = seed(1, 'a'.repeat(24));
  const me = seed(2, 'b'.repeat(24));
  const relay = createE2EEDeviceVerificationRelay({ prisma: store.prisma as never, counters });
  const send = (payload: unknown) => relay.send({ caller: { userId: ALICE, sessionId: me.sessionId }, payload });
  return { phone, me, send };
}

const outcome = async (pending: Promise<unknown>): Promise<number> => {
  try {
    await pending;
    return 201;
  } catch (error) {
    return (error as { status: number }).status;
  }
};

describe('un dépôt refusé ne coûte rien', () => {
  it('des demandes refusées (génération nommée périmée, 409) ne consomment pas les demandes de l’heure', async () => {
    const { me, send } = world(createMemorySlidingWindow());
    const request = (fill: number) => ({
      v: 1,
      type: 'request',
      tx: Buffer.alloc(16, fill).toString('base64'),
      from: { userId: ALICE, deviceId: me.deviceId, registrationId: me.registrationId, identityKey: me.identityKey, platform: 'ios' },
      commitment: Buffer.alloc(32, 7).toString('base64'),
      methods: ['emoji'],
    });
    const stale = Array.from({ length: DEVICE_VERIFICATION_RATES.requestsPerHour }, (_, index) =>
      outcome(send({ to: { deviceId: 1, registrationId: 9999 }, message: request(index + 1) })),
    );

    expect(await Promise.all(stale)).toEqual(stale.map(() => 409));
    expect(await outcome(send({ to: 'others', message: request(9) }))).toBe(201);
  });

  it('Redis en panne : un envoi refusé par le débit horaire ne laisse aucune clé de transaction dans la mémoire du processus', async () => {
    const brokenRedis = { eval: async () => Promise.reject(new Error('down')) };
    const { phone, send } = world(createSlidingWindow(brokenRedis as never));
    const txKeys = new Set<string>();
    const set = Map.prototype.set;
    const spy = jest.spyOn(Map.prototype, 'set').mockImplementation(function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
      if (typeof key === 'string' && key.includes(':tx:')) txKeys.add(key);
      return set.call(this, key, value);
    });
    const cancels = Array.from({ length: 200 }, (_, index) => Buffer.from(Array.from({ length: 16 }, (__, byte) => (index * 7 + byte) & 255)).toString('base64'));

    const statuses: number[] = [];
    for (const tx of cancels) {
      statuses.push(await outcome(send({ to: { deviceId: phone.deviceId, registrationId: phone.registrationId }, message: { v: 1, type: 'cancel', tx, reason: 'timeout' } })));
    }
    spy.mockRestore();

    expect(statuses.filter((status) => status === 429)).toHaveLength(200 - DEVICE_VERIFICATION_RATES.messagesPerHour);
    expect(txKeys.size).toBeLessThanOrEqual(DEVICE_VERIFICATION_RATES.messagesPerHour);
  });

  it('le repli mémoire a un plafond dur de clés : au-delà, la clé la moins récemment comptée est oubliée', async () => {
    const counters = createMemorySlidingWindow({ maxKeys: 3 });
    const at = { max: 1, windowMs: HOUR_MS, now: Date.parse('2026-11-17T10:00:00Z') };
    await counters.hit('a', at);
    await counters.hit('b', at);
    await counters.hit('c', at);

    expect((await counters.peek('a', at)).allowed).toBe(false);
    await counters.hit('d', at);

    expect((await counters.peek('a', at)).allowed).toBe(true);
    expect((await counters.peek('d', at)).allowed).toBe(false);
    expect((await counters.peek('c', at)).allowed).toBe(false);
  });

  it('regarder une fenêtre ne la consomme pas', async () => {
    const counters = createMemorySlidingWindow();
    const at = { max: 1, windowMs: HOUR_MS, now: Date.parse('2026-11-17T10:00:00Z') };

    await counters.peek('k', at);
    await counters.peek('k', at);

    expect(await counters.hit('k', at)).toEqual({ allowed: true, count: 1, retryAfter: 0 });
  });
});
