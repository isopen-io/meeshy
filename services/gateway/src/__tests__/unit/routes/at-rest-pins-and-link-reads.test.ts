/**
 * #12822, contre-audit F2 — deux portes de lecture de plus d'un message
 * `server`/`hybrid` : la liste des épingles et la lecture par lien de partage.
 *
 * Toutes deux ouvraient le repos (`revealAtRestRows`) sans qu'aucun témoin ne
 * le prouve. Et l'épingle ne servait pas `isEncrypted` : une ligne qu'aucune clé
 * n'ouvre (contenu vide) partait comme un message vide, sans que le client
 * puisse dire « Message chiffré » — la bulle vide que `/sync` montrait avant
 * son correctif.
 *
 * Le VRAI `EncryptionService` scelle ; les routes réelles servent, sous leur
 * vrai schéma de réponse. Seule la base est simulée.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterAll } from '@jest/globals';
import Fastify, { type FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(), trace: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../utils/conversation-id-cache', () => ({ resolveConversationId: jest.fn(async (_p: unknown, id: string) => id) }));
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: jest.fn(async () => true),
}));
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: jest.fn(async () => new Map()) }),
}));

const linkRows: { rows: unknown[] } = { rows: [] };
jest.mock('../../../routes/links/utils/prisma-queries', () => ({
  getConversationMessagesWithDetails: jest.fn(async () => linkRows.rows),
  countConversationMessages: jest.fn(async () => linkRows.rows.length),
}));
jest.mock('../../../routes/links/utils/link-helpers', () => ({
  createLegacyHybridRequest: jest.fn(() => ({
    isAuthenticated: false, isAnonymous: true, user: null,
    anonymousParticipant: { id: '507f1f77bcf86cd799439177', shareLinkId: '507f1f77bcf86cd799439188' },
  })),
}));
jest.mock('../../../services/EncryptionService', () => {
  const actual = jest.requireActual('../../../services/EncryptionService') as typeof import('../../../services/EncryptionService');
  return { ...actual, getEncryptionService: jest.fn(async (prisma: PrismaClient) => new actual.EncryptionService(prisma)) };
});

import { EncryptionService } from '../../../services/EncryptionService';
import { registerMessagePinRoutes } from '../../../routes/conversations/messages-pin';
import { registerMessagesRetrievalRoutes } from '../../../routes/links/messages-retrieval';

const CONV_ID = '507f1f77bcf86cd799439101';
const USER_ID = '507f1f77bcf86cd799439122';
const READER = '507f1f77bcf86cd799439155';
const MSG_ID = '507f1f77bcf86cd799439133';
const LINK_DB_ID = '507f1f77bcf86cd799439188';
const SECRET = 'Le badge du parking est 4471';
const MASTER = Buffer.alloc(32, 17).toString('base64');
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

const ciphertexts: string[] = [];

async function sealedRow(overrides: Row = {}): Promise<Row> {
  const sealed = await new EncryptionService(keyStore as unknown as PrismaClient).sealAtRest({ plaintext: SECRET, conversationId: CONV_ID });
  ciphertexts.push(sealed.ciphertext);
  return {
    id: MSG_ID, conversationId: CONV_ID, senderId: READER, content: '', originalLanguage: 'fr', messageType: 'text',
    editedAt: null, deletedAt: null, replyToId: null, forwardedFromId: null, forwardedFromConversationId: null,
    pinnedAt: new Date(), pinnedBy: USER_ID, isViewOnce: false, isBlurred: false, expiresAt: null, effectFlags: 0, ephemeralDuration: null,
    translations: null, createdAt: new Date('2026-10-24T10:00:00Z'), updatedAt: new Date('2026-10-24T10:00:00Z'), metadata: null,
    sender: null, attachments: [], reactions: [], replyTo: null, _count: { reactions: 0, replies: 0 },
    isEncrypted: true, encryptionMode: 'server', encryptedContent: sealed.ciphertext,
    encryptionMetadata: { mode: 'server', ...sealed.metadata, canTranslate: true },
    ...overrides,
  };
}

const unreadable = async (): Promise<Row> => {
  const row = await sealedRow();
  return { ...row, encryptionMetadata: { ...(row.encryptionMetadata as Row), authTag: Buffer.alloc(16, 9).toString('base64') } };
};

const leaksCiphertext = (body: string): boolean => ciphertexts.some((fragment) => body.includes(fragment));

async function pinnedBody(row: Row) {
  const prisma = {
    ...keyStore,
    participant: { findFirst: jest.fn(async () => ({ id: READER, userId: USER_ID, isActive: true, joinedAt: new Date(0), shareLinkId: null, permissions: null })) },
    userConversationPreferences: { findFirst: jest.fn(async () => null) },
    userMessageDeletion: { findMany: jest.fn(async () => []) },
    messageAttachment: { findMany: jest.fn(async () => []) },
    message: { findMany: jest.fn(async () => [row]), count: jest.fn(async () => 1) },
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const auth = async (req: FastifyRequest) => {
    Object.assign(req, { authContext: { type: 'registered', isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } } });
  };
  registerMessagePinRoutes(app as never, prisma as never, auth as never, { getManager: () => null } as never);
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/pinned-messages` });
    return { status: res.statusCode, body: res.body, first: JSON.parse(res.body).data?.[0], select: (prisma.message.findMany.mock.calls[0] as unknown as [{ select: Row }] | undefined)?.[0].select };
  } finally {
    await app.close();
  }
}

describe('GET /conversations/:id/pinned-messages — une épingle server', () => {
  it('sert le clair, déclaré non chiffré, jamais le chiffré', async () => {
    const served = await pinnedBody(await sealedRow());

    expect(served.status).toBe(200);
    expect(served.first).toMatchObject({ content: SECRET, isEncrypted: false });
    expect(leaksCiphertext(served.body)).toBe(false);
  });

  it('lit les colonnes du repos', async () => {
    const served = await pinnedBody(await sealedRow());

    expect(served.select).toMatchObject({ isEncrypted: true, encryptionMode: true, encryptedContent: true, encryptionMetadata: true });
  });

  it('une épingle qu’aucune clé n’ouvre sort SCELLÉE : contenu vide DÉCLARÉ chiffré, jamais une bulle vide', async () => {
    const served = await pinnedBody(await unreadable());

    expect(served.first).toMatchObject({ content: '', isEncrypted: true });
    expect(leaksCiphertext(served.body)).toBe(false);
  });
});

async function linkBody(row: Row) {
  linkRows.rows = [row];
  const prisma = {
    ...keyStore,
    conversationShareLink: {
      findUnique: jest.fn(async () => ({ id: LINK_DB_ID, conversationId: CONV_ID, allowViewHistory: true, conversation: { id: CONV_ID, title: 'T', type: 'group' } })),
      findMany: jest.fn(async () => []),
    },
    participant: { findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    message: { findMany: jest.fn(async () => []) },
    messageViewOnceView: { findMany: jest.fn(async () => []) },
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  await registerMessagesRetrievalRoutes(app as never);
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_DB_ID}/messages` });
    return { status: res.statusCode, body: res.body, first: JSON.parse(res.body).data?.messages?.[0] };
  } finally {
    await app.close();
  }
}

describe('GET /links/:identifier/messages — un message server lu par l’invité du lien', () => {
  it('sert le clair, jamais le chiffré', async () => {
    const served = await linkBody(await sealedRow());

    expect(served.status).toBe(200);
    expect(served.first).toMatchObject({ content: SECRET });
    expect(served.first?.isEncrypted ?? false).toBe(false);
    expect(leaksCiphertext(served.body)).toBe(false);
  });

  it('une ligne qu’aucune clé n’ouvre sort scellée, sans chiffré', async () => {
    const served = await linkBody(await unreadable());

    expect(served.first).toMatchObject({ content: '' });
    expect(leaksCiphertext(served.body)).toBe(false);
  });
});
