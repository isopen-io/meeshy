/**
 * #7950 — le marqueur `postReplyTo.deletedAt` TRAVERSE le sérialiseur de la
 * liste de messages (`messageSchema`).
 *
 * `fast-json-stringify` retire toute clé que le schéma ne déclare pas : sans
 * déclaration, la passerelle vidait l'instantané d'une story supprimée et
 * retirait en même temps le marqueur qui dit au client POURQUOI il est vide —
 * une carte muette au lieu de « Story indisponible ». Même contrôle pour
 * `authorId` / `authorName`, que `buildPostReplyTo` fige et qu'iOS décode.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import { messageSchema } from '@meeshy/shared/types/api-schemas';

const app = Fastify();

afterAll(async () => {
  await app.close();
});

const reponse = {
  id: '507f1f77bcf86cd799439a11',
  conversationId: '507f1f77bcf86cd799439a01',
  senderId: '507f1f77bcf86cd799439c02',
  content: 'Superbe !',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: '2026-09-25T09:30:00.000Z',
  storyReplyToId: '507f1f77bcf86cd799439b01',
  postReplyTo: {
    id: '507f1f77bcf86cd799439b01',
    type: 'STORY',
    moodEmoji: null,
    previewText: '',
    thumbnailUrl: null,
    reactionCount: 0,
    commentCount: 0,
    shareCount: 0,
    createdAt: '2026-09-25T08:00:00.000Z',
    authorId: '507f1f77bcf86cd799439c01',
    authorName: 'Demo',
    deletedAt: '2026-09-25T09:00:00.000Z',
  },
};

describe('#7950 — postReplyTo sur le fil', () => {
  it('sert deletedAt, authorId et authorName déclarés par messageSchema', async () => {
    app.get('/m', { schema: { response: { 200: messageSchema } } }, async () => reponse);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/m' });
    const servi = res.json() as { postReplyTo: Record<string, unknown> };

    expect(servi.postReplyTo).toMatchObject({
      deletedAt: '2026-09-25T09:00:00.000Z',
      authorId: '507f1f77bcf86cd799439c01',
      authorName: 'Demo',
      thumbnailUrl: null,
      previewText: '',
    });
  });
});
