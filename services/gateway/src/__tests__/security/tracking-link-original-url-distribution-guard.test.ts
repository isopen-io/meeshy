/**
 * Aucune valeur servie par la console des liens de suivi n'ouvre la porte d'une
 * conversation (#8876).
 *
 * `TrackingLinkService.processMessageLinks` crée un lien de suivi pour CHAQUE
 * adresse brute d'un message, d'une publication ou d'un commentaire, en y
 * consignant `conversationId` et `createdBy`. Une invitation collée dans une
 * conversation privée devient donc un lien de suivi dont `originalUrl` vaut
 * `https://meeshy.me/chat/<linkId>` — et `linkId` est une clé de jointure
 * (`SHARE_LINK_JOIN_KEY_COLUMNS`) que `POST /links/:key/members` accepte sans
 * créance.
 *
 * Trois portes d'administration servaient cette adresse telle quelle : la liste
 * et la fiche des liens de suivi, et le classement des liens. Leurs lecteurs
 * sont BIGBOSS, ADMIN et AUDIT — AUDIT n'a ni `canViewSensitiveData` ni le rang
 * qui ouvre l'inventaire des conversations.
 *
 * Le sentinelle est posé dans le CHEMIN (la clé) ET dans la requête : le témoin
 * tombe si l'une ou l'autre sort, et si la recherche en fait un oracle.
 *
 * @jest-environment node
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      info: jest.fn<any>(),
      warn: jest.fn<any>(),
      error: jest.fn<any>(),
      debug: jest.fn<any>(),
    }),
  },
}));
jest.mock('../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    getTrackingLinkStats: async () => ({
      confirmedClicks: 0,
      clicksByDate: {},
      clicksByCountry: {},
      clicksByDevice: {},
      clicksByBrowser: {},
      clicksByOS: {},
      clicksBySocialSource: {},
      topReferrers: [],
    }),
  })),
}));

import { registerTrackingLinkAdminRoutes } from '../../routes/admin/tracking-links';
import { systemRankingsRoutes } from '../../routes/admin/system-rankings';

const LINK = '507f1f77bcf86cd799439041';
const ACTOR = '507f1f77bcf86cd799439011';
const CONVERSATION = '507f1f77bcf86cd799439031';
const SENTINEL = 'mshy_SENTINELLE_CLE_DE_JOINTURE';
const QUERY_SENTINEL = 'SENTINELLE_REQUETE';
const CONVERSATION_TITLE = 'Titre-secret-de-la-conversation';

const pastedInvitation = (): Record<string, unknown> => ({
  id: LINK,
  token: 'a1b2c3',
  name: 'Invitation collée',
  campaign: null,
  source: null,
  medium: null,
  originalUrl: `https://meeshy.me/chat/${SENTINEL}?t=${QUERY_SENTINEL}#fragment`,
  shortUrl: 'https://meeshy.me/l/a1b2c3',
  targetType: 'CONVERSATION',
  targetId: CONVERSATION,
  conversationId: CONVERSATION,
  createdBy: ACTOR,
  totalClicks: 3,
  uniqueClicks: 2,
  isActive: true,
  expiresAt: null,
  lastClickedAt: null,
  createdAt: new Date('2026-09-01T08:00:00.000Z'),
  creator: { id: ACTOR, username: 'awa', displayName: 'Awa Diop', avatar: null },
});

function makePrisma() {
  return {
    trackingLink: {
      findMany: jest.fn<any>(async () => [pastedInvitation()]),
      count: jest.fn<any>(async () => 1),
      findUnique: jest.fn<any>(async () => pastedInvitation()),
    },
    trackingLinkClick: {
      findMany: jest.fn<any>(async () => []),
      groupBy: jest.fn<any>(async () => []),
    },
    user: { findMany: jest.fn<any>(async () => [{ id: ACTOR, username: 'awa', displayName: 'Awa Diop', avatar: null }]) },
    post: { findMany: jest.fn<any>(async () => []) },
    conversation: { findMany: jest.fn<any>(async () => [{ id: CONVERSATION, title: CONVERSATION_TITLE }]) },
  } as any;
}

async function mount(role: string): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const prisma = makePrisma();
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: ACTOR,
      registeredUser: { id: ACTOR, role, username: 'acteur' },
    };
  });
  registerTrackingLinkAdminRoutes(app);
  await app.register(systemRankingsRoutes);
  await app.ready();
  return { app, prisma };
}

const READERS = ['AUDIT', 'ADMIN'] as const;

beforeEach(() => jest.clearAllMocks());

describe.each(READERS)('#8876 — %s ne reçoit aucune clé de jointure par un lien de suivi', (role) => {
  it('GET /tracking-links ne sert ni la clé ni la requête de l’adresse d’origine', async () => {
    const { app } = await mount(role);
    const res = await app.inject({ method: 'GET', url: '/tracking-links' });

    expect(res.statusCode).toBe(200);
    expect(res.payload).not.toContain(SENTINEL);
    expect(res.payload).not.toContain(QUERY_SENTINEL);
    expect(res.json().data[0].originalUrl).toBe('https://meeshy.me/chat/…');
    await app.close();
  });

  it('GET /tracking-links/:id ne sert ni la clé ni la requête de l’adresse d’origine', async () => {
    const { app } = await mount(role);
    const res = await app.inject({ method: 'GET', url: `/tracking-links/${LINK}` });

    expect(res.statusCode).toBe(200);
    expect(res.payload).not.toContain(SENTINEL);
    expect(res.payload).not.toContain(QUERY_SENTINEL);
    await app.close();
  });

  it.each(['tracking_links_most_visited', 'tracking_links_most_unique'])(
    'GET /ranking?entityType=links&criterion=%s ne sert que l’origine de l’adresse',
    async (criterion) => {
      const { app } = await mount(role);
      const res = await app.inject({ method: 'GET', url: `/ranking?entityType=links&criterion=${criterion}` });

      expect(res.statusCode).toBe(200);
      expect(res.payload).not.toContain(SENTINEL);
      expect(res.payload).not.toContain(QUERY_SENTINEL);
      expect(res.json().data.rankings[0].originalUrl).toBe('https://meeshy.me');
      await app.close();
    }
  );

  it('la recherche ne porte pas sur l’adresse d’origine — elle ne devient pas un oracle', async () => {
    const { app, prisma } = await mount(role);
    await app.inject({ method: 'GET', url: `/tracking-links?search=${SENTINEL}` });

    const where = JSON.stringify(prisma.trackingLink.findMany.mock.calls[0][0].where);
    expect(where).not.toContain('originalUrl');
    await app.close();
  });
});

describe('#8876 — le titre de la conversation est réservé au rang d’administration', () => {
  it('AUDIT reçoit title: null et un label de cible null, sans que la base soit interrogée', async () => {
    const { app, prisma } = await mount('AUDIT');
    const list = (await app.inject({ method: 'GET', url: '/tracking-links' })).json().data[0];
    const fiche = (await app.inject({ method: 'GET', url: `/tracking-links/${LINK}` })).json().data;

    expect(list.conversation).toEqual({ id: CONVERSATION, title: null });
    expect(list.target).toEqual({ type: 'CONVERSATION', id: CONVERSATION, label: null });
    expect(fiche.conversation.title).toBeNull();
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it.each(['ADMIN', 'BIGBOSS'])('%s reçoit le titre et le label', async (role) => {
    const { app } = await mount(role);
    const list = (await app.inject({ method: 'GET', url: '/tracking-links' })).json().data[0];

    expect(list.conversation).toEqual({ id: CONVERSATION, title: CONVERSATION_TITLE });
    expect(list.target.label).toBe(CONVERSATION_TITLE);
    await app.close();
  });
});
