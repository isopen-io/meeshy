/**
 * #12822, contre-audit E3 — l'aperçu de liste RECALCULÉ (suppression, vue
 * unique ouverte, masquage, traduction qui atterrit) d'une conversation
 * `server`/`hybrid` sert le clair du dernier message, comme `GET /conversations`.
 *
 * `emitConversationPreviewUpdate` lisait `content` — vide en base — sans ouvrir
 * le repos : la ligne de liste passait à « Message chiffré » (`content: ''`,
 * `isEncrypted: true`) pour un message que ses membres lisent en clair.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterAll } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EncryptionService } from '../../services/EncryptionService';
import { emitConversationPreviewUpdate } from '../emitConversationPreviewUpdate';

const CONV = '507f1f77bcf86cd799439044';
const MSG = '507f1f77bcf86cd799439055';
const SECRET = 'Rendez-vous déplacé à 18 h, porte B';
const MASTER = Buffer.alloc(32, 13).toString('base64');
const savedKey = process.env.ENCRYPTION_MASTER_KEY;
process.env.ENCRYPTION_MASTER_KEY = MASTER;

afterAll(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = savedKey;
});

type Row = Record<string, unknown>;
const keys = new Map<string, Row>();
const keyStore = {
  serverEncryptionKey: {
    create: jest.fn(async ({ data }: { data: Row }) => { keys.set(String(data.id), data); return data; }),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => keys.get(where.id) ?? null),
    findMany: jest.fn(async () => []),
    update: jest.fn(async () => ({})),
    updateMany: jest.fn(async () => ({ count: 0 })),
  },
  conversation: { findUnique: jest.fn(async () => null), updateMany: jest.fn(async () => ({ count: 0 })) },
};

async function sealedLatest(mode: 'server' | 'hybrid'): Promise<Row> {
  const sealed = await new EncryptionService(keyStore as unknown as PrismaClient).sealAtRest({ plaintext: SECRET, conversationId: CONV });
  return {
    id: MSG, conversationId: CONV, senderId: 'p-A', createdAt: new Date('2026-10-24T10:00:00Z'),
    content: '', metadata: null, translations: null, originalLanguage: 'fr', isBlurred: false, isViewOnce: false,
    expiresAt: null, ephemeralDuration: null, isEncrypted: true, encryptionMode: mode,
    encryptedContent: sealed.ciphertext, encryptionMetadata: { mode, ...sealed.metadata, canTranslate: true },
    messageType: 'text', messageSource: 'user', effectFlags: 0, forwardedFromId: null, replyToId: null,
    sender: null, attachments: [], _count: { attachments: 0 },
  };
}

describe.each(['server', 'hybrid'] as const)('aperçu recalculé d’une conversation %s', (mode) => {
  it('la ligne de liste reçoit le clair, jamais une bulle « chiffrée » vide', async () => {
    const latest = await sealedLatest(mode);
    const emitted: Array<Record<string, unknown>> = [];
    const prisma = {
      ...keyStore,
      participant: { findMany: jest.fn(async () => [{ id: 'p-B', userId: 'u-B', user: null }]) },
      message: { findFirst: jest.fn(async () => latest) },
      userMessageDeletion: { findMany: jest.fn(async () => []) },
      userConversationPreferences: { findMany: jest.fn(async () => []) },
    };
    const io = { to: () => ({ emit: (_event: string, payload: Record<string, unknown>) => { emitted.push(payload); } }) };
    const errors: unknown[] = [];

    await emitConversationPreviewUpdate(prisma as never, io as never, CONV, 'u-A', (error) => errors.push(error));

    expect(errors).toEqual([]);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.['lastMessagePreview']).toBe(SECRET);
    expect(emitted[0]?.['lastMessageIsEncrypted'] ?? false).toBe(false);
    expect(JSON.stringify(emitted)).not.toContain(String(latest['encryptedContent']));
  });
});
