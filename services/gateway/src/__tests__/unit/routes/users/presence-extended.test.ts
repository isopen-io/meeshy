/**
 * Extended tests for presence.ts — covers the branch where ids deduplication
 * results in an empty array (line 68: ids.length === 0 after split+filter).
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CURRENT_USER_ID = '507f1f77bcf86cd799439099';

function makePrisma(opts: { users?: Array<{ id: string; lastActiveAt: Date | null }> } = {}) {
  return {
    user: {
      // Le double DISCRIMINE sur le `where` — il ne peut pas rendre la même
      // chose à toutes les questions. `resolveForTargets` interroge deux fois
      // `user.findMany` : les lignes cibles, puis celles qui ont BLOQUÉ le
      // lecteur (`blockedUserIds: { has: … }`). Un double aveugle rendait la
      // même liste aux deux, donc « tout le monde a bloqué le lecteur », donc
      // tout masqué — et le témoin mesurait alors un blocage imaginaire au
      // lieu de la propriété qu'il nomme.
      findMany: jest.fn<any>(async (args: any) =>
        args?.where?.blockedUserIds ? [] : (opts.users ?? [])
      ),
      findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
    },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

async function buildApp(opts: {
  presenceChecker?: any;
  users?: Array<{ id: string; lastActiveAt: Date | null }>;
} = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma({ users: opts.users }));
  app.decorate('presenceChecker', opts.presenceChecker ?? null);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    // La forme RÉELLE d'un contexte authentifié : `type` et `registeredUser`
    // COMPRIS. `viewerFromAuthContext` exige les trois — sans eux le viewer
    // est `null`, donc TOUT est masqué, et ce double rendait donc les témoins
    // aveugles à la loi de présence qu'ils traversent.
    (req as any).authContext = {
      isAuthenticated: true,
      type: 'user',
      userId: CURRENT_USER_ID,
      registeredUser: { id: CURRENT_USER_ID, role: 'USER' },
    };
  });

  await getUsersPresence(app);
  await app.ready();
  return app;
}

// ─── Line 68: ids deduplication results in empty array ────────────────────────

describe('GET /users/presence — ids is comma-only (empty after dedup)', () => {
  it('returns 200 with empty users array when ids contains only commas', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/users/presence?ids=,%2C' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.users).toEqual([]);
    await app.close();
  });

  it('returns 200 with empty users when ids is a single whitespace-trimmed empty value', async () => {
    const app = await buildApp();
    // ?ids=, → splits to ['', ''] → filter removes both → empty array
    const res = await app.inject({ method: 'GET', url: '/users/presence?ids=,' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.users).toEqual([]);
    await app.close();
  });
});

// ─── Line 104: presenceMap.get(id) ?? false right-side branch ─────────────────

describe('GET /users/presence — sparse presenceMap (line 104 ?? false)', () => {
  it('returns isOnline:false for ids absent from the presenceChecker Map', async () => {
    // Le lecteur regarde SA PROPRE présence, et celle d'un id qu'il n'a pas le
    // droit de voir. Ce témoin porte sur le repli `?? false` du checker, pas
    // sur la visibilité : il visait auparavant deux inconnus, et ne passait au
    // vert que par la branche FAIL-OPEN que #4164 vient de fermer — un id
    // absent de la carte y retombait sur la présence runtime BRUTE.
    //
    // Soi est le seul cas où la loi du 2026-08-25 sert la présence sans
    // dépendre d'une amitié. La propriété mesurée est donc intacte, et le
    // témoin ne s'appuie plus sur un défaut pour l'atteindre.
    const USER_A = CURRENT_USER_ID;
    const USER_B = '507f1f77bcf86cd799439022';

    // presenceChecker.bulk returns a Map that only includes USER_A (USER_B absent)
    const sparsePresenceChecker = {
      bulk: jest.fn<any>().mockReturnValue(new Map([[USER_A, true]])),
    };

    const app = await buildApp({
      presenceChecker: sparsePresenceChecker,
      users: [{ id: USER_A, lastActiveAt: null }],
    });
    const res = await app.inject({
      method: 'GET',
      url: `/users/presence?ids=${USER_A},${USER_B}`,
    });
    expect(res.statusCode).toBe(200);
    const users = res.json().data.users as Array<{ userId: string; isOnline: boolean }>;
    const userA = users.find(u => u.userId === USER_A);
    const userB = users.find(u => u.userId === USER_B);
    expect(userA?.isOnline).toBe(true);
    // USER_B absent from presenceMap → Map.get() returns undefined → ?? false
    expect(userB?.isOnline).toBe(false);
    await app.close();
  });
});
