/**
 * Le relais des messages de comparaison (#19156, spec 2026-11-17 § 5.2), prouvé contre le
 * magasin en mémoire : aucun message entre deux comptes, adressage par génération, `from` égal
 * à l'annuaire, schémas qui refusent ce que les clients refusent, débits par génération, copies
 * d'une demande prise remplacées par `cancel(accepted-elsewhere)`, dix minutes de vie.
 *
 * @jest-environment node
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { DEVICE_TRUST_CAPABILITY, DEVICE_VERIFICATION_ERROR_CODES, DEVICE_VERIFICATION_TTL_MS } from '@meeshy/shared/types/e2ee-device-trust';
import { E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';
import {
  createE2EEDeviceVerificationRelay,
  DeviceVerificationRefusedError,
  DEVICE_VERIFICATION_RATES,
  type VerificationDelivery,
} from '../E2EEDeviceVerificationRelay';
import { createMemorySlidingWindow } from '../sliding-window';
import { createFakeE2EEStore, type FakeE2EEStore } from './fake-e2ee-store';
import { randomIdentityKey } from './fake-signatures';

const ALICE = '6745a1b2c3d4e5f601234567';
const BOB = '6745a1b2c3d4e5f601234568';
const START = new Date('2026-11-17T10:00:00Z');
const MINUTE = 60_000;

const bytes = (length: number, fill: number) => Buffer.alloc(length, fill).toString('base64');
const TX = bytes(16, 1);
const OTHER_TX = bytes(16, 2);

type Seeded = {
  readonly userId: string;
  readonly deviceId: number;
  readonly registrationId: number;
  readonly sessionId: string;
  readonly identityKey: string;
  readonly platform: 'ios' | 'android' | 'web';
  readonly label?: string;
};

function seed(store: FakeE2EEStore, device: Partial<Seeded> & { readonly deviceId: number }, options: { readonly capable?: boolean } = {}): Seeded {
  const seeded: Seeded = {
    userId: ALICE,
    registrationId: 1000 + device.deviceId,
    sessionId: `${device.deviceId}`.padStart(24, 'a'),
    identityKey: randomIdentityKey(),
    platform: 'ios',
    ...device,
  };
  store.collections.E2EEDevice.insert({
    ...seeded,
    label: seeded.label ?? null,
    capabilities: options.capable === false ? [] : [DEVICE_TRUST_CAPABILITY],
    signedPreKeyId: 1, signedPreKey: 'x', signedPreKeySignature: 'x',
    kyberLastResortId: 1, kyberLastResort: 'x', kyberLastResortSignature: 'x',
  });
  return seeded;
}

const descriptorOf = (device: Seeded) => ({
  userId: device.userId,
  deviceId: device.deviceId,
  registrationId: device.registrationId,
  identityKey: device.identityKey,
  platform: device.platform,
  ...(device.label ? { label: device.label } : {}),
});
const request = (from: Seeded, tx = TX) => ({ v: 1, type: 'request', tx, from: descriptorOf(from), commitment: bytes(32, 7), methods: ['emoji', 'decimal'] });
const accept = (from: Seeded, tx = TX) => ({ v: 1, type: 'accept', tx, from: descriptorOf(from), nonce: bytes(32, 9), method: 'emoji' });
const reveal = (tx = TX) => ({ v: 1, type: 'reveal', tx, nonce: bytes(32, 3) });
const cancel = (reason: string, tx = TX) => ({ v: 1, type: 'cancel', tx, reason });
const to = (device: Seeded) => ({ deviceId: device.deviceId, registrationId: device.registrationId });
const callerOf = (device: Seeded) => ({ userId: device.userId, sessionId: device.sessionId });

function relayWith(store = createFakeE2EEStore()) {
  const clock = { now: START };
  const deliveries: VerificationDelivery[] = [];
  const requested: unknown[] = [];
  const relay = createE2EEDeviceVerificationRelay({
    prisma: store.prisma as never,
    counters: createMemorySlidingWindow(),
    now: () => clock.now,
    deliver: (sent) => deliveries.push(...sent),
    onRequest: async (sender) => {
      requested.push(sender);
    },
  });
  const advance = (ms: number) => {
    clock.now = new Date(clock.now.getTime() + ms);
  };
  return { store, relay, deliveries, requested, advance };
}

const refusal = async (promise: Promise<unknown>): Promise<DeviceVerificationRefusedError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DeviceVerificationRefusedError) return error;
    throw error;
  }
  throw new Error('refus attendu');
};

describe('le relais de la confirmation d’un appareil par code (#19156)', () => {
  describe('adressage : mes seuls appareils, par génération', () => {
    it('une demande à « others » part vers mes autres appareils actifs et CAPABLES, jamais vers moi ni vers un autre compte', async () => {
      const { store, relay, deliveries } = relayWith();
      const phone = seed(store, { deviceId: 1, label: 'iPhone de Zoé' });
      const tablet = seed(store, { deviceId: 2, platform: 'android' });
      seed(store, { deviceId: 3, platform: 'web' }, { capable: false });
      seed(store, { userId: BOB, deviceId: 1 });
      const newcomer = seed(store, { deviceId: 4 });

      const sent = await relay.send({ caller: callerOf(newcomer), payload: { to: 'others', message: request(newcomer) } });

      expect(sent.recipients).toEqual([to(phone), to(tablet)]);
      expect(sent.ids).toHaveLength(2);
      expect(deliveries.map((delivery) => delivery.recipient)).toEqual([{ userId: ALICE, ...to(phone) }, { userId: ALICE, ...to(tablet) }]);
      expect(deliveries[0]?.served).toEqual({
        id: sent.ids[0],
        relayedFrom: to(newcomer),
        message: request(newcomer),
        createdAt: START.toISOString(),
      });
    });

    it('un AUTRE compte ne peut ni écrire dans le relais d’un autre, ni lire, ni accuser ce qui ne lui est pas adressé', async () => {
      const { store, relay } = relayWith();
      const alicePhone = seed(store, { deviceId: 1 });
      const aliceNew = seed(store, { deviceId: 2 });
      const bobPhone = seed(store, { userId: BOB, deviceId: 1 });
      const bobOther = seed(store, { userId: BOB, deviceId: 2 });
      const sent = await relay.send({ caller: callerOf(aliceNew), payload: { to: 'others', message: request(aliceNew) } });

      const crossing = await refusal(relay.send({ caller: callerOf(bobPhone), payload: { to: to(alicePhone), message: request(bobPhone) } }));
      const spoofing = await refusal(relay.send({ caller: callerOf(bobPhone), payload: { to: 'others', message: request(aliceNew) } }));
      const bobReads = await relay.list({ caller: callerOf(bobPhone) });
      const bobAcks = await relay.ack({ caller: callerOf(bobPhone), ids: sent.ids });
      const bobOthers = await relay.send({ caller: callerOf(bobPhone), payload: { to: 'others', message: request(bobPhone, OTHER_TX) } });

      expect(crossing.status).toBe(409);
      expect(crossing.code).toBe(E2EE_ERROR_CODES.DEVICE_CHANGED);
      expect(spoofing.code).toBe(DEVICE_VERIFICATION_ERROR_CODES.FROM_MISMATCH);
      expect(bobReads).toEqual([]);
      expect(bobAcks).toBe(0);
      expect(await relay.list({ caller: callerOf(alicePhone) })).toHaveLength(1);
      expect(bobOthers.recipients).toEqual([to(bobOther)]);
    });

    it('une génération nommée doit être active, capable et pas moi ; sinon 409 et rien n’est déposé', async () => {
      const { store, relay } = relayWith();
      const newcomer = seed(store, { deviceId: 2 });
      const incapable = seed(store, { deviceId: 3 }, { capable: false });
      const phone = seed(store, { deviceId: 1 });
      const stale = { deviceId: phone.deviceId, registrationId: phone.registrationId + 1 };

      const targets = [to(incapable), stale, to(newcomer)];
      const refused = await Promise.all(targets.map((target) => refusal(relay.send({ caller: callerOf(newcomer), payload: { to: target, message: request(newcomer) } }))));

      expect(refused.map((error) => [error.status, error.code])).toEqual(targets.map(() => [409, E2EE_ERROR_CODES.DEVICE_CHANGED]));
      expect(store.collections.E2EEDeviceVerificationMessage.rows).toHaveLength(0);
    });

    it('une génération retirée ne reçoit plus rien, et ce qui lui était adressé disparaît avec elle', async () => {
      const { store, relay } = relayWith();
      const phone = seed(store, { deviceId: 1 });
      const newcomer = seed(store, { deviceId: 2 });
      await relay.send({ caller: callerOf(newcomer), payload: { to: 'others', message: request(newcomer) } });
      const { retireDeviceRows } = await import('../device-retirement');
      const [row] = store.collections.E2EEDevice.rows.filter((device) => device.deviceId === phone.deviceId);
      await retireDeviceRows(store.prisma as never, { devices: [row as never], now: START });

      const after = await relay.send({ caller: callerOf(newcomer), payload: { to: 'others', message: request(newcomer, OTHER_TX) } });

      expect(after.recipients).toEqual([]);
      expect(store.collections.E2EEDeviceVerificationMessage.rows).toHaveLength(0);
      expect((await refusal(relay.list({ caller: callerOf(phone) }))).code).toBe(E2EE_ERROR_CODES.DEVICE_NOT_BOUND);
    });
  });

  describe('l’émetteur et le message : hygiène, jamais une correction', () => {
    it('refuse un `from` qui ne décrit pas l’émetteur tel que l’annuaire le tient : clé, place, génération, plateforme, libellé', async () => {
      const { store, relay } = relayWith();
      seed(store, { deviceId: 1 });
      const newcomer = seed(store, { deviceId: 2, label: 'iPad de Zoé' });
      const lies: Seeded[] = [
        { ...newcomer, identityKey: randomIdentityKey() },
        { ...newcomer, deviceId: 7 },
        { ...newcomer, registrationId: newcomer.registrationId + 1 },
        { ...newcomer, platform: 'android' },
        { ...newcomer, label: 'Support Meeshy' },
        { ...newcomer, label: undefined },
      ];

      const refused = await Promise.all(lies.map((from) => refusal(relay.send({ caller: callerOf(newcomer), payload: { to: 'others', message: request(from) } }))));

      expect(refused.map((error) => [error.status, error.code])).toEqual(lies.map(() => [403, DEVICE_VERIFICATION_ERROR_CODES.FROM_MISMATCH]));
      expect(store.collections.E2EEDeviceVerificationMessage.rows).toHaveLength(0);
    });

    it('chaque négatif « refus » des vecteurs communs est refusé par les schémas du relais', async () => {
      const vectors = JSON.parse(readFileSync(join(__dirname, '../../../../../../packages/shared/fixtures/e2ee-device-verification/sas-v1.vectors.json'), 'utf8'));
      const refusals = (vectors.negatives as { name: string; outcome: string; input: Record<string, unknown> }[]).filter((negative) => negative.outcome.startsWith('refus:'));
      const { store, relay } = relayWith();
      const phone = seed(store, { deviceId: 1 });
      const newcomer = seed(store, { deviceId: 2 });

      const verdicts = await Promise.all(
        refusals.map(async (negative) => {
          const message = 'from' in negative.input ? { ...request(newcomer), from: negative.input.from } : { ...accept(phone), nonce: negative.input.nonce };
          const sender = 'from' in negative.input ? newcomer : phone;
          const target = 'from' in negative.input ? 'others' : to(newcomer);
          const error = await refusal(relay.send({ caller: callerOf(sender), payload: { to: target, message } }));
          return [negative.name, error.status, error.code];
        }),
      );

      expect(refusals.length).toBeGreaterThanOrEqual(10);
      expect(verdicts).toEqual(refusals.map((negative) => [negative.name, 400, DEVICE_VERIFICATION_ERROR_CODES.INVALID]));
    });

    it('refuse un champ en trop (même volumineux), un nom de clé privée, une version inconnue, des méthodes en double et un `accept`, `reveal` ou `method` à « others »', async () => {
      const { store, relay } = relayWith();
      const phone = seed(store, { deviceId: 1 });
      const newcomer = seed(store, { deviceId: 2 });
      const payloads = [
        { to: 'others', message: { ...request(newcomer), extra: 1 } },
        { to: 'others', message: request(newcomer), privateKey: 'x' },
        { to: 'others', message: { ...request(newcomer), v: 2 } },
        { to: 'others', message: { ...request(newcomer), methods: ['emoji', 'emoji'] } },
        { to: 'others', message: accept(phone) },
        { to: 'others', message: reveal() },
        { to: 'others', message: { v: 1, type: 'method', tx: TX, method: 'decimal' } },
        { to: to(phone), message: { ...cancel('user-denied'), padding: 'x'.repeat(4096) } },
      ];

      const refused = await Promise.all(payloads.map((payload, index) => refusal(relay.send({ caller: callerOf(index === 4 ? phone : newcomer), payload }))));

      expect(refused.map((error) => error.status)).toEqual(payloads.map(() => 400));
      expect(store.collections.E2EEDeviceVerificationMessage.rows).toHaveLength(0);
    });

    it('un appareil qui n’a pas déclaré la capacité, ou une session sans appareil, ne relaie rien', async () => {
      const { store, relay } = relayWith();
      seed(store, { deviceId: 1 });
      const legacy = seed(store, { deviceId: 2 }, { capable: false });

      const incapable = await refusal(relay.send({ caller: callerOf(legacy), payload: { to: 'others', message: request(legacy) } }));
      const unbound = await refusal(relay.send({ caller: { userId: ALICE, sessionId: 'f'.repeat(24) }, payload: { to: 'others', message: request(legacy) } }));

      expect([incapable.status, incapable.code]).toEqual([409, DEVICE_VERIFICATION_ERROR_CODES.NOT_CAPABLE]);
      expect([unbound.status, unbound.code]).toEqual([403, E2EE_ERROR_CODES.DEVICE_NOT_BOUND]);
    });
  });

  describe('une demande prise, une demande annulée', () => {
    it('quand l’initiateur révèle à un répondeur, les autres copies deviennent `cancel(accepted-elsewhere)` qui nomme qui a répondu — même chez celui qui avait déjà accusé la demande', async () => {
      const { store, relay, deliveries } = relayWith();
      const phone = seed(store, { deviceId: 1 });
      const tablet = seed(store, { deviceId: 2 });
      const laptop = seed(store, { deviceId: 3, platform: 'web' });
      const newcomer = seed(store, { deviceId: 4 });
      await relay.send({ caller: callerOf(newcomer), payload: { to: 'others', message: request(newcomer) } });
      const [shownOnLaptop] = await relay.list({ caller: callerOf(laptop) });
      await relay.ack({ caller: callerOf(laptop), ids: [shownOnLaptop?.id ?? ''] });
      await relay.send({ caller: callerOf(phone), payload: { to: to(newcomer), message: accept(phone) } });
      deliveries.splice(0);

      await relay.send({ caller: callerOf(newcomer), payload: { to: to(phone), message: reveal() } });

      const elsewhere = { relayedFrom: to(newcomer), message: cancel('accepted-elsewhere'), answeredBy: to(phone) };
      expect(await relay.list({ caller: callerOf(tablet) })).toEqual([expect.objectContaining(elsewhere)]);
      expect(await relay.list({ caller: callerOf(laptop) })).toEqual([expect.objectContaining(elsewhere)]);
      expect((await relay.list({ caller: callerOf(phone) })).map((served) => served.message.type)).toEqual(['request', 'reveal']);
      expect(deliveries.map((delivery) => [delivery.recipient.deviceId, delivery.served.message.type, delivery.served.answeredBy])).toEqual([
        [1, 'reveal', undefined],
        [2, 'cancel', to(phone)],
        [3, 'cancel', to(phone)],
      ]);
    });

    it('une annulation de l’initiateur remplace ses copies en attente : la demande ne se sert plus', async () => {
      const { store, relay } = relayWith();
      const phone = seed(store, { deviceId: 1 });
      const newcomer = seed(store, { deviceId: 2 });
      await relay.send({ caller: callerOf(newcomer), payload: { to: 'others', message: request(newcomer) } });

      await relay.send({ caller: callerOf(newcomer), payload: { to: 'others', message: cancel('timeout') } });

      expect((await relay.list({ caller: callerOf(phone) })).map((served) => served.message)).toEqual([cancel('timeout')]);
    });
  });

  describe('l’accusé, la durée de vie, le balayage', () => {
    it('un accusé ne retire que ce qui est adressé à la génération de l’appelant, et un message ne vit que dix minutes', async () => {
      const { store, relay, advance } = relayWith();
      const phone = seed(store, { deviceId: 1 });
      const tablet = seed(store, { deviceId: 2 });
      const newcomer = seed(store, { deviceId: 3 });
      const sent = await relay.send({ caller: callerOf(newcomer), payload: { to: 'others', message: request(newcomer) } });

      expect(await relay.ack({ caller: callerOf(tablet), ids: sent.ids })).toBe(1);
      expect(await relay.list({ caller: callerOf(phone) })).toHaveLength(1);
      expect(await relay.list({ caller: callerOf(tablet) })).toEqual([]);
      advance(DEVICE_VERIFICATION_TTL_MS + 1);
      expect(await relay.list({ caller: callerOf(phone) })).toEqual([]);
      expect(await relay.sweep()).toBe(2);
      expect(store.collections.E2EEDeviceVerificationMessage.rows).toHaveLength(0);
    });

    it('`after` lit la suite, sans relire ce qui précède', async () => {
      const { store, relay } = relayWith();
      const phone = seed(store, { deviceId: 1 });
      const newcomer = seed(store, { deviceId: 2 });
      await relay.send({ caller: callerOf(newcomer), payload: { to: 'others', message: request(newcomer) } });
      const [first] = await relay.list({ caller: callerOf(phone) });
      await relay.send({ caller: callerOf(newcomer), payload: { to: to(phone), message: { v: 1, type: 'method', tx: TX, method: 'decimal' } } });

      const next = await relay.list({ caller: callerOf(phone), after: first?.id });

      expect(next.map((served) => served.message.type)).toEqual(['method']);
    });
  });

  describe('les débits, par génération émettrice et en fenêtres glissantes d’une heure', () => {
    it(`au plus ${DEVICE_VERIFICATION_RATES.requestsPerHour} demandes par heure ; la cinquième attend que la plus ancienne sorte de la fenêtre`, async () => {
      const { store, relay, advance } = relayWith();
      seed(store, { deviceId: 1 });
      const newcomer = seed(store, { deviceId: 2 });
      const send = (index: number) => relay.send({ caller: callerOf(newcomer), payload: { to: 'others', message: request(newcomer, bytes(16, 10 + index)) } });
      for (let index = 0; index < DEVICE_VERIFICATION_RATES.requestsPerHour; index += 1) {
        await send(index);
        advance(MINUTE);
      }

      const fifth = await refusal(send(9));
      advance(60 * MINUTE - 4 * MINUTE + 1);

      expect([fifth.status, fifth.code]).toEqual([429, DEVICE_VERIFICATION_ERROR_CODES.RATE_LIMITED]);
      expect(fifth.retryAfter).toBeGreaterThan(0);
      await expect(send(10)).resolves.toEqual(expect.objectContaining({ ids: expect.any(Array) }));
    });

    it(`au plus ${DEVICE_VERIFICATION_RATES.sendsPerTx} envois par transaction et ${DEVICE_VERIFICATION_RATES.messagesPerHour} messages par heure`, async () => {
      const { store, relay } = relayWith();
      const phone = seed(store, { deviceId: 1 });
      const newcomer = seed(store, { deviceId: 2 });
      const method = (tx: string) => relay.send({ caller: callerOf(newcomer), payload: { to: to(phone), message: { v: 1, type: 'method', tx, method: 'emoji' } } });
      for (let index = 0; index < DEVICE_VERIFICATION_RATES.sendsPerTx; index += 1) await method(TX);
      const ninth = await refusal(method(TX));
      const txs = Array.from({ length: DEVICE_VERIFICATION_RATES.messagesPerHour - DEVICE_VERIFICATION_RATES.sendsPerTx }, (_, index) => bytes(16, 40 + index));
      for (const tx of txs) await method(tx);

      const overflow = await refusal(method(bytes(16, 200)));

      expect(ninth.status).toBe(429);
      expect(overflow.status).toBe(429);
    });

    it('l’appareil d’un intrus n’épuise pas le quota du vrai nouvel appareil, et seize appareils peuvent tous demander', async () => {
      const { store, relay } = relayWith();
      const devices = Array.from({ length: 16 }, (_, index) => seed(store, { deviceId: index + 1 }));
      const intruder = devices[15] as Seeded;
      for (let index = 0; index < DEVICE_VERIFICATION_RATES.requestsPerHour; index += 1) {
        await relay.send({ caller: callerOf(intruder), payload: { to: 'others', message: request(intruder, bytes(16, 60 + index)) } });
      }
      await refusal(relay.send({ caller: callerOf(intruder), payload: { to: 'others', message: request(intruder, bytes(16, 99)) } }));

      const everyone = await Promise.all(
        devices.slice(0, 15).map((device, index) => relay.send({ caller: callerOf(device), payload: { to: 'others', message: request(device, bytes(16, 100 + index)) } })),
      );

      expect(everyone.map((sent) => sent.recipients.length)).toEqual(devices.slice(0, 15).map(() => 15));
    });
  });

  it('une demande relayée prévient l’annonce (pour un push), aucun autre message ne le fait', async () => {
    const { store, relay, requested } = relayWith();
    const phone = seed(store, { deviceId: 1 });
    const newcomer = seed(store, { deviceId: 2 });

    await relay.send({ caller: callerOf(newcomer), payload: { to: 'others', message: request(newcomer) } });
    await relay.send({ caller: callerOf(phone), payload: { to: to(newcomer), message: accept(phone) } });

    expect(requested).toEqual([{ userId: ALICE, ...to(newcomer) }]);
  });
});
