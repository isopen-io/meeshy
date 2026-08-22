/**
 * `GET /admin/messages` et `GET /admin/communities` — ce que la console de
 * modération REÇOIT VRAIMENT.
 *
 * Les deux routes déclarent `data: { type: 'array', items: { type: 'object' } }`.
 * Un `items` sans `properties` ni `additionalProperties` n'est pas permissif :
 * fast-json-stringify SUPPRIME toute clé de chaque élément. La réponse porte
 * donc le bon NOMBRE d'éléments — et chacun est `{}`.
 *
 * C'est le pire des cas de la famille ouverte au cycle 84 bis : un tableau non
 * vide d'objets vides ressemble à une réponse valide. La pagination est juste,
 * le compteur de tête est juste, la liste est intégralement muette. Les deux
 * handlers font pourtant un `findMany` riche — `sender` et son `user`,
 * `conversation`, `attachments`, `_count` pour les messages ; `creator` et
 * `_count` pour les communautés.
 *
 * Ce que ces témoins gardent est la VALEUR SERVIE, à travers `app.inject()` —
 * donc à travers le vrai sérialiseur, seul endroit où la panne est observable.
 * Un témoin qui inspecterait la valeur rendue par le handler passerait des deux
 * côtés du correctif : la suppression a lieu APRÈS le handler.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import { registerContentRoutes } from '../content';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const MESSAGE_ID = '507f1f77bcf86cd799439011';
const COMMUNITY_ID = '507f1f77bcf86cd799439021';

const messageFindMany = jest.fn<any>();
const messageCount = jest.fn<any>();
const communityFindMany = jest.fn<any>();
const communityCount = jest.fn<any>();

const mockPrisma = {
  message: { findMany: messageFindMany, count: messageCount },
  community: { findMany: communityFindMany, count: communityCount },
} as any;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: { id: ADMIN_ID, role: 'ADMIN' },
    };
  });
  app.register(registerContentRoutes);
  await app.ready();
  return app;
}

function moderatedMessage() {
  return {
    id: MESSAGE_ID,
    content: 'Contenu signalé par trois membres',
    messageType: 'text',
    originalLanguage: 'fr',
    isEdited: false,
    createdAt: new Date('2026-08-22T09:15:00.000Z'),
    sender: {
      id: '507f1f77bcf86cd799439012',
      userId: '507f1f77bcf86cd799439013',
      displayName: 'Alice Martin',
      avatar: 'https://cdn.meeshy.me/a.png',
      type: 'MEMBER',
      language: 'fr',
      user: {
        id: '507f1f77bcf86cd799439013',
        username: 'alice',
        displayName: 'Alice Martin',
        firstName: 'Alice',
        lastName: 'Martin',
        avatar: 'https://cdn.meeshy.me/a.png',
      },
    },
    conversation: {
      id: '507f1f77bcf86cd799439014',
      identifier: 'meeshy-global',
      title: 'Meeshy Global',
      type: 'GROUP',
    },
    attachments: [
      {
        id: '507f1f77bcf86cd799439015',
        fileName: 'piece.png',
        originalName: 'piece jointe.png',
        mimeType: 'image/png',
        fileSize: 20480,
      },
    ],
    _count: { replies: 4 },
  };
}

function listedCommunity() {
  return {
    id: COMMUNITY_ID,
    identifier: 'devs-paris',
    name: 'Devs Paris',
    description: 'Communauté des développeurs parisiens',
    avatar: 'https://cdn.meeshy.me/c.png',
    isPrivate: false,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    creator: {
      id: '507f1f77bcf86cd799439022',
      username: 'bob',
      displayName: 'Bob Durand',
      avatar: 'https://cdn.meeshy.me/b.png',
    },
    _count: { members: 42, Conversation: 7 },
  };
}

describe('GET /admin/messages — la liste servie à la console de modération', () => {
  beforeEach(() => {
    messageFindMany.mockReset().mockResolvedValue([moderatedMessage()]);
    messageCount.mockReset().mockResolvedValue(1);
  });

  it('sert le message avec ses champs de tête, et non un objet vide', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/messages' });

    expect(res.statusCode).toBe(200);
    const [served] = res.json().data;
    expect(served).toMatchObject({
      id: MESSAGE_ID,
      content: 'Contenu signalé par trois membres',
      messageType: 'text',
      originalLanguage: 'fr',
      isEdited: false,
    });
    await app.close();
  });

  it("sert l'auteur du message — la colonne que la modération lit en premier", async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/messages' });

    const [served] = res.json().data;
    expect(served.sender).toMatchObject({
      id: '507f1f77bcf86cd799439012',
      displayName: 'Alice Martin',
      type: 'MEMBER',
    });
    expect(served.sender.user).toMatchObject({
      username: 'alice',
      firstName: 'Alice',
    });
    await app.close();
  });

  it('sert la conversation où le message a été posté', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/messages' });

    const [served] = res.json().data;
    expect(served.conversation).toMatchObject({
      identifier: 'meeshy-global',
      title: 'Meeshy Global',
      type: 'GROUP',
    });
    await app.close();
  });

  it('sert les pièces jointes et le compte de réponses que le handler a chargés', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/messages' });

    const [served] = res.json().data;
    expect(served.attachments).toHaveLength(1);
    expect(served.attachments[0]).toMatchObject({
      originalName: 'piece jointe.png',
      mimeType: 'image/png',
      fileSize: 20480,
    });
    expect(served._count).toEqual({ replies: 4 });
    await app.close();
  });
});

describe('GET /admin/communities — la liste servie à la console de modération', () => {
  beforeEach(() => {
    communityFindMany.mockReset().mockResolvedValue([listedCommunity()]);
    communityCount.mockReset().mockResolvedValue(1);
  });

  it('sert la communauté avec son identité, et non un objet vide', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/communities' });

    expect(res.statusCode).toBe(200);
    const [served] = res.json().data;
    expect(served).toMatchObject({
      id: COMMUNITY_ID,
      identifier: 'devs-paris',
      name: 'Devs Paris',
      description: 'Communauté des développeurs parisiens',
      isPrivate: false,
    });
    await app.close();
  });

  it('sert le créateur et les effectifs — les deux colonnes de la table', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/communities' });

    const [served] = res.json().data;
    expect(served.creator).toMatchObject({
      username: 'bob',
      displayName: 'Bob Durand',
    });
    expect(served._count).toEqual({ members: 42, Conversation: 7 });
    await app.close();
  });
});
