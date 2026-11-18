/**
 * #19368 — `?expand=stats` sert à chaque lecteur le nombre de publications
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
    friendRequest: { findFirst: jest.fn<any>(async () => null), findMany: jest.fn<any>(async () => []), count: jest.fn<any>(async () => 0) },
    communityMember: { findMany: jest.fn<any>(async () => []) },
    message: { count: jest.fn<any>(async () => 0), groupBy: jest.fn<any>(async () => []) },
    participant: { findMany: jest.fn<any>(async () => []), count: jest.fn<any>(async () => 0) },
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
const COMPTEURS = (s: Charge) => ({ postsCount: s.postsCount, reelsCount: s.reelsCount, storiesCount: s.storiesCount, statusesCount: s.statusesCount });

describe('?expand=stats — les publications que CE lecteur peut voir (#19368)', () => {
  it("un lecteur sans lien ne compte que le public en ligne : ni l'Amis, ni le Privé, ni le cercle", async () => {
    const app = await monter(LECTEUR, null);
    expect(COMPTEURS(await statsDe(app, '?expand=stats'))).toEqual({ postsCount: 1, reelsCount: 0, storiesCount: 1, statusesCount: 0 });
    await app.close();
  });

  it('un lecteur Ami compte aussi les Amis et les Connaissances, jamais le Proche ni le Privé', async () => {
    const app = await monter(LECTEUR, lien('FRIEND', 'FRIEND'));
    expect(COMPTEURS(await statsDe(app, '?expand=stats'))).toEqual({ postsCount: 2, reelsCount: 1, storiesCount: 1, statusesCount: 1 });
    await app.close();
  });

  it('un lecteur que la cible a bloqué ne compte rien', async () => {
    const app = await monter(LECTEUR, lien('FRIEND', 'FRIEND'), { lecteurBloqueCible: true });
    expect(COMPTEURS(await statsDe(app, '?expand=stats'))).toEqual({ postsCount: 0, reelsCount: 0, storiesCount: 0, statusesCount: 0 });
    await app.close();
  });

  it('le propriétaire garde le total, archive de stories comprise', async () => {
    const app = await monter(CIBLE, null);
    expect(COMPTEURS(await statsDe(app, '?expand=stats'))).toEqual({ postsCount: 3, reelsCount: 2, storiesCount: 2, statusesCount: 1 });
    await app.close();
  });

  it("l'administration garde le total", async () => {
    const app = await monter(LECTEUR, null, {}, 'ADMIN');
    expect(COMPTEURS(await statsDe(app, '?expand=stats'))).toEqual({ postsCount: 3, reelsCount: 2, storiesCount: 2, statusesCount: 1 });
    await app.close();
  });

  it('« Voir comme » Connaissance compte pour un lecteur de ce cercle, pas pour le propriétaire', async () => {
    const app = await monter(CIBLE, null);
    expect(COMPTEURS(await statsDe(app, '?as=ACQUAINTANCE&expand=stats'))).toEqual({ postsCount: 1, reelsCount: 1, storiesCount: 1, statusesCount: 0 });
    await app.close();
  });

  it('« Voir comme » Proche ouvre les Amis et le Proche, jamais le Privé', async () => {
    const app = await monter(CIBLE, null);
    expect(COMPTEURS(await statsDe(app, '?as=CLOSE&expand=stats'))).toEqual({ postsCount: 2, reelsCount: 2, storiesCount: 1, statusesCount: 1 });
    await app.close();
  });
});
