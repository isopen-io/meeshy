/**
 * La présence échoue FERMÉ (#4164).
 *
 * `GET /users/presence` traitait une entrée ABSENTE de la carte de visibilité
 * en servant la présence runtime BRUTE — l'inverse exact de la règle du
 * 2026-08-25, qui dit qu'une entrée absente vaut masquée sauf pour
 * ADMIN/BIGBOSS.
 *
 * ## Le témoin porte sur un id ABSENT, jamais sur un id REFUSÉ
 *
 * C'est la subtilité de placement, et elle décide tout : un id présent dans la
 * carte avec `showOnline: false` emprunte l'AUTRE branche — celle qui a
 * toujours été correcte — et un témoin posé là passerait au vert sans rien
 * prouver. Seul un id que la carte ne contient pas exerce le repli.
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

import { directoryPresenceRoutes } from '../../../../routes/directory/presence';

const PREFIXE = '/api/v1/directory';
const LECTEUR = '507f1f77bcf86cd799439099';
/** Un id que RIEN ne résout : ni `User`, ni `Participant` anonyme. */
const INCONNU = '507f1f77bcf86cd799439011';
const ANONYME = '507f1f77bcf86cd799439033';

function prismaDouble(opts: { users?: Array<{ id: string; lastActiveAt: Date | null }> } = {}) {
  return {
    user: {
      // Discrimine sur le `where` : la seconde requête de `resolveForTargets`
      // demande qui a BLOQUÉ le lecteur, et un double aveugle répondrait
      // « tout le monde ».
      findMany: jest.fn<any>(async (args: any) =>
        args?.where?.blockedUserIds ? [] : (opts.users ?? [])
      ),
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })),
    },
    participant: {
      findMany: jest.fn<any>(async () => [{ id: ANONYME, lastActiveAt: new Date('2026-08-01T10:00:00Z') }]),
    },
    friendRequest: { findMany: jest.fn<any>(async () => []) },
  };
}

async function monter(opts: {
  enLigne: string[];
  role?: string;
  users?: Array<{ id: string; lastActiveAt: Date | null }>;
}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prismaDouble({ users: opts.users }) as never);
  app.decorate('presenceChecker', {
    bulk: (ids: readonly string[]) => new Map(ids.map((id) => [id, opts.enLigne.includes(id)])),
  } as never);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      type: 'user',
      userId: LECTEUR,
      registeredUser: { id: LECTEUR, role: opts.role ?? 'USER' },
    };
  });
  await app.register(directoryPresenceRoutes, { prefix: PREFIXE });
  await app.ready();
  return app;
}

const lire = (app: FastifyInstance, ids: string) =>
  app.inject({ method: 'GET', url: `${PREFIXE}/presence?ids=${ids}` });

describe('Un id ABSENT de la carte de visibilité est MASQUÉ', () => {
  it("ne sert pas la présence runtime d'un inconnu, même s'il est en ligne", async () => {
    // `INCONNU` n'est résolu par aucune requête : ni utilisateur, ni
    // participant anonyme. Il ne peut donc pas figurer dans la carte — c'est
    // exactement l'entrée que l'ancienne branche servait en clair.
    const app = await monter({ enLigne: [INCONNU] });

    const res = await lire(app, INCONNU);

    expect(res.statusCode).toBe(200);
    const [servi] = res.json().data.users as Array<{ isOnline: boolean; lastActiveAt: string | null }>;
    expect(servi.isOnline).toBe(false);
    expect(servi.lastActiveAt).toBeNull();
    await app.close();
  });

  it("ne sert pas non plus la dernière activité d'un participant ANONYME", async () => {
    // Un anonyme n'a ni ami ni compte : il n'apparaît jamais dans la carte, et
    // son sort est donc celui du repli — pas une branche à lui.
    const app = await monter({ enLigne: [ANONYME] });

    const [servi] = (await lire(app, ANONYME)).json().data.users as Array<{ isOnline: boolean; lastActiveAt: string | null }>;

    expect(servi.isOnline).toBe(false);
    expect(servi.lastActiveAt).toBeNull();
    await app.close();
  });

  it("l'ADMINISTRATION, elle, voit l'entrée absente — le repli n'est pas un masque universel", async () => {
    const app = await monter({ enLigne: [INCONNU], role: 'ADMIN' });

    const [servi] = (await lire(app, INCONNU)).json().data.users as Array<{ isOnline: boolean }>;

    expect(servi.isOnline).toBe(true);
    await app.close();
  });
});

describe('Le lecteur voit SA propre présence', () => {
  it('sert soi-même — sans quoi la garde masquerait tout le monde, y compris à soi', async () => {
    const app = await monter({
      enLigne: [LECTEUR],
      users: [{ id: LECTEUR, lastActiveAt: new Date('2026-08-01T10:00:00Z') }],
    });

    const [servi] = (await lire(app, LECTEUR)).json().data.users as Array<{ isOnline: boolean; lastActiveAt: string | null }>;

    expect(servi.isOnline).toBe(true);
    expect(servi.lastActiveAt).not.toBeNull();
    await app.close();
  });
});

describe('La borne anti-moisson', () => {
  it('refuse au-delà de 200 ids', async () => {
    const app = await monter({ enLigne: [] });
    const ids = Array.from({ length: 201 }, (_, i) => `id${i}`).join(',');

    const res = await lire(app, ids);

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('exige le paramètre', async () => {
    const app = await monter({ enLigne: [] });

    expect((await app.inject({ method: 'GET', url: `${PREFIXE}/presence?ids=` })).statusCode).toBe(400);
    await app.close();
  });
});
