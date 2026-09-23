/**
 * `GET /conversations` sert à la ligne de liste ce que le composeur partagé
 * sait déjà rendre (#7591, #7594) :
 *
 * - `lastMessage.sticker`, hissé de `metadata.sticker` — sans lui, un sticker
 *   envoyé en `messageType: "image"` se lisait « 📷 Photo » au chargement ;
 * - `lastMessage.attachments[0].alt` — la phrase d'un sticker de texte — et la
 *   protection propre de la pièce ;
 * - `lastMessage.viewOnceConsumed`, PAR LECTEUR, lu dans
 *   `MessageStatusEntry.viewedOnceAt`.
 *
 * Mesuré sur le corps SÉRIALISÉ par la vraie route et son vrai schéma de
 * réponse : fast-json-stringify retire en silence toute clé non déclarée, et
 * c'est exactement ainsi que `metadata.sticker` disparaissait.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const USER_ID = '507f1f77bcf86cd799439001';
const CONV_ID = '507f1f77bcf86cd799439101';
const PARTICIPANT_ID = '507f1f77bcf86cd799439201';
const ALICE_PARTICIPANT_ID = '507f1f77bcf86cd799439202';
const MESSAGE_ID = '507f1f77bcf86cd799439301';

jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

jest.mock('../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

jest.mock('../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCountsForUser: async () => new Map(),
    getUnreadCount: async () => 0,
  })),
}));

jest.mock('../../services/ConversationBridgeService', () => ({
  ConversationBridgeService: jest.fn().mockImplementation(() => ({ buildBridgeData: async () => new Map() })),
}));

type Row = Record<string, unknown>;

const stickerAttachment = (overrides: Row = {}): Row => ({
  id: 'a1',
  mimeType: 'image/png',
  thumbnailUrl: null,
  originalName: 'sticker.png',
  fileSize: 6000,
  duration: null,
  width: 512,
  height: 512,
  pageCount: null,
  bitrate: null,
  sampleRate: null,
  metadata: null,
  alt: 'Bonjour à tous',
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ...overrides,
});

const stickerMessage = (overrides: Row = {}): Row => ({
  id: MESSAGE_ID,
  content: '',
  createdAt: new Date('2026-09-23T10:00:00Z'),
  senderId: ALICE_PARTICIPANT_ID,
  messageType: 'image',
  isBlurred: false,
  isViewOnce: false,
  effectFlags: 0,
  expiresAt: null,
  ephemeralDuration: null,
  isEncrypted: false,
  messageSource: 'user',
  forwardedFromId: null,
  translations: null,
  originalLanguage: 'fr',
  metadata: { sticker: { emoji: '👋' } },
  sender: {
    id: ALICE_PARTICIPANT_ID,
    userId: null,
    displayName: 'Demo',
    avatar: null,
    type: 'user',
    user: null,
  },
  attachments: [stickerAttachment()],
  _count: { attachments: 1 },
  ...overrides,
});

function listConversation(message: Row): Row {
  return {
    id: CONV_ID,
    title: 'Conv',
    type: 'direct',
    identifier: 'conv-a',
    isActive: true,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-09-23T10:00:00Z'),
    lastMessageAt: new Date('2026-09-23T10:00:00Z'),
    banner: null,
    avatar: null,
    communityId: null,
    _count: { participants: 2 },
    isAnnouncementChannel: false,
    participants: [
      {
        id: PARTICIPANT_ID,
        conversationId: CONV_ID,
        userId: USER_ID,
        type: 'user',
        displayName: 'Moi',
        avatar: null,
        role: 'member',
        language: 'fr',
        nickname: null,
        joinedAt: new Date('2026-01-01T00:00:00Z'),
        isActive: true,
        isOnline: true,
        lastActiveAt: null,
        user: { id: USER_ID, username: 'moi', displayName: 'Moi', firstName: null, lastName: null, isOnline: true, lastActiveAt: null },
      },
    ],
    userPreferences: [],
    messages: [message],
  };
}

type StatusEntry = { messageId: string; participantId: string; viewedOnceAt?: Date | null };

function listPrisma(message: Row, statusEntries: readonly StatusEntry[] = []) {
  return {
    conversation: {
      findMany: jest.fn(async () => [listConversation(message)]),
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 1),
    },
    // La jonction du LECTEUR (plancher d'historique, participant de la
    // consommation) : sa ligne `Participant` dans la conversation.
    participant: {
      findMany: jest.fn(async () => [
        {
          id: PARTICIPANT_ID,
          conversationId: CONV_ID,
          role: 'member',
          joinedAt: new Date('2026-01-01T00:00:00Z'),
          shareLinkId: null,
          historyVisibleFrom: null,
          permissions: null,
          anonymousSession: null,
          user: { role: 'USER' },
        },
      ]),
    },
    conversationReadCursor: { findMany: jest.fn(async () => []) },
    messageStatusEntry: {
      findMany: jest.fn(async (args: { where: { messageId: { in: string[] }; participantId: { in: string[] } } }) =>
        statusEntries.filter(
          (entry) => args.where.messageId.in.includes(entry.messageId) && args.where.participantId.in.includes(entry.participantId),
        ),
      ),
    },
  };
}

async function servedLastMessage(prisma: ReturnType<typeof listPrisma>): Promise<Row> {
  const app: FastifyInstance = Fastify({ logger: false });
  const optionalAuth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Row).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID },
      hasFullAccess: true,
    };
  };
  const { registerCoreRoutes } = await import('../../routes/conversations/core');
  registerCoreRoutes(app, prisma as unknown as PrismaClient, optionalAuth, optionalAuth);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: '/conversations', headers: { authorization: 'Bearer x' } });
  await app.close();
  expect(res.statusCode).toBe(200);
  return res.json().data[0].lastMessage as Row;
}

describe('GET /conversations — sticker, texte alternatif et vue unique ouverte (#7591, #7594)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sert lastMessage.sticker hissé de metadata.sticker, même en messageType "image"', async () => {
    const lastMessage = await servedLastMessage(listPrisma(stickerMessage()));
    expect(lastMessage.messageType).toBe('image');
    expect(lastMessage.sticker).toEqual({ emoji: '👋' });
  });

  it('sert un gabarit entier (slots compris) et null sans sticker', async () => {
    const template = { templateId: 'bubble-pop', slots: { title: 'Salut' }, animation: 'pop' };
    const withTemplate = await servedLastMessage(listPrisma(stickerMessage({ metadata: { sticker: template } })));
    expect(withTemplate.sticker).toEqual(template);

    const plain = await servedLastMessage(listPrisma(stickerMessage({ metadata: null })));
    expect(plain.sticker).toBeNull();
  });

  it('sert le texte alternatif de la première pièce jointe et sa protection propre', async () => {
    const lastMessage = await servedLastMessage(listPrisma(stickerMessage()));
    const [attachment] = lastMessage.attachments as Row[];
    expect(attachment).toMatchObject({ alt: 'Bonjour à tous', isViewOnce: false, isBlurred: false, effectFlags: 0 });
  });

  it('charge alt et la protection de la pièce dans le select de la liste', async () => {
    const prisma = listPrisma(stickerMessage());
    await servedLastMessage(prisma);
    const [[args]] = prisma.conversation.findMany.mock.calls as unknown as [[{ select: { messages: { select: { attachments: { select: Row } } } } }]];
    expect(args.select.messages.select.attachments.select).toMatchObject({ alt: true, isViewOnce: true, isBlurred: true, effectFlags: true });
  });

  describe('témoins de fuite : rien du sticker ne part quand le message ou la pièce est protégé', () => {
    it('message à vue unique : ni sticker, ni pièce jointe, ni texte alternatif', async () => {
      const lastMessage = await servedLastMessage(listPrisma(stickerMessage({ isViewOnce: true, effectFlags: 4 })));
      expect(lastMessage.isViewOnce).toBe(true);
      expect(lastMessage.sticker).toBeNull();
      expect(lastMessage.attachments).toBeNull();
      expect(JSON.stringify(lastMessage)).not.toContain('Bonjour à tous');
    });

    it('message flouté : ni sticker ni texte alternatif', async () => {
      const lastMessage = await servedLastMessage(listPrisma(stickerMessage({ isBlurred: true })));
      expect(lastMessage.sticker).toBeNull();
      expect(JSON.stringify(lastMessage)).not.toContain('Bonjour à tous');
    });

    it('pièce floutée sur un message ordinaire : la pièce part avec son drapeau, sans alt ni sticker', async () => {
      const template = { templateId: 'bubble-pop', slots: { title: 'Spoiler final' } };
      const lastMessage = await servedLastMessage(
        listPrisma(stickerMessage({ metadata: { sticker: template }, attachments: [stickerAttachment({ isBlurred: true, alt: 'Spoiler final' })] })),
      );
      const [attachment] = lastMessage.attachments as Row[];
      expect(attachment.isBlurred).toBe(true);
      expect(attachment.alt).toBeNull();
      expect(lastMessage.sticker).toBeNull();
      expect(JSON.stringify(lastMessage)).not.toContain('Spoiler final');
    });

    it('pièce à vue unique par son seul bitfield : alt retenu', async () => {
      const lastMessage = await servedLastMessage(
        listPrisma(stickerMessage({ attachments: [stickerAttachment({ effectFlags: 4, alt: 'Code 4242' })] })),
      );
      expect(JSON.stringify(lastMessage)).not.toContain('Code 4242');
      expect(lastMessage.sticker).toBeNull();
    });
  });

  describe('viewOnceConsumed, par lecteur', () => {
    const viewOnce = () => stickerMessage({ isViewOnce: true, effectFlags: 4, metadata: null, messageType: 'text', attachments: [], _count: { attachments: 0 } });

    it('true quand LE LECTEUR a ouvert le message (viewedOnceAt posé)', async () => {
      const prisma = listPrisma(viewOnce(), [
        { messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, viewedOnceAt: new Date('2026-09-23T10:01:00Z') },
      ]);
      const lastMessage = await servedLastMessage(prisma);
      expect(lastMessage.viewOnceConsumed).toBe(true);
    });

    it('false quand un AUTRE participant l’a ouvert, pas le lecteur', async () => {
      const prisma = listPrisma(viewOnce(), [
        { messageId: MESSAGE_ID, participantId: ALICE_PARTICIPANT_ID, viewedOnceAt: new Date('2026-09-23T10:01:00Z') },
      ]);
      expect((await servedLastMessage(prisma)).viewOnceConsumed).toBe(false);
    });

    it('false quand l’entrée du lecteur existe sans viewedOnceAt (colonne absente ou nulle)', async () => {
      const absent = await servedLastMessage(listPrisma(viewOnce(), [{ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID }]));
      expect(absent.viewOnceConsumed).toBe(false);
      const nulle = await servedLastMessage(
        listPrisma(viewOnce(), [{ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, viewedOnceAt: null }]),
      );
      expect(nulle.viewOnceConsumed).toBe(false);
    });

    it('une seule lecture bornée, sur le participant du lecteur, et aucune hors vue unique', async () => {
      const prisma = listPrisma(viewOnce());
      await servedLastMessage(prisma);
      expect(prisma.messageStatusEntry.findMany).toHaveBeenCalledTimes(1);
      const [[args]] = prisma.messageStatusEntry.findMany.mock.calls as unknown as [[{ where: Row; take: number }]];
      expect(args.where).toMatchObject({ messageId: { in: [MESSAGE_ID] }, participantId: { in: [PARTICIPANT_ID] } });
      expect(args.take).toBeGreaterThanOrEqual(1);

      const ordinary = listPrisma(stickerMessage());
      const lastMessage = await servedLastMessage(ordinary);
      expect(ordinary.messageStatusEntry.findMany).not.toHaveBeenCalled();
      expect(lastMessage.viewOnceConsumed).toBe(false);
    });
  });
});
