/**
 * `POST /translate-blocking` SANS `message_id` traduit un texte — il n'ÉCRIT
 * plus de message.
 *
 * Appelée avec `conversation_id` + `text`, la route persistait un message
 * utilisateur (`MessageTranslationService.handleNewMessage` →
 * `_saveMessageToDatabase` : `prisma.message.create`, `lastMessageAt` bumpé)
 * sans passer par `MessagingService.handleMessage`. Elle contournait donc le
 * mode lent des nouveaux comptes de Meeshy Global, la clôture, le rang
 * d'écriture, le mode lent configuré et jusqu'à l'appartenance
 * (`senderParticipant?.id || senderId`) : un compte neuf écrivait dans le salon
 * global sans limite, et le message apparaissait chez tout le monde au
 * rechargement. Aucun client n'emploie ce chemin pour ENVOYER (iOS passe
 * `message_id`, Android ne passe que le texte) ; les trois transports d'envoi
 * convergent sur `handleMessage`, et cette route n'en est plus un.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({}))
}));

import { translationRoutes } from '../../../routes/translation';

const USER_ID = '507f1f77bcf86cd799439033';
const GLOBAL_CONVERSATION_ID = '507f1f77bcf86cd799439022';

const translated = {
  translatedText: 'Bonjour tout le monde',
  sourceLanguage: 'en',
  targetLanguage: 'fr',
  confidenceScore: 0.93,
  processingTime: 0.12,
  modelType: 'medium'
};

async function buildApp() {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: USER_ID };
  });

  const prisma = {
    message: { findUnique: jest.fn<any>(async () => null), create: jest.fn<any>() },
    participant: { findFirst: jest.fn<any>(async () => null) },
    conversation: { update: jest.fn<any>(), create: jest.fn<any>() }
  };
  const translationService = {
    handleNewMessage: jest.fn<any>(async () => ({ messageId: 'persisted-by-mistake' })),
    getTranslation: jest.fn<any>(async () => null),
    translateTextDirectly: jest.fn<any>(async () => translated)
  };
  app.decorate('prisma', prisma);
  app.decorate('translationService', translationService);

  await translationRoutes(app);
  await app.ready();
  return { app, prisma, translationService };
}

const translate = (app: FastifyInstance, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/translate-blocking', payload });

describe('POST /translate-blocking — un texte sans message_id', () => {
  it('ne crée aucun message, même avec l’identifiant du salon global', async () => {
    const { app, translationService } = await buildApp();

    const res = await translate(app, {
      text: 'Hello everyone',
      target_language: 'fr',
      conversation_id: GLOBAL_CONVERSATION_ID
    });

    expect(res.statusCode).toBe(200);
    expect(translationService.handleNewMessage).not.toHaveBeenCalled();
    await app.close();
  });

  it('rend la traduction du texte, sans identifiant de message', async () => {
    const { app } = await buildApp();

    const res = await translate(app, { text: 'Hello everyone', target_language: 'fr', source_language: 'en' });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.translated_text).toBe('Bonjour tout le monde');
    expect(data.original_text).toBe('Hello everyone');
    expect(data.source_language).toBe('en');
    expect(data.target_language).toBe('fr');
    expect(data.message_id).toBeUndefined();
    await app.close();
  });

  it('traduit par le chemin direct, avec la langue source annoncée et le modèle prédit', async () => {
    const { app, translationService } = await buildApp();

    await translate(app, { text: 'A'.repeat(50), target_language: 'fr', source_language: 'de', model_type: 'basic' });

    expect(translationService.translateTextDirectly).toHaveBeenCalledWith('A'.repeat(50), 'de', 'fr', 'medium');
    await app.close();
  });

  it('laisse le traducteur détecter la langue quand l’appelant ne l’annonce pas', async () => {
    const { app, translationService } = await buildApp();

    await translate(app, { text: 'Hello', target_language: 'fr' });

    expect(translationService.translateTextDirectly).toHaveBeenCalledWith('Hello', 'auto', 'fr', 'basic');
    await app.close();
  });
});
