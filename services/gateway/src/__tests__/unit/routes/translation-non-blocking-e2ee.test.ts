/**
 * Constat GWX-07 de la contre-analyse E2EE du 2026-11-17 (#18906) — POST
 * /translate (NON bloquant), cas « message_id », applique la MÊME loi que la
 * route bloquante (`translation-blocking-e2ee.test.ts`) :
 * `sharedTranslationServerReadsMessage`, régime de la CONVERSATION, régime et
 * drapeau du MESSAGE, régime inconnu ⇒ scellé. Une ligne e2ee y était jugée
 * « lisible » (son texte est le littéral `[Encrypted]`), et la retraduction
 * partait vers le traducteur, qui rangeait et diffusait la « traduction » d'un
 * message que le serveur ne lit pas.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

// La loi de lecture (#16557) est prouvée ailleurs (`translation-read-law.test.ts`) : tenue pour acquise ici.
jest.mock('../../../services/messaging/translationReadGate', () => ({
  readerMayTranslateMessage: jest.fn(async () => true),
}));
jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';
import type { MessagingService } from '../../../services/messaging/MessagingService';

const MSG_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439033';
const USER_ID = '507f1f77bcf86cd799439001';

type Row = { readonly encryptionMode: string | null; readonly isEncrypted?: boolean; readonly conversationMode: string | null };

const rowOf = ({ encryptionMode, isEncrypted, conversationMode }: Row) => ({
  id: MSG_ID,
  content: '[Encrypted]',
  originalLanguage: 'fr',
  encryptionMode,
  isEncrypted: isEncrypted ?? false,
  encryptedContent: isEncrypted ? 'libsignal-v1' : null,
  encryptionMetadata: null,
  conversationId: CONV_ID,
  conversation: { encryptionMode: conversationMode },
});

async function buildApp(row: Row) {
  const handleNewMessage = jest.fn(async () => ({ messageId: MSG_ID }));
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', { message: { findUnique: jest.fn(async () => rowOf(row)) } } as unknown as PrismaClient);
  app.decorate('translationService', { handleNewMessage } as unknown as MessageTranslationService);
  app.decorate('messagingService', {} as unknown as MessagingService);
  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    (request as unknown as Record<string, unknown>).authContext = {
      isAuthenticated: true, isAnonymous: false, type: 'jwt', userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' },
    };
  });
  const { translationRoutes } = await import('../../../routes/translation-non-blocking');
  await app.register(translationRoutes);
  await app.ready();
  return { app, handleNewMessage };
}

const retranslate = (app: FastifyInstance) =>
  app.inject({ method: 'POST', url: '/translate', payload: { message_id: MSG_ID, target_language: 'en' } });

describe('POST /translate (non bloquant) — le serveur ne retraduit rien d’une conversation chiffrée de bout en bout', () => {
  it.each<readonly [string, Row]>([
    ['message e2ee libsignal dans une conversation e2ee', { encryptionMode: 'e2ee', isEncrypted: true, conversationMode: 'e2ee' }],
    ['message sans régime dans une conversation e2ee', { encryptionMode: null, conversationMode: 'e2ee' }],
    ['régime de conversation inconnu', { encryptionMode: null, conversationMode: 'signal_v3' }],
    ['message chiffré sans régime', { encryptionMode: null, isEncrypted: true, conversationMode: null }],
  ])('400 E2EE_NOT_TRANSLATABLE, traducteur jamais appelé : %s', async (_label, row) => {
    const { app, handleNewMessage } = await buildApp(row);

    const res = await retranslate(app);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('E2EE_NOT_TRANSLATABLE');
    expect(handleNewMessage).not.toHaveBeenCalled();
    await app.close();
  });

  it('un message en clair se retraduit toujours (contrôle) : 200, traducteur appelé', async () => {
    const { app, handleNewMessage } = await buildApp({ encryptionMode: null, conversationMode: null });

    const res = await retranslate(app);

    expect(res.statusCode).toBe(200);
    expect(handleNewMessage).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
