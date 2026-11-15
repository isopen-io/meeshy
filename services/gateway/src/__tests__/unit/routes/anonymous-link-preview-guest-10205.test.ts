/**
 * #10205 — l'aperçu d'un lien d'invitation lu SANS COMPTE Meeshy : ni le
 * nombre de participants (stats.totalParticipants / memberCount /
 * anonymousCount, currentUses, currentConcurrentUsers), ni la FICHE de
 * l'hôte (id, prénom, nom) — seul son nom affiché, son pseudo et son avatar
 * disent qui invite. Un compte garde tout.
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
    participant: { count: jest.fn(async () => 5), findMany: jest.fn(async () => [{ language: 'fr' }, { language: 'en' }]) },
    $runCommandRaw: runCommandRaw,
  } as never);
  await anonymousRoutes(app, { afterResponse: executeur.afterResponse, optionalAuth: fakeOptionalAuth });
  await app.ready();
  return { app, executeur, runCommandRaw, findFirst };
}

const preview = async (headers: Record<string, string> = {}) => {
  const { app } = await buildApp(shareLinkRow({ link: { currentUses: 9, currentConcurrentUsers: 3 } }));
  const res = await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}`, headers });
  await app.close();
  expect(res.statusCode).toBe(200);
  return res.json().data as Record<string, any>;
};

describe('#10205 — aperçu d’un lien lu sans compte Meeshy', () => {
  it('ne sert aucun effectif ni compteur d’usage', async () => {
    const data = await preview();
    expect(data.stats).not.toHaveProperty('totalParticipants');
    expect(data.stats).not.toHaveProperty('memberCount');
    expect(data.stats).not.toHaveProperty('anonymousCount');
    expect(data).not.toHaveProperty('currentUses');
    expect(data).not.toHaveProperty('currentConcurrentUsers');
  });

  it('garde les langues parlées, qui ne comptent personne', async () => {
    const data = await preview();
    expect(data.stats.spokenLanguages).toEqual(expect.arrayContaining(['fr', 'en']));
  });

  it('ne sert de l’hôte que son nom affiché, son pseudo et son avatar', async () => {
    const data = await preview();
    expect(Object.keys(data.creator).sort()).toEqual(['avatar', 'displayName', 'username']);
  });

  it('un compte Meeshy garde l’effectif, les compteurs et la fiche de l’hôte', async () => {
    const data = await preview({ 'x-test-user': VISITOR_ID });
    expect(data.stats).toMatchObject({ totalParticipants: 10, memberCount: 5, anonymousCount: 5 });
    expect(data).toMatchObject({ currentUses: 9, currentConcurrentUsers: 3 });
    expect(data.creator).toMatchObject({ id: CREATOR_ID, firstName: 'Alice', lastName: 'Martin' });
  });

  // RÉTROCOMPATIBILITÉ (#9223) : le SDK iOS publié décode `creator.id`/`username`
  // et `stats.totalParticipants/memberCount/anonymousCount` en champs OBLIGATOIRES
  // (`ShareLinkModels.swift`). Un client iOS (`X-Meeshy-Platform: ios`)
  // reçoit donc une forme DÉCODABLE, aux effectifs NEUTRES — jamais le vrai chiffre.
  it('sert à un client natif sans compte une forme décodable, effectifs à zéro', async () => {
    const data = await preview({ 'x-meeshy-platform': 'ios', 'x-meeshy-version': '1.1.2' });
    expect(data.stats).toEqual({ totalParticipants: 0, memberCount: 0, anonymousCount: 0, languageCount: 2, spokenLanguages: expect.arrayContaining(['fr', 'en']) });
    expect(data.creator).toEqual({ id: CREATOR_ID, username: 'alice', displayName: 'Alice', avatar: null });
    expect(data).not.toHaveProperty('currentUses');
  });
});
