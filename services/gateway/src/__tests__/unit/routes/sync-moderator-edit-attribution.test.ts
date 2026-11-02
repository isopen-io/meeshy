/**
 * #11375 — le rattrapage `/sync` (reconnexion, démarrage à froid) sert l'auteur
 * d'une modification faite par un modérateur PAR LECTEUR, comme la liste :
 * la mention à tous, l'identité à ADMIN / BIGBOSS et au modérateur lui-même,
 * jamais les colonnes brutes.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MASKED_MODERATOR_EDITOR } from '@meeshy/shared/utils/message-edit-attribution';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import { syncMessages } from '../../../routes/sync/messages';

const CONV = '507f1f77bcf86cd799439101';
const READER_USER = '507f1f77bcf86cd799439122';
const READER_P = '507f1f77bcf86cd799439133';
const AUTHOR_P = '507f1f77bcf86cd799439144';
const MODERATOR_USER = '507f1f77bcf86cd799439188';

const ROW = {
  id: '507f1f77bcf86cd799439201', conversationId: CONV, senderId: AUTHOR_P, content: 'texte corrigé',
  originalLanguage: 'fr', messageType: 'text', messageSource: 'user', metadata: null, translations: null,
  isEdited: true, editedAt: new Date('2026-10-24T09:00:00.000Z'),
  thirdPartyEditorId: MODERATOR_USER, thirdPartyEditorRole: 'MODERATOR',
  createdAt: new Date('2026-10-20T08:00:00.000Z'), updatedAt: new Date('2026-10-24T09:00:00.000Z'),
  deletedAt: null, attachments: [], sender: null,
};

const syncPrisma = () => ({
  participant: {
    findMany: jest.fn<any>().mockResolvedValue([{
      id: READER_P, userId: READER_USER, conversationId: CONV, role: 'member', joinedAt: new Date('2026-01-01T00:00:00.000Z'),
      shareLinkId: null, historyVisibleFrom: null, permissions: null, anonymousSession: null, user: { role: 'USER' },
    }]),
  },
  conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue([]) },
  conversation: { findMany: jest.fn<any>().mockResolvedValue([{ id: CONV, isAnnouncementChannel: false }]) },
  userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
  reaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
  attachmentReaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
  message: {
    findMany: jest.fn<any>(async ({ where }: { where: Record<string, unknown> }) =>
      ('updatedAt' in where || 'OR' in where) ? [ROW] : []),
  },
});

const served = async (globalRole: string) => {
  const result = await syncMessages({
    prisma: syncPrisma() as never,
    identity: { kind: 'user', userId: READER_USER },
    editAttributionReader: { userId: READER_USER, globalRole },
    sinceDate: new Date('2026-10-21T00:00:00.000Z'),
    cap: 50,
  });
  return result.modified[0] as Record<string, unknown>;
};

describe('/sync — l’auteur d’une modification par un modérateur (#11375)', () => {
  it('un membre ordinaire lit la mention, sans identité ni rang ni colonne brute', async () => {
    const row = await served('USER');

    expect(row).toMatchObject({ editedById: MASKED_MODERATOR_EDITOR, editedByRole: null });
    expect(row).not.toHaveProperty('thirdPartyEditorId');
    expect(row).not.toHaveProperty('thirdPartyEditorRole');
    expect(JSON.stringify(row)).not.toContain(MODERATOR_USER);
  });

  it('un ADMIN lit l’identité et le rôle', async () => {
    expect(await served('ADMIN')).toMatchObject({ editedById: MODERATOR_USER, editedByRole: 'MODERATOR' });
  });
});
