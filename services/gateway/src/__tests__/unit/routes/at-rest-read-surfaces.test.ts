/**
 * #11381, #12822 (constat 6) — les surfaces de LECTURE d'un message
 * `server`/`hybrid` servent son clair aux membres, jamais du chiffré présenté
 * comme du texte.
 *
 * `_saveTranslationToDatabase` range les traductions chiffrées au repos
 * (`isEncrypted: true`, base64 dans `text`). `transformTranslationsToArray`
 * les servait telles quelles en `translatedContent`, et `/sync` ne lisait même
 * pas le chiffré du message : la bulle d'un client rattrapé se vidait.
 *
 * Le VRAI `EncryptionService` scelle la ligne et ses traductions ; les routes
 * réelles les servent. Seule la base est simulée.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterAll } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const USER_ID = '507f1f77bcf86cd799439000';
const PARTICIPANT_ID = '507f1f77bcf86cd799439aaa';
const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439033';
const SECRET = 'Le code de la porte est 4471';
const SECRET_EN = 'The door code is 4471';
const MASTER = Buffer.alloc(32, 11).toString('base64');
const savedKey = process.env.ENCRYPTION_MASTER_KEY;
process.env.ENCRYPTION_MASTER_KEY = MASTER;

afterAll(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = savedKey;
});

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (req: FastifyRequest) => {
    Object.assign(req, { authContext: { userId: USER_ID, type: 'user', isAnonymous: false, isAuthenticated: true } });
  },
  isRegisteredUser: () => true,
}));

import { EncryptionService } from '../../../services/EncryptionService';
import { EncryptionHelper } from '../../../services/message-translation/EncryptionHelper';
import { syncRoutes } from '../../../routes/sync';
import { registerMessagesReadRoutes } from '../../../routes/messages-reads';
import { transformTranslationsToArray } from '../../../utils/translation-transformer';

type Row = Record<string, unknown>;

const keys = new Map<string, Row>();
const designation: { keyId: string | null } = { keyId: null };

const keyStore = {
  serverEncryptionKey: {
    create: jest.fn(async ({ data }: { data: Row }) => { keys.set(String(data.id), data); return data; }),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => keys.get(where.id) ?? null),
    findMany: jest.fn(async () => []),
    update: jest.fn(async () => ({})),
    updateMany: jest.fn(async () => ({ count: 0 })),
  },
  conversation: {
    findUnique: jest.fn(async () => designation.keyId
      ? { serverEncryptionKeyId: designation.keyId, encryptionMode: 'server', serverEncryptionKey: keys.get(designation.keyId) ?? null }
      : null),
    updateMany: jest.fn(async () => ({ count: 0 })),
  },
};

const ciphertextFragments: string[] = [];

async function sealedMessage(overrides: Row = {}): Promise<Row> {
  const sealer = new EncryptionService(keyStore as unknown as PrismaClient);
  designation.keyId = designation.keyId ?? await sealer.getOrCreateConversationKey(CONV_ID);
  const sealed = await sealer.sealAtRest({ plaintext: SECRET, conversationId: CONV_ID, preferredKeyId: designation.keyId });
  const translated = await new EncryptionHelper(keyStore as unknown as PrismaClient).encryptTranslation(SECRET_EN, CONV_ID);
  ciphertextFragments.push(sealed.ciphertext, translated.encryptedContent);
  return {
    id: MSG_ID, conversationId: CONV_ID, senderId: PARTICIPANT_ID, content: '', clientMessageId: null,
    originalLanguage: 'fr', messageType: 'text', messageSource: 'user', metadata: null,
    isEdited: false, editedAt: null, replyToId: null, reactionSummary: null, reactionCount: 0,
    validatedMentions: [], isViewOnce: false, maxViewOnceCount: null, viewOnceCount: 0, isBlurred: false,
    effectFlags: 0, expiresAt: null, ephemeralDuration: null, attachments: [], sender: null,
    isEncrypted: true, encryptionMode: 'server', encryptedContent: sealed.ciphertext,
    encryptionMetadata: { mode: 'server', ...sealed.metadata, canTranslate: true },
    translations: {
      en: {
        text: translated.encryptedContent, translationModel: 'basic', isEncrypted: true,
        encryptionKeyId: translated.encryptionKeyId, encryptionIv: translated.encryptionIv,
        encryptionAuthTag: translated.encryptionAuthTag, createdAt: new Date('2026-10-24T10:00:00Z'),
      },
    },
    createdAt: new Date('2026-10-24T10:00:00Z'), updatedAt: new Date('2026-10-24T10:00:00Z'),
    ...overrides,
  };
}

const leaksCiphertext = (body: string): boolean => ciphertextFragments.some((fragment) => body.includes(fragment));

function syncPrisma(changed: Row[]) {
  return {
    ...keyStore,
    participant: { findMany: jest.fn(async () => [{ id: PARTICIPANT_ID, conversationId: CONV_ID }]) },
    message: { findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValueOnce(changed).mockResolvedValue([]) },
    conversationShareLink: { findMany: jest.fn(async () => []) },
    userEventSeq: { findUnique: jest.fn(async () => null) },
    userMessageDeletion: { findMany: jest.fn(async () => []) },
    userConversationPreferences: { findMany: jest.fn(async () => []) },
  };
}

async function syncApp(prisma: ReturnType<typeof syncPrisma>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  await app.register(syncRoutes);
  await app.ready();
  return app;
}

describe('GET /sync — un message server rattrapé', () => {
  it('sert son clair et sa traduction ouverte, jamais le chiffré', async () => {
    const prisma = syncPrisma([await sealedMessage()]);
    const app = await syncApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/sync?since=2026-10-01T00:00:00.000Z&collections=messages' });
    await app.close();

    expect(res.statusCode).toBe(200);
    const [served] = res.json().data.collections.messages.added;
    expect(served.content).toBe(SECRET);
    expect(served.translations).toEqual([expect.objectContaining({ targetLanguage: 'en', translatedContent: SECRET_EN, isEncrypted: false })]);
    expect(leaksCiphertext(res.body)).toBe(false);
  });

  it('lit le chiffré : le select demande les colonnes du repos', async () => {
    const prisma = syncPrisma([await sealedMessage()]);
    const app = await syncApp(prisma);
    await app.inject({ method: 'GET', url: '/sync?since=2026-10-01T00:00:00.000Z&collections=messages' });
    await app.close();

    const [args] = prisma.message.findMany.mock.calls[0] as [{ select: Row }];
    expect(args.select).toMatchObject({ isEncrypted: true, encryptionMode: true, encryptedContent: true, encryptionMetadata: true });
  });

  it('une ligne qu’aucune clé n’ouvre sort SCELLÉE : contenu vide déclaré chiffré, ni chiffré ni traduction illisible', async () => {
    const row = await sealedMessage();
    const unreadable = { ...row, encryptionMetadata: { ...(row.encryptionMetadata as Row), authTag: Buffer.alloc(16, 2).toString('base64') } };
    const app = await syncApp(syncPrisma([unreadable]));
    const res = await app.inject({ method: 'GET', url: '/sync?since=2026-10-01T00:00:00.000Z&collections=messages' });
    await app.close();

    const [served] = res.json().data.collections.messages.added;
    expect(served).toMatchObject({ content: '', isEncrypted: true });
    expect(served.translations ?? []).toEqual([]);
    expect(leaksCiphertext(res.body)).toBe(false);
  });
});

describe('GET /messages/:id/translations — un message server', () => {
  async function readsApp(row: Row): Promise<FastifyInstance> {
    const prisma = {
      ...keyStore,
      message: { findFirst: jest.fn(async () => row) },
      participant: { findFirst: jest.fn(async () => ({ id: PARTICIPANT_ID, conversationId: CONV_ID })) },
      messageViewOnceView: { findMany: jest.fn(async () => []) },
    };
    const app = Fastify({ logger: false });
    const { createUnifiedAuthMiddleware } = await import('../../../middleware/auth');
    registerMessagesReadRoutes(app, {
      prisma: prisma as never,
      requiredAuth: createUnifiedAuthMiddleware(prisma as never, {} as never),
      attachmentService: {} as never,
      translationService: {} as never,
      socketIOHandler: {} as never,
      trackingLinkService: {} as never,
    });
    await app.ready();
    return app;
  }

  it('sert le texte original et la traduction en clair, jamais le chiffré', async () => {
    const app = await readsApp(await sealedMessage());
    const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}/translations` });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      originalContent: SECRET,
      translations: [expect.objectContaining({ targetLanguage: 'en', translatedContent: SECRET_EN, isEncrypted: false })],
    });
    expect(leaksCiphertext(res.body)).toBe(false);
  });
});

describe('transformTranslationsToArray — en défense', () => {
  it('ne sert jamais une entrée encore chiffrée comme du texte', async () => {
    const row = await sealedMessage();
    const served = transformTranslationsToArray(MSG_ID, row.translations as never);
    expect(served).toEqual([]);
  });

  it('sert une traduction en clair', () => {
    const served = transformTranslationsToArray(MSG_ID, { fr: { text: 'Bonjour', translationModel: 'basic', createdAt: new Date() } });
    expect(served).toEqual([expect.objectContaining({ targetLanguage: 'fr', translatedContent: 'Bonjour' })]);
  });
});
