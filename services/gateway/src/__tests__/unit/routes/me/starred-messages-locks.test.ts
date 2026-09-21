/**
 * Règle 4 du favori de message (#7377) — ce qui part À CÔTÉ est retenu par
 * DEUX verrous indépendants, et chacun a ici son témoin :
 *
 *   1. la PROJECTION reconstruit chaque objet champ par champ — elle ne rend
 *      aucune colonne qu'elle ne nomme pas, même quand la ligne Prisma en porte ;
 *   2. le SCHÉMA de réponse est fermé à chaque niveau — il retire du fil ce
 *      qu'un handler lui passerait en trop.
 *
 * Le témoin de route (`starred-messages-list.test.ts`) ne peut pas les
 * départager : il reste vert tant qu'UN des deux tient. Retirer l'un sans
 * rougir ici, c'est perdre un verrou sans le savoir.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import Fastify from 'fastify';

import { projectStarredItem, type StarredMessageRow } from '../../../../services/messaging/messageStars/starredMessageProjection';
import { starredMessagesListResponseSchema } from '../../../../routes/me/starred-messages-schemas';
import { attachmentRow, conversationRow, messageRow, starRow } from './starred-messages-harness';

const SECRETS = [
  'CIPHERTEXT-MUST-NOT-LEAVE',
  'IV-MUST-NOT-LEAVE',
  'TRANSCRIPT-MUST-NOT-LEAVE',
  'ada@example.com',
  'isOnline',
  'lastActiveAt',
  'reactionSummary',
  'validatedMentions',
  'memberCount',
];

describe('verrou 1 — la projection ne nomme que ce qu’elle choisit', () => {
  it('rend exactement les clés du contrat, même depuis une ligne qui en porte bien plus', () => {
    const item = projectStarredItem({
      star: starRow() as unknown as { id: string; createdAt: Date },
      message: messageRow({ attachments: [attachmentRow()] }) as unknown as StarredMessageRow,
      verdict: 'served',
      conversation: conversationRow() as unknown as Parameters<typeof projectStarredItem>[0]['conversation'],
      directPeer: null,
    });

    expect(Object.keys(item).sort()).toEqual(['conversation', 'id', 'message', 'sender', 'starredAt']);
    expect(Object.keys(item.message).sort()).toEqual([
      'attachments',
      'content',
      'conversationId',
      'createdAt',
      'editedAt',
      'id',
      'isProtected',
      'messageType',
      'originalLanguage',
      'translations',
    ]);
    const serialized = JSON.stringify(item);
    for (const secret of SECRETS) expect(serialized).not.toContain(secret);
  });
});

describe('verrou 2 — le schéma de réponse retire ce qu’un handler passerait en trop', () => {
  it('ne sert, à aucun niveau, une clé que le schéma ne déclare pas', async () => {
    const app = Fastify({ logger: false });
    app.get('/leak', { schema: { response: { 200: starredMessagesListResponseSchema } } }, async () => ({
      success: true,
      extraEnvelope: 'CIPHERTEXT-MUST-NOT-LEAVE',
      data: [
        {
          id: 's1',
          starredAt: '2026-09-21T09:00:00.000Z',
          encryptedContent: 'CIPHERTEXT-MUST-NOT-LEAVE',
          message: {
            id: 'm1',
            conversationId: 'c1',
            messageType: 'text',
            createdAt: '2026-09-20T10:00:00.000Z',
            editedAt: null,
            isProtected: false,
            content: 'Hello',
            originalLanguage: 'en',
            reactionSummary: { x: 1 },
            translations: [
              { id: 't1', messageId: 'm1', targetLanguage: 'fr', translatedContent: 'Bonjour', encryptionIv: 'IV-MUST-NOT-LEAVE' },
            ],
            attachments: [
              { id: 'a1', mimeType: 'audio/mp4', fileUrl: null, thumbnailUrl: null, isMasked: true, transcription: 'TRANSCRIPT-MUST-NOT-LEAVE' },
            ],
          },
          sender: { id: 'p1', userId: 'u1', displayName: 'Ada', avatar: null, username: 'ada', isOnline: true, lastActiveAt: 'x' },
          conversation: { id: 'c1', identifier: 'i', type: 'group', name: 'n', avatar: null, memberCount: 4200 },
        },
      ],
      pagination: { limit: 20, hasMore: false, nextCursor: null, form: 'keyset', validatedMentions: [] },
    }));
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/leak' });

      expect(res.statusCode).toBe(200);
      for (const secret of [...SECRETS, 'extraEnvelope', 'encryptedContent', 'transcription']) {
        expect(res.payload).not.toContain(secret);
      }
      expect(res.json().data[0].message.translations[0]).toEqual({
        id: 't1',
        messageId: 'm1',
        targetLanguage: 'fr',
        translatedContent: 'Bonjour',
      });
    } finally {
      await app.close();
    }
  });
});
