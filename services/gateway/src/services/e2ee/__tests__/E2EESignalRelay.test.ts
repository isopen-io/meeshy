/**
 * LE RELAIS DES SIGNAUX CHIFFRÉS (#13142) : une réaction, la frappe, un accusé,
 * une modification, une suppression pour tous, une vue unique, un épinglage
 * partent tous par CE chemin dans une conversation e2ee, en enveloppes opaques.
 * La passerelle vérifie le régime, le membre, l'appareil (Sesame), range une
 * enveloppe par appareil sous un identifiant de signal qui n'est celui d'aucun
 * message, et ne réveille qu'à la demande de l'expéditeur, sans jamais dire
 * quel signal elle porte.
 */
import { E2EE_ERROR_CODES, LIBSIGNAL_PROTOCOL } from '@meeshy/shared/types/e2ee-directory';
import type { E2EESignalRelayRequest } from '@meeshy/shared/types/e2ee-signals';
import type { EnvelopeDelivery } from '../E2EEEnvelopeRelay';
import { E2eeRelayRefusedError } from '../e2ee-relay-errors';
import { createE2EESignalRelay, E2EE_WAKE_PUSH_TYPE } from '../E2EESignalRelay';
import { createFakeE2EEStore } from './fake-e2ee-store';

const ALICE = 'a1'.repeat(12);
const BOB = 'b2'.repeat(12);
const MALLORY = 'e5'.repeat(12);
const CONVERSATION = 'f6'.repeat(12);
const CLEAR_CONVERSATION = 'f7'.repeat(12);
const ALICE_SESSION = 'c3'.repeat(12);
const MALLORY_SESSION = 'ee'.repeat(12);

function seeded(options: { readonly blocked?: readonly (readonly [string, string])[] } = {}) {
  const store = createFakeE2EEStore();
  const device = (userId: string, deviceId: number, registrationId: number, sessionId: string) =>
    store.collections.E2EEDevice.insert({ userId, deviceId, registrationId, sessionId, identityKey: 'ik', platform: 'ios' });
  device(ALICE, 1, 101, ALICE_SESSION);
  device(ALICE, 2, 102, 'aa'.repeat(12));
  device(BOB, 1, 201, 'bb'.repeat(12));
  device(MALLORY, 1, 301, MALLORY_SESSION);
  store.collections.Conversation.insert({ id: CONVERSATION, encryptionMode: 'e2ee' });
  store.collections.Conversation.insert({ id: CLEAR_CONVERSATION, encryptionMode: 'server' });
  [CONVERSATION, CLEAR_CONVERSATION].forEach((conversationId) => {
    store.collections.Participant.insert({ conversationId, userId: ALICE });
    store.collections.Participant.insert({ conversationId, userId: BOB });
  });
  const delivered: EnvelopeDelivery[] = [];
  const woken: string[][] = [];
  const relay = createE2EESignalRelay({
    prisma: store.prisma as never,
    deliver: (deliveries) => delivered.push(...deliveries),
    wake: async (userIds) => {
      woken.push([...userIds]);
    },
    blockedBetween: async (a, b) => (options.blocked ?? []).some(([x, y]) => (x === a && y === b) || (x === b && y === a)),
  });
  return { store, relay, delivered, woken };
}

const envelope = (userId: string, deviceId: number, registrationId: number, body = 'b3BhcXVl') => ({
  userId,
  deviceId,
  registrationId,
  type: 2 as const,
  body,
});

const request = (overrides: Partial<E2EESignalRelayRequest> = {}): E2EESignalRelayRequest => ({
  protocol: LIBSIGNAL_PROTOCOL,
  senderDeviceId: 1,
  unapprovedOwnDevices: [],
  envelopes: [envelope(ALICE, 2, 102), envelope(BOB, 1, 201)],
  wake: false,
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

describe('le relais des signaux chiffrés', () => {
  it('range une enveloppe opaque par appareil sous un identifiant de signal, et la remet à son seul appareil', async () => {
    const { store, relay, delivered } = seeded();

    const relayed = await relay.relay({ conversationId: CONVERSATION, senderUserId: ALICE, sessionId: ALICE_SESSION, request: request() });

    expect(relayed.envelopes).toBe(2);
    expect(relayed.signalId).toMatch(/^[a-f0-9]{24}$/);
    const rows = store.collections.MessageEnvelope.rows;
    expect(rows.map((row) => [row.recipientUserId, row.recipientDeviceId, row.body])).toEqual([
      [ALICE, 2, 'b3BhcXVl'],
      [BOB, 1, 'b3BhcXVl'],
    ]);
    expect(rows.every((row) => row.messageId === relayed.signalId && row.conversationId === CONVERSATION)).toBe(true);
    expect(delivered.map((delivery) => [delivery.recipient.userId, delivery.recipient.deviceId, delivery.envelope.messageId])).toEqual([
      [ALICE, 2, relayed.signalId],
      [BOB, 1, relayed.signalId],
    ]);
  });

  it("donne à chaque signal un identifiant neuf : deux réactions identiques ne se reconnaissent pas l'une l'autre", async () => {
    const { relay } = seeded();
    const first = await relay.relay({ conversationId: CONVERSATION, senderUserId: ALICE, sessionId: ALICE_SESSION, request: request() });
    const second = await relay.relay({ conversationId: CONVERSATION, senderUserId: ALICE, sessionId: ALICE_SESSION, request: request() });

    expect(first.signalId).not.toBe(second.signalId);
  });

  it("refuse 409 E2EE_REGIME_CHANGED vers une conversation qui n'est pas chiffrée de bout en bout, sans rien ranger", async () => {
    const { store, relay, delivered } = seeded();

    const error = await refusalOf(
      relay.relay({ conversationId: CLEAR_CONVERSATION, senderUserId: ALICE, sessionId: ALICE_SESSION, request: request() }),
    );

    expect([error.status, error.code]).toEqual([409, E2EE_ERROR_CODES.REGIME_CHANGED]);
    expect(store.collections.MessageEnvelope.rows).toHaveLength(0);
    expect(delivered).toHaveLength(0);
  });

  it("refuse 403 E2EE_SIGNAL_FORBIDDEN un appareil enrôlé qui n'est pas membre de la conversation", async () => {
    const { store, relay } = seeded();

    const error = await refusalOf(
      relay.relay({
        conversationId: CONVERSATION,
        senderUserId: MALLORY,
        sessionId: MALLORY_SESSION,
        request: request({ envelopes: [envelope(ALICE, 1, 101), envelope(ALICE, 2, 102), envelope(BOB, 1, 201)] }),
      }),
    );

    expect([error.status, error.code]).toEqual([403, E2EE_ERROR_CODES.SIGNAL_FORBIDDEN]);
    expect(store.collections.MessageEnvelope.rows).toHaveLength(0);
  });

  it("refuse 403 E2EE_DEVICE_NOT_BOUND un appareil émetteur qui n'est pas celui de la session", async () => {
    const { relay } = seeded();

    const error = await refusalOf(
      relay.relay({ conversationId: CONVERSATION, senderUserId: ALICE, sessionId: 'aa'.repeat(12), request: request() }),
    );

    expect(error.code).toBe(E2EE_ERROR_CODES.DEVICE_NOT_BOUND);
  });

  it('refuse 409 E2EE_DEVICES_MISMATCH une liste d’appareils qui oublie mon autre appareil (Sesame)', async () => {
    const { store, relay } = seeded();

    const error = await refusalOf(
      relay.relay({
        conversationId: CONVERSATION,
        senderUserId: ALICE,
        sessionId: ALICE_SESSION,
        request: request({ envelopes: [envelope(BOB, 1, 201)] }),
      }),
    );

    expect(error.code).toBe(E2EE_ERROR_CODES.DEVICES_MISMATCH);
    expect(error.mismatch?.missing).toEqual([{ userId: ALICE, deviceId: 2 }]);
    expect(store.collections.MessageEnvelope.rows).toHaveLength(0);
  });

  it("réveille les comptes destinataires seulement quand l'expéditeur le demande", async () => {
    const quiet = seeded();
    await quiet.relay.relay({ conversationId: CONVERSATION, senderUserId: ALICE, sessionId: ALICE_SESSION, request: request() });

    const loud = seeded();
    await loud.relay.relay({ conversationId: CONVERSATION, senderUserId: ALICE, sessionId: ALICE_SESSION, request: request({ wake: true }) });

    expect(quiet.woken).toEqual([]);
    expect(loud.woken).toEqual([[ALICE, BOB]]);
  });

  it('refuse 403 E2EE_SIGNAL_FORBIDDEN un signal vers une conversation fermée, sans enveloppe ni réveil', async () => {
    const { store, relay, delivered, woken } = seeded();
    const conversation = store.collections.Conversation.rows.find((row) => row.id === CONVERSATION);
    if (conversation) conversation.closedAt = new Date();

    const error = await refusalOf(
      relay.relay({ conversationId: CONVERSATION, senderUserId: ALICE, sessionId: ALICE_SESSION, request: request({ wake: true }) }),
    );

    expect([error.status, error.code]).toEqual([403, E2EE_ERROR_CODES.SIGNAL_FORBIDDEN]);
    expect(store.collections.MessageEnvelope.rows).toHaveLength(0);
    expect(delivered).toHaveLength(0);
    expect(woken).toEqual([]);
  });

  it("refuse 403 E2EE_SIGNAL_FORBIDDEN le signal d'un tête-à-tête où l'un a bloqué l'autre, dans les deux sens", async () => {
    const blockedByBob = seeded({ blocked: [[BOB, ALICE]] });
    const error = await refusalOf(
      blockedByBob.relay.relay({ conversationId: CONVERSATION, senderUserId: ALICE, sessionId: ALICE_SESSION, request: request({ wake: true }) }),
    );

    expect([error.status, error.code]).toEqual([403, E2EE_ERROR_CODES.SIGNAL_FORBIDDEN]);
    expect(blockedByBob.store.collections.MessageEnvelope.rows).toHaveLength(0);
    expect(blockedByBob.woken).toEqual([]);
  });

  it('ne consulte pas le blocage hors tête-à-tête : un groupe relaie comme avant', async () => {
    const { store, relay } = seeded({ blocked: [[BOB, ALICE]] });
    const conversation = store.collections.Conversation.rows.find((row) => row.id === CONVERSATION);
    if (conversation) conversation.type = 'group';

    const relayed = await relay.relay({ conversationId: CONVERSATION, senderUserId: ALICE, sessionId: ALICE_SESSION, request: request() });

    expect(relayed.envelopes).toBe(2);
  });

  it("nomme le réveil d'un type opaque, le même pour tout signal", () => {
    expect(E2EE_WAKE_PUSH_TYPE).toBe('e2ee_wake');
  });
});
