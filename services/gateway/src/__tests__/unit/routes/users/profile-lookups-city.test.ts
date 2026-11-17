/**
 * `GET /users/email/:email` et `GET /users/phone/:phone` — la ville DÉCLARÉE suit le cercle
 * choisi par son propriétaire, comme sur la fiche (#18862, revue).
 *
 * Ces deux portes chargent `publicUserSelect` et servent `publicProfileSchema`, qui déclarent
 * désormais `city` et `cityCircle`. Sans passer par `withServedCity`, la ville ET le réglage
 * partaient tels quels vers quiconque connaît l'adresse ou le numéro de la personne.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/rate-limiter', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

import { getUserByEmail, getUserByPhone } from '../../../../routes/users/profile-lookups';
import { clearPrivacyPreferencesCache } from '../../../../services/preferences/privacy-cache';

const CIBLE = '507f1f77bcf86cd799439011';
const LECTEUR = '507f1f77bcf86cd799439022';
const LOW = CIBLE < LECTEUR ? CIBLE : LECTEUR;
const HIGH = CIBLE < LECTEUR ? LECTEUR : CIBLE;

const lien = (niveau: string) => ({
  id: 'r1',
  userLowId: LOW,
  userHighId: HIGH,
  grantedByLow: niveau,
  grantedByHigh: niveau,
  transitions: [],
});

type Cas = { readonly niveau: string; readonly avecValeurs: boolean; readonly cityCircle?: string | null };

function prismaDouble({ niveau, avecValeurs, cityCircle = 'FRIEND' }: Cas) {
  const row = lien(niveau);
  return {
    userPreferences: { findMany: jest.fn<any>(async () => []) },
    userPreference: { findMany: jest.fn<any>(async () => []) },
    user: {
      findFirst: jest.fn<any>(async (args?: any) =>
        args?.where?.blockedUserIds || args?.where?.OR
          ? null
          : {
              id: CIBLE,
              username: 'cible',
              firstName: 'Ada',
              lastName: 'Lovelace',
              displayName: 'Ada',
              avatar: null,
              banner: null,
              bio: null,
              role: 'USER',
              isOnline: true,
              lastActiveAt: new Date(),
              deactivatedAt: null,
              createdAt: new Date('2025-01-01T00:00:00Z'),
              registrationCountry: avecValeurs ? 'FR' : null,
              timezone: avecValeurs ? 'Europe/Paris' : null,
              voiceModel: null,
              city: 'Dakar',
              cityCircle,
            },
      ),
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })),
      findMany: jest.fn<any>(async (args: any) =>
        (args?.where?.blockedUserIds ? [] : args?.where?.id?.in ?? []).map((id: string) => ({
          id,
          role: 'USER',
          birthDate: null,
          isActive: true,
          deletedAt: null,
          deactivatedAt: null,
        })),
      ),
    },
    userRelation: { findUnique: jest.fn<any>(async () => row), findMany: jest.fn<any>(async () => [row]) },
    friendRequest: { findFirst: jest.fn<any>(async () => null), findMany: jest.fn<any>(async () => []) },
    communityMember: { findMany: jest.fn<any>(async () => []) },
  };
}

async function monter(cas: Cas): Promise<FastifyInstance> {
  clearPrivacyPreferencesCache();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prismaDouble(cas) as never);
  (app as unknown as { redis?: unknown }).redis = undefined;
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, type: 'user', userId: LECTEUR, registeredUser: { id: LECTEUR, role: 'USER' } };
    (req as any).user = { userId: LECTEUR };
  });
  await app.register(getUserByEmail);
  await app.register(getUserByPhone);
  await app.ready();
  return app;
}

const PORTES = [
  ['GET /users/email/:email', '/users/email/cible@example.com'],
  ['GET /users/phone/:phone', '/users/phone/33612345678'],
] as const;

describe.each(PORTES)('%s — la ville selon le cercle choisi', (_porte, url) => {
  const lire = async (cas: Cas) => {
    const app = await monter(cas);
    const res = await app.inject({ method: 'GET', url });
    await app.close();
    expect(res.statusCode).toBe(200);
    return res.json().data as Record<string, unknown>;
  };

  it('lecteur Connaissance, ville ouverte aux Amis : ni la ville ni le réglage ne partent', async () => {
    const data = await lire({ niveau: 'ACQUAINTANCE', avecValeurs: true, cityCircle: 'FRIEND' });
    expect('city' in data).toBe(false);
    expect('cityCircle' in data).toBe(false);
  });

  it('lecteur Proche, ville ouverte aux Amis : la ville part, jamais le réglage', async () => {
    const data = await lire({ niveau: 'CLOSE', avecValeurs: true, cityCircle: 'FRIEND' });
    expect(data.city).toBe('Dakar');
    expect('cityCircle' in data).toBe(false);
  });

  it('aucun cercle choisi : personne d autre que la personne ne lit sa ville', async () => {
    const data = await lire({ niveau: 'CLOSE', avecValeurs: true, cityCircle: null });
    expect('city' in data).toBe(false);
    expect('cityCircle' in data).toBe(false);
  });
});
