import { E2EE_ERROR_CODES, LIBSIGNAL_PROTOCOL, type E2EERelayRequest } from '@meeshy/shared/types/e2ee-directory';
import { createE2EEEnvelopeRelay, type E2EEEnvelopeRelay } from '../E2EEEnvelopeRelay';
import { E2eeRelayRefusedError } from '../e2ee-relay-errors';
import { createFakeE2EEStore, type FakeE2EEStore } from './fake-e2ee-store';

const ALICE = 'a1'.repeat(12);
const BOB = 'b2'.repeat(12);
const MALLORY = 'e5'.repeat(12);
const CONVERSATION = 'f6'.repeat(12);
const ALICE_SESSION = 'c3'.repeat(12);
const BOB_SESSION = 'd4'.repeat(12);
const MESSAGE = '0a'.repeat(12);

const NOW = new Date('2026-10-23T12:00:00Z');

function seeded(): { store: FakeE2EEStore; relay: E2EEEnvelopeRelay } {
  const store = createFakeE2EEStore();
  const device = (userId: string, deviceId: number, registrationId: number, sessionId: string, retiredAt: Date | null = null) =>
    store.collections.E2EEDevice.insert({ userId, deviceId, registrationId, sessionId, retiredAt, identityKey: 'ik', platform: 'ios' });
  device(ALICE, 1, 101, ALICE_SESSION);
  device(ALICE, 2, 102, 'aa'.repeat(12));
  device(BOB, 1, 201, BOB_SESSION);
  device(BOB, 2, 202, 'bb'.repeat(12), new Date());
  device(MALLORY, 1, 301, 'ee'.repeat(12));
  store.collections.Participant.insert({ conversationId: CONVERSATION, userId: ALICE });
  store.collections.Participant.insert({ conversationId: CONVERSATION, userId: BOB });
  store.collections.Participant.insert({ conversationId: CONVERSATION, userId: null, type: 'anonymous' });
  store.collections.Participant.insert({ conversationId: CONVERSATION, userId: MALLORY, isActive: false });
  return { store, relay: createE2EEEnvelopeRelay({ prisma: store.prisma as never, now: () => NOW }) };
}

const envelope = (userId: string, deviceId: number, registrationId: number, body = 'Y2lwaGVy') => ({ userId, deviceId, registrationId, type: 3 as const, body });

const relayRequest = (overrides: Partial<E2EERelayRequest> = {}): E2EERelayRequest => ({
  protocol: LIBSIGNAL_PROTOCOL,
  senderDeviceId: 1,
  sessionId: ALICE_SESSION,
  unapprovedOwnDevices: [],
  envelopes: [envelope(ALICE, 2, 102), envelope(BOB, 1, 201)],
  ...overrides,
});

const refusalOf = async (promise: Promise<unknown>): Promise<E2eeRelayRefusedError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof E2eeRelayRefusedError) return error;
    throw error;
  }
  throw new Error('refus attendu');
};

describe("le relais d'enveloppes libsignal", () => {
  describe("admission d'un envoi", () => {
    it('admet un envoi qui adresse chaque appareil actif des participants, sauf l’émetteur', async () => {
      const { relay } = seeded();
      await expect(relay.admit({ conversationId: CONVERSATION, senderUserId: ALICE, relay: relayRequest() })).resolves.toMatchObject({
        senderDeviceId: 1,
      });
    });

    it('refuse en 409 E2EE_DEVICES_MISMATCH une liste incomplète, en trop ou périmée — et le dit', async () => {
      const { relay } = seeded();
      const error = await refusalOf(
        relay.admit({
          conversationId: CONVERSATION,
          senderUserId: ALICE,
          relay: relayRequest({ envelopes: [envelope(BOB, 1, 999), envelope(BOB, 2, 202), envelope(MALLORY, 1, 301)] }),
        }),
      );
      expect(error.code).toBe(E2EE_ERROR_CODES.DEVICES_MISMATCH);
      expect(error.status).toBe(409);
      expect(error.mismatch).toEqual({
        missing: [{ userId: ALICE, deviceId: 2 }],
        extra: [{ userId: BOB, deviceId: 2 }, { userId: MALLORY, deviceId: 1 }],
        stale: [{ userId: BOB, deviceId: 1 }],
      });
    });

    it("refuse un appareil émetteur qui n'est pas celui de la session appelante", async () => {
      const { relay } = seeded();
      const error = await refusalOf(relay.admit({ conversationId: CONVERSATION, senderUserId: ALICE, relay: relayRequest({ senderDeviceId: 2 }) }));
      expect(error.code).toBe(E2EE_ERROR_CODES.DEVICE_NOT_BOUND);
      expect(error.status).toBe(403);
    });

    it('refuse un envoi sans session identifiée', async () => {
      const { relay } = seeded();
      const error = await refusalOf(relay.admit({ conversationId: CONVERSATION, senderUserId: ALICE, relay: relayRequest({ sessionId: null }) }));
      expect(error.code).toBe(E2EE_ERROR_CODES.DEVICE_NOT_BOUND);
    });

    it("n'exclut que MES appareils non approuvés, jamais celui d'un contact", async () => {
      const { relay } = seeded();
      await expect(
        relay.admit({ conversationId: CONVERSATION, senderUserId: ALICE, relay: relayRequest({ unapprovedOwnDevices: [2], envelopes: [envelope(BOB, 1, 201)] }) }),
      ).resolves.toBeDefined();

      const error = await refusalOf(
        relay.admit({ conversationId: CONVERSATION, senderUserId: ALICE, relay: relayRequest({ unapprovedOwnDevices: [7], envelopes: [envelope(BOB, 1, 201)] }) }),
      );
      expect(error.code).toBe(E2EE_ERROR_CODES.ENVELOPES_INVALID);
    });
  });

  describe('persistance, lecture et accusé', () => {
    async function persisted() {
      const context = seeded();
      const admitted = await context.relay.admit({ conversationId: CONVERSATION, senderUserId: ALICE, relay: relayRequest() });
      const served = await context.relay.persist({ messageId: MESSAGE, conversationId: CONVERSATION, admitted });
      return { ...context, served };
    }

    it('range une enveloppe par appareil destinataire et rend ce qu’il faut distribuer', async () => {
      const { store, served } = await persisted();
      expect(store.collections.MessageEnvelope.rows).toHaveLength(2);
      expect(served.map((item) => [item.recipient.userId, item.recipient.deviceId])).toEqual([[ALICE, 2], [BOB, 1]]);
      expect(served[0].envelope).toMatchObject({ messageId: MESSAGE, senderUserId: ALICE, senderDeviceId: 1, type: 3 });
    });

    it("ne sert à un appareil QUE ses enveloppes, et seulement à sa session", async () => {
      const { relay } = await persisted();
      const bob = await relay.listFor({ userId: BOB, sessionId: BOB_SESSION });
      expect(bob).toHaveLength(1);
      expect(bob[0].conversationId).toBe(CONVERSATION);

      const error = await refusalOf(relay.listFor({ userId: BOB, sessionId: ALICE_SESSION }));
      expect(error.code).toBe(E2EE_ERROR_CODES.DEVICE_NOT_BOUND);
    });

    it("efface à l'accusé de réception les seules enveloppes de l'appareil qui accuse", async () => {
      const { relay, store, served } = await persisted();
      const ids = served.map((item) => item.envelope.id);

      const deleted = await relay.ack({ userId: BOB, sessionId: BOB_SESSION, ids });

      expect(deleted).toBe(1);
      expect(store.collections.MessageEnvelope.rows.map((row) => row.recipientUserId)).toEqual([ALICE]);
    });

    it('balaie les enveloppes de plus de 30 jours', async () => {
      const { relay, store } = await persisted();
      store.collections.MessageEnvelope.rows[0].createdAt = new Date('2026-09-01T00:00:00Z');

      await expect(relay.sweep()).resolves.toBe(1);
      expect(store.collections.MessageEnvelope.rows).toHaveLength(1);
    });
  });
});
