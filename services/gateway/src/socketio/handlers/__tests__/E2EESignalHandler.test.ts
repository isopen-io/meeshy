/**
 * `e2ee:send-signal` (#13142) : le même juge que la route, la session de la
 * SOCKET (jamais celle que la charge déclarerait), et l'écart Sesame à plat.
 */
import { E2EE_ERROR_CODES, LIBSIGNAL_PROTOCOL } from '@meeshy/shared/types/e2ee-directory';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { E2EESignalAck } from '@meeshy/shared/types/e2ee-signals';
import { createE2EESignalRelay } from '../../../services/e2ee/E2EESignalRelay';
import { createFakeE2EEStore } from '../../../services/e2ee/__tests__/fake-e2ee-store';
import { handleE2EESignal, listenE2EESignals, type SignalCaller } from '../E2EESignalHandler';

const ALICE = 'a1'.repeat(12);
const BOB = 'b2'.repeat(12);
const CONVERSATION = 'f6'.repeat(12);
const ALICE_SESSION = 'c3'.repeat(12);

function seeded() {
  const store = createFakeE2EEStore();
  store.collections.E2EEDevice.insert({ userId: ALICE, deviceId: 1, registrationId: 101, sessionId: ALICE_SESSION, identityKey: 'ik', platform: 'ios' });
  store.collections.E2EEDevice.insert({ userId: BOB, deviceId: 1, registrationId: 201, sessionId: 'd4'.repeat(12), identityKey: 'ik', platform: 'ios' });
  store.collections.Conversation.insert({ id: CONVERSATION, encryptionMode: 'e2ee' });
  store.collections.Participant.insert({ conversationId: CONVERSATION, userId: ALICE });
  store.collections.Participant.insert({ conversationId: CONVERSATION, userId: BOB });
  return { store, signals: createE2EESignalRelay({ prisma: store.prisma as never, deliver: () => undefined }) };
}

const socketOf = (sessionId: string | undefined) => {
  const listeners = new Map<string, (data: unknown, ack?: (response: E2EESignalAck) => void) => void>();
  return {
    id: 'socket-1',
    data: sessionId ? { sessionId } : {},
    on: (event: string, listener: (data: unknown, ack?: (response: E2EESignalAck) => void) => void) => listeners.set(event, listener),
    emitFromClient: (event: string, data: unknown) =>
      new Promise<E2EESignalAck>((resolve) => listeners.get(event)?.(data, resolve)),
  };
};

const payload = (overrides: Record<string, unknown> = {}) => ({
  conversationId: CONVERSATION,
  protocol: LIBSIGNAL_PROTOCOL,
  senderDeviceId: 1,
  envelopes: [{ userId: BOB, deviceId: 1, registrationId: 201, type: 2, body: 'b3BhcXVl' }],
  ...overrides,
});

const alice = (): SignalCaller => ({ userId: ALICE, isAnonymous: false });

describe('e2ee:send-signal', () => {
  it("relaie le signal de l'appareil lié à la session de la socket et accuse son identifiant", async () => {
    const { store, signals } = seeded();
    const socket = socketOf(ALICE_SESSION);
    listenE2EESignals(socket, { signals, callerOf: alice });

    const ack = await socket.emitFromClient(CLIENT_EVENTS.E2EE_SEND_SIGNAL, payload());

    expect(ack).toMatchObject({ success: true, data: { envelopes: 1 } });
    expect(store.collections.MessageEnvelope.rows).toHaveLength(1);
  });

  it("refuse une socket sans session d'appareil, un invité, et une charge invalide, sans rien ranger", async () => {
    const { store, signals } = seeded();

    const withoutSession = await handleE2EESignal(socketOf(undefined), payload(), { signals, callerOf: alice });
    const guest = await handleE2EESignal(socketOf(ALICE_SESSION), payload(), { signals, callerOf: () => ({ userId: 'x', isAnonymous: true }) });
    const malformed = await handleE2EESignal(socketOf(ALICE_SESSION), payload({ conversationId: 'nope' }), { signals, callerOf: alice });

    expect([withoutSession.code, guest.code, malformed.code]).toEqual([
      E2EE_ERROR_CODES.DEVICE_NOT_BOUND,
      E2EE_ERROR_CODES.DEVICE_NOT_BOUND,
      E2EE_ERROR_CODES.ENVELOPES_INVALID,
    ]);
    expect(store.collections.MessageEnvelope.rows).toHaveLength(0);
  });

  it("porte à plat l'écart Sesame, comme l'accusé de message:send", async () => {
    const { signals } = seeded();

    const ack = await handleE2EESignal(
      socketOf(ALICE_SESSION),
      payload({ envelopes: [{ userId: BOB, deviceId: 1, registrationId: 999, type: 2, body: 'b3BhcXVl' }] }),
      { signals, callerOf: alice },
    );

    expect(ack).toMatchObject({ success: false, code: E2EE_ERROR_CODES.DEVICES_MISMATCH, stale: [{ userId: BOB, deviceId: 1 }] });
  });

  it('refuse au-delà de la cadence', async () => {
    const { signals } = seeded();

    const ack = await handleE2EESignal(socketOf(ALICE_SESSION), payload(), { signals, callerOf: alice, withinRate: async () => false });

    expect(ack).toMatchObject({ success: false, code: 'RATE_LIMIT_EXCEEDED' });
  });
});
