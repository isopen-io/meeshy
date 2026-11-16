/**
 * `GET /directory/people/:handle` — la fiche par cercle (#18861).
 *
 * `?expand=circle` rend la relation et l'état de chaque capacité ; `?as=<cercle>`,
 * réservé au PROPRIÉTAIRE, rend la fiche telle que ce cercle la voit, par la MÊME
 * loi. Fuseau et pays d'inscription ne partent que selon le cercle.
 *
 * Les témoins s'écrivent sur un cercle AUTRE que le premier (Ami, Connaissance) et
 * mesurent ce qui part À CÔTÉ d'un état fermé : tout passe par `app.inject`, donc
 * par le VRAI sérialiseur.
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

function prismaDouble(row: ReturnType<typeof lien> | null) {
  return {
    user: {
      findMany: jest.fn<any>(async (args: any) =>
        (args?.where?.blockedUserIds ? [] : args?.where?.id?.in ?? []).map((id: string) => ({ id, role: 'USER', birthDate: null, isActive: true, deletedAt: null, deactivatedAt: null })),
      ),
      findFirst: jest.fn<any>(async (args?: any) =>
        args?.where?.blockedUserIds
          ? null
          : {
              id: CIBLE,
              username: 'cible',
              role: 'USER',
              isOnline: true,
              lastActiveAt: new Date(),
              deactivatedAt: null,
              createdAt: new Date('2025-01-01T00:00:00Z'),
              registrationCountry: 'FR',
              timezone: 'Europe/Paris',
              voiceModel: null,
            },
      ),
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [], createdAt: new Date('2025-01-01') })),
    },
    userRelation: { findUnique: jest.fn<any>(async () => row), findMany: jest.fn<any>(async () => (row ? [row] : [])) },
    friendRequest: { findFirst: jest.fn<any>(async () => null), findMany: jest.fn<any>(async () => []), count: jest.fn<any>(async () => 0) },
    communityMember: { findMany: jest.fn<any>(async () => []) },
    message: { count: jest.fn<any>(async () => 0), groupBy: jest.fn<any>(async () => []) },
    participant: { findMany: jest.fn<any>(async () => []), count: jest.fn<any>(async () => 0) },
    post: { count: jest.fn<any>(async () => 0) },
  };
}

async function monter(viewerId: string | null, row: ReturnType<typeof lien> | null): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prismaDouble(row) as never);
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

describe('?expand=circle — ce que le cercle du lecteur ouvre', () => {
  it('un lecteur AMI reçoit la relation, la présence ouverte et la détaillée fermée par Proche', async () => {
    const app = await monter(LECTEUR, lien('FRIEND', 'FRIEND'));
    const data = (await lire(app, '?expand=circle')).json().data as Charge;
    expect(data.circle.level).toBe('FRIEND');
    expect(data.circle.grantedByViewer).toBe('FRIEND');
    expect(data.circle.missing).toEqual({ level: 'CLOSE', byViewer: true, byTarget: true });
    expect(data.circle.capabilities.presence.state).toBe('open');
    expect(data.circle.capabilities.presenceDetailed).toMatchObject({ state: 'locked', circle: 'CLOSE' });
    await app.close();
  });

  it('un état fermé ne porte QUE state, circle, consentRequired — jamais la valeur ni un champ voisin', async () => {
    const app = await monter(LECTEUR, lien('FRIEND', 'FRIEND'));
    const data = (await lire(app, '?expand=circle')).json().data as Charge;
    for (const state of Object.values<Charge>(data.circle.capabilities)) {
      expect(Object.keys(state).sort()).toEqual(['circle', 'consentRequired', 'state']);
    }
    await app.close();
  });

  it('sans l expansion, la charge ne porte pas `circle` (ancien client inchangé)', async () => {
    const app = await monter(LECTEUR, lien('FRIEND', 'FRIEND'));
    const data = (await lire(app, '')).json().data as Charge;
    expect('circle' in data).toBe(false);
    await app.close();
  });

  it('un lecteur anonyme est refusé comme avant', async () => {
    const app = await monter(null, null);
    expect((await lire(app, '?expand=circle')).statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });
});

describe('fuseau et pays d inscription servis selon le cercle', () => {
  it('Connaissance : ni pays ni fuseau', async () => {
    const app = await monter(LECTEUR, lien('ACQUAINTANCE', 'ACQUAINTANCE'));
    const data = (await lire(app, '')).json().data as Charge;
    expect(data.registrationCountry ?? null).toBeNull();
    expect(data.timezone ?? null).toBeNull();
    await app.close();
  });

  it('Ami : le pays, pas le fuseau', async () => {
    const app = await monter(LECTEUR, lien('FRIEND', 'FRIEND'));
    const data = (await lire(app, '')).json().data as Charge;
    expect(data.registrationCountry).toBe('FR');
    expect(data.timezone ?? null).toBeNull();
    await app.close();
  });

  it('Proche : le pays ET le fuseau', async () => {
    const app = await monter(LECTEUR, lien('CLOSE', 'CLOSE'));
    const data = (await lire(app, '')).json().data as Charge;
    expect(data.registrationCountry).toBe('FR');
    expect(data.timezone).toBe('Europe/Paris');
    await app.close();
  });

  it('une demande d un seul côté Proche reste au niveau Ami : pas de fuseau', async () => {
    const app = await monter(LECTEUR, lien('CLOSE', 'FRIEND'));
    const data = (await lire(app, '')).json().data as Charge;
    expect(data.timezone ?? null).toBeNull();
    await app.close();
  });

  it('`fields=` ne lève pas la garde : demander le fuseau à un Ami ne le sert pas', async () => {
    const app = await monter(LECTEUR, lien('FRIEND', 'FRIEND'));
    const data = (await lire(app, '?fields=timezone')).json().data as Charge;
    expect(data.timezone ?? null).toBeNull();
    await app.close();
  });

  it('le propriétaire lit les siens', async () => {
    const app = await monter(CIBLE, null);
    const data = (await lire(app, '')).json().data as Charge;
    expect(data.registrationCountry).toBe('FR');
    expect(data.timezone).toBe('Europe/Paris');
    await app.close();
  });
});

describe('?as=<cercle> — « Voir comme », réservé au propriétaire', () => {
  it('le propriétaire voit sa fiche comme un AMI : pays oui, fuseau non, présence détaillée fermée', async () => {
    const app = await monter(CIBLE, null);
    const data = (await lire(app, '?as=FRIEND&expand=circle,presence')).json().data as Charge;
    expect(data.registrationCountry).toBe('FR');
    expect(data.timezone ?? null).toBeNull();
    expect(data.circle.level).toBe('FRIEND');
    expect(data.circle.capabilities.presenceDetailed.state).toBe('locked');
    expect(data.lastActiveAt ?? null).toBeNull();
    await app.close();
  });

  it('le propriétaire voit sa fiche comme une CONNAISSANCE : ni pays ni fuseau ni présence', async () => {
    const app = await monter(CIBLE, null);
    const data = (await lire(app, '?as=ACQUAINTANCE&expand=circle,presence')).json().data as Charge;
    expect(data.registrationCountry ?? null).toBeNull();
    expect(data.timezone ?? null).toBeNull();
    expect(data.isOnline ?? null).toBeNull();
    await app.close();
  });

  it('comme un PROCHE : tout ce que Proche ouvre', async () => {
    const app = await monter(CIBLE, null);
    const data = (await lire(app, '?as=CLOSE&expand=circle')).json().data as Charge;
    expect(data.timezone).toBe('Europe/Paris');
    expect(data.circle.capabilities.presenceDetailed.state).toBe('open');
    await app.close();
  });

  it('« Voir comme » ne sert jamais les compteurs intimes, même au propriétaire', async () => {
    const app = await monter(CIBLE, null);
    const stats = (await lire(app, '?as=FRIEND&expand=stats')).json().data.stats as Charge;
    expect('totalMessages' in stats).toBe(false);
    await app.close();
  });

  it('un autre lecteur qui passe `as` est refusé (403), sans rien servir', async () => {
    const app = await monter(LECTEUR, lien('BLOOD', 'BLOOD'));
    const res = await lire(app, '?as=BLOOD');
    expect(res.statusCode).toBe(403);
    expect(JSON.stringify(res.json())).not.toContain('Europe/Paris');
    await app.close();
  });

  it('un cercle inconnu est refusé (400)', async () => {
    const app = await monter(CIBLE, null);
    expect((await lire(app, '?as=TOUT')).statusCode).toBe(400);
    await app.close();
  });
});
