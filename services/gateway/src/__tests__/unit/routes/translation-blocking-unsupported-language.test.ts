/**
 * `POST /translate-blocking` vers une langue que NLLB-200 ne sert pas (`byv`…
 * #3659). La retraduction d'un message attendait dix secondes une traduction
 * que `handleNewMessage` ne demande jamais (la cible est filtrée), puis servait
 * `"[BYV] <texte>"` en `model: 'fallback'` — un texte FABRIQUÉ, présenté comme
 * du Medumba (règle 1 du Prisme : sans traduction, l'ORIGINAL).
 *
 * Désormais l'original, tout de suite, dans sa langue : la forme que la route
 * sert déjà quand la source égale la cible — même enveloppe, donc rien ne
 * change pour un client ancien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn(), logWarn: jest.fn() }));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

import { translationRoutes } from '../../../routes/translation';

const MSG_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439033';
const USER_ID = 'alice-user-id';
const CONTENT = 'Bonjour à tous, rendez-vous à 18h';

async function buildApp(originalLanguage: string): Promise<{ app: FastifyInstance; translationService: Record<string, jest.Mock<any>> }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: USER_ID };
  });
  app.decorate('prisma', {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: MSG_ID, content: CONTENT, originalLanguage, encryptionMode: null, isEncrypted: false,
        conversationId: CONV_ID, conversation: { encryptionMode: null, participants: [{ userId: USER_ID }] },
      }),
    },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  });
  const translationService = {
    handleNewMessage: jest.fn<any>().mockResolvedValue({ messageId: MSG_ID }),
    getTranslation: jest.fn<any>().mockResolvedValue(null),
  };
  app.decorate('translationService', translationService);
  await translationRoutes(app);
  await app.ready();
  return { app, translationService };
}

const retranslate = (app: FastifyInstance, target: string) =>
  app.inject({ method: 'POST', url: '/translate-blocking', payload: { message_id: MSG_ID, target_language: target } });

describe('POST /translate-blocking — retraduction vers une langue que NLLB-200 ne sert pas', () => {
  it("sert l'original dans sa langue, tout de suite, sans rien demander au translator", async () => {
    const { app, translationService } = await buildApp('fr');
    const started = Date.now();

    const res = await retranslate(app, 'byv');

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.translated_text).toBe(CONTENT);
    expect(data.source_language).toBe('fr');
    expect(data.target_language).toBe('fr');
    expect(translationService.handleNewMessage).not.toHaveBeenCalled();
    await app.close();
  });

  it("sert l'original d'un message ÉCRIT dans une langue que NLLB-200 ne lit pas", async () => {
    const { app, translationService } = await buildApp('byv');

    const res = await retranslate(app, 'en');

    expect(res.json().data.translated_text).toBe(CONTENT);
    expect(res.json().data.target_language).toBe('byv');
    expect(translationService.handleNewMessage).not.toHaveBeenCalled();
    await app.close();
  });
});
