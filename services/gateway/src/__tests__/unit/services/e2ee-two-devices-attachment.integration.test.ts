/**
 * INTÉGRATION À DEUX APPAREILS, avec libsignal RÉEL — une PIÈCE JOINTE (#10789).
 *
 * Même banc que `e2ee-two-devices.integration.test.ts` : Alice et Bob sont deux
 * appareils `@signalapp/libsignal-client` d'un processus Node à part, la
 * passerelle est la vraie. Alice chiffre un fichier SENTINELLE au format
 * `client-v1` (`@meeshy/shared/utils/e2ee-attachment-cipher`), le dépose par la
 * voie opaque de la porte TUS (`storeEndToEndBlob`, sur un vrai disque
 * temporaire), et met le pointeur — clé, condensat, nom, type — dans le
 * contenu libsignal. Bob ouvre l'enveloppe, lit le pointeur, relit le blob,
 * vérifie et déchiffre : il retrouve le fichier.
 *
 * Puis on cherche, en clair, en base64 et en hexa : les octets du fichier, son
 * nom, son type, sa clé — dans la base (chaque document, chaque écriture
 * Prisma), sur le DISQUE de la passerelle (chaque fichier écrit), dans les
 * journaux, la socket, les notifications et Redis.
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
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { encryptAttachment, decryptAttachment } from '@meeshy/shared/utils/e2ee-attachment-cipher';
import { endToEndUploadRefusal, storeEndToEndBlob } from '../../../services/attachments/endToEndBlobUpload';

const ALICE = '507f1f77bcf86cd799439018';
const BOB = '507f1f77bcf86cd799439019';
const ALICE_SESSION = '507f1f77bcf86cd799439020';
const BOB_SESSION = '507f1f77bcf86cd799439021';
const CONVERSATION = '507f1f77bcf86cd799439012';
const ALICE_PARTICIPANT = '507f1f77bcf86cd799439014';
const MESSAGE_ID = '507f1f77bcf86cd799439013';
const BLOB_ID = '507f1f77bcf86cd7994390b1';

const forms = (value: string | Uint8Array): string[] => {
  const raw = Buffer.from(value);
  return [raw.toString('latin1'), raw.toString('base64'), raw.toString('hex')];
};

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map((entry) => (entry.isDirectory()
    ? filesUnder(path.join(dir, entry.name))
    : Promise.resolve([path.join(dir, entry.name)]))));
  return nested.flat();
}

describe('E2EE à deux appareils, libsignal réel : une pièce jointe (#10789)', () => {
  jest.setTimeout(60_000);

  let devices: LibsignalDevices;
  let uploadDir: string;
  beforeAll(async () => {
    devices = new LibsignalDevices();
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2ee-attachment-integration-'));
  });
  afterAll(async () => {
    devices.close();
    await fs.rm(uploadDir, { recursive: true, force: true });
  });

  it("le fichier, son nom, son type et sa clé n'atteignent ni la base, ni le disque, ni les journaux, ni la socket, ni le push, ni Redis — et Bob l'ouvre", async () => {
    resetParticipantLookupCache();
    const fileSentinel = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`photo-sentinelle-${randomBytes(16).toString('hex')}`)]);
    const fileName = `IMG-${randomBytes(6).toString('hex')}.jpg`;
    const contentType = 'image/x-meeshy-sentinel';

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
    const attachments: Record<string, unknown>[] = [];
    const prismaWrites: unknown[] = [];
    const emitted: unknown[] = [];
    setE2EEEnvelopeIOProvider(() => ({
      to: (room: string) => ({ emit: (event: string, payload: unknown) => { emitted.push({ room, event, payload }); return true; } }),
      in: () => ({ fetchSockets: async () => [], socketsLeave: () => undefined }),
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
    const aliceKeys = await devices.request<Record<string, unknown>>('create', { name: 'alice', userId: ALICE, oneTime: 2 });
    const bobKeys = await devices.request<Record<string, unknown>>('create', { name: 'bob', userId: BOB, oneTime: 2 });
    const enrolled = await Promise.all([
      app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'alice' }, payload: aliceKeys }),
      app.inject({ method: 'POST', url: '/e2ee/devices', headers: { 'x-test-user': 'bob' }, payload: bobKeys }),
    ]);
    expect(enrolled.map((reply) => reply.statusCode)).toEqual([201, 201]);

    // 1. Alice chiffre le fichier SUR SON APPAREIL et dépose le blob par la voie opaque.
    const sealedFile = await encryptAttachment(fileSentinel);
    const digest = Buffer.from(sealedFile.digest).toString('base64');
    const metadata = { uploadcontext: 'e2ee-attachment', digest, filetype: 'application/octet-stream', filename: 'blob' };
    expect(endToEndUploadRefusal({ metadata, isAnonymous: false })).toBeNull();
    const tusTemp = path.join(uploadDir, '.tus-resumable');
    await fs.mkdir(tusTemp, { recursive: true });
    await fs.writeFile(path.join(tusTemp, 'upload-1'), sealedFile.blob);
    const prismaAttachments = {
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        prismaWrites.push(data);
        const row = { id: BLOB_ID, messageId: null, ...data };
        attachments.push(row);
        return row;
      }),
      findMany: jest.fn().mockImplementation(async ({ where }: { where?: { id?: { in?: string[] }; messageId?: string } }) =>
        attachments.filter((row) => (where?.id?.in ? where.id.in.includes(String(row.id)) : where?.messageId ? row.messageId === where.messageId : true))),
      updateMany: jest.fn().mockImplementation(async ({ where, data }: { where: { id: { in: string[] } }; data: Record<string, unknown> }) => {
        prismaWrites.push(data);
        attachments.filter((row) => where.id.in.includes(String(row.id))).forEach((row) => Object.assign(row, data));
        return { count: 1 };
      }),
    };
    const uploaded = await storeEndToEndBlob({ prisma: { messageAttachment: prismaAttachments } as never, uploadPath: uploadDir }, {
      sourcePath: path.join(tusTemp, 'upload-1'), metadata, userId: ALICE, now: new Date(),
    });
    expect(uploaded.status_code).toBe(200);

    // 2. Le pointeur voyage DANS le contenu libsignal.
    const content = JSON.stringify({
      v: 2, conversationId: CONVERSATION, clientMessageId: 'cid_1', sentAt: Date.now(), authorUserId: ALICE, authorDeviceId: 1,
      attachments: [{
        id: BLOB_ID, scheme: 'client-v1', key: Buffer.from(sealedFile.key).toString('base64'), digest,
        size: sealedFile.size, contentType, fileName, kind: 'image',
      }],
    });
    const served = await app.inject({ method: 'GET', url: `/e2ee/keys/${BOB}`, headers: { 'x-test-user': 'alice' } });
    const [bobBundle] = served.json().data.devices as E2EEDeviceBundle[];
    const ciphertext = await devices.request<{ type: 2 | 3; body: string }>('encrypt', {
      from: 'alice', fromAddress: { name: ALICE, deviceId: 1 }, toAddress: { name: BOB, deviceId: 1 }, bundle: bobBundle, plaintext: content,
    });

    // 3. L'envoi traverse le vrai MessagingService, pièce rattachée.
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
      messageAttachment: prismaAttachments,
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
    const response = await service.handleMessage({
      conversationId: CONVERSATION, content: '', originalLanguage: 'fr', attachmentIds: [BLOB_ID],
      encryptedPayload: {
        ciphertext: LIBSIGNAL_PROTOCOL, mode: 'e2ee', protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1, regimeEpoch: 0,
        relay: { protocol: LIBSIGNAL_PROTOCOL, senderDeviceId: 1, sessionId: ALICE_SESSION, unapprovedOwnDevices: [],
          envelopes: [{ userId: BOB, deviceId: 1, registrationId: bobKeys.registrationId as number, type: ciphertext.type, body: ciphertext.body }] },
      },
    } as unknown as MessageRequest, ALICE_PARTICIPANT);
    expect(response.success).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(attachments[0]).toMatchObject({ messageId: MESSAGE_ID, mimeType: 'application/octet-stream', encryptionMode: 'e2ee' });

    // 4. Ce qu'un ancien client reçoit, et l'éventail de notifications.
    const wire = buildMessageNewPayload({ ...messages[0], attachments } as unknown as Message, { conversationId: CONVERSATION } as never);
    const notifications: unknown[] = [];
    const record = async (...args: unknown[]) => { notifications.push(args); return null; };
    await notifyMessageRecipients({
      prisma: {
        participant: { findUnique: jest.fn().mockResolvedValue({ userId: ALICE, displayName: 'Alice', avatar: null }) },
        user: { findUnique: jest.fn().mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null }) },
        conversation: { findUnique: jest.fn().mockResolvedValue({ title: null, type: 'direct', participants: [{ userId: BOB }] }) },
        message: { findUnique: jest.fn().mockResolvedValue({ deletedAt: null }) },
        notification: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
        messageAttachment: { findMany: jest.fn().mockResolvedValue(attachments) },
        userConversationPreferences: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
      notificationService: { createReplyNotification: record, createMentionNotificationsBatch: async (...args: unknown[]) => { notifications.push(args); return 0; }, createMessageNotification: record },
      message: messages[0] as never,
      senderParticipantId: ALICE_PARTICIPANT,
      conversationId: CONVERSATION,
      processedContent: String(messages[0].content),
    });

    // 5. Bob ouvre l'enveloppe, lit le pointeur, relit le blob, vérifie, déchiffre.
    const listed = await app.inject({ method: 'GET', url: '/e2ee/envelopes', headers: { 'x-test-user': 'bob' } });
    const [envelope] = listed.json().data.envelopes;
    const opened = await devices.request<{ plaintext: string }>('decrypt', {
      to: 'bob', toAddress: { name: BOB, deviceId: 1 }, fromAddress: { name: ALICE, deviceId: 1 }, type: envelope.type, body: envelope.body,
    });
    const [pointer] = JSON.parse(opened.plaintext).attachments;
    const blob = await fs.readFile(path.join(uploadDir, String(attachments[0]!.filePath)));
    const file = await decryptAttachment(blob, { key: Buffer.from(pointer.key, 'base64'), digest: Buffer.from(pointer.digest, 'base64'), size: pointer.size });
    expect(Buffer.from(file).equals(fileSentinel)).toBe(true);
    expect(pointer.fileName).toBe(fileName);
    const tampered = Buffer.from(blob);
    tampered[30] = (tampered[30] ?? 0) ^ 1;
    await expect(decryptAttachment(tampered, { key: Buffer.from(pointer.key, 'base64'), digest: Buffer.from(pointer.digest, 'base64'), size: pointer.size }))
      .rejects.toMatchObject({ reason: 'digest-mismatch' });

    // 6. Rien de ce que le chiffré cache n'est côté serveur.
    stdout.mockRestore();
    stderr.mockRestore();
    consoleSpies.forEach((spy) => spy.mockRestore());
    const disk = (await Promise.all((await filesUnder(uploadDir)).map((file) => fs.readFile(file, 'latin1')))).join('\n');
    expect((await filesUnder(uploadDir)).filter((file) => !file.includes('.tus-resumable'))).toHaveLength(1);
    expect(createHash('sha256').update(blob).digest('base64')).toBe(digest);
    const secrets = [...forms(fileSentinel.subarray(4)), ...forms(fileName), ...forms(contentType), ...forms(sealedFile.key)];
    const database = JSON.stringify({ collections: Object.fromEntries(Object.entries(store.collections).map(([name, c]) => [name, c.rows])), messages, attachments, prismaWrites });
    const surfaces = { database, disk, logs: logs.join('\n'), socket: JSON.stringify(emitted), push: JSON.stringify(notifications), redis: JSON.stringify(redisCalls), wire: JSON.stringify(wire) };
    Object.entries(surfaces).forEach(([surface, text]) => {
      secrets.forEach((secret) => expect({ surface, leaked: text.includes(secret) }).toEqual({ surface, leaked: false }));
    });
    await app.close();
  });
});
