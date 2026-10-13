/**
 * Revue de conformité O3 (#10506) — la recherche sert un `searchId` OPAQUE
 * et signé (`meta.searchId`) que l'événement `discovery` recopie ; le texte
 * saisi ne quitte jamais la route, et aucun journal ne l'écrit en clair —
 * ni le gestionnaire, ni la journalisation des requêtes lentes ou refusées
 * (qui écrit l'adresse, chaîne de requête comprise).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const logged: unknown[] = [];
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: (...a: unknown[]) => logged.push(a), info: jest.fn(), warn: (...a: unknown[]) => logged.push(a), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({
  ...(jest.requireActual('../../../../utils/logger') as object),
  logError: (...a: unknown[]) => logged.push(a),
  logWarn: (...a: unknown[]) => logged.push(a),
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: async (_viewer: unknown, ids: string[]) =>
      new Map(ids.map((id) => [id, { showOnline: false, showLastSeenTimestamp: false }])),
    resolveForTarget: async () => ({ showOnline: false, showLastSeenTimestamp: false }),
  }),
}));

import { searchUsers } from '../../../../routes/users/preferences';
import { readSearchId } from '../../../../services/social/searchFingerprint';
import { redactReaderFileUrl } from '../../../../utils/redact-reader-file-url';

const MOI = '507f1f77bcf86cd799439011';

function prismaDouble(fail = false) {
  return {
    user: {
      findMany: jest.fn<any>(async () => {
        if (fail) throw new Error('db down');
        return [];
      }),
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })),
      count: jest.fn<any>(async () => 0),
    },
    userPreferences: { findMany: jest.fn<any>(async () => []) },
    userPreference: { findMany: jest.fn<any>(async () => []) },
    friendRequest: { findMany: jest.fn<any>(async () => []) },
  };
}

async function monter(prisma = prismaDouble()): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, type: 'user', userId: MOI, registeredUser: { id: MOI, role: 'USER' } };
    (req as any).user = { userId: MOI, role: 'USER' };
  });
  await searchUsers(app);
  await app.ready();
  return app;
}

describe('GET /users/search — meta.searchId', () => {
  it('sert un searchId signé ; deux saisies équivalentes ont la même empreinte, le texte n’y figure pas', async () => {
    const app = await monter();
    const a = (await app.inject({ method: 'GET', url: '/users/search?q=Alice%20Martin' })).json();
    const b = (await app.inject({ method: 'GET', url: '/users/search?q=%20alice%20%20martin' })).json();
    const c = (await app.inject({ method: 'GET', url: '/users/search?q=Bob' })).json();

    const readA = readSearchId(a.meta.searchId);
    const readB = readSearchId(b.meta.searchId);
    expect(readA).toBeDefined();
    expect(readA?.fingerprint).toBe(readB?.fingerprint);
    expect(readA?.nonce).not.toBe(readB?.nonce);
    expect(readSearchId(c.meta.searchId)?.fingerprint).not.toBe(readA?.fingerprint);
    expect(a.meta.searchId.toLowerCase()).not.toContain('alice');
    await app.close();
  });

  it('une panne ne journalise jamais la requête en clair', async () => {
    logged.length = 0;
    const app = await monter(prismaDouble(true));
    const res = await app.inject({ method: 'GET', url: '/users/search?q=Alice%20Martin' });

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(logged)).not.toMatch(/alice/i);
    await app.close();
  });
});

describe('les journaux d’adresse (requête lente, refus de schéma) taisent le texte cherché', () => {
  it.each([
    ['/api/v1/users/search?q=Alice%20Martin&limit=20', '/api/v1/users/search?q=[redacted]&limit=20'],
    ['/api/v1/communities/search?limit=5&q=club%20de%20foot', '/api/v1/communities/search?limit=5&q=[redacted]'],
    ['/api/v1/conversations/c1/messages/search?q=rendez-vous', '/api/v1/conversations/c1/messages/search?q=[redacted]'],
    ['/api/v1/users/search?query=Alice', '/api/v1/users/search?query=[redacted]'],
  ])('%s', (url, expected) => {
    expect(redactReaderFileUrl(url)).toBe(expected);
  });

  it('une adresse sans recherche traverse intacte', () => {
    expect(redactReaderFileUrl('/api/v1/posts?limit=20&cursor=abc')).toBe('/api/v1/posts?limit=20&cursor=abc');
  });
});

describe('SEARCH_FINGERPRINT_SECRET — fail-closed sans casser la recherche', () => {
  it('en production sans secret : aucune empreinte calculée, la recherche répond quand même', async () => {
    const { issueSearchId: issue } = await import('../../../../services/social/searchFingerprint');
    const env = { ...process.env };
    process.env.NODE_ENV = 'production';
    delete process.env.SEARCH_FINGERPRINT_SECRET;
    try {
      expect(issue('Alice')).toBeUndefined();
      const app = await monter();
      const res = await app.inject({ method: 'GET', url: '/users/search?q=Alice' });
      expect(res.statusCode).toBe(200);
      expect(res.json().meta?.searchId).toBeUndefined();
      await app.close();
    } finally {
      process.env = env;
    }
  });
});
