/**
 * Unit tests for users presence route (presence.ts)
 * Tests GET /users/presence.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { getUsersPresence } from '../../../../routes/users/presence';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID_1 = '507f1f77bcf86cd799439011';
const USER_ID_2 = '507f1f77bcf86cd799439022';
const CURRENT_USER_ID = '507f1f77bcf86cd799439099';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    ...overrides,
  } as any;
}

function makePresenceChecker(onlineIds: string[] = []) {
  return {
    bulk: jest.fn<any>((ids: string[]) => {
      const map = new Map<string, boolean>();
      for (const id of ids) {
        map.set(id, onlineIds.includes(id));
      }
      return map;
    }),
  };
}

async function buildApp(opts: {
  auth?: 'authenticated' | 'unauthenticated';
  prisma?: ReturnType<typeof makePrisma>;
  presenceChecker?: ReturnType<typeof makePresenceChecker> | null;
  // Rôle du viewer, tel que porté par `authContext.registeredUser.role` en
  // production (`viewerFromAuthContext` exige aussi `type: 'user'`). Absent
  // par défaut : reproduit le fixture historique (authContext sans `type`),
  // que `viewerFromAuthContext` traite comme non-enregistré.
  viewerRole?: string;
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const { auth = 'authenticated', prisma = makePrisma(), presenceChecker = makePresenceChecker(), viewerRole } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('presenceChecker', presenceChecker);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = auth === 'authenticated'
      ? {
          isAuthenticated: true,
          userId: CURRENT_USER_ID,
          registeredUser: { id: CURRENT_USER_ID, ...(viewerRole ? { role: viewerRole } : {}) },
          ...(viewerRole ? { type: 'user' } : {}),
        }
      : { isAuthenticated: false, registeredUser: null };
  });

  await getUsersPresence(app);
  await app.ready();
  return { app, prisma };
}

// ─── GET /users/presence ───────────────────────────────────────────────────────

describe('GET /users/presence — missing ids param', () => {
  it('returns 400 when ids param is omitted', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/users/presence?ids=' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /users/presence — too many ids', () => {
  it('returns 400 when more than 200 ids are provided', async () => {
    const { app } = await buildApp();
    const ids = Array.from({ length: 201 }, (_, i) => `id${i}`).join(',');
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${ids}` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /users/presence — presenceChecker not mounted', () => {
  it('returns 200 with all users offline when presenceChecker is null', async () => {
    const { app } = await buildApp({ presenceChecker: null });
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${USER_ID_1},${USER_ID_2}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /users/presence — success with online users', () => {
  it('returns 200 with presence data for each id', async () => {
    const prisma = makePrisma();
    prisma.user.findMany = jest.fn<any>().mockResolvedValue([
      { id: USER_ID_1, lastActiveAt: new Date('2024-01-01') },
    ]);
    const checker = makePresenceChecker([USER_ID_1]);
    const { app } = await buildApp({ prisma, presenceChecker: checker });
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${USER_ID_1},${USER_ID_2}` });
    expect(res.statusCode).toBe(200);
    expect(checker.bulk).toHaveBeenCalledWith([USER_ID_1, USER_ID_2]);
    await app.close();
  });

  it('deduplicates repeated ids', async () => {
    const checker = makePresenceChecker();
    const { app } = await buildApp({ presenceChecker: checker });
    const res = await app.inject({
      method: 'GET', url: `/users/presence?ids=${USER_ID_1},${USER_ID_1}`,
    });
    expect(res.statusCode).toBe(200);
    expect(checker.bulk).toHaveBeenCalledWith([USER_ID_1]);
    await app.close();
  });
});

describe('GET /users/presence — DB error', () => {
  it('returns 500 on unexpected error', async () => {
    const prisma = makePrisma();
    prisma.user.findMany = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${USER_ID_1}` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── Anonymes : directive produit 2026-08-25 ───────────────────────────────────
// « Personne ne doit savoir ma dernière connexion si on n'est pas ami » — un
// participant anonyme n'a jamais d'ami : sa présence sort BRUTE aujourd'hui
// (`vis` absent de `visibilityMap`, qui ne couvre que les `users`), ce que
// cette section verrouille comme une fuite. Seul un administrateur global
// (ADMIN/BIGBOSS) doit continuer à la voir.

const ANON_PARTICIPANT_ID = '507f1f77bcf86cd799439033';

function makeAnonParticipantPrisma(lastActiveAt: Date | null = new Date('2024-01-01')) {
  return makePrisma({
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([{ id: ANON_PARTICIPANT_ID, lastActiveAt }]),
    },
  });
}

describe('GET /users/presence — anonymous participant presence', () => {
  it('hides an anonymous participant from a non-admin registered viewer', async () => {
    const prisma = makeAnonParticipantPrisma();
    const checker = makePresenceChecker([ANON_PARTICIPANT_ID]);
    const { app } = await buildApp({ prisma, presenceChecker: checker, viewerRole: 'USER' });
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${ANON_PARTICIPANT_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.users).toEqual([
      { userId: ANON_PARTICIPANT_ID, isOnline: false, lastActiveAt: null },
    ]);
    await app.close();
  });

  it('hides an anonymous participant from a MODERATOR viewer — MODERATOR is not privileged since 2026-08-25', async () => {
    const prisma = makeAnonParticipantPrisma();
    const checker = makePresenceChecker([ANON_PARTICIPANT_ID]);
    const { app } = await buildApp({ prisma, presenceChecker: checker, viewerRole: 'MODERATOR' });
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${ANON_PARTICIPANT_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.users).toEqual([
      { userId: ANON_PARTICIPANT_ID, isOnline: false, lastActiveAt: null },
    ]);
    await app.close();
  });

  it('hides an anonymous participant from an unauthenticated viewer', async () => {
    const prisma = makeAnonParticipantPrisma();
    const checker = makePresenceChecker([ANON_PARTICIPANT_ID]);
    const { app } = await buildApp({ prisma, presenceChecker: checker, auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${ANON_PARTICIPANT_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.users).toEqual([
      { userId: ANON_PARTICIPANT_ID, isOnline: false, lastActiveAt: null },
    ]);
    await app.close();
  });

  it('shows an anonymous participant to ADMIN/BIGBOSS viewers (directive: "Admin et supérieur")', async () => {
    const lastActiveAt = new Date('2024-01-01');
    for (const role of ['ADMIN', 'BIGBOSS']) {
      const prisma = makeAnonParticipantPrisma(lastActiveAt);
      const checker = makePresenceChecker([ANON_PARTICIPANT_ID]);
      const { app } = await buildApp({ prisma, presenceChecker: checker, viewerRole: role });
      const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${ANON_PARTICIPANT_ID}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.users).toEqual([
        { userId: ANON_PARTICIPANT_ID, isOnline: true, lastActiveAt: lastActiveAt.toISOString() },
      ]);
      await app.close();
    }
  });
});
