/**
 * @jest-environment node
 *
 * messageSchema — contrat de SÉRIALISATION de l'APERÇU DE TRANSFERT.
 *
 * `GET /conversations/:id/messages` enrichit chaque message transféré avec
 * `forwardedFrom` (le message d'ORIGINE : expéditeur, première pièce jointe,
 * lieu partagé) et `forwardedFromConversation` (la provenance) — deux objets
 * imbriqués construits par la route, plus `effectFlags` au niveau message.
 *
 * Rien de tout cela n'atteignait le client : `messageSchema` ne déclarait que
 * `forwardedFromId` / `forwardedFromConversationId`, et sans
 * `additionalProperties`, fast-json-stringify STRIPPE en silence tout champ
 * absent des `properties`. La bulle de transfert n'avait donc jamais ni auteur
 * d'origine, ni vignette, ni nom de conversation source — l'enrichissement
 * (deux requêtes Prisma par page) était payé pour rien.
 *
 * Un test qui appellerait le handler ne prouverait RIEN : le bug ne vit pas
 * dans le mapping, il vit dans le sérialiseur. Ce test monte donc une instance
 * Fastify minimale portant le VRAI schéma de réponse de la route (l'enveloppe
 * `{ success, data: [messageSchema] }`) et lit ce qui sort du fil.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import { messageSchema } from '@meeshy/shared/types/api-schemas';

// Forme EXACTE construite par routes/conversations/messages.ts
// (§ « ENRICHIR LES MESSAGES FORWARDÉS »).
const FORWARDED_MESSAGE = {
  id: '507f1f77bcf86cd799439011',
  conversationId: '507f1f77bcf86cd799439012',
  senderId: 'user-bob',
  content: '',
  originalLanguage: 'fr',
  messageType: 'image',
  messageSource: 'user',
  createdAt: '2026-08-19T10:00:00.000Z',
  timestamp: '2026-08-19T10:00:00.000Z',
  translations: [],
  effectFlags: 5,
  forwardedFromId: '507f1f77bcf86cd799439021',
  forwardedFromConversationId: '507f1f77bcf86cd799439022',
  forwardedFrom: {
    id: '507f1f77bcf86cd799439021',
    content: 'Regarde ça',
    messageType: 'image',
    createdAt: '2026-08-18T09:00:00.000Z',
    sender: {
      id: 'participant-alice',
      userId: 'user-alice',
      username: 'alice',
      displayName: 'Alice Ndiaye',
      avatar: 'https://cdn.meeshy.me/a.jpg',
    },
    attachments: [
      {
        id: '507f1f77bcf86cd799439031',
        mimeType: 'image/jpeg',
        thumbnailUrl: 'https://cdn.meeshy.me/t.jpg',
        fileUrl: 'https://cdn.meeshy.me/f.jpg',
      },
    ],
    location: {
      latitude: 14.6928,
      longitude: -17.4467,
      name: 'Place de l’Indépendance',
      address: 'Dakar, Sénégal',
      category: 'landmark',
    },
  },
  forwardedFromConversation: {
    id: '507f1f77bcf86cd799439022',
    title: 'Équipe produit',
    identifier: 'equipe-produit',
    type: 'group',
    avatar: 'https://cdn.meeshy.me/c.jpg',
  },
};

const ORDINARY_MESSAGE = {
  id: '507f1f77bcf86cd799439013',
  conversationId: '507f1f77bcf86cd799439012',
  senderId: 'user-bob',
  content: 'Bonjour',
  messageType: 'text',
  createdAt: '2026-08-19T10:00:00.000Z',
  timestamp: '2026-08-19T10:00:00.000Z',
  translations: [],
};

let app: FastifyInstance;

async function serialized(url: string): Promise<Record<string, any>> {
  const response = await app.inject({ method: 'GET', url });
  return JSON.parse(response.payload);
}

beforeAll(async () => {
  app = Fastify();
  const schema = {
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'array', items: messageSchema },
        },
      },
    },
  };
  app.get('/forwarded', { schema }, async () => ({ success: true, data: [FORWARDED_MESSAGE] }));
  app.get('/ordinary', { schema }, async () => ({ success: true, data: [ORDINARY_MESSAGE] }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('messageSchema — sérialisation de l’aperçu de transfert', () => {
  it('laisse passer forwardedFrom — sans lui la bulle transférée n’a aucun message d’origine', async () => {
    const message = (await serialized('/forwarded')).data[0];

    expect(message.forwardedFrom).toBeDefined();
    expect(message.forwardedFrom.id).toBe('507f1f77bcf86cd799439021');
    expect(message.forwardedFrom.content).toBe('Regarde ça');
    expect(message.forwardedFrom.messageType).toBe('image');
    expect(message.forwardedFrom.createdAt).toBe('2026-08-18T09:00:00.000Z');
  });

  it('laisse passer l’expéditeur d’origine — le nom affiché sous « Transféré de »', async () => {
    const message = (await serialized('/forwarded')).data[0];

    expect(message.forwardedFrom.sender).toMatchObject({
      id: 'participant-alice',
      userId: 'user-alice',
      username: 'alice',
      displayName: 'Alice Ndiaye',
      avatar: 'https://cdn.meeshy.me/a.jpg',
    });
  });

  it('laisse passer la première pièce jointe d’origine — la vignette du transfert de média', async () => {
    const message = (await serialized('/forwarded')).data[0];

    expect(message.forwardedFrom.attachments).toEqual([
      {
        id: '507f1f77bcf86cd799439031',
        mimeType: 'image/jpeg',
        thumbnailUrl: 'https://cdn.meeshy.me/t.jpg',
        fileUrl: 'https://cdn.meeshy.me/f.jpg',
      },
    ]);
  });

  it('laisse passer le lieu du message d’origine (Lot 2) — un transfert géolocalisé garde sa position', async () => {
    const message = (await serialized('/forwarded')).data[0];

    expect(message.forwardedFrom.location).toMatchObject({
      latitude: 14.6928,
      longitude: -17.4467,
      name: 'Place de l’Indépendance',
    });
  });

  it('laisse passer forwardedFromConversation — le nom de la conversation source', async () => {
    const message = (await serialized('/forwarded')).data[0];

    expect(message.forwardedFromConversation).toEqual({
      id: '507f1f77bcf86cd799439022',
      title: 'Équipe produit',
      identifier: 'equipe-produit',
      type: 'group',
      avatar: 'https://cdn.meeshy.me/c.jpg',
    });
  });

  it('laisse passer effectFlags au niveau message — le bitfield des effets (flou, éphémère, vue unique)', async () => {
    const message = (await serialized('/forwarded')).data[0];

    expect(message.effectFlags).toBe(5);
  });

  it('un message ordinaire sérialise sans crasher et sans champ de transfert fabriqué', async () => {
    const message = (await serialized('/ordinary')).data[0];

    expect(message.content).toBe('Bonjour');
    expect(message.forwardedFrom ?? null).toBeNull();
    expect(message.forwardedFromConversation ?? null).toBeNull();
  });
});
