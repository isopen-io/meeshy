/**
 * #11381, #12822 — la traduction AUTOMATIQUE d'un message `server`/`hybrid`.
 *
 * La ligne en base porte `content: ''` et le chiffré à côté. Le VRAI
 * `MessageTranslationService` (seul le transport ZMQ est simulé) doit remettre
 * au translator le CLAIR, ouvert par la passerelle depuis la ligne — jamais une
 * chaîne vide, jamais le chiffré, jamais un texte que l'appelant prétend être
 * celui du message.
 */
import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import { EventEmitter } from 'events';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

class FakeZmqClient extends EventEmitter {
  sendTranslationRequest = jest.fn(async (_request: unknown) => 'task-1');
  healthCheck = jest.fn(async () => true);
  close = jest.fn(async () => undefined);
}
const zmq = new FakeZmqClient();

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstance: jest.fn(async () => zmq) },
}));

import { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';
import { EncryptionService } from '../../../services/EncryptionService';

const MASTER = Buffer.alloc(32, 5).toString('base64');
const MSG_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const SECRET = 'la réunion est déplacée à jeudi, salle 4471';
const savedKey = process.env.ENCRYPTION_MASTER_KEY;
process.env.ENCRYPTION_MASTER_KEY = MASTER;

afterAll(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = savedKey;
});

type Row = Record<string, unknown>;

const keys = new Map<string, Row>();
const state: { row: Row } = { row: {} };

const prisma = {
  message: {
    findFirst: jest.fn(async () => ({ ...state.row })),
    findUnique: jest.fn(async () => ({ ...state.row })),
    update: jest.fn(async () => ({ ...state.row })),
  },
  conversation: { findUnique: jest.fn(async () => ({ autoTranslateEnabled: true, serverEncryptionKeyId: null })) },
  participant: {
    findMany: jest.fn(async () => [{ id: 'p-en', type: 'anonymous', displayName: 'en', language: 'en', user: null }]),
    findUnique: jest.fn(async () => null),
  },
  userStats: { upsert: jest.fn(async () => ({})) },
  serverEncryptionKey: {
    create: jest.fn(async ({ data }: { data: Row }) => { keys.set(String(data.id), data); return data; }),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => keys.get(where.id) ?? null),
    findMany: jest.fn(async () => []),
    update: jest.fn(async () => ({})),
    updateMany: jest.fn(async () => ({ count: 0 })),
  },
} as unknown as PrismaClient;

async function sealedRow(mode: 'server' | 'hybrid'): Promise<Row> {
  const sealed = await new EncryptionService(prisma).sealAtRest({ plaintext: SECRET, conversationId: CONV_ID });
  return {
    id: MSG_ID, conversationId: CONV_ID, senderId: 'sender-1', content: '', originalLanguage: 'fr',
    messageType: 'text', isEncrypted: true, encryptionMode: mode,
    encryptedContent: sealed.ciphertext, encryptionMetadata: { mode, ...sealed.metadata, canTranslate: true },
    deletedAt: null, translations: null,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

const requestedTexts = (): unknown[] =>
  zmq.sendTranslationRequest.mock.calls.map(([request]) => (request as { text: unknown }).text);

beforeEach(() => {
  zmq.sendTranslationRequest.mockClear();
});

describe.each(['server', 'hybrid'] as const)('traduction automatique d’un message %s chiffré au repos', (mode) => {
  it('le translator reçoit le CLAIR ouvert depuis la ligne (forme exacte de queueMessageTranslation)', async () => {
    state.row = await sealedRow(mode);
    const service = new MessageTranslationService(prisma);
    await service.initialize();

    await service.handleNewMessage({
      id: MSG_ID, conversationId: CONV_ID, senderId: 'sender-1',
      content: SECRET, originalLanguage: 'fr', messageType: 'text', replyToId: null,
    } as Parameters<MessageTranslationService['handleNewMessage']>[0]);
    await settle();

    expect(requestedTexts()).toEqual([SECRET]);
  });

  it('le texte d’un appelant n’est pas celui du message : seule la ligne fait foi', async () => {
    state.row = await sealedRow(mode);
    const service = new MessageTranslationService(prisma);
    await service.initialize();

    await service.handleNewMessage({
      id: MSG_ID, conversationId: CONV_ID, content: 'texte fabriqué par le client', originalLanguage: 'fr', targetLanguage: 'en',
    } as Parameters<MessageTranslationService['handleNewMessage']>[0]);
    await settle();

    expect(requestedTexts()).toEqual([SECRET]);
  });

  it('une ligne qu’aucune clé n’ouvre n’est JAMAIS envoyée : ni vide, ni chiffrée', async () => {
    const row = await sealedRow(mode);
    state.row = { ...row, encryptionMetadata: { ...(row.encryptionMetadata as Row), authTag: Buffer.alloc(16, 1).toString('base64') } };
    const service = new MessageTranslationService(prisma);
    await service.initialize();

    await service.handleNewMessage({
      id: MSG_ID, conversationId: CONV_ID, content: SECRET, originalLanguage: 'fr',
    } as Parameters<MessageTranslationService['handleNewMessage']>[0]);
    await settle();

    expect(zmq.sendTranslationRequest).not.toHaveBeenCalled();
  });
});

const requests = (): Row[] => zmq.sendTranslationRequest.mock.calls.map(([request]) => request as Row);

describe('E1 — le translator apprend qu’un texte est chiffré au repos (ni cache Redis, ni journal)', () => {
  it.each(['server', 'hybrid'] as const)('la traduction automatique d’un message %s porte atRest', async (mode) => {
    state.row = await sealedRow(mode);
    const service = new MessageTranslationService(prisma);
    await service.initialize();

    await service.handleNewMessage({
      id: MSG_ID, conversationId: CONV_ID, content: SECRET, originalLanguage: 'fr',
    } as Parameters<MessageTranslationService['handleNewMessage']>[0]);
    await settle();

    expect(requests()).toEqual([expect.objectContaining({ text: SECRET, atRest: true })]);
  });

  it('la retraduction d’un message server porte atRest', async () => {
    state.row = await sealedRow('server');
    const service = new MessageTranslationService(prisma);
    await service.initialize();

    await service.retranslateMessageAsync(MSG_ID, { conversationId: CONV_ID, content: SECRET, targetLanguage: 'en' } as Parameters<MessageTranslationService['retranslateMessageAsync']>[1]);
    await settle();

    expect(requests()).toEqual([expect.objectContaining({ text: SECRET, atRest: true })]);
  });

  it('un message non chiffré ne porte pas le drapeau : le translator garde son cache', async () => {
    state.row = {
      id: MSG_ID, conversationId: CONV_ID, senderId: 'sender-1', content: SECRET, originalLanguage: 'fr',
      messageType: 'text', isEncrypted: false, encryptionMode: null, deletedAt: null, translations: null,
    };
    const service = new MessageTranslationService(prisma);
    await service.initialize();

    await service.handleNewMessage({
      id: MSG_ID, conversationId: CONV_ID, content: SECRET, originalLanguage: 'fr',
    } as Parameters<MessageTranslationService['handleNewMessage']>[0]);
    await settle();

    expect(requests()).toHaveLength(1);
    expect(requests()[0]).not.toHaveProperty('atRest');
  });
});

describe('E2 — une traduction dont le régime ne se relit pas ne se range JAMAIS en clair', () => {
  const TRANSLATED = 'the meeting moves to Thursday, room 4471';

  it('la relecture du message échoue : message.update ne reçoit aucun texte', async () => {
    state.row = await sealedRow('server');
    const service = new MessageTranslationService(prisma);
    await service.initialize();
    const update = prisma.message.update as unknown as jest.Mock;
    const findUnique = prisma.message.findUnique as unknown as jest.Mock;
    update.mockClear();
    findUnique.mockImplementation(async (args: unknown) => {
      const select = (args as { select?: Record<string, unknown> }).select ?? {};
      if ('encryptionMode' in select && !('encryptedContent' in select)) throw new Error('mongo down');
      return { ...state.row };
    });

    zmq.emit('translationCompleted', {
      taskId: 'task-e2', targetLanguage: 'en',
      result: { messageId: MSG_ID, sourceLanguage: 'fr', targetLanguage: 'en', translatedText: TRANSLATED, confidenceScore: 0.9, processingTime: 1, modelType: 'basic' },
    });
    await settle();
    findUnique.mockImplementation(async () => ({ ...state.row }));

    expect(JSON.stringify(update.mock.calls)).not.toContain(TRANSLATED);
  });
});
