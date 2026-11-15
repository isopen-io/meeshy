/**
 * `GET /anonymous/link/:identifier` — ce que la page d'accueil d'invitation
 * montre du GROUPE, et la VISITE qu'elle compte (#7794).
 *
 * La vraie sérialisation est exercée (les schémas partagés ne sont PAS
 * mockés) : un champ absent du schéma de réponse est retiré en silence par
 * `fast-json-stringify`, et seul un témoin qui traverse la sérialisation voit
 * qu'un logo ou une bannière n'arrive jamais au client.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

import { anonymousRoutes } from '../../../routes/anonymous';
import { executeurImmediat } from '../../helpers/after-response';

const LINK_ID = 'mshy_link_abc123';
const SHARE_LINK_DB_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const CREATOR_ID = '507f1f77bcf86cd799439044';
const VISITOR_ID = '507f1f77bcf86cd799439055';

type Overrides = { readonly link?: Record<string, unknown>; readonly conversation?: Record<string, unknown> };

const shareLinkRow = ({ link = {}, conversation = {} }: Overrides = {}) => ({
  id: SHARE_LINK_DB_ID, linkId: LINK_ID, name: 'Invitation', description: 'Viens !',
  isActive: true, expiresAt: null, maxUses: null, currentUses: 0,
  maxConcurrentUsers: null, currentConcurrentUsers: 0,
  requireAccount: false, requireNickname: false, requireEmail: false, requireBirthday: false,
  allowedLanguages: [], allowAnonymousMessages: true, allowAnonymousFiles: false,
  allowAnonymousImages: true, allowViewHistory: true,
  conversation: {
    id: CONV_ID, title: 'Équipe', description: 'Le groupe', type: 'group',
    avatar: null, banner: null, createdAt: new Date('2026-09-01T10:00:00.000Z'),
    ...conversation,
  },
  creator: { id: CREATOR_ID, username: 'alice', firstName: 'Alice', lastName: 'Martin', displayName: 'Alice', avatar: null },
  ...link,
});

/** Un faux `optionalAuth` : `x-test-user` pose l'identité inscrite, comme le ferait le vrai middleware. */
async function fakeOptionalAuth(request: FastifyRequest): Promise<void> {
  const userId = request.headers['x-test-user'];
  (request as unknown as { authContext: unknown }).authContext =
    typeof userId === 'string'
      ? { type: 'user', isAuthenticated: true, isAnonymous: false, userId }
      : { type: 'anonymous', isAuthenticated: false, isAnonymous: true };
}

async function buildApp(row: unknown, runCommandRaw = jest.fn(async (_command: unknown): Promise<unknown> => ({ ok: 1, n: 1, nModified: 1 }))) {
  const executeur = executeurImmediat();
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const findFirst = jest.fn(async () => row);
  app.decorate('prisma', {
    conversationShareLink: { findFirst, findUnique: jest.fn(async () => row) },
    participant: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
    $runCommandRaw: runCommandRaw,
  } as never);
  await anonymousRoutes(app, { afterResponse: executeur.afterResponse, optionalAuth: fakeOptionalAuth });
  await app.ready();
  return { app, executeur, runCommandRaw, findFirst };
}

describe('aperçu d’un lien d’invitation — le groupe', () => {
  it('sert le logo et la bannière du groupe', async () => {
    const { app } = await buildApp(shareLinkRow({ conversation: { avatar: '/api/v1/attachments/file/a.png', banner: 'https://cdn.meeshy.me/b.jpg' } }));

    const res = await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.conversation).toMatchObject({
      avatar: '/api/v1/attachments/file/a.png',
      banner: 'https://cdn.meeshy.me/b.jpg',
    });
    await app.close();
  });

  it('sert null quand le groupe n’a ni logo ni bannière', async () => {
    const { app } = await buildApp(shareLinkRow());

    const res = await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}` });

    expect(res.json().data.conversation).toMatchObject({ avatar: null, banner: null });
    await app.close();
  });

  it('demande le logo et la bannière au select de la conversation', async () => {
    const { app, findFirst } = await buildApp(shareLinkRow());

    await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}` });

    const call = findFirst.mock.calls[0] as unknown as [{ select: { conversation: { select: Record<string, boolean> } } }];
    expect(call[0].select.conversation.select).toMatchObject({ avatar: true, banner: true });
    await app.close();
  });

  it.each(['public', 'global', 'broadcast'])('sert le type réel « %s »', async (type) => {
    const { app } = await buildApp(shareLinkRow({ conversation: { type } }));

    const res = await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.conversation.type).toBe(type);
    await app.close();
  });

  it('ne sert rien qui identifie un membre — la conversation ne porte que le groupe', async () => {
    const { app } = await buildApp(shareLinkRow({ conversation: { participants: [{ displayName: 'Bob', avatar: 'x' }], members: ['Bob'] } }));

    const res = await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}` });

    expect(Object.keys(res.json().data.conversation).sort()).toEqual(
      ['avatar', 'banner', 'createdAt', 'description', 'id', 'title', 'type'],
    );
    await app.close();
  });
});

describe('aperçu d’un lien d’invitation — la visite', () => {
  it('compte une visite quand l’aperçu est servi, sans perdre les liens nés avant la colonne', async () => {
    const { app, executeur, runCommandRaw } = await buildApp(shareLinkRow());

    await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}`, headers: { 'x-test-user': VISITOR_ID } });
    await executeur.settle();

    expect(runCommandRaw).toHaveBeenCalledTimes(1);
    expect(runCommandRaw).toHaveBeenCalledWith({
      update: 'ConversationShareLink',
      updates: [{
        q: { _id: { $oid: SHARE_LINK_DB_ID } },
        u: [{ $set: { visitCount: { $add: [{ $ifNull: ['$visitCount', 0] }, 1] } } }],
      }],
    });
    await app.close();
  });

  it('compte la visite APRÈS la réponse — jamais sur son chemin', async () => {
    const { app, executeur } = await buildApp(shareLinkRow());

    await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}` });

    expect(executeur.labels).toEqual(['share-link-visit']);
    await app.close();
  });

  it('ne compte pas l’auteur du lien qui regarde son propre aperçu', async () => {
    const { app, executeur, runCommandRaw } = await buildApp(shareLinkRow());

    await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}`, headers: { 'x-test-user': CREATOR_ID } });
    await executeur.settle();

    expect(runCommandRaw).not.toHaveBeenCalled();
    await app.close();
  });

  it('ne compte pas un lien refusé (inactif)', async () => {
    const { app, executeur, runCommandRaw } = await buildApp(shareLinkRow({ link: { isActive: false } }));

    const res = await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}` });
    await executeur.settle();

    expect(res.statusCode).toBe(410);
    expect(runCommandRaw).not.toHaveBeenCalled();
    await app.close();
  });

  it('un compteur en panne ne fait jamais échouer l’aperçu', async () => {
    const enPanne = jest.fn(async (_command: unknown): Promise<unknown> => { throw new Error('mongo down'); });
    const { app, executeur } = await buildApp(shareLinkRow(), enPanne);

    const res = await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}` });
    await executeur.settle();

    expect(res.statusCode).toBe(200);
    expect(enPanne).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
