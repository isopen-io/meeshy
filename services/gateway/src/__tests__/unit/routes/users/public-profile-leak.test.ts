/**
 * Un profil PUBLIC ne sert que ce qui est public (#4161).
 *
 * Les trois routes de recherche de profil déclaraient
 * `data: { type: 'object', additionalProperties: true }` — ce qui DÉSARME
 * `fast-json-stringify`. Tout ce que le `select` chargeait partait donc, sans
 * qu'aucune déclaration ne l'autorise, **à un appelant anonyme** :
 *
 *   les TROIS langues du Prisme — `systemLanguage`, `regionalLanguage`,
 *   `customDestinationLanguage` — soit les préférences linguistiques d'un
 *   inconnu ; `isActive` et `deactivatedAt`, qui disent l'état de son compte ;
 *   `updatedAt`, qui trace sa dernière activité administrative.
 *
 * Mesuré en intégration : 23 champs servis à un anonyme, dont ces six, plus un
 * `autoTranslateEnabled: true` écrit EN DUR — un champ de contrat qui ne dit
 * rien de vrai.
 *
 * ## Pourquoi le correctif est au `select`, et pas au schéma
 *
 * Le dépôt l'écrit déjà : « compter sur fast-json-stringify pour retenir une
 * donnée personnelle est un piège armé, pas une garde ». Ce qui ne sort pas de
 * la base ne peut pas fuir par une omission de schéma — et la première personne
 * qui ajoute le champ au schéma publie alors la fuite sans qu'un témoin tombe.
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

import { getUserById, getUserByUsername } from '../../../../routes/users/profile';

const PREFIXE = '/api/v1';

/** Ce que la BASE porte — bien plus que ce qu'un profil public doit servir. */
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

/** Les six champs qui fuyaient, plus le champ écrit en dur. */
const JAMAIS_PUBLIC = [
  'systemLanguage',
  'regionalLanguage',
  'customDestinationLanguage',
  'isActive',
  'deactivatedAt',
  'updatedAt',
  'autoTranslateEnabled',
  'email',
  'phoneNumber',
] as const;

function buildApp() {
  const findFirst = jest.fn<any>(async () => LIGNE_COMPLETE);
  const findUnique = jest.fn<any>(async () => LIGNE_COMPLETE);
  return { prisma: { user: { findFirst, findUnique } }, findFirst, findUnique };
}

async function monter(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async () => {});
  app.decorate('prisma', prisma as never);
  await app.register(async (i) => {
    await getUserById(i);
    await getUserByUsername(i);
  }, { prefix: PREFIXE });
  await app.ready();
  return app;
}

const PORTES = [
  { nom: '/users/:id', url: `${PREFIXE}/users/507f1f77bcf86cd799439011` },
  { nom: '/u/:username', url: `${PREFIXE}/u/quelquun` },
] as const;

describe('Un appelant ANONYME ne reçoit aucun champ privé', () => {
  it.each(PORTES)('$nom ne sert AUCUN des champs qui fuyaient', async ({ url }) => {
    const { prisma } = buildApp();
    const app = await monter(prisma);

    const res = await app.inject({ method: 'GET', url });

    expect(res.statusCode).toBe(200);
    const data = res.json().data ?? {};

    // Assertion NÉGATIVE, et sur la charge SÉRIALISÉE : le défaut est un
    // schéma permissif, donc un témoin qui lirait l'objet du handler ne
    // verrait pas la différence entre « déclaré » et « laissé passer ».
    const servis = JAMAIS_PUBLIC.filter((champ) => champ in data);
    expect(servis).toEqual([]);

    await app.close();
  });

  it.each(PORTES)('$nom ne CHARGE même pas ces champs — le repli est à la source', async ({ url }) => {
    const { prisma, findFirst, findUnique } = buildApp();
    const app = await monter(prisma);

    await app.inject({ method: 'GET', url });

    const appel = (findFirst.mock.calls[0] ?? findUnique.mock.calls[0])?.[0] as { select?: Record<string, unknown> };
    const select = appel?.select ?? {};
    // Ce qui ne sort pas de la base ne peut pas fuir par une omission de
    // schéma. La première personne qui ajoute un champ au schéma publierait
    // sinon la fuite sans qu'un témoin tombe.
    for (const champ of ['systemLanguage', 'regionalLanguage', 'customDestinationLanguage', 'updatedAt']) {
      expect(select[champ]).toBeUndefined();
    }

    await app.close();
  });

  it.each(PORTES)('$nom sert bien ce qui EST public', async ({ url }) => {
    const { prisma } = buildApp();
    const app = await monter(prisma);

    const res = await app.inject({ method: 'GET', url });
    const data = res.json().data ?? {};

    // Le contrôle de non-régression : resserrer ne doit pas vider.
    for (const champ of ['id', 'username', 'displayName', 'avatar', 'bio', 'role', 'createdAt']) {
      expect(champ in data).toBe(true);
    }

    await app.close();
  });
});
