/**
 * #11381, #12822 (constat 6) — le FIL d'un message `server`/`hybrid` sert le
 * clair de la racine, des réponses et de la citation, leurs traductions
 * ouvertes, et jamais le chiffré — ni comme texte, ni à côté.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterAll } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn(async () => '507f1f77bcf86cd799439022'),
}));

jest.mock('../../../../routes/conversations/utils/access-control', () =>
  (jest.requireActual('../../../helpers/acces-conversation-double') as { doubleAccesConversation: (actual: Record<string, unknown>, impl: () => Promise<boolean>) => unknown })
    .doubleAccesConversation(jest.requireActual('../../../../routes/conversations/utils/access-control') as Record<string, unknown>, async () => true));

import { registerThreadsRoutes } from '../../../../routes/conversations/threads';
import { EncryptionService } from '../../../../services/EncryptionService';
import { EncryptionHelper } from '../../../../services/message-translation/EncryptionHelper';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const PARENT_ID = '507f1f77bcf86cd799439033';
const REPLY_ID = '507f1f77bcf86cd799439044';
const MASTER = Buffer.alloc(32, 13).toString('base64');
const savedKey = process.env.ENCRYPTION_MASTER_KEY;
process.env.ENCRYPTION_MASTER_KEY = MASTER;

afterAll(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = savedKey;
});

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

const ciphertexts: string[] = [];

async function sealed(id: string, plaintext: string, overrides: Row = {}): Promise<Row> {
  const sealer = new EncryptionService(keyStore as unknown as PrismaClient);
  designation.keyId = designation.keyId ?? await sealer.getOrCreateConversationKey(CONV_ID);
  const box = await sealer.sealAtRest({ plaintext, conversationId: CONV_ID, preferredKeyId: designation.keyId });
  const translated = await new EncryptionHelper(keyStore as unknown as PrismaClient).encryptTranslation(`EN ${plaintext}`, CONV_ID);
  ciphertexts.push(box.ciphertext, translated.encryptedContent);
  return {
    id, content: '', originalLanguage: 'fr', conversationId: CONV_ID, senderId: 'part-1', messageType: 'text',
    messageSource: null, editedAt: null, deletedAt: null, replyToId: null, reactionSummary: {}, reactionCount: 0,
    validatedMentions: [], createdAt: new Date(), updatedAt: new Date(), sender: null, attachments: [], replyTo: null,
    _count: { reactions: 0, statusEntries: 0 },
    isEncrypted: true, encryptionMode: 'server', encryptedContent: box.ciphertext,
    encryptionMetadata: { mode: 'server', ...box.metadata, canTranslate: true },
    translations: {
      en: {
        text: translated.encryptedContent, translationModel: 'basic', isEncrypted: true,
        encryptionKeyId: translated.encryptionKeyId, encryptionIv: translated.encryptionIv,
        encryptionAuthTag: translated.encryptionAuthTag, createdAt: new Date(),
      },
    },
    ...overrides,
  };
}

async function threadApp(parent: Row, replies: Row[]): Promise<FastifyInstance> {
  const prisma = {
    ...keyStore,
    message: {
      findFirst: jest.fn(async () => parent),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValueOnce(replies).mockResolvedValue([]),
    },
    participant: { findFirst: jest.fn(async () => null) },
    conversationShareLink: { findUnique: jest.fn(async () => null) },
  };
  const app = Fastify({ logger: false });
  registerThreadsRoutes(app, prisma as never, async (req: FastifyRequest) => {
    Object.assign(req, { authContext: { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } } });
  });
  await app.ready();
  return app;
}

describe('GET /conversations/:id/threads/:messageId — fil server', () => {
  it('sert le clair de la racine, de la réponse et de sa citation, traductions ouvertes, sans chiffré', async () => {
    const parent = await sealed(PARENT_ID, 'Rendez-vous porte B');
    const reply = await sealed(REPLY_ID, 'Code 4471', { replyToId: PARENT_ID, replyTo: { ...parent, translations: undefined, _count: undefined } });
    const app = await threadApp(parent, [reply]);
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${PARENT_ID}` });
    await app.close();

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.parent.content).toBe('Rendez-vous porte B');
    expect(data.parent.translations).toEqual([expect.objectContaining({ targetLanguage: 'en', translatedContent: 'EN Rendez-vous porte B' })]);
    expect(data.replies[0].content).toBe('Code 4471');
    expect(data.replies[0].replyTo.content).toBe('Rendez-vous porte B');
    expect(ciphertexts.some((c) => res.body.includes(c))).toBe(false);
    expect(res.body).not.toContain('encryptionMetadata');
  });
});
