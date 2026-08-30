/**
 * Le successeur annoncé par les trois portes de profil doit être SUIVABLE,
 * sur une réponse RÉUSSIE comme sur une réponse d'ÉCHEC (#4440).
 *
 * ## Le défaut
 *
 * `onRequest: depreciee(ANNONCE_PROFIL)` composait `Link` depuis un successeur
 * STATIQUE — `/api/v1/directory/people/:handle`, le segment `:handle` littéral,
 * jamais résolu — et le posait INCONDITIONNELLEMENT, avant toute validation, tout
 * hook d'authentification, tout handler. Le même fichier porte pourtant
 * `annonceProfil(handle)`, qui résout le VRAI identifiant et s'ajoute une fois le
 * handler atteint — mais un `Link` posé en `onRequest` part AVANT lui, sur
 * TOUTE réponse, y compris celles qu'aucun handler ne produit jamais (un 400 de
 * validation Ajv, par exemple : Fastify le rend entre `preValidation` et
 * `preHandler`, sans jamais exécuter le corps de la route).
 *
 * Doctrine du dépôt : un `Link` que le client ne peut pas suivre n'indique
 * aucune migration — il désinforme. `deprecation-successor-sweep.ts` mesure
 * exactement cette propriété par balayage statique ; ce fichier la mesure par
 * une VRAIE requête (`app.inject()`), contre une VRAIE instance Fastify montée
 * avec les trois routes réelles de `routes/users/profile.ts`.
 *
 * ## Pourquoi `GET /users/id/:id` porte la preuve d'ÉCHEC
 *
 * Les trois routes partagent le MÊME mécanisme (`depreciee(...)` en
 * `onRequest`) — la preuve n'a donc besoin d'être portée qu'une fois pour
 * établir que le hook, lui, est corrigé. `GET /users/id/:id` est la seule des
 * trois dont le schéma de `params` contraint la forme (`pattern:
 * '^[a-f\\d]{24}$'`) : un identifiant qui ne matche pas fait échouer la
 * validation Ajv, et Fastify répond 400 SANS jamais atteindre le handler — donc
 * sans que `annoncerDepreciation(reply, annonceProfil(id))` (la ligne du
 * handler qui, elle, résout déjà correctement) n'ait la moindre chance de
 * s'exécuter. Si le `Link` est suivable ICI, c'est que le hook `onRequest`
 * lui-même l'est — pas seulement le chemin qui passe par le handler.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('../../../../routes/users/presence-gate', () => ({
  viewerFromRequest: () => null,
  presenceFor: () => null,
  applyPresenceVisibilityAsOffline: (rows: unknown) => rows,
  gateProfilePresence: async (_f: unknown, _r: unknown, user: unknown) => user,
  getOptionalAuth: () => async () => {},
}));

import { getUserByUsername, getUserById, getUserByIdDedicated } from '../../../../routes/users/profile';

const PREFIXE = '/api/v1';

const LIGNE_COMPLETE = {
  id: '507f1f77bcf86cd799439011',
  username: 'quelquun',
  firstName: 'Quel',
  lastName: 'Quun',
  displayName: 'Quelquun',
  avatar: null,
  banner: null,
  bio: '',
  role: 'USER',
  isOnline: true,
  lastActiveAt: new Date('2026-08-01T00:00:00Z'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  voiceModel: null,
};

function buildPrisma() {
  const findFirst = jest.fn<any>(async () => LIGNE_COMPLETE);
  return { user: { findFirst } };
}

async function monter(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async () => {});
  app.decorate('prisma', prisma as never);
  await app.register(async (i) => {
    await getUserByUsername(i);
    await getUserById(i);
    await getUserByIdDedicated(i);
  }, { prefix: PREFIXE });
  await app.ready();
  return app;
}

/**
 * Un `Link` SUIVABLE ne porte plus de segment de gabarit — la même propriété
 * que `RE_SEGMENT_GABARIT` dans `deprecation-successor-sweep.ts`, reprise ici
 * pour que les deux témoins (balayage statique, requête réelle) jugent la
 * même chose.
 */
function contientUnSegmentDeGabarit(link: string | string[] | undefined): boolean {
  const valeur = Array.isArray(link) ? link.join(', ') : link ?? '';
  return /:[a-zA-Z]/.test(valeur);
}

describe('#4440 — GET /u/:username annonce un successeur SUIVABLE', () => {
  it('une réponse 200 ne porte aucun segment de gabarit dans Link, et pointe le VRAI handle', async () => {
    const app = await monter(buildPrisma());

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/u/quelquun` });

    expect(res.statusCode).toBe(200);
    expect(contientUnSegmentDeGabarit(res.headers['link'])).toBe(false);
    expect(res.headers['link']).toContain('/api/v1/directory/people/quelquun');

    await app.close();
  });
});

describe('#4440 — GET /users/:id annonce un successeur SUIVABLE', () => {
  it('une réponse 200 ne porte aucun segment de gabarit dans Link, et pointe le VRAI id', async () => {
    const app = await monter(buildPrisma());

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/users/507f1f77bcf86cd799439011` });

    expect(res.statusCode).toBe(200);
    expect(contientUnSegmentDeGabarit(res.headers['link'])).toBe(false);
    expect(res.headers['link']).toContain('/api/v1/directory/people/507f1f77bcf86cd799439011');

    await app.close();
  });
});

describe('#4440 — GET /users/id/:id annonce un successeur SUIVABLE, sur un 200 COMME sur un 400', () => {
  it('une réponse 200 ne porte aucun segment de gabarit dans Link, et pointe le VRAI id', async () => {
    const app = await monter(buildPrisma());

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/users/id/507f1f77bcf86cd799439011` });

    expect(res.statusCode).toBe(200);
    expect(contientUnSegmentDeGabarit(res.headers['link'])).toBe(false);
    expect(res.headers['link']).toContain('/api/v1/directory/people/507f1f77bcf86cd799439011');

    await app.close();
  });

  it('une réponse 400 (id malformé, rejetée par Ajv AVANT le handler) porte Link AUSSI, et SUIVABLE — c’est la preuve que le hook onRequest lui-même est corrigé', async () => {
    const prisma = buildPrisma();
    const app = await monter(prisma);

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/users/id/not-an-object-id` });

    // Le handler n'est JAMAIS atteint sur ce chemin : Ajv rejette `id` en
    // `preValidation`/validation de schéma, avant `preHandler`. Le prouver
    // écarte toute ambiguïté sur QUI a posé le `Link` de cette réponse — ce ne
    // peut être que le hook `onRequest`.
    expect(res.statusCode).toBe(400);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();

    expect(res.headers['link']).toBeDefined();
    expect(contientUnSegmentDeGabarit(res.headers['link'])).toBe(false);

    await app.close();
  });
});
