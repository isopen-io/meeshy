/**
 * Joindre quelqu'un par son adresse ou son numéro exige un compte (#4160).
 *
 * `GET /users/email/:email` et `GET /users/phone/:phone` n'exigeaient **aucune
 * authentification**. Elles confirmaient sans compte qu'une adresse ou un
 * numéro appartient à un utilisateur Meeshy — **et rendaient son profil**.
 *
 * Ce qu'un attaquant en obtenait est un **annuaire inversé** : à partir d'une
 * liste d'e-mails ou de numéros, l'identité civile associée — prénom, nom,
 * pseudo, photo, bannière, bio, rôle, date d'inscription. Ce sont les deux
 * seules routes du dépôt qui joignent « ce numéro » à « cette personne » :
 * c'est une dé-anonymisation de numéro de téléphone, donnée personnelle au
 * sens du RGPD.
 *
 * La jumelle authentifiée `POST /users/me/contacts/match` fait exactement le
 * même travail, AVEC authentification, AVEC filtrage du blocage et AVEC le
 * gate de présence. Elle est bien faite — et sa loi n'était appliquée nulle
 * part ailleurs.
 *
 * Les deux routes sont CONSERVÉES et non retirées : le SDK iOS
 * (`UserService.swift:141,157`) et **Android** (`UserApi.kt:75,81`) les
 * appellent. Le correctif est de les FERMER, pas de les supprimer.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('../../../routes/users/presence-gate', () => ({
  viewerFromRequest: () => null,
  presenceFor: () => null,
  applyPresenceVisibilityAsOffline: (rows: unknown) => rows,
  // La route appelle `gateProfilePresence` : un double partiel du module la
  // laisserait `undefined`, et le 500 qui suit ressemblerait à un défaut de la
  // route plutôt qu'à un défaut du double.
  gateProfilePresence: async (_f: unknown, _r: unknown, user: unknown) => user,
  getOptionalAuth: () => async () => {},
}));

import { getUserByEmail, getUserByPhone } from '../../../routes/users/profile';

const PREFIXE = '/api/v1';
const VIEWER = '507f1f77bcf86cd799439011';

type Reglages = { authentifie: boolean; cible?: Record<string, unknown> | null };

function buildApp(reglages: Reglages) {
  const findFirst = jest.fn<any>(async () => reglages.cible ?? null);
  const prisma = {
    user: {
      findFirst,
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })),
    },
  };
  return { prisma, findFirst };
}

async function monter(prisma: unknown, authentifie: boolean): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any, reply: any) => {
    if (!authentifie) {
      return reply.code(401).send({ success: false, error: 'Authentication required' });
    }
    req.authContext = { isAuthenticated: true, userId: VIEWER, registeredUser: { id: VIEWER } };
    req.user = { userId: VIEWER };
  });
  app.decorate('prisma', prisma as never);
  await app.register(async (i) => {
    await getUserByEmail(i);
    await getUserByPhone(i);
  }, { prefix: PREFIXE });
  await app.ready();
  return app;
}

const PORTES = [
  { nom: 'adresse', url: `${PREFIXE}/users/email/quelquun%40exemple.test` },
  { nom: 'numéro', url: `${PREFIXE}/users/phone/%2B33612345678` },
] as const;

describe('L’annuaire inversé exige un compte', () => {
  it.each(PORTES)('refuse un appelant anonyme sur le $nom', async ({ url }) => {
    const { prisma, findFirst } = buildApp({ authentifie: false });
    const app = await monter(prisma, false);

    const res = await app.inject({ method: 'GET', url });

    expect(res.statusCode).toBe(401);
    // La base n'est même pas interrogée : sans compte, la question ne se pose
    // pas. Un `findFirst` émis avant le refus serait déjà une surface de déni
    // de service sur une colonne SANS INDEX (`phoneNumber`).
    expect(findFirst).not.toHaveBeenCalled();

    await app.close();
  });

  it.each(PORTES)('répond à un appelant authentifié sur le $nom', async ({ url }) => {
    const { prisma } = buildApp({
      authentifie: true,
      cible: { id: 'u-2', username: 'cible', displayName: 'Cible', isActive: true },
    });
    const app = await monter(prisma, true);

    const res = await app.inject({ method: 'GET', url });

    expect(res.statusCode).toBe(200);

    await app.close();
  });
});

describe('… et les filtres que la jumelle authentifiée applique déjà', () => {
  it.each(PORTES)('$nom : écarte un compte désactivé ou supprimé', async ({ url }) => {
    const { prisma, findFirst } = buildApp({ authentifie: true, cible: null });
    const app = await monter(prisma, true);

    await app.inject({ method: 'GET', url });

    const where = findFirst.mock.calls[0][0].where as Record<string, unknown>;
    // Sans ces clauses, un compte désactivé restait consultable et
    // `deactivatedAt` était servi. La forme du « non supprimé » est traitée par
    // le témoin suivant — elle n'est PAS `deletedAt: null` seul.
    expect(where).toMatchObject({ isActive: true });

    await app.close();
  });

  it.each(PORTES)('$nom : n’écarte PAS une ligne dont `deletedAt` est ABSENT', async ({ url }) => {
    const { prisma, findFirst } = buildApp({ authentifie: true, cible: null });
    const app = await monter(prisma, true);

    await app.inject({ method: 'GET', url });

    const where = findFirst.mock.calls[0][0].where as Record<string, any>;

    // Le piège que le dépôt documente (`packages/shared/CLAUDE.md` § « Absent
    // vs null ») : sur le connecteur MongoDB, Prisma enveloppe les filtres
    // scalaires, si bien qu'un `{ deletedAt: null }` NU ne matche que les
    // documents où le champ est présent-et-nul. Mesuré en intégration : les 222
    // comptes ont `deletedAt` ABSENT — la clause seule écartait tout le monde,
    // et la route rendait 404 sur des comptes parfaitement vivants.
    //
    // Ce témoin porte sur la FORME de la clause, parce qu'un double Prisma ne
    // reproduit pas la sémantique du connecteur : aucun test d'intégration de
    // handler ne pouvait attraper ce défaut.
    expect(where.deletedAt).toBeUndefined();
    expect(JSON.stringify(where.AND)).toContain('isSet');

    await app.close();
  });

  it.each(PORTES)('$nom : écarte qui a bloqué l’appelant, et qui l’appelant a bloqué', async ({ url }) => {
    const { prisma, findFirst } = buildApp({ authentifie: true, cible: null });
    const app = await monter(prisma, true);

    await app.inject({ method: 'GET', url });

    const where = findFirst.mock.calls[0][0].where as Record<string, any>;
    // Le blocage vaut dans les DEUX sens : sans cela, un utilisateur bloqué
    // retrouvait le profil de qui l'a bloqué, s'il connaissait son adresse.
    expect(where.NOT).toMatchObject({ blockedUserIds: { has: VIEWER } });
    expect(where.id).toMatchObject({ notIn: expect.any(Array) });

    await app.close();
  });
});
