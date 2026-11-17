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
  /**
   * Remplace l'écriture des enveloppes ; `write` est la vraie — dans le tampon
   * de la transaction quand elle passe par le client transactionnel, sur le
   * magasin quand elle passe par le client extérieur.
   */
  readonly envelopeCreateMany?: (args: unknown, write: (args: unknown) => Promise<unknown>) => Promise<unknown>;
  readonly messageDelete?: (args: unknown) => Promise<unknown>;
  /**
   * La validation échoue APRÈS le rappel (audit de #19080, E2) : élection du
   * jeu de réplicas, conflit d'écriture détecté à la validation (P2034), délai
   * de transaction dépassé (P2028). Rend l'erreur à lever, ou `null`.
   */
  readonly commitFailure?: () => Error | null;
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
  const envelopeCreateMany = options.envelopeCreateMany;
  const throughOverride = (write: (args: unknown) => Promise<unknown>) => (args: unknown) =>
    (envelopeCreateMany ? envelopeCreateMany(args, write) : write(args));
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
      createMany: throughOverride(envelopeDelegate.createMany as (args: unknown) => Promise<unknown>),
    },
    friendRequest: { findFirst: async () => null },
    postMention: { findUnique: async () => null },
    post: { findUnique: async () => null },
    trackingLink: { updateMany: async () => ({ count: 0 }) },
    messageAttachment: { findMany: async () => [] },
    user: { findUnique: async () => null, findMany: async () => [] },
  };
  // Une transaction du jeu de réplicas (isolation par instantané) : les lignes
  // ET les enveloppes qu'elle écrit restent dans SON tampon, invisibles aux
  // autres requêtes, et ne rejoignent le magasin qu'à sa validation ; une
  // insertion concurrente sur la même clé unique échoue en conflit d'écriture
  // (P2034, comme MongoDB). Un abandon — rappel qui lève, ou validation qui
  // échoue après lui — ne défait QUE son tampon : ce que le client extérieur a
  // écrit pendant le rappel reste, comme en base réelle (banc strict de
  // l'audit de #19080, E2).
  type Staging = { readonly rows: Record<string, unknown>[]; readonly envelopes: Record<string, unknown>[] };
  const openTransactions = new Set<Staging>();
  const live = (clientMessageId: unknown) => (row: Record<string, unknown>) =>
    clientMessageId !== undefined && row.clientMessageId === clientMessageId && row.deletedAt === null;
  const visibleTo = (staging: Staging | null) => (staging ? [...messages, ...staging.rows] : messages);
  const messageDelegate = (staging: Staging | null) => ({
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (visibleTo(staging).some(live(data.clientMessageId))) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      const concurrent = [...openTransactions].some((other) => other !== staging && other.rows.some(live(data.clientMessageId)));
      if (concurrent) throw Object.assign(new Error('Transaction failed due to a write conflict'), { code: 'P2034' });
      writes.push({ delegate: 'message', op: 'create', args: data });
      const row = {
        id: (nextId++).toString(16).padStart(24, '0'), createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
        validatedMentions: [], attachments: [], replyTo: null,
        sender: { id: ALICE_PARTICIPANT, displayName: 'Alice', avatar: null, type: 'user', userId: ALICE }, ...data,
      };
      (staging ? staging.rows : messages).push(row);
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
      visibleTo(staging).find((m) => where.clientMessageId !== undefined && m.clientMessageId === where.clientMessageId) ?? null,
    findUnique: async () => null,
  });
  const stagedEnvelopeDelegate = (staging: Staging) => ({
    ...envelopeDelegate,
    createMany: throughOverride(async (args: unknown) => {
      const { data } = args as { data: Record<string, unknown>[] };
      data.forEach((row) => staging.envelopes.push({ id: (nextId++).toString(16).padStart(24, '0'), createdAt: new Date(), ...row }));
      return { count: data.length };
    }),
    findMany: async (args: { where: { messageId?: string } }) => [
      ...((await (envelopeDelegate.findMany as (args: unknown) => Promise<Record<string, unknown>[]>)(args)) ?? []),
      ...staging.envelopes.filter((row) => args.where.messageId === undefined || row.messageId === args.where.messageId),
    ],
  });
  const transaction = async (run: (tx: unknown) => Promise<unknown>): Promise<unknown> => {
    const staging: Staging = { rows: [], envelopes: [] };
    openTransactions.add(staging);
    try {
      const result = await run(clientFor(staging));
      const failure = options.commitFailure?.() ?? null;
      if (failure) throw failure;
      messages.push(...staging.rows);
      staging.envelopes.forEach((row) => store.collections.MessageEnvelope.insert(row));
      return result;
    } finally {
      openTransactions.delete(staging);
    }
  };
  const clientFor = (staging: Staging | null): Record<string, unknown> => {
    const delegates: Record<string, Record<string, unknown>> = {
      ...base,
      message: messageDelegate(staging),
      ...(staging ? { messageEnvelope: stagedEnvelopeDelegate(staging) } : {}),
    };
    return new Proxy(delegates, {
      get: (target, key) => {
        if (key === '$transaction') return transaction;
        if (key === '$runCommandRaw') return recordedOperation('$runCommandRaw', 'command');
        if (typeof key !== 'string' || key.startsWith('$') || key === 'then') return target[key as string];
        return recording(key, target[key] ?? {});
      },
    });
  };
  const prisma = clientFor(null);
  const service = new MessagingService(prisma as never, { handleNewMessage: async () => ({}) } as never, {} as never);
  return { service, store, messages, writes, emitted };
}
