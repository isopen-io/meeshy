/**
 * POST /translate-blocking refuse tout message d'une conversation chiffrée de
 * bout en bout, par la loi `sharedTranslationServerReadsMessage` (régime de la
 * CONVERSATION, régime et drapeau du MESSAGE) — pas seulement quand la ligne du
 * message porte `encryptionMode === 'e2ee'`. Le serveur n'est alors jamais appelé.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

import type { MessageActionInput, MessageActions } from '@meeshy/shared/utils/message-action-policy';
import { translationRoutes } from '../../../routes/translation';

const MSG_ID = '507f1f77bcf86cd799439011';
const ALICE = 'alice-user-id';

type Row = { readonly encryptionMode: string | null; readonly isEncrypted?: boolean; readonly conversationMode: string | null };

const rowOf = ({ encryptionMode, isEncrypted, conversationMode }: Row) => ({
  id: MSG_ID,
  content: 'envelope-or-clear',
  originalLanguage: 'fr',
  encryptionMode,
  isEncrypted,
  conversationId: '507f1f77bcf86cd799439033',
  conversation: { encryptionMode: conversationMode, participants: [{ userId: ALICE }] },
});

async function buildApp(row: Row) {
  const translationService = {
    handleNewMessage: jest.fn<any>().mockResolvedValue({ messageId: MSG_ID }),
    getTranslation: jest.fn<any>().mockResolvedValue({
      translatedText: 'x', sourceLanguage: 'fr', targetLanguage: 'en', confidenceScore: 1, processingTime: 0, modelType: 'basic',
    }),
  };
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: FastifyRequest, _reply: FastifyReply) => {
    (req as unknown as { user?: { userId: string } }).user = { userId: ALICE };
  });
  app.decorate('prisma', {
    message: { findUnique: jest.fn<any>().mockResolvedValue(rowOf(row)) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  });
  app.decorate('translationService', translationService);
  await translationRoutes(app);
  await app.ready();
  return { app, translationService };
}

const translate = (app: FastifyInstance) =>
  app.inject({ method: 'POST', url: '/translate-blocking', payload: { message_id: MSG_ID, target_language: 'en' } });

describe('POST /translate-blocking — le serveur ne traduit rien d’une conversation chiffrée de bout en bout', () => {
  it.each<readonly [string, Row]>([
    ['message sans régime dans une conversation e2ee', { encryptionMode: null, conversationMode: 'e2ee' }],
    ['régime de conversation en majuscules', { encryptionMode: null, conversationMode: 'E2EE' }],
    ['régime de conversation inconnu', { encryptionMode: null, conversationMode: 'signal_v3' }],
    ['régime de message en majuscules', { encryptionMode: 'E2EE', conversationMode: null }],
    ['message chiffré sans régime', { encryptionMode: null, isEncrypted: true, conversationMode: null }],
  ])('400 E2EE_NOT_TRANSLATABLE, serveur jamais appelé : %s', async (_label, row) => {
    const { app, translationService } = await buildApp(row);

    const res = await translate(app);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('E2EE_NOT_TRANSLATABLE');
    expect(translationService.getTranslation).not.toHaveBeenCalled();
    expect(translationService.handleNewMessage).not.toHaveBeenCalled();
    await app.close();
  });

  it.each<readonly [string, Row]>([
    ['clair', { encryptionMode: null, conversationMode: null }],
    ['conversation chiffrée par le serveur', { encryptionMode: null, conversationMode: 'server' }],
    ['message chiffré par le serveur (hybride)', { encryptionMode: 'hybrid', isEncrypted: true, conversationMode: 'hybrid' }],
  ])('le serveur lit déjà le texte : 200, %s', async (_label, row) => {
    const { app } = await buildApp(row);

    expect((await translate(app)).statusCode).toBe(200);
    await app.close();
  });
});

type MessageVector = { readonly _label: string; readonly input: MessageActionInput; readonly expected: MessageActions };

const FIXTURES = resolve(__dirname, '../../../../../../packages/shared/fixtures/action-policy');
const vectors: readonly MessageVector[] = JSON.parse(readFileSync(resolve(FIXTURES, 'message-actions.vectors.json'), 'utf-8')).vectors;
const translatable = vectors.filter((vector) => vector.expected.verdicts.translate !== null);

describe('parité — « Traduire » (loi des actions) et POST /translate-blocking', () => {
  it('les vecteurs couvrent la traduction servie ET la traduction sur l’appareil', () => {
    expect(new Set(translatable.map((vector) => vector.expected.verdicts.translate))).toEqual(new Set(['served-switch', 'device']));
  });

  it.each(translatable.map((vector) => [vector._label, vector] as const))('%s', async (_label, vector) => {
    const { message, conversation } = vector.input;
    const { app, translationService } = await buildApp({
      encryptionMode: message.encryptionMode ?? null,
      isEncrypted: message.isEncrypted ?? undefined,
      conversationMode: conversation.encryptionMode ?? null,
    });

    const res = await translate(app);

    const onDevice = vector.expected.verdicts.translate === 'device';
    expect(res.statusCode).toBe(onDevice ? 400 : 200);
    if (onDevice) expect(translationService.getTranslation).not.toHaveBeenCalled();
    await app.close();
  });
});
