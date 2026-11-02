/**
 * #11375 — `GET /conversations/:id/messages`, la route d'historique des deux
 * clients, SERT l'auteur d'une modification faite par un modérateur : sans
 * elle, « modifié par un modérateur » disparaissait au premier rechargement
 * (web) et la revalidation REST effaçait la colonne GRDB que le socket venait
 * d'écrire (iOS). Et elle le sert PAR LECTEUR : l'identité du modérateur ne
 * part qu'à ADMIN / BIGBOSS et au modérateur lui-même — les autres lisent la
 * mention, jamais le nom ni le rang.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MASKED_MODERATOR_EDITOR } from '@meeshy/shared/utils/message-edit-attribution';
import Fastify, { FastifyInstance } from 'fastify';

// #9629 — la loi d'audience des avis de capture a ses témoins de câblage
// (`capture-notice-served-surfaces.test.ts`) ; ces témoins-ci ne servent aucun avis.
jest.mock('../../../services/messaging/captureNoticeVisibility', () => ({
  ...(jest.requireActual('../../../services/messaging/captureNoticeVisibility') as object),
  hidingServedTo: async (_prisma: unknown, params: { hiding: unknown }) => params.hiding,
  hidingServedToReader: async (_prisma: unknown, params: { hiding: unknown }) => params.hiding,
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn();
jest.mock('../../../routes/conversations/utils/access-control', () =>
  (jest.requireActual('../../helpers/acces-conversation-double') as any).doubleAccesConversation(
    jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>,
    (...args: any[]) => mockCanAccessConversation(...args)));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/messaging/MessagingService', () => ({
  MessagingService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({})),
}));

import { registerMessagesRoutes } from '../../../routes/conversations/messages';

const CONV_ID = '507f1f77bcf86cd799439011';
const AUTHOR_ID = '507f1f77bcf86cd799439022';
const MODERATOR_ID = '507f1f77bcf86cd799439055';
const READER_ID = '507f1f77bcf86cd799439066';

function makeMessage(editor: { thirdPartyEditorId: string | null; thirdPartyEditorRole: string | null }) {
  return {
    id: '507f1f77bcf86cd799439099',
    conversationId: CONV_ID,
    senderId: 'p_author',
    content: 'texte corrigé',
    originalLanguage: 'fr',
    messageType: 'text',
    isEdited: true,
    editedAt: new Date('2026-10-24T09:00:00Z'),
    ...editor,
    createdAt: new Date('2026-10-24T08:00:00Z'),
    updatedAt: new Date('2026-10-24T09:00:00Z'),
    attachments: [],
    validatedMentions: null,
    _count: { attachments: 0 },
    sender: {
      id: 'p_author',
      userId: AUTHOR_ID,
      displayName: 'Alice',
      avatar: null,
      type: 'user',
      role: 'member',
      language: 'fr',
      user: { id: AUTHOR_ID, username: 'alice' },
    },
  };
}

const BY_MODERATOR = { thirdPartyEditorId: MODERATOR_ID, thirdPartyEditorRole: 'MODERATOR' };
const BY_AUTHOR = { thirdPartyEditorId: null, thirdPartyEditorRole: null };

async function serveMessages(
  messages: unknown[],
  reader: { userId: string; role: string },
): Promise<{ app: FastifyInstance; prisma: any }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const prisma: any = {
    participant: { findFirst: jest.fn().mockResolvedValue(null) },
    message: {
      count: jest.fn().mockResolvedValue(messages.length),
      findMany: jest.fn().mockResolvedValue(messages),
    },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  const optionalAuth = async (req: any) => {
    req.authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: reader.userId,
      registeredUser: { id: reader.userId, role: reader.role },
    };
  };

  mockResolveConversationId.mockResolvedValue(CONV_ID);
  mockCanAccessConversation.mockResolvedValue(true);

  registerMessagesRoutes(app, prisma, {} as any, optionalAuth, optionalAuth);
  await app.ready();
  return { app, prisma };
}

const firstServed = async (messages: unknown[], reader: { userId: string; role: string }) => {
  const { app } = await serveMessages(messages, reader);
  const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
  await app.close();
  return { status: res.statusCode, body: res.body, message: res.json().data[0] };
};

describe('GET /conversations/:id/messages — l’auteur d’une modification par un modérateur (#11375)', () => {
  it('un membre ordinaire lit la mention, sans identité ni rang', async () => {
    const { status, body, message } = await firstServed([makeMessage(BY_MODERATOR)], { userId: READER_ID, role: 'USER' });

    expect(status).toBe(200);
    expect(message.editedById).toBe(MASKED_MODERATOR_EDITOR);
    expect(message.editedByRole).toBeNull();
    expect(body).not.toContain(MODERATOR_ID);
  });

  it.each(['ADMIN', 'BIGBOSS'])('un %s lit l’identité et le rôle du modérateur', async (role) => {
    const { message } = await firstServed([makeMessage(BY_MODERATOR)], { userId: READER_ID, role });

    expect(message.editedById).toBe(MODERATOR_ID);
    expect(message.editedByRole).toBe('MODERATOR');
  });

  it('le modérateur lui-même lit sa propre identité', async () => {
    const { message } = await firstServed([makeMessage(BY_MODERATOR)], { userId: MODERATOR_ID, role: 'MODERATOR' });

    expect(message.editedById).toBe(MODERATOR_ID);
  });

  it('une modification de l’auteur se sert null, jamais une clé absente', async () => {
    const { message } = await firstServed([makeMessage(BY_AUTHOR)], { userId: READER_ID, role: 'ADMIN' });

    expect(message).toHaveProperty('editedById', null);
    expect(message).toHaveProperty('editedByRole', null);
  });

  it('les colonnes brutes ne partent jamais', async () => {
    const { message } = await firstServed([makeMessage(BY_MODERATOR)], { userId: READER_ID, role: 'BIGBOSS' });

    expect(message).not.toHaveProperty('thirdPartyEditorId');
    expect(message).not.toHaveProperty('thirdPartyEditorRole');
  });

  it('demande les colonnes à Prisma — un champ non sélectionné n’existe pas', async () => {
    const { app, prisma } = await serveMessages([], { userId: READER_ID, role: 'USER' });
    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
    await app.close();

    const select = prisma.message.findMany.mock.calls[0][0].select;
    expect(select).toMatchObject({ thirdPartyEditorId: true, thirdPartyEditorRole: true });
  });
});
