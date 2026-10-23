/**
 * #12333 (audit B1) — GET /admin/messages sert `attachmentSocketSelect` sous
 * `additionalProperties: true`. Depuis que ce select porte `alt`,
 * `altTranslations` et la ligne `message` (protection du porteur), la route
 * les sert-elle pour une pièce PROTÉGÉE ?
 *
 * @jest-environment node
 */
import Fastify from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }));

import { registerContentRoutes } from '../../../routes/admin/content';

const ROW = {
  id: 'm1', content: 'x', messageType: 'image', originalLanguage: 'fr', isEdited: false,
  createdAt: new Date('2026-10-01T00:00:00Z'), sender: null, conversation: null, _count: { replies: 0 },
  isViewOnce: true, isBlurred: false, effectFlags: 0, expiresAt: null, deletedAt: null, isEncrypted: false, encryptionMode: null,
  attachments: [{
    id: 'a1', fileName: 'secret.jpg', mimeType: 'image/jpeg', fileUrl: 'x.jpg', thumbnailUrl: null,
    isViewOnce: true, isBlurred: false, effectFlags: 0,
    alt: 'Le code du coffre est 4512', altLanguage: 'fr',
    altTranslations: { en: { text: 'The safe code is 4512' } },
    message: { isViewOnce: true, isBlurred: false, effectFlags: 0, expiresAt: null, deletedAt: null, isEncrypted: false, encryptionMode: null },
  }],
};

describe('audit #12333 — la description d’une pièce protégée sur GET /admin/messages', () => {
  it('ne sort ni la description, ni ses traductions, ni les drapeaux bruts du porteur', async () => {
    const prisma = { message: { findMany: jest.fn<any>().mockResolvedValue([ROW]), count: jest.fn<any>().mockResolvedValue(1) } };
    const app = Fastify({ logger: false });
    app.decorate('prisma', prisma);
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: '507f1f77bcf86cd799439011', role: 'ADMIN', username: 'a' } };
    });
    app.register(registerContentRoutes);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/messages' });
    await app.close();
    const piece = JSON.parse(res.body).data[0].attachments[0];
    expect(piece.isProtected).toBe(true);
    expect(piece.fileUrl).toBeNull();
    expect(res.body).not.toContain('4512');
    expect(piece).not.toHaveProperty('message');
  });
});
