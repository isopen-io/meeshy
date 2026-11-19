/**
 * `GET /directory/people/:handle` — les langues DÉCLARÉES d'une personne sur sa fiche (#19373).
 *
 * La planche montre « Portugais · Anglais » sur la fiche d'un inconnu (cercle Public) : la fiche
 * sert `languages`, la descente du Prisme (système → régionale → destination personnalisée),
 * normalisée et dédoublonnée. Ce qui part À CÔTÉ est gardé : les trois colonnes brutes (qui disent
 * quelle langue occupe quel rang, #4161) et la locale de l'appareil ne partent jamais.
 *
 * Les témoins s'écrivent sur un cercle autre que le premier (Connaissance) et sur « Voir comme ».
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

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

const CIBLE = '507f1f77bcf86cd799439011';
const LECTEUR = '507f1f77bcf86cd799439022';
const LOW = CIBLE < LECTEUR ? CIBLE : LECTEUR;
const HIGH = CIBLE < LECTEUR ? LECTEUR : CIBLE;

const RANGS_BRUTS = ['systemLanguage', 'regionalLanguage', 'customDestinationLanguage', 'deviceLocale'] as const;

type Langues = {
  readonly systemLanguage?: string | null;
  readonly regionalLanguage?: string | null;
  readonly customDestinationLanguage?: string | null;
  readonly deactivatedAt?: Date | null;
};

const lien = (niveau: string) => ({
  id: 'r1',
  userLowId: LOW,
  userHighId: HIGH,
  grantedByLow: niveau,
  grantedByHigh: niveau,
  transitions: [],
});

function prismaDouble(langues: Langues, niveau: string) {
  const row = lien(niveau);
  const findFirst = jest.fn<any>(async (args?: any) =>
    args?.where?.blockedUserIds || args?.where?.OR
      ? null
      : {
          id: CIBLE,
          username: 'rui',
          role: 'USER',
          isOnline: true,
          lastActiveAt: new Date(),
          deactivatedAt: null,
          createdAt: new Date('2025-01-01T00:00:00Z'),
          voiceModel: null,
          deviceLocale: 'de-DE',
          ...langues,
        },
  );
  return {
    findFirst,
    prisma: {
      userPreferences: { findMany: jest.fn<any>(async () => []) },
      userPreference: { findMany: jest.fn<any>(async () => []) },
      profileAddress: { findMany: async () => [] },
      user: {
        findMany: jest.fn<any>(async (args: any) =>
          (args?.where?.blockedUserIds ? [] : args?.where?.id?.in ?? []).map((id: string) => ({
            id, role: 'USER', birthDate: null, isActive: true, deletedAt: null, deactivatedAt: null,
          })),
        ),
        findFirst,
        findUnique: jest.fn<any>(async () => ({ blockedUserIds: [], createdAt: new Date('2025-01-01') })),
      },
      userRelation: { findUnique: jest.fn<any>(async () => row), findMany: jest.fn<any>(async () => [row]) },
      friendRequest: { findFirst: jest.fn<any>(async () => null), findMany: jest.fn<any>(async () => []), count: jest.fn<any>(async () => 0) },
      communityMember: { findMany: jest.fn<any>(async () => []) },
      message: { count: jest.fn<any>(async () => 0), groupBy: jest.fn<any>(async () => []) },
      participant: { findMany: jest.fn<any>(async () => []), count: jest.fn<any>(async () => 0) },
      post: { count: jest.fn<any>(async () => 0) },
    },
  };
}

async function lire({ viewerId = LECTEUR, langues, niveau = 'ACQUAINTANCE', qs = '' }: {
  readonly viewerId?: string;
  readonly langues: Langues;
  readonly niveau?: string;
  readonly qs?: string;
}) {
  clearPrivacyPreferencesCache();
  const { prisma, findFirst } = prismaDouble(langues, niveau);
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  (app as unknown as { redis?: unknown }).redis = undefined;
  app.addHook('onRequest', async (req: any) => {
    req.authContext = { isAuthenticated: true, type: 'user', userId: viewerId, registeredUser: { id: viewerId, role: 'USER' } };
  });
  await app.register(directoryPersonRoutes, { prefix: '/api/v1/directory' });
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/api/v1/directory/people/${CIBLE}${qs}` });
  await app.close();
  const profil = findFirst.mock.calls.map((c) => c[0] as { select?: Record<string, unknown> }).find((a) => a?.select?.id);
  return { status: res.statusCode, data: (res.json().data ?? {}) as Record<string, unknown>, select: profil?.select ?? {} };
}

describe('la fiche sert les langues déclarées, dans l ordre du Prisme', () => {
  it('un lecteur Connaissance lit « Portugais · Anglais » dans l ordre déclaré', async () => {
    const { status, data } = await lire({ langues: { systemLanguage: 'pt', regionalLanguage: 'en', customDestinationLanguage: null } });
    expect(status).toBe(200);
    expect(data.languages).toEqual(['pt', 'en']);
  });

  it('les rangs bruts et la locale de l appareil ne partent jamais à côté', async () => {
    const { data } = await lire({ langues: { systemLanguage: 'it', regionalLanguage: 'fr', customDestinationLanguage: 'pt' } });
    expect(data.languages).toEqual(['it', 'fr', 'pt']);
    expect(RANGS_BRUTS.filter((champ) => champ in data)).toEqual([]);
  });

  it('une langue déclarée deux fois ne part qu une fois, normalisée', async () => {
    const { data } = await lire({ langues: { systemLanguage: 'FR', regionalLanguage: 'fr', customDestinationLanguage: 'es' } });
    expect(data.languages).toEqual(['fr', 'es']);
  });

  it('un compte DÉSACTIVÉ ne sert pas ses langues : la fiche d un compte parti ne dit plus rien de lui', async () => {
    const { data } = await lire({ langues: { systemLanguage: 'pt', regionalLanguage: 'en', deactivatedAt: new Date('2026-11-01T00:00:00Z') } });
    expect('languages' in data).toBe(false);
    expect(RANGS_BRUTS.filter((champ) => champ in data)).toEqual([]);
  });

  it('aucune langue déclarée : la clé est absente, le client garde son repli', async () => {
    const { data } = await lire({ langues: { systemLanguage: null, regionalLanguage: null, customDestinationLanguage: null } });
    expect('languages' in data).toBe(false);
  });

  it('« Voir comme » au cercle Public sert les mêmes langues au propriétaire, sans les rangs bruts', async () => {
    const { status, data } = await lire({
      viewerId: CIBLE,
      langues: { systemLanguage: 'pt', regionalLanguage: 'en', customDestinationLanguage: null },
      qs: '?as=PUBLIC',
    });
    expect(status).toBe(200);
    expect(data.viewAs).toBe('PUBLIC');
    expect(data.languages).toEqual(['pt', 'en']);
    expect(RANGS_BRUTS.filter((champ) => champ in data)).toEqual([]);
  });
});

describe('?fields= gouverne ce que la base charge pour les langues', () => {
  it('?fields=languages charge les trois rangs du Prisme et jamais la locale de l appareil', async () => {
    const { data, select } = await lire({ langues: { systemLanguage: 'pt', regionalLanguage: 'en' }, qs: '?fields=languages' });
    expect(data.languages).toEqual(['pt', 'en']);
    expect(select).toMatchObject({ systemLanguage: true, regionalLanguage: true, customDestinationLanguage: true });
    expect(select.deviceLocale).toBeUndefined();
  });

  it('?fields=username ne charge aucune langue et n en sert aucune', async () => {
    const { data, select } = await lire({ langues: { systemLanguage: 'pt' }, qs: '?fields=username' });
    expect('languages' in data).toBe(false);
    for (const champ of RANGS_BRUTS) expect(select[champ]).toBeUndefined();
  });
});
