/**
 * `GET /directory/people/:handle?expand=relation` — l'annonce `acceptsRequests`
 * (#19362) : la fiche dit si son propriétaire accepte une demande de CE lecteur,
 * par la même loi que le refus de l'envoi. Témoins sur un cercle autre que le
 * premier (Connaissance) et sur ce qui part à côté (anonyme, soi, bloqué, Voir comme).
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
  readonly reglagesEnPanne?: boolean;
};

function prismaDouble(row: ReturnType<typeof lien> | null, cible: Cible = {}) {
  return {
    userPreferences: {
      findMany: jest.fn<any>(async () => {
        if (cible.reglagesEnPanne) throw new Error('base indisponible');
        return cible.privacy ? [{ userId: CIBLE, privacy: cible.privacy }] : [];
      }),
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
        args?.where?.blockedUserIds?.has === CIBLE && args?.where?.id === LECTEUR && cible.lecteurBloqueCible
          ? { id: LECTEUR }
          : args?.where?.blockedUserIds || args?.where?.OR
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
    post: { count: jest.fn<any>(async () => 0) },
  };
}

async function monter(viewerId: string | null, row: ReturnType<typeof lien> | null, cible: Cible = {}): Promise<FastifyInstance> {
  clearPrivacyPreferencesCache();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prismaDouble(row, cible) as never);
  (app as unknown as { redis?: unknown }).redis = undefined;
  app.addHook('onRequest', async (req: any) => {
    req.authContext = viewerId
      ? { isAuthenticated: true, type: 'user', userId: viewerId, registeredUser: { id: viewerId, role: 'USER' } }
      : { isAuthenticated: false, isAnonymous: true, type: 'anonymous', userId: 'anonymous' };
  });
  await app.register(directoryPersonRoutes, { prefix: '/api/v1/directory' });
  await app.ready();
  return app;
}

const lire = (app: FastifyInstance, qs: string) =>
  app.inject({ method: 'GET', url: `/api/v1/directory/people/${CIBLE}${qs}` });

type Charge = Record<string, any>;

const BLOQUE = { lecteurBloqueCible: true } as const;
const FERMEE: Cible = { privacy: { allowContactRequests: false } };

describe('#19362 — acceptsRequests sur la fiche', () => {
  it('un lecteur sans lien lit `false` quand la cible ferme les demandes', async () => {
    const app = await monter(LECTEUR, null, FERMEE);
    const data = (await lire(app, '?expand=relation')).json().data as Charge;
    expect(data.relation).toBe('none');
    expect(data.acceptsRequests).toBe(false);
    await app.close();
  });

  it('un lecteur Connaissance lit `true` : la montée reste permise', async () => {
    const app = await monter(LECTEUR, lien('ACQUAINTANCE', 'ACQUAINTANCE'), FERMEE);
    const data = (await lire(app, '?expand=relation')).json().data as Charge;
    expect(data.acceptsRequests).toBe(true);
    await app.close();
  });

  it('réglage ouvert ou absent : `true`', async () => {
    const ouverte = await monter(LECTEUR, null, { privacy: { allowContactRequests: true } });
    expect(((await lire(ouverte, '?expand=relation')).json().data as Charge).acceptsRequests).toBe(true);
    await ouverte.close();
    const absent = await monter(LECTEUR, null);
    expect(((await lire(absent, '?expand=relation')).json().data as Charge).acceptsRequests).toBe(true);
    await absent.close();
  });

  it('la fiche ne sert jamais le réglage lui-même à côté du booléen', async () => {
    const app = await monter(LECTEUR, null, FERMEE);
    const brut = (await lire(app, '?expand=relation,circle,stats')).body;
    expect(brut).not.toMatch(/allowContactRequests/);
    await app.close();
  });

  it('réglages illisibles : la fiche part, sans le champ (l’envoi, lui, reste gardé)', async () => {
    const app = await monter(LECTEUR, null, { ...FERMEE, reglagesEnPanne: true });
    const res = await lire(app, '?expand=relation');
    expect(res.statusCode).toBe(200);
    expect(res.json().data.relation).toBe('none');
    expect('acceptsRequests' in res.json().data).toBe(false);
    await app.close();
  });

  it.each([
    ['anonyme', null, '?expand=relation', {}],
    ['soi', CIBLE, '?expand=relation', {}],
    ['sans expand=relation', LECTEUR, '', {}],
    ['fields ne l’élargit pas', LECTEUR, '?fields=acceptsRequests', {}],
    ['lecteur qui a bloqué la cible', LECTEUR, '?expand=relation', BLOQUE],
    ['Voir comme', CIBLE, '?as=PUBLIC&expand=relation', {}],
  ] as const)('%s : aucun `acceptsRequests`', async (_nom, viewer, qs, extra) => {
    const app = await monter(viewer, null, { ...FERMEE, ...extra });
    const res = await lire(app, qs);
    expect(res.statusCode).toBeLessThan(500);
    if (extra === BLOQUE) expect(res.json().data.blockedByViewer).toBe(true);
    expect(res.body).not.toMatch(/acceptsRequests|allowContactRequests/);
    await app.close();
  });
});
