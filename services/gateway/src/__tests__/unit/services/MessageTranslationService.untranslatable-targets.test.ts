/**
 * Incident prod 2026-11-01 — un lecteur en `byv` (Medumba) coûtait, à CHAQUE
 * message de sa conversation, cinq pushes au translator sur ~2,5 min et un
 * `translation:failed` diffusé. `byv` est offert au produit mais n'a aucun
 * code NLLB-200 (#3659) : le translator ne pourra jamais le servir.
 *
 * La passerelle ne pousse donc que les langues traduisibles côté serveur
 * (`isServerTranslatableLanguage`, `@meeshy/shared/utils/languages`). Une
 * cible qui ne l'est pas sert l'ORIGINAL (règle 1 du Prisme) : ni push, ni
 * échec annoncé. Le VRAI service tourne ; seul le transport ZMQ est simulé.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
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

const MSG_ID = '507f1f77bcf86cd799439031';
const CONV_ID = '507f1f77bcf86cd799439032';

type Row = Record<string, unknown>;
const state: { row: Row; readers: readonly string[] } = { row: {}, readers: [] };

const reader = (language: string) => ({ id: `p-${language}`, type: 'anonymous', displayName: language, language, user: null });

const prisma = {
  message: {
    findFirst: jest.fn(async () => ({ ...state.row })),
    findUnique: jest.fn(async () => ({ ...state.row })),
    update: jest.fn(async () => ({ ...state.row })),
  },
  conversation: { findUnique: jest.fn(async () => ({ autoTranslateEnabled: true, serverEncryptionKeyId: null })) },
  participant: {
    findMany: jest.fn(async () => state.readers.map(reader)),
    findUnique: jest.fn(async () => null),
  },
  userStats: { upsert: jest.fn(async () => ({})) },
} as unknown as PrismaClient;

const row = (originalLanguage: string): Row => ({
  id: MSG_ID, conversationId: CONV_ID, senderId: 'sender-1', content: 'Bonjour à tous',
  originalLanguage, messageType: 'text', isEncrypted: false, encryptionMode: null, deletedAt: null, translations: null,
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const pushedTargets = (): unknown[] =>
  zmq.sendTranslationRequest.mock.calls.map(([request]) => (request as { targetLanguages: unknown }).targetLanguages);

async function newMessage(options: { originalLanguage: string; readers: readonly string[]; targetLanguage?: string }) {
  state.row = row(options.originalLanguage);
  state.readers = options.readers;
  const service = new MessageTranslationService(prisma);
  await service.initialize();
  const failed = jest.fn();
  service.on('translationError', failed);
  await service.handleNewMessage({
    id: MSG_ID, conversationId: CONV_ID, senderId: 'sender-1', content: 'Bonjour à tous',
    originalLanguage: options.originalLanguage, messageType: 'text', replyToId: null,
    ...(options.targetLanguage ? { targetLanguage: options.targetLanguage } : {}),
  } as Parameters<MessageTranslationService['handleNewMessage']>[0]);
  await settle();
  return { service, failed };
}

beforeEach(() => {
  zmq.sendTranslationRequest.mockClear();
});

describe('une langue sans code NLLB-200 ne part jamais au translator', () => {
  it('un lecteur byv seul : aucun push, aucun échec annoncé', async () => {
    const { failed } = await newMessage({ originalLanguage: 'fr', readers: ['fr', 'byv'] });

    expect(zmq.sendTranslationRequest).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });

  it('un lecteur byv parmi d’autres : seules les langues servies partent', async () => {
    await newMessage({ originalLanguage: 'fr', readers: ['en', 'byv', 'de'] });

    expect(pushedTargets()).toHaveLength(1);
    expect([...(pushedTargets()[0] as string[])].sort()).toEqual(['de', 'en']);
  });

  it('une traduction demandée explicitement vers byv ne part pas', async () => {
    await newMessage({ originalLanguage: 'fr', readers: ['fr'], targetLanguage: 'byv' });

    expect(zmq.sendTranslationRequest).not.toHaveBeenCalled();
  });

  it('un message ÉCRIT en byv ne se traduit pas : NLLB-200 ne sait pas le lire', async () => {
    await newMessage({ originalLanguage: 'byv', readers: ['en', 'fr'] });

    expect(zmq.sendTranslationRequest).not.toHaveBeenCalled();
  });

  it('la retraduction d’un message vers byv ne part pas', async () => {
    state.row = row('fr');
    const service = new MessageTranslationService(prisma);
    await service.initialize();

    await service.retranslateMessageAsync(MSG_ID, { conversationId: CONV_ID, content: 'Bonjour', targetLanguage: 'byv' } as Parameters<MessageTranslationService['retranslateMessageAsync']>[1]);
    await settle();

    expect(zmq.sendTranslationRequest).not.toHaveBeenCalled();
  });
});
