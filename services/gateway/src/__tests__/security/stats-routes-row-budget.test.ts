/**
 * #4391 — « Les six routes de statistiques comptent en base, jamais une ligne
 * par message ».
 *
 * Critère 3 de l'issue, et c'est LE point cher du lot : **le témoin porte sur
 * le NOMBRE DE LIGNES LUES, jamais sur la forme de la réponse.** C'est une
 * subtilité de PLACEMENT héritée de #4166 — un témoin qui n'assert que la
 * sortie reste VERT quand on remet une lecture non bornée, puisque le schéma
 * de réponse filtre déjà ce qui part sur le fil. Un témoin qui ne peut pas
 * tomber n'atteste rien.
 *
 * Ce fichier instrumente donc le CLIENT PRISMA : chaque appel est journalisé
 * avec le nombre de lignes qu'il RAMÈNE, et chaque route reçoit un budget de
 * lignes. Les doubles sont réglés pour qu'une lecture non bornée rende
 * `LIGNES_EN_BASE` (5 000) lignes — très au-dessus de tous les budgets — si
 * bien que réintroduire un `findMany` par message fait TOMBER le témoin, quelle
 * que soit la forme de la réponse.
 *
 * Deux garde-fous de méthode, repris du patron `unbounded-findmany-guard` :
 *   - un CAS POSITIF (§ « L'instrument voit bien les lignes ») qui prouve que
 *     le compteur sait rendre 5 000 — sans quoi un instrument cassé rendrait
 *     tous les budgets verts pour rien ;
 *   - des assertions de MOYEN à côté des budgets (`findMany` jamais appelé,
 *     `post.count` jamais appelé depuis `achievements`) : le budget dit que la
 *     lecture est bornée, le moyen dit PAR QUOI elle l'est.
 *
 * Les six routes (liste établie contre `docs/product/api-simplification/
 * bande-passante.md` § 2, qui fait foi) :
 *   1. GET /users/me/stats                      (routes/user-stats.ts)
 *   2. GET /users/:userId/stats                 (routes/users/preferences.ts → computeUserStats)
 *   3. GET /users/me/stats/achievements         (routes/user-stats.ts)
 *   4. GET /users/me/stats/timeline             (routes/user-stats.ts)   ← la sixième de l'issue
 *   5. GET /tracking-links/:token/stats         (services/TrackingLinkService.ts)
 *   6. GET /admin/messages/stats                (routes/admin/messages.ts)
 *
 * Les deux lectures qui ne passent PAS par une route Fastify ici — le calcul
 * partagé de `/users/:userId/stats` et le service de `/tracking-links/:token/
 * stats` — sont sollicitées à leur point d'entrée réel (`computeUserStats`,
 * `TrackingLinkService.getTrackingLinkStats`). C'est le même instrument : le
 * budget porte sur ce que la LECTURE ramène, pas sur le transport qui l'appelle.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }));
jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));
jest.mock('../../validation/helpers.js', () => ({
  validateQuery: () => async (_req: unknown, _reply: unknown) => {},
}));
jest.mock('../../validation/admin-schemas.js', () => ({
  AdminMessagesStatsQuerySchema: {},
  AdminMessagesEngagementQuerySchema: {},
}));

// =============================================================================
// L'instrument — un journal des lectures, par MODÈLE, OPÉRATION et LIGNES.
// =============================================================================

const USER_ID = '507f1f77bcf86cd799439011';
const LINK_ID = '507f1f77bcf86cd799439099';

/** Ce qu'une lecture non bornée ramènerait — très au-dessus de tout budget. */
const LIGNES_EN_BASE = 5000;

type Lecture = { readonly modele: string; readonly operation: string; readonly lignes: number };

/**
 * Combien de LIGNES ce résultat porte-t-il ?
 *
 * Un scalaire (`count`) n'en porte aucune — c'est précisément ce qui distingue
 * « compter en base » de « compter en JavaScript ». Un tableau en porte sa
 * longueur ; un document, une.
 */
function compterLignes(resultat: unknown): number {
  if (Array.isArray(resultat)) return resultat.length;
  if (resultat === null || resultat === undefined) return 0;
  if (typeof resultat === 'number' || typeof resultat === 'boolean' || typeof resultat === 'string') return 0;
  return 1;
}

type Journal = { readonly lectures: Lecture[] };

/**
 * Enveloppe un double Prisma (objet plat `modèle → opération → fonction`) de
 * façon que CHAQUE appel s'inscrive au journal avec ce qu'il ramène.
 */
function instrumenter<T extends Record<string, Record<string, unknown>>>(
  double: T,
  journal: Journal
): PrismaClient {
  const instrumente: Record<string, Record<string, unknown>> = {};
  for (const [modele, operations] of Object.entries(double)) {
    const enveloppe: Record<string, unknown> = {};
    for (const [operation, impl] of Object.entries(operations)) {
      if (typeof impl !== 'function') {
        enveloppe[operation] = impl;
        continue;
      }
      const fn = impl as (...args: unknown[]) => unknown;
      enveloppe[operation] = async (...args: unknown[]) => {
        const resultat = await fn(...args);
        journal.lectures.push({ modele, operation, lignes: compterLignes(resultat) });
        return resultat;
      };
    }
    instrumente[modele] = enveloppe;
  }
  return instrumente as unknown as PrismaClient;
}

const lignesLues = (journal: Journal): number =>
  journal.lectures.reduce((total, l) => total + l.lignes, 0);

const aAppele = (journal: Journal, modele: string, operation: string): boolean =>
  journal.lectures.some((l) => l.modele === modele && l.operation === operation);

// =============================================================================
// L'instrument voit bien les lignes — cas POSITIF.
// Sans lui, un compteur cassé rendrait tous les budgets verts pour rien.
// =============================================================================

describe("L'instrument voit bien les lignes qu'une lecture ramène", () => {
  it('compte 5 000 lignes pour un findMany non borné, 0 pour un count', async () => {
    const journal: Journal = { lectures: [] };
    const prisma = instrumenter(
      {
        message: {
          findMany: () => Promise.resolve(Array.from({ length: LIGNES_EN_BASE }, () => ({ createdAt: new Date() }))),
          count: () => Promise.resolve(LIGNES_EN_BASE),
        },
      },
      journal
    ) as unknown as { message: { findMany: () => Promise<unknown>; count: () => Promise<unknown> } };

    await prisma.message.findMany();
    await prisma.message.count();

    expect(lignesLues(journal)).toBe(LIGNES_EN_BASE);
    expect(journal.lectures).toEqual([
      { modele: 'message', operation: 'findMany', lignes: LIGNES_EN_BASE },
      { modele: 'message', operation: 'count', lignes: 0 },
    ]);
  });
});

// =============================================================================
// Doubles communs
// =============================================================================

const LANGUES = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl'];

const messagesEnBase = () =>
  Array.from({ length: LIGNES_EN_BASE }, () => ({ createdAt: new Date(), content: 'lorem ipsum' }));

/**
 * Double du calcul de statistiques d'un compte. `message.findMany` /
 * `post.findMany` rendent 5 000 lignes : toute lecture non bornée qui
 * réapparaîtrait ferait exploser le budget.
 */
function doubleStats() {
  return {
    message: {
      count: jest.fn(() => Promise.resolve(42)),
      groupBy: jest.fn(() => Promise.resolve(LANGUES.map((l) => ({ originalLanguage: l })))),
      findMany: jest.fn(() => Promise.resolve(messagesEnBase())),
      aggregateRaw: jest.fn(() => Promise.resolve([{ daily: [], length: [] }])),
    },
    participant: {
      count: jest.fn(() => Promise.resolve(7)),
      findMany: jest.fn(() => Promise.resolve([])),
    },
    friendRequest: { count: jest.fn(() => Promise.resolve(3)) },
    user: { findUnique: jest.fn(() => Promise.resolve({ createdAt: new Date('2024-01-01') })) },
    post: {
      count: jest.fn(() => Promise.resolve(5)),
      findMany: jest.fn(() => Promise.resolve(messagesEnBase())),
    },
  };
}

async function appUserStats(prisma: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (req as unknown as Record<string, unknown>).user = { userId: USER_ID };
  });
  const { userStatsRoutes } = await import('../../routes/user-stats');
  await app.register(userStatsRoutes);
  await app.ready();
  return app;
}

// =============================================================================
// 1. GET /users/me/stats  —  bornée par le nombre de LANGUES, pas de messages
// =============================================================================

const BUDGET_STATS = 64;

describe('GET /users/me/stats — budget de lignes lues', () => {
  it('ne lit jamais une ligne par message', async () => {
    const journal: Journal = { lectures: [] };
    const app = await appUserStats(instrumenter(doubleStats(), journal));

    const res = await app.inject({ method: 'GET', url: '/users/me/stats', headers: { authorization: 'Bearer t' } });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(lignesLues(journal)).toBeLessThanOrEqual(BUDGET_STATS);
    expect(aAppele(journal, 'message', 'findMany')).toBe(false);
  });
});

// =============================================================================
// 2. GET /users/:userId/stats — le calcul PARTAGÉ (computeUserStats)
// =============================================================================

describe('computeUserStats — le calcul servi par GET /users/:userId/stats', () => {
  it('ne lit jamais une ligne par message', async () => {
    const journal: Journal = { lectures: [] };
    const { computeUserStats } = await import('../../routes/user-stats');

    const stats = await computeUserStats(instrumenter(doubleStats(), journal), USER_ID);

    expect(stats.totalMessages).toBe(42);
    expect(lignesLues(journal)).toBeLessThanOrEqual(BUDGET_STATS);
    expect(aAppele(journal, 'message', 'findMany')).toBe(false);
  });
});

// =============================================================================
// 3. GET /users/me/stats/achievements
//    Budget de lignes ET budget de MOYENS : la route ne paie plus les trois
//    `post.count` d'un calcul dont elle ne garde qu'un champ.
// =============================================================================

describe('GET /users/me/stats/achievements — budget de lignes lues', () => {
  it('ne lit jamais une ligne par message', async () => {
    const journal: Journal = { lectures: [] };
    const app = await appUserStats(instrumenter(doubleStats(), journal));

    const res = await app.inject({
      method: 'GET',
      url: '/users/me/stats/achievements',
      headers: { authorization: 'Bearer t' },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(lignesLues(journal)).toBeLessThanOrEqual(BUDGET_STATS);
    expect(aAppele(journal, 'message', 'findMany')).toBe(false);
  });

  it("ne paie aucune des agrégations de contenu dont elle ne garde rien", async () => {
    const journal: Journal = { lectures: [] };
    const app = await appUserStats(instrumenter(doubleStats(), journal));

    const res = await app.inject({
      method: 'GET',
      url: '/users/me/stats/achievements',
      headers: { authorization: 'Bearer t' },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(aAppele(journal, 'post', 'count')).toBe(false);
    // Six agrégations, pas neuf : les trois `post.count` servent `postsCount` /
    // `reelsCount` / `storiesCount`, qu'aucun succès ne lit.
    expect(journal.lectures).toHaveLength(6);
  });
});

// =============================================================================
// 4. GET /users/me/stats/timeline — LA lecture « une ligne par message »
// =============================================================================

describe('GET /users/me/stats/timeline — budget de lignes lues', () => {
  it('compte en base : au plus une ligne par TRANCHE demandée, jamais une par message', async () => {
    const journal: Journal = { lectures: [] };
    const app = await appUserStats(instrumenter(doubleStats(), journal));

    const res = await app.inject({
      method: 'GET',
      url: '/users/me/stats/timeline?days=90',
      headers: { authorization: 'Bearer t' },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect((JSON.parse(res.body) as { data: unknown[] }).data).toHaveLength(90);
    expect(lignesLues(journal)).toBeLessThanOrEqual(90);
    expect(aAppele(journal, 'message', 'findMany')).toBe(false);
  });

  /**
   * L'ÉVENTAIL est borné par le CONTRAT, pas par la donnée.
   *
   * Le remplacement échange une lecture proportionnelle au nombre de messages
   * contre un COUNT par tranche : le budget de lignes ci-dessus ne dit rien du
   * nombre de REQUÊTES. Ce que `days` vaut devient donc la seule borne de
   * l'éventail, et elle doit être refusée AVANT le handler — sinon
   * `?days=100000` échangerait une lecture lourde contre cent mille requêtes,
   * un défaut pire que celui qu'on corrige.
   */
  it("refuse hors contrat AVANT d'ouvrir le moindre éventail", async () => {
    const journal: Journal = { lectures: [] };
    const app = await appUserStats(instrumenter(doubleStats(), journal));

    const horsBorne = await app.inject({
      method: 'GET',
      url: '/users/me/stats/timeline?days=100000',
      headers: { authorization: 'Bearer t' },
    });
    await app.close();

    expect(horsBorne.statusCode).toBe(400);
    expect(journal.lectures).toHaveLength(0);
  });
});

// =============================================================================
// 5. GET /tracking-links/:token/stats — TrackingLinkService.getTrackingLinkStats
// =============================================================================

const LIEN = {
  id: LINK_ID,
  token: 'AbCd12',
  shortUrl: '/l/AbCd12',
  originalUrl: 'https://example.com',
  isActive: true,
  expiresAt: null,
  totalClicks: 3,
  uniqueClicks: 2,
  createdBy: USER_ID,
  conversationId: null,
  messageId: null,
  targetType: 'URL',
  targetId: null,
  name: null,
  campaign: null,
  source: null,
  medium: null,
  createdAt: new Date('2024-01-01'),
  lastClickedAt: null,
};

const clicsEnBase = () =>
  Array.from({ length: LIGNES_EN_BASE }, () => ({
    country: 'FR', device: 'mobile', browser: 'Safari', os: 'iOS', language: 'fr',
    socialSource: null, referrer: null, ipAddress: '1.2.3.4', deviceFingerprint: 'fp',
    redirectStatus: 'confirmed', clickedAt: new Date('2024-06-01T12:00:00.000Z'),
  }));

describe('getTrackingLinkStats — budget de lignes lues', () => {
  it('agrège en base : jamais une ligne par clic', async () => {
    const journal: Journal = { lectures: [] };
    const prisma = instrumenter(
      {
        trackingLink: { findUnique: jest.fn(() => Promise.resolve(LIEN)) },
        trackingLinkClick: {
          findMany: jest.fn(() => Promise.resolve(clicsEnBase())),
          aggregateRaw: jest.fn(() => Promise.resolve([{}])),
        },
        conversationShareLink: { findFirst: jest.fn(() => Promise.resolve(null)) },
      },
      journal
    );

    const { TrackingLinkService } = await import('../../services/TrackingLinkService');
    await new TrackingLinkService(prisma).getTrackingLinkStats('AbCd12');

    expect(lignesLues(journal)).toBeLessThanOrEqual(8);
    expect(aAppele(journal, 'trackingLinkClick', 'findMany')).toBe(false);
  });
});

// =============================================================================
// 6. GET /admin/messages/stats
// =============================================================================

describe('GET /admin/messages/stats — budget de lignes lues', () => {
  it('compte en base sur toute la fenêtre : jamais une ligne par message', async () => {
    const journal: Journal = { lectures: [] };
    const prisma = instrumenter(
      {
        message: {
          count: jest.fn(() => Promise.resolve(1234)),
          groupBy: jest.fn(() => Promise.resolve([{ messageType: 'text', _count: { id: 1234 } }])),
          findMany: jest.fn(() => Promise.resolve(messagesEnBase())),
          aggregateRaw: jest.fn(() => Promise.resolve([{ daily: [], length: [] }])),
        },
        participant: { findMany: jest.fn(() => Promise.resolve([])) },
        reaction: { count: jest.fn(() => Promise.resolve(0)) },
      },
      journal
    );

    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('authenticate', async (req: FastifyRequest): Promise<void> => {
      (req as unknown as Record<string, unknown>).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'ADMIN' },
      };
    });
    app.decorate('prisma', prisma);
    const { messagesRoutes } = await import('../../routes/admin/messages');
    await app.register(messagesRoutes);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/stats?period=90d' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(lignesLues(journal)).toBeLessThanOrEqual(128);
    expect(aAppele(journal, 'message', 'findMany')).toBe(false);
  });
});
