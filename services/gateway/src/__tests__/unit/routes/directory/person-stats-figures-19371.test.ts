/**
 * #19371 — « En chiffres » : `totalMessages` et `totalTranslations` partent vers
 * un lecteur Proche et au-dessus, sous `privacy.showProfileFigures` du sujet.
 * `totalConversations` et `friendRequestsReceived` restent à soi et à
 * l'administration, et un succès dont la métrique est fermée ne part pas : son
 * `current` dirait le compte exact.
 *
 * (Harnais repris de #19368) — `?expand=stats` sert à chaque lecteur le nombre de publications
 * qu'IL peut voir, par genre : l'audience des listes (visibilité, cercles,
 * blocage), stories et statuts en ligne. Soi et l'administration gardent le
 * total ; « Voir comme » compte pour un lecteur synthétique du cercle.
 *
 * Le double de `post.count` APPLIQUE la requête : un compteur servi sans
 * audience compterait la publication privée, et le témoin tombe.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// Le `CacheStore` partagé n'est pas monté ici : chaque témoin relit l'audience (#19368).
jest.mock('../../../../services/CacheStore', () => ({ getCacheStore: () => undefined }));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));
jest.mock('../../../../routes/users/presence-gate', () => ({
  ...(jest.requireActual('../../../../routes/users/presence-gate') as object),
  getOptionalAuth: () => async () => undefined,
}));

import { directoryPersonRoutes } from '../../../../routes/directory/person';
import { clearPrivacyPreferencesCache } from '../../../../services/preferences/privacy-cache';
import { matchesPostWhere } from '../../../helpers/where-matcher-posts';

const DEMAIN = new Date(Date.now() + 24 * 3600 * 1000);
const HIER = new Date(Date.now() - 24 * 3600 * 1000);
const publication = (id: string, type: string, visibility: string, extra: Record<string, unknown> = {}) => ({
  id,
  authorId: '507f1f77bcf86cd799439011',
  type,
  visibility,
  visibilityUserIds: [] as string[],
  communityId: null,
  expiresAt: null as Date | null,
  ...extra,
});
const PUBLICATIONS = [
  publication('p1', 'POST', 'PUBLIC'),
  publication('p2', 'POST', 'FRIENDS'),
  publication('p3', 'POST', 'PRIVATE'),
  publication('p4', 'REEL', 'CLOSE'),
  publication('p5', 'REEL', 'ACQUAINTANCES'),
  publication('p6', 'STORY', 'PUBLIC', { expiresAt: DEMAIN }),
  publication('p7', 'STORY', 'PUBLIC', { expiresAt: HIER }),
  publication('p8', 'STATUS', 'FRIENDS', { expiresAt: DEMAIN }),
] as const;

const CIBLE = '507f1f77bcf86cd799439011';
const LECTEUR = '507f1f77bcf86cd799439022';
const LOW = CIBLE < LECTEUR ? CIBLE : LECTEUR;
const HIGH = CIBLE < LECTEUR ? LECTEUR : CIBLE;

const lien = (parLecteur: string, parCible: string) => ({
  id: 'r1',
  userLowId: LOW,
  userHighId: HIGH,
  grantedByLow: LOW === LECTEUR ? parLecteur : parCible,
  grantedByHigh: LOW === LECTEUR ? parCible : parLecteur,
  transitions: [],
});

type Cible = {
  readonly privacy?: Record<string, boolean>;
  readonly deactivatedAt?: Date | null;
  readonly birthDate?: Date | null;
  readonly lecteurBloqueCible?: boolean;
};

function prismaDouble(row: ReturnType<typeof lien> | null, cible: Cible = {}) {
  return {
    userPreferences: {
      findMany: jest.fn<any>(async () => (cible.privacy ? [{ userId: CIBLE, privacy: cible.privacy }] : [])),
    },
    userPreference: { findMany: jest.fn<any>(async () => []) },
    profileAddress: { findMany: async () => [] },
    user: {
      findMany: jest.fn<any>(async (args: any) =>
        (args?.where?.blockedUserIds ? [] : args?.where?.id?.in ?? []).map((id: string) => ({
          id,
          role: 'USER',
          birthDate: id === CIBLE ? cible.birthDate ?? null : null,
          isActive: true,
          deletedAt: null,
          deactivatedAt: id === CIBLE ? cible.deactivatedAt ?? null : null,
        })),
      ),
      findFirst: jest.fn<any>(async (args?: any) =>
        args?.where?.blockedUserIds || args?.where?.OR
          ? null
          : {
              id: CIBLE,
              username: 'cible',
              role: 'USER',
              isOnline: true,
              lastActiveAt: new Date(),
              deactivatedAt: cible.deactivatedAt ?? null,
              createdAt: new Date('2025-01-01T00:00:00Z'),
              registrationCountry: 'FR',
              timezone: 'Europe/Paris',
              voiceModel: null,
            },
      ),
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: cible.lecteurBloqueCible ? [CIBLE] : [], createdAt: new Date('2025-01-01') })),
    },
    userRelation: { findUnique: jest.fn<any>(async () => row), findMany: jest.fn<any>(async () => (row ? [row] : [])) },
    friendRequest: { findFirst: jest.fn<any>(async () => null), findMany: jest.fn<any>(async () => []), count: jest.fn<any>(async () => 64) },
    communityMember: { findMany: jest.fn<any>(async () => []) },
    message: {
      count: jest.fn<any>(async (args: any) => (args?.where?.translations ? 5120 : 8902)),
      groupBy: jest.fn<any>(async () => [{ originalLanguage: 'fr' }, { originalLanguage: 'en' }, { originalLanguage: 'ar' }]),
    },
    participant: { findMany: jest.fn<any>(async () => [{ id: 'part-1' }]), count: jest.fn<any>(async () => 12) },
    post: { count: jest.fn<any>(async (args: any) => PUBLICATIONS.filter((p) => matchesPostWhere(p, args?.where)).length) },
  };
}

async function monter(viewerId: string | null, row: ReturnType<typeof lien> | null, cible: Cible = {}, role = 'USER'): Promise<FastifyInstance> {
  clearPrivacyPreferencesCache();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prismaDouble(row, cible) as never);
  (app as unknown as { redis?: unknown }).redis = undefined;
  app.addHook('onRequest', async (req: any) => {
    req.authContext = viewerId
      ? { isAuthenticated: true, type: 'user', userId: viewerId, registeredUser: { id: viewerId, role } }
      : { isAuthenticated: false, isAnonymous: true, type: 'anonymous', userId: 'anonymous' };
  });
  await app.register(directoryPersonRoutes, { prefix: '/api/v1/directory' });
  await app.ready();
  return app;
}

const lire = (app: FastifyInstance, qs: string) =>
  app.inject({ method: 'GET', url: `/api/v1/directory/people/${CIBLE}${qs}` });

type Charge = Record<string, any>;
const statsDe = async (app: FastifyInstance, qs: string): Promise<Charge> => (await lire(app, qs)).json().data.stats as Charge;
const CHIFFRES = (s: Charge) => ({ totalMessages: s.totalMessages, totalTranslations: s.totalTranslations });
const INTIMES = (s: Charge) => ({ totalConversations: s.totalConversations, friendRequestsReceived: s.friendRequestsReceived });
const succes = (s: Charge) => (s.achievements as Array<{ id: string }>).map((a) => a.id).sort();
const ABSENTS = { totalMessages: undefined, totalTranslations: undefined };
const SERVIS = { totalMessages: 8902, totalTranslations: 5120 };
const FERMES = { totalConversations: undefined, friendRequestsReceived: undefined };

const lecture = async (viewerId: string | null, row: ReturnType<typeof lien> | null, qs = '?expand=stats', cible: Cible = {}, role = 'USER') => {
  const app = await monter(viewerId, row, cible, role);
  try {
    return await statsDe(app, qs);
  } finally {
    await app.close();
  }
};

describe('?expand=stats — « En chiffres » à un Proche (#19371)', () => {
  it('un Proche reçoit messages et traductions, jamais les fils ni les demandes reçues', async () => {
    const stats = await lecture(LECTEUR, lien('CLOSE', 'CLOSE'));
    expect(CHIFFRES(stats)).toEqual(SERVIS);
    expect(INTIMES(stats)).toEqual(FERMES);
    expect('totalConversations' in stats).toBe(false);
  });

  it('un Ami ne reçoit rien : les champs sont ABSENTS, jamais 0', async () => {
    const stats = await lecture(LECTEUR, lien('FRIEND', 'FRIEND'));
    expect(CHIFFRES(stats)).toEqual(ABSENTS);
    expect('totalMessages' in stats).toBe(false);
  });

  it('un Proche accordé d un seul côté reste un Ami', async () => {
    expect(CHIFFRES(await lecture(LECTEUR, lien('CLOSE', 'FRIEND')))).toEqual(ABSENTS);
  });

  it('la personne qui a coupé « Montrer mes chiffres » ne les montre pas, même au Sang', async () => {
    expect(CHIFFRES(await lecture(LECTEUR, lien('BLOOD', 'BLOOD'), '?expand=stats', { privacy: { showProfileFigures: false } }))).toEqual(ABSENTS);
  });

  it('un Proche que la cible a bloqué ne reçoit rien', async () => {
    expect(CHIFFRES(await lecture(LECTEUR, lien('CLOSE', 'CLOSE'), '?expand=stats', { lecteurBloqueCible: true }))).toEqual(ABSENTS);
  });

  it('un compte désactivé ne montre rien', async () => {
    expect(CHIFFRES(await lecture(LECTEUR, lien('CLOSE', 'CLOSE'), '?expand=stats', { deactivatedAt: new Date() }))).toEqual(ABSENTS);
  });

  it('un anonyme ne reçoit rien', async () => {
    const app = await monter(null, null);
    const reponse = await lire(app, '?expand=stats');
    await app.close();
    expect(reponse.body).not.toContain('totalMessages');
    expect(reponse.body).not.toContain('8902');
  });

  it('« Voir comme » Proche montre au propriétaire ce que ses Proches reçoivent ; « Voir comme » Ami, rien', async () => {
    expect(CHIFFRES(await lecture(CIBLE, null, '?as=CLOSE&expand=stats'))).toEqual(SERVIS);
    expect(CHIFFRES(await lecture(CIBLE, null, '?as=FRIEND&expand=stats'))).toEqual(ABSENTS);
    expect(INTIMES(await lecture(CIBLE, null, '?as=BLOOD&expand=stats'))).toEqual(FERMES);
  });

  it('« Voir comme » Proche suit la préférence RÉELLE du propriétaire', async () => {
    expect(CHIFFRES(await lecture(CIBLE, null, '?as=CLOSE&expand=stats', { privacy: { showProfileFigures: false } }))).toEqual(ABSENTS);
  });

  it('soi et l administration gardent les quatre compteurs', async () => {
    expect({ ...CHIFFRES(await lecture(CIBLE, null)), ...INTIMES(await lecture(CIBLE, null)) }).toEqual({ ...SERVIS, totalConversations: 12, friendRequestsReceived: 64 });
    expect(INTIMES(await lecture(LECTEUR, null, '?expand=stats', {}, 'ADMIN'))).toEqual({ totalConversations: 12, friendRequestsReceived: 64 });
  });

  it('À CÔTÉ du champ gardé : un succès dont la métrique est fermée ne part pas (son `current` dirait le compte)', async () => {
    expect(succes(await lecture(LECTEUR, null))).toEqual(['fidele', 'polyglotte']);
    expect(succes(await lecture(LECTEUR, lien('CLOSE', 'CLOSE')))).toEqual(['bavard', 'fidele', 'polyglotte', 'traducteur']);
    expect(succes(await lecture(CIBLE, null))).toEqual(['bavard', 'connecteur', 'fidele', 'polyglotte', 'populaire', 'traducteur']);
  });
});
