/**
 * #11375 — `GET /messages/:id` sert l'auteur d'une modification faite par un
 * modérateur PAR LECTEUR. Cette route laisse traverser `data` entier (son
 * schéma décrit le message, pas l'enveloppe) : les colonnes brutes
 * `thirdPartyEditorId` / `thirdPartyEditorRole` y partiraient telles quelles
 * sans la projection.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { MASKED_MODERATOR_EDITOR } from '@meeshy/shared/utils/message-edit-attribution';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockAuthMiddleware = jest.fn();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  isRegisteredUser: (ctx: { type?: string }) => ctx?.type === 'user',
}));
jest.mock('../../../services/attachments/index', () => ({ AttachmentService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {}, attachmentFullSelect: {}, attachmentForwardPreviewSelect: {},
}));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/TrackingLinkService', () => ({ TrackingLinkService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../validation/helpers', () => ({
  validateParams: jest.fn(() => async () => {}),
  validateBody: jest.fn(() => async () => {}),
  validateQuery: jest.fn(() => async () => {}),
}));
jest.mock('../../../validation/messages-schemas', () => ({
  MessageParamsSchema: {}, AttachmentParamsSchema: {}, UpdateMessageBodySchema: {},
  MessageStatusBodySchema: {}, MessageStatusDetailsQuerySchema: {}, AttachmentStatusBodySchema: {},
}));
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()) }),
}));

import messageRoutes from '../../../routes/messages';

const CONV = '507f1f77bcf86cd799439101';
const READER_USER = '507f1f77bcf86cd799439122';
const AUTHOR_P = '507f1f77bcf86cd799439144';
const READER_P = '507f1f77bcf86cd799439133';
const MODERATOR_USER = '507f1f77bcf86cd799439188';
const MSG_ID = '507f1f77bcf86cd799439201';

async function getMessage(readerRole: string, editor: { thirdPartyEditorId: string | null; thirdPartyEditorRole: string | null }) {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = {
      type: 'user', isAuthenticated: true, isAnonymous: false, userId: READER_USER, hasFullAccess: true,
      registeredUser: { id: READER_USER, role: readerRole },
    };
  });
  const reader = {
    id: READER_P, userId: READER_USER, role: 'member', joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    shareLinkId: null, historyVisibleFrom: null, permissions: null, anonymousSession: null, user: { role: readerRole },
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    message: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: MSG_ID, conversationId: CONV, senderId: AUTHOR_P, content: 'texte corrigé', originalLanguage: 'fr',
        messageType: 'text', messageSource: 'user', isEdited: true, editedAt: new Date('2026-10-24T09:00:00.000Z'),
        ...editor,
        createdAt: new Date('2026-10-24T08:00:00.000Z'), updatedAt: new Date('2026-10-24T09:00:00.000Z'),
        deletedAt: null, metadata: null, translations: null, attachments: [],
        sender: { id: AUTHOR_P, userId: null, displayName: 'Alice', avatar: null, isOnline: false, type: 'user', user: null },
        conversation: { participants: [reader] },
      }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(reader), findMany: jest.fn<any>().mockResolvedValue([]) },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ isAnnouncementChannel: false }) },
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userConversationPreferences: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationReadCursor: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as never);
  await app.register(messageRoutes);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}` });
  await app.close();
  return res;
}

const BY_MODERATOR = { thirdPartyEditorId: MODERATOR_USER, thirdPartyEditorRole: 'BIGBOSS' };

describe('GET /messages/:id — l’auteur d’une modification par un modérateur (#11375)', () => {
  it('un membre ordinaire lit la mention, jamais l’identité ni le rang', async () => {
    const res = await getMessage('USER', BY_MODERATOR);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ editedById: MASKED_MODERATOR_EDITOR, editedByRole: null });
    expect(res.body).not.toContain(MODERATOR_USER);
    expect(res.body).not.toContain('BIGBOSS');
    expect(res.body).not.toContain('thirdPartyEditor');
  });

  it('un ADMIN lit l’identité et le rang', async () => {
    const res = await getMessage('ADMIN', BY_MODERATOR);

    expect(res.json().data).toMatchObject({ editedById: MODERATOR_USER, editedByRole: 'BIGBOSS' });
    expect(res.body).not.toContain('thirdPartyEditor');
  });

  it('une modification de l’auteur se sert null', async () => {
    const res = await getMessage('USER', { thirdPartyEditorId: null, thirdPartyEditorRole: null });

    expect(res.json().data).toMatchObject({ editedById: null, editedByRole: null });
  });
});
