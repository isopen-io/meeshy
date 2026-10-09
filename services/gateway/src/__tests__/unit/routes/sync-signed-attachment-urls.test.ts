/**
 * #9600 — le rattrapage `/sync` sert l'adresse d'une pièce protégée SIGNÉE
 * pour le lecteur, sur SA ligne de participant dans la conversation du
 * message ; celle d'une pièce ordinaire reste celle d'avant.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { type FastifyRequest } from 'fastify';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

const USER_ID = '507f1f77bcf86cd799439000';
const MOI_C1 = '507f1f77bcf86cd799439bb1';
const MOI_C2 = '507f1f77bcf86cd799439bb2';
const AUTRE = '507f1f77bcf86cd799439ccc';
const SINCE = '2026-07-01T00:00:00.000Z';
const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e.jpg';

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (req: FastifyRequest) => {
    (req as unknown as { authContext: unknown }).authContext = { userId: USER_ID, type: 'user' };
  },
}));

import { syncRoutes } from '../../../routes/sync';
import { checkReaderFileToken, readSigningKeys } from '../../../services/attachments/readerFileSignature';

const SIGNING_KEY = Buffer.alloc(32, 8).toString('base64');

const attachment = (id: string, messageId: string) => ({
  id,
  messageId,
  mimeType: 'image/jpeg',
  fileSize: 10,
  fileUrl: KEY,
  thumbnailUrl: null,
  createdAt: new Date('2026-07-02T10:00:00.000Z'),
  transcription: null,
  translations: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
});

const row = (id: string, conversationId: string, protection: Record<string, unknown>, pieceId: string) => ({
  id,
  conversationId,
  senderId: AUTRE,
  content: '',
  originalLanguage: 'fr',
  messageType: 'image',
  messageSource: 'user',
  reactionSummary: {},
  reactionCount: 0,
  createdAt: new Date('2026-07-02T10:00:00.000Z'),
  updatedAt: new Date('2026-07-02T10:30:00.000Z'),
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ephemeralDuration: null,
  expiresAt: null,
  ...protection,
  attachments: [attachment(pieceId, id)],
});

const membership = (id: string, conversationId: string) => ({
  id,
  conversationId,
  joinedAt: new Date('2026-06-15T00:00:00Z'),
  shareLinkId: null,
  permissions: null,
  anonymousSession: null,
});

const FLAME = {
  effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL,
  ephemeralDuration: 30,
  expiresAt: new Date(Date.now() + 3600_000),
};

function makePrisma() {
  return {
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([membership(MOI_C1, 'c1'), membership(MOI_C2, 'c2')]),
    },
    message: {
      findMany: jest.fn<any>()
        .mockResolvedValueOnce([
          row('m-flame', 'c2', FLAME, 'aaaaaaaaaaaaaaaaaaaaaaa1'),
          row('m-plain', 'c1', {}, 'aaaaaaaaaaaaaaaaaaaaaaa2'),
        ])
        .mockResolvedValue([]),
    },
    conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    reaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
    messageStatusEntry: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

async function syncAdded(query = '', prisma = makePrisma()) {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  await app.register(syncRoutes);
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages${query}` });
    return res.json().data.collections.messages.added as ReadonlyArray<{ id: string; attachments: Array<{ fileUrl: string }> }>;
  } finally {
    await app.close();
  }
}

beforeEach(() => {
  process.env.ATTACHMENT_URL_SIGNING_KEY = SIGNING_KEY;
});

afterEach(() => {
  delete process.env.ATTACHMENT_URL_SIGNING_KEY;
});

describe('#9600 · `/sync` signe l’adresse d’une pièce protégée pour SON lecteur', () => {
  it('signe la pièce d’une flamme pour MA ligne dans la conversation du message', async () => {
    const added = await syncAdded();
    const url = added.find((m) => m.id === 'm-flame')?.attachments[0]?.fileUrl ?? '';
    const match = /^\/api\/v1\/attachments\/signed\/([^/]+)\/([^/]+)$/.exec(url);
    expect(match).not.toBeNull();
    const [, token, encodedKey] = match as RegExpExecArray;
    const check = checkReaderFileToken({
      token: token as string,
      storageKey: decodeURIComponent(encodedKey as string),
      keys: readSigningKeys(),
      now: new Date(),
    });
    expect(check).toEqual({ kind: 'valid', attachmentId: 'aaaaaaaaaaaaaaaaaaaaaaa1', readerParticipantId: MOI_C2 });
  });

  it('sert la clé d’avant pour la pièce d’un message ordinaire', async () => {
    const added = await syncAdded();
    expect(added.find((m) => m.id === 'm-plain')?.attachments[0]?.fileUrl).toBe(KEY);
  });

  it('sert la clé d’avant quand aucune clé de signature n’est posée', async () => {
    delete process.env.ATTACHMENT_URL_SIGNING_KEY;
    const added = await syncAdded();
    expect(added.find((m) => m.id === 'm-flame')?.attachments[0]?.fileUrl).toBe(KEY);
  });

  it('charge le bloc de protection quand seules les pièces sont demandées — une pièce ordinaire ne se signe pas par ignorance', async () => {
    const prisma = makePrisma();
    await syncAdded('&fields=messages.attachments', prisma);
    const select = (prisma.message.findMany.mock.calls[0]![0] as { select: Record<string, unknown> }).select;
    expect(select).toEqual(expect.objectContaining({
      attachments: expect.anything(),
      isViewOnce: true,
      isBlurred: true,
      effectFlags: true,
      ephemeralDuration: true,
      expiresAt: true,
    }));
  });
});
