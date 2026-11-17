/**
 * Banc d'envoi : le VRAI `MessagingService.handleMessage` (point où REST et les
 * deux événements socket convergent) → `MessageProcessor` → admission e2ee →
 * relais, sur un double Prisma (même forme que `e2ee-two-devices.integration.test.ts`).
 * Les modules à effets (traduction, stats, liens, mentions, cache) sont doublés
 * par le fichier de test qui importe ce banc (`jest.mock` est hissé par fichier).
 * Repris de la contre-analyse E2EE du 2026-11-17 (#18906).
 */
import { createFakeE2EEStore } from '../../e2ee/__tests__/fake-e2ee-store';
import { MessagingService } from '../MessagingService';
import { resetParticipantLookupCache } from '../../../utils/participant-lookup-cache';
import { setE2EEEnvelopeIOProvider } from '../../e2ee/envelope-delivery';

export const ALICE = '507f1f77bcf86cd799439018';
export const BOB = '507f1f77bcf86cd799439019';
export const ALICE_SESSION = '507f1f77bcf86cd799439020';
export const CONVERSATION = '507f1f77bcf86cd799439012';
export const ALICE_PARTICIPANT = '507f1f77bcf86cd799439014';

export type Harness = ReturnType<typeof createSendHarness>;

export function createSendHarness(options: {
  readonly encryptionMode: string;
  readonly envelopeCreateMany?: (args: unknown) => Promise<unknown>;
  readonly messageDelete?: (args: unknown) => Promise<unknown>;
}) {
  resetParticipantLookupCache();
  const store = createFakeE2EEStore();
  store.collections.Participant.insert({ id: ALICE_PARTICIPANT, conversationId: CONVERSATION, userId: ALICE });
  store.collections.Participant.insert({ conversationId: CONVERSATION, userId: BOB });
  store.collections.E2EEDevice.insert({ userId: ALICE, deviceId: 1, registrationId: 111, sessionId: ALICE_SESSION, identityKey: 'a', platform: 'ios' });
  store.collections.E2EEDevice.insert({ userId: BOB, deviceId: 1, registrationId: 222, sessionId: 'bob-session', identityKey: 'b', platform: 'android' });
  const emitted: unknown[] = [];
  setE2EEEnvelopeIOProvider(() => ({
    to: (room: string) => ({ emit: (event: string, payload: unknown) => { emitted.push({ room, event, payload }); return true; } }),
    in: () => ({ fetchSockets: async () => [], socketsLeave: () => undefined }),
  }));

  const messages: Record<string, unknown>[] = [];
  const writes: unknown[] = [];
  let nextId = 0x100;
  const recordedOperation = (delegate: string, op: string) => async (args: unknown) => {
    writes.push({ delegate, op, args });
    if (op === 'findMany') return [];
    if (op === 'count') return 0;
    return op.endsWith('Many') ? { count: 0 } : null;
  };
  const recording = (delegate: string, known: Record<string, unknown> = {}) =>
    new Proxy(known, { get: (target, op) => (op in target ? target[op as string] : recordedOperation(delegate, String(op))) });

  const envelopeDelegate = store.prisma.messageEnvelope;
  const base: Record<string, Record<string, unknown>> = {
    conversation: {
      findUnique: async () => ({ id: CONVERSATION, type: 'direct', encryptionMode: options.encryptionMode, encryptionEnabledAt: new Date('2026-01-01'), encryptionEpoch: 0 }),
      findFirst: async () => ({ id: CONVERSATION, identifier: 'dm', type: 'direct' }),
      update: async (args: unknown) => { writes.push({ delegate: 'conversation', op: 'update', args }); return { id: CONVERSATION }; },
    },
    participant: {
      findUnique: async () => ({ id: ALICE_PARTICIPANT, conversationId: CONVERSATION, isActive: true, userId: ALICE }),
      findFirst: async () => null,
      findMany: store.prisma.participant.findMany,
    },
    e2EEDevice: store.prisma.e2EEDevice,
    messageEnvelope: {
      ...envelopeDelegate,
      createMany: options.envelopeCreateMany ?? envelopeDelegate.createMany,
    },
    friendRequest: { findFirst: async () => null },
    postMention: { findUnique: async () => null },
    post: { findUnique: async () => null },
    message: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const clash = data.clientMessageId && messages.some((m) => m.clientMessageId === data.clientMessageId && m.deletedAt === null);
        if (clash) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        writes.push({ delegate: 'message', op: 'create', args: data });
        const row = {
          id: (nextId++).toString(16).padStart(24, '0'), createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
          validatedMentions: [], attachments: [], replyTo: null,
          sender: { id: ALICE_PARTICIPANT, displayName: 'Alice', avatar: null, type: 'user', userId: ALICE }, ...data,
        };
        messages.push(row);
        return row;
      },
      update: async (args: unknown) => { writes.push({ delegate: 'message', op: 'update', args }); return messages[0]; },
      findMany: async () => [],
      delete: options.messageDelete ?? (async ({ where }: { where: { id: string } }) => {
        const index = messages.findIndex((m) => m.id === where.id);
        if (index >= 0) messages.splice(index, 1);
        return null;
      }),
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        messages.find((m) => where.clientMessageId !== undefined && m.clientMessageId === where.clientMessageId) ?? null,
      findUnique: async () => null,
    },
    trackingLink: { updateMany: async () => ({ count: 0 }) },
    messageAttachment: { findMany: async () => [] },
    user: { findUnique: async () => null, findMany: async () => [] },
  };
  const prisma = new Proxy(base, {
    get: (target, key) => {
      if (key === '$runCommandRaw') return recordedOperation('$runCommandRaw', 'command');
      if (typeof key !== 'string' || key.startsWith('$') || key === 'then') return target[key as string];
      return recording(key, target[key] ?? {});
    },
  });
  const service = new MessagingService(prisma as never, { handleNewMessage: async () => ({}) } as never, {} as never);
  return { service, store, messages, writes, emitted };
}
