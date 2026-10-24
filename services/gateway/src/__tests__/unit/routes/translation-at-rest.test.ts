/**
 * #11381 — la RETRADUCTION d'un message `server`/`hybrid` part du CLAIR.
 *
 * La ligne porte `content: ''` et le chiffré à côté. Les deux routes de
 * retraduction et l'événement socket lisaient `content` : le translator
 * recevait une chaîne vide et rangeait une traduction vide. Ici, le vrai
 * `EncryptionService` scelle le message comme `MessageProcessor` le fait, et
 * le témoin regarde ce que le translator REÇOIT.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/EncryptionService', () => {
  const actual = jest.requireActual('../../../services/EncryptionService') as typeof import('../../../services/EncryptionService');
  return { ...actual, getEncryptionService: jest.fn(async (prisma: PrismaClient) => new actual.EncryptionService(prisma)) };
});

import { EncryptionService } from '../../../services/EncryptionService';
import { loadTranslatableMessage } from '../../../services/messaging/atRestTranslationSource';
import { SERVER_AT_REST_UNREADABLE } from '../../../services/messaging/serverAtRest';

const MSG_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439033';
const ALICE = '507f1f77bcf86cd799439044';
const SECRET = 'Le code de la porte est 4471';
const savedKey = process.env.ENCRYPTION_MASTER_KEY;

afterAll(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = savedKey;
});

beforeEach(() => {
  process.env.ENCRYPTION_MASTER_KEY = Buffer.alloc(32, 11).toString('base64');
});

type Store = { readonly keys: Map<string, Record<string, unknown>> };

const keyPrisma = (store: Store) => ({
  conversation: { findUnique: jest.fn(async () => null) },
  serverEncryptionKey: {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => { store.keys.set(String(data.id), data); return data; }),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => store.keys.get(where.id) ?? null),
    findMany: jest.fn(async () => [...store.keys.values()]),
    update: jest.fn(async () => ({})),
  },
});

async function sealedRow(store: Store, conversationId = CONV_ID) {
  const writer = new EncryptionService(keyPrisma(store) as unknown as PrismaClient);
  const sealed = await writer.sealAtRest({ plaintext: SECRET, conversationId });
  return {
    id: MSG_ID,
    conversationId: CONV_ID,
    senderId: '507f1f77bcf86cd799439055',
    content: '',
    originalLanguage: 'fr',
    isEncrypted: true,
    encryptionMode: 'server',
    encryptedContent: sealed.ciphertext,
    encryptionMetadata: { mode: 'server', ...sealed.metadata },
    translations: null,
    conversation: { encryptionMode: 'server', participants: [{ userId: ALICE }] },
  };
}

function prismaWith(store: Store, row: Record<string, unknown>) {
  return {
    ...keyPrisma(store),
    message: { findUnique: jest.fn(async () => row) },
    participant: { findFirst: jest.fn(async () => ({ id: 'p-alice' })) },
  } as unknown as PrismaClient;
}

async function blockingApp(prisma: PrismaClient) {
  const translationService = {
    handleNewMessage: jest.fn(async () => ({ messageId: MSG_ID })),
    getTranslation: jest.fn(async () => ({
      translatedText: 'The door code is 4471', sourceLanguage: 'fr', targetLanguage: 'en', confidenceScore: 1, processingTime: 0, modelType: 'basic',
    })),
  };
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: FastifyRequest, _reply: FastifyReply) => {
    (req as unknown as { user?: { userId: string } }).user = { userId: ALICE };
  });
  app.decorate('prisma', prisma);
  app.decorate('translationService', translationService);
  const { translationRoutes } = await import('../../../routes/translation');
  await translationRoutes(app);
  await app.ready();
  return { app, translationService };
}

async function nonBlockingApp(prisma: PrismaClient) {
  const translationService = { handleNewMessage: jest.fn(async () => ({ messageId: MSG_ID })) };
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('translationService', translationService);
  app.decorate('messagingService', {});
  app.decorate('authenticate', async (req: FastifyRequest, _reply: FastifyReply) => {
    (req as unknown as Record<string, unknown>).authContext = { userId: ALICE, isAuthenticated: true, isAnonymous: false };
  });
  const { translationRoutes } = await import('../../../routes/translation-non-blocking');
  await app.register(translationRoutes);
  await app.ready();
  return { app, translationService };
}

describe('POST /translate-blocking — un message server se retraduit depuis son clair', () => {
  it('le translator reçoit le texte ouvert, jamais la chaîne vide', async () => {
    const store: Store = { keys: new Map() };
    const { app, translationService } = await blockingApp(prismaWith(store, await sealedRow(store)));

    await app.inject({ method: 'POST', url: '/translate-blocking', payload: { message_id: MSG_ID, target_language: 'en' } });

    expect(translationService.handleNewMessage).toHaveBeenCalledWith(expect.objectContaining({ content: SECRET }));
    await app.close();
  });

  it('une ligne qu’aucune clé n’ouvre est REFUSÉE, jamais traduite vide', async () => {
    const store: Store = { keys: new Map() };
    const row = await sealedRow(store);
    store.keys.clear();
    const { app, translationService } = await blockingApp(prismaWith(store, row));

    const res = await app.inject({ method: 'POST', url: '/translate-blocking', payload: { message_id: MSG_ID, target_language: 'en' } });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe(SERVER_AT_REST_UNREADABLE);
    expect(translationService.handleNewMessage).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /translate — la retraduction non bloquante part du clair', () => {
  it('le translator reçoit le texte ouvert', async () => {
    const store: Store = { keys: new Map() };
    const { app, translationService } = await nonBlockingApp(prismaWith(store, await sealedRow(store)));

    const res = await app.inject({ method: 'POST', url: '/translate', payload: { message_id: MSG_ID, target_language: 'en' } });

    expect(res.statusCode).toBe(200);
    expect(translationService.handleNewMessage).toHaveBeenCalledWith(expect.objectContaining({ content: SECRET }));
    await app.close();
  });

  it('une ligne scellée sous la clé d’une AUTRE conversation est refusée', async () => {
    const store: Store = { keys: new Map() };
    const { app, translationService } = await nonBlockingApp(prismaWith(store, await sealedRow(store, '507f1f77bcf86cd799439099')));

    const res = await app.inject({ method: 'POST', url: '/translate', payload: { message_id: MSG_ID, target_language: 'en' } });

    expect(res.statusCode).toBe(409);
    expect(translationService.handleNewMessage).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('translation:request — l’événement socket lit le clair', () => {
  it('loadTranslatableMessage ouvre le texte du message server', async () => {
    const store: Store = { keys: new Map() };
    const message = await loadTranslatableMessage(prismaWith(store, await sealedRow(store)), MSG_ID);
    expect(message).toMatchObject({ id: MSG_ID, conversationId: CONV_ID, content: SECRET, encryptionMode: 'server' });
  });

  it('scellé, le texte reste vide : la porte socket répond « vide », sans traduire', async () => {
    const store: Store = { keys: new Map() };
    const row = await sealedRow(store);
    store.keys.clear();
    const message = await loadTranslatableMessage(prismaWith(store, row), MSG_ID);
    expect(message?.content).toBe('');
  });
});
