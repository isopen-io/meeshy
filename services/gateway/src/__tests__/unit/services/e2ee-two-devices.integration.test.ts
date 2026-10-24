/**
 * INTÉGRATION À DEUX APPAREILS, avec libsignal RÉEL (#3706, spec § 8.3).
 *
 * Alice et Bob sont deux appareils `@signalapp/libsignal-client` qui tournent
 * dans un processus Node à part (`libsignal-device.mjs` : Jest remplace la
 * bibliothèque par un simulacre). La passerelle, elle, est la VRAIE : routes
 * `/e2ee` (Fastify), annuaire (dont la vérification XEdDSA de production,
 * branchée sur la vraie bibliothèque), `MessagingService` → `MessageProcessor`
 * → relais, distribution socket, éventail de notifications.
 *
 * Alice publie, Bob publie, Alice réserve le bundle de Bob, chiffre un texte
 * SENTINELLE aléatoire, l'envoie ; Bob relit son enveloppe par la route et la
 * déchiffre. Puis on cherche la sentinelle — en clair, en base64, en hexa —
 * dans tout ce que la passerelle a écrit (« MongoDB » : chaque document de
 * chaque collection et chaque argument d'écriture Prisma), dans tout ce
 * qu'elle a journalisé (stdout, stderr, console), dans ce que la socket a
 * émis, dans les charges de notification et dans chaque appel au magasin de
 * cache (Redis, `getCacheStore`), remplacé par un espion qui enregistre tout.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { MessageRequest } from '@meeshy/shared/types';

const mockHandleNewMessage = jest.fn();
const mockUpdateOnNewMessage = jest.fn();
const mockProcessExplicitLinksInContent = jest.fn(
  async ({ content }: { content: string }) => ({ processedContent: content, trackingLinks: [] })
);

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({
    handleNewMessage: mockHandleNewMessage
  }))
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    updateOnNewMessage: mockUpdateOnNewMessage
  }
}));

const mockOnNewMessage: any = jest.fn(async () => undefined);
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: {
    onNewMessage: (...a: any[]) => mockOnNewMessage(...a)
  }
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    findExistingTrackingLink: jest.fn(async () => null),
    createTrackingLink: jest.fn(async () => ({ token: 'abc123' })),
    processExplicitLinksInContent: mockProcessExplicitLinksInContent,
    collectContentTrackingLinks: jest.fn(async () => [])
  }))
}));

jest.mock('../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn().mockReturnValue([]),
    extractMentionsWithParticipants: jest.fn().mockReturnValue([]),
    resolveUsernames: jest.fn(async () => new Map()),
    validateMentionPermissions: jest.fn(async () => ({
      isValid: true, validUserIds: [], invalidUsernames: [], errors: []
    })),
    createMentions: jest.fn(async () => undefined)
  }))
}));

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    markMessagesAsRead: jest.fn(async () => undefined),
    getUnreadCount: jest.fn(async () => 0)
  }))
}));

const redisCalls: unknown[] = [];
jest.mock('../../../services/CacheStore', () => {
  const actual = jest.requireActual('../../../services/CacheStore') as Record<string, unknown>;
  const spy = new Proxy({}, {
    get: (_target, method) => async (...args: unknown[]) => { redisCalls.push({ method: String(method), args }); return null; },
  });
  return { ...actual, getCacheStore: () => spy };
});

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));




import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'child_process';
import { createInterface } from 'readline';
import { randomBytes } from 'crypto';
import { join } from 'path';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { LIBSIGNAL_PROTOCOL, type E2EEDeviceBundle } from '@meeshy/shared/types/e2ee-directory';
import { MessagingService } from '../../../services/MessagingService';
import type { PrismaClient, Message } from '@meeshy/shared/prisma/client';
import { resetParticipantLookupCache } from '../../../utils/participant-lookup-cache';
import { registerE2EERoutes } from '../../../routes/e2ee';
import { createE2EEDirectory } from '../../../services/e2ee/E2EEDirectory';
import { createE2EEEnvelopeRelay } from '../../../services/e2ee/E2EEEnvelopeRelay';
import { libsignalSignatureVerifier, type LibsignalPublicKeyApi } from '../../../services/e2ee/signature-verifier';
import { setE2EEEnvelopeIOProvider } from '../../../services/e2ee/envelope-delivery';
import { createFakeE2EEStore } from '../../../services/e2ee/__tests__/fake-e2ee-store';
import { buildMessageNewPayload } from '../../../socketio/messageNewPayload';
import { notifyMessageRecipients } from '../../../services/messaging/messageNotificationFanOut';

const HELPER = join(__dirname, '../../../services/e2ee/__tests__/libsignal-device.mjs');

class LibsignalDevices {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private next = 1;

  constructor() {
    this.child = spawn(process.execPath, [HELPER, 'serve']);
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      const { id, result, error } = JSON.parse(line);
      const waiter = this.pending.get(id);
      this.pending.delete(id);
      if (error) waiter?.reject(new Error(error));
      else waiter?.resolve(result);
    });
  }

  request<T>(command: string, args: Record<string, unknown>): Promise<T> {
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify({ id, command, args })}\n`);
    });
  }

  close(): void {
    this.child.kill();
  }
}

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

/** La surface `PublicKey` de libsignal, servie par la VRAIE bibliothèque d'un processus à part. */
const realLibsignal: LibsignalPublicKeyApi = {
  PublicKey: {
    deserialize: (identityKey: Uint8Array) => ({
      verify: (message: Uint8Array, signature: Uint8Array) =>
        execFileSync(process.execPath, [HELPER, 'verify', b64(identityKey), b64(message), b64(signature)]).toString() === 'true',
    }),
  },
};

const ALICE = '507f1f77bcf86cd799439018';
const BOB = '507f1f77bcf86cd799439019';
const ALICE_SESSION = '507f1f77bcf86cd799439020';
const BOB_SESSION = '507f1f77bcf86cd799439021';
const CONVERSATION = '507f1f77bcf86cd799439012';
const ALICE_PARTICIPANT = '507f1f77bcf86cd799439014';
const MESSAGE_ID = '507f1f77bcf86cd799439013';

describe('E2EE de bout en bout à deux appareils, libsignal réel (#3706)', () => {
  jest.setTimeout(60_000);

  let devices: LibsignalDevices;
  beforeAll(() => { devices = new LibsignalDevices(); });
  afterAll(() => devices.close());

  it("ne laisse aucun octet du texte sentinelle dans la base, les journaux, la socket ni les notifications — et Bob le déchiffre", async () => {
    resetParticipantLookupCache();
    const sentinel = `sentinelle-${randomBytes(16).toString('hex')}`;
    const forms = [sentinel, Buffer.from(sentinel).toString('base64'), Buffer.from(sentinel).toString('hex')];

    const logs: string[] = [];
    const capture = (sink: (chunk: any, ...rest: any[]) => boolean) => (chunk: any, ...rest: any[]) => {
      logs.push(String(chunk));
      return sink(chunk, ...rest);
    };
    const writeOut = process.stdout.write.bind(process.stdout);
    const writeErr = process.stderr.write.bind(process.stderr);
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(capture(writeOut) as never);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(capture(writeErr) as never);
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(JSON.stringify(args)); }));

    const store = createFakeE2EEStore();
    store.collections.Participant.insert({ id: ALICE_PARTICIPANT, conversationId: CONVERSATION, userId: ALICE });
    store.collections.Participant.insert({ conversationId: CONVERSATION, userId: BOB });
    const messages: Record<string, unknown>[] = [];
    const prismaWrites: unknown[] = [];
    const emitted: unknown[] = [];
    setE2EEEnvelopeIOProvider(() => ({
      to: (room: string) => ({ emit: (event: string, payload: unknown) => { emitted.push({ room, event, payload }); return true; } }),
      in: () => ({ fetchSockets: async () => [] }),
    }));

    const users: Record<string, { userId: string; sessionId: string }> = {
      alice: { userId: ALICE, sessionId: ALICE_SESSION },
      bob: { userId: BOB, sessionId: BOB_SESSION },
    };
    const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    registerE2EERoutes(app, {
      auth: async (request: FastifyRequest) => {
        const who = users[String(request.headers['x-test-user'])];
        (request as unknown as { authContext: unknown }).authContext = { isAuthenticated: true, isAnonymous: false, ...who };
      },
      directory: createE2EEDirectory({ prisma: store.prisma as never, verifier: libsignalSignatureVerifier(() => realLibsignal) }),
      relay: createE2EEEnvelopeRelay({ prisma: store.prisma as never }),
      mayReadKeysOf: async () => true,
    });
    await app.ready();

    // 1. Chaque appareil publie ses clés publiques ; la passerelle vérifie leurs signatures avec libsignal.
    const aliceKeys = await devices.request<Record<string, unknown>>('create', { name: 'alice', userId: ALICE, oneTime: 2 });
    const bobKeys = await devices.request<Record<string, unknown>>('create', { name: 'bob', userId: BOB, oneTime: 2 });
    const aliceEnrolled = await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' }, payload: aliceKeys });
    const bobEnrolled = await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'bob' }, payload: bobKeys });
    expect([aliceEnrolled.statusCode, bobEnrolled.statusCode]).toEqual([201, 201]);

    // Une signature falsifiée est refusée par la vraie vérification XEdDSA.
    const forged = { ...bobKeys, signedPreKey: { ...(bobKeys.signedPreKey as object), signature: b64(randomBytes(64)) } };
    const refused = await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'bob' }, payload: forged });
    expect(refused.statusCode).toBe(400);

    // Rejouer l'identité PUBLIQUE de Bob depuis la session d'Alice : la preuve de possession manque.
    const hijack = await app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' }, payload: { ...bobKeys } });
    expect(hijack.json().code).toBe('E2EE_DEVICE_BINDING_INVALID');

    // 2. Alice réserve le bundle de Bob et chiffre (PQXDH + Double Ratchet) dans SON processus.
    const served = await app.inject({ method: 'GET', url: `/e2ee/keys/${BOB}`, headers: { 'x-test-user': 'alice' } });
    const [bobBundle] = served.json().data.devices as E2EEDeviceBundle[];
    expect(bobBundle.preKey).not.toBeNull();
    expect(bobBundle.kyberPreKey.lastResort).toBe(false);
    const ciphertext = await devices.request<{ type: 2 | 3; body: string }>('encrypt', {
      from: 'alice', fromAddress: { name: ALICE, deviceId: 1 }, toAddress: { name: BOB, deviceId: 1 }, bundle: bobBundle, plaintext: sentinel,
    });
    expect(ciphertext.type).toBe(3);

    // 3. L'envoi traverse le VRAI MessagingService. Toute opération Prisma non
    //    simulée explicitement (effets d'après-envoi compris) est ENREGISTRÉE.
    const recordedOperation = (delegate: string, op: string) => async (args: unknown) => {
      prismaWrites.push({ delegate, op, args });
      if (op === 'findMany') return [];
      if (op === 'count') return 0;
      return op.endsWith('Many') ? { count: 0 } : null;
    };
    const recording = (delegate: string, known: Record<string, unknown> = {}) =>
      new Proxy(known, { get: (target, op) => (op in target ? target[op as string] : recordedOperation(delegate, String(op))) });
    const base: any = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({ id: CONVERSATION, type: 'direct', encryptionMode: 'e2ee', encryptionEnabledAt: new Date('2026-01-01') }),
        findFirst: jest.fn().mockResolvedValue({ id: CONVERSATION, identifier: 'dm', type: 'direct' }),
        update: jest.fn().mockImplementation(async (args: unknown) => { prismaWrites.push(args); return { id: CONVERSATION }; }),
      },
      participant: {
        findUnique: jest.fn().mockResolvedValue({ id: ALICE_PARTICIPANT, conversationId: CONVERSATION, isActive: true, userId: ALICE }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: store.prisma.participant.findMany,
      },
      e2EEDevice: store.prisma.e2EEDevice,
      messageEnvelope: store.prisma.messageEnvelope,
      friendRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      postMention: { findUnique: jest.fn().mockResolvedValue(null) },
      post: { findUnique: jest.fn().mockResolvedValue(null) },
      message: {
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          prismaWrites.push(data);
          const row = { id: MESSAGE_ID, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, validatedMentions: [], attachments: [], replyTo: null,
            sender: { id: ALICE_PARTICIPANT, displayName: 'Alice', avatar: null, type: 'user', userId: ALICE }, ...data };
          messages.push(row);
          return row;
        }),
        update: jest.fn().mockImplementation(async (args: unknown) => { prismaWrites.push(args); return messages[0]; }),
        findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null),
      },
      trackingLink: { updateMany: jest.fn() },
      messageAttachment: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = new Proxy(base, {
      get: (target, key) => {
        if (key === '$runCommandRaw') return recordedOperation('$runCommandRaw', 'command');
        if (typeof key !== 'string' || key.startsWith('$') || key === 'then') return target[key as string];
        return recording(key, target[key] ?? {});
      },
    });
    const service = new MessagingService(prisma as PrismaClient, { handleNewMessage: mockHandleNewMessage } as any, {} as any);
    const request = {
      conversationId: CONVERSATION, content: '', originalLanguage: 'fr',
      encryptedPayload: {
        ciphertext: LIBSIGNAL_PROTOCOL, mode: 'e2ee', protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1, regimeEpoch: 0,
        relay: { protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1, sessionId: ALICE_SESSION, unapprovedOwnDevices: [],
          envelopes: [{ userId: BOB, deviceId: 1, registrationId: bobKeys.registrationId as number, type: ciphertext.type, body: ciphertext.body }] },
      },
    } as unknown as MessageRequest;
    const response = await service.handleMessage(request, ALICE_PARTICIPANT);
    expect(response.success).toBe(true);
    expect(emitted).toEqual([expect.objectContaining({ room: `device:${BOB}:1:${bobKeys.registrationId as number}`, event: 'e2ee:envelope' })]);

    // 4. Ce qu'un ancien client reçoit : le littéral et l'invitation à mettre à jour.
    const wire = buildMessageNewPayload(messages[0] as unknown as Message, { conversationId: CONVERSATION } as never);
    expect(wire).toMatchObject({ content: '[Encrypted]', isEncrypted: true, e2eeUpgradeRequired: true });

    // 5. L'éventail de notifications d'un message chiffré.
    const notifications: unknown[] = [];
    const record = async (...args: unknown[]) => { notifications.push(args); return null; };
    await notifyMessageRecipients({
      prisma: {
        participant: { findUnique: jest.fn().mockResolvedValue({ userId: ALICE, displayName: 'Alice', avatar: null }) },
        user: { findUnique: jest.fn().mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null }) },
        conversation: { findUnique: jest.fn().mockResolvedValue({ title: null, type: 'direct', participants: [{ userId: BOB }] }) },
        message: { findUnique: jest.fn().mockResolvedValue({ deletedAt: null }) },
        notification: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
        messageAttachment: { findMany: jest.fn().mockResolvedValue([]) },
        userConversationPreferences: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
      notificationService: { createReplyNotification: record, createMentionNotificationsBatch: async (...args: unknown[]) => { notifications.push(args); return 0; }, createMessageNotification: record },
      message: messages[0] as never,
      senderParticipantId: ALICE_PARTICIPANT,
      conversationId: CONVERSATION,
      processedContent: String(messages[0].content),
    });
    expect(notifications.length).toBeGreaterThan(0);

    // Ce que la base garde en attendant l'accusé : le chiffré opaque, et lui seul.
    const storedBeforeAck = JSON.stringify(store.collections.MessageEnvelope.rows);
    expect(storedBeforeAck).toContain(ciphertext.body);

    // 6. Bob relit son enveloppe par la route, la déchiffre, puis l'accuse.
    const listed = await app.inject({ method: 'GET', url: '/e2ee/envelopes', headers: { 'x-test-user': 'bob' } });
    const [envelope] = listed.json().data.envelopes;
    const decrypted = await devices.request<{ plaintext: string }>('decrypt', {
      to: 'bob', toAddress: { name: BOB, deviceId: 1 }, fromAddress: { name: ALICE, deviceId: 1 }, type: envelope.type, body: envelope.body,
    });
    expect(decrypted.plaintext).toBe(sentinel);
    const ack = await app.inject({ method: 'POST', url: '/e2ee/envelopes/ack', headers: { 'x-test-user': 'bob' }, payload: { ids: [envelope.id] } });
    expect(ack.json().data).toEqual({ deleted: 1 });

    // 7. La sentinelle n'est nulle part côté serveur — effets d'après-envoi détachés compris.
    await new Promise((resolve) => setTimeout(resolve, 100));
    stdout.mockRestore();
    stderr.mockRestore();
    consoleSpies.forEach((spy) => spy.mockRestore());
    const database = JSON.stringify({ storedBeforeAck, collections: Object.fromEntries(Object.entries(store.collections).map(([name, c]) => [name, c.rows])), messages, prismaWrites });
    const surfaces = { database, logs: logs.join('\n'), socket: JSON.stringify(emitted), push: JSON.stringify(notifications), redis: JSON.stringify(redisCalls), wire: JSON.stringify(wire) };
    Object.entries(surfaces).forEach(([surface, text]) => {
      forms.forEach((form) => expect({ surface, leaked: text.includes(form) }).toEqual({ surface, leaked: false }));
    });
    expect(store.collections.MessageEnvelope.rows).toHaveLength(0);
    await app.close();
  });
});
