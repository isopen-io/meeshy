/**
 * Retrouver des comptes par carnet d'adresses est BORNÉ en identifiants (#8104).
 *
 * Les trois portes (`/users/me/contacts/match`, `/users/me/contacts/sync`,
 * `PUT`/`PATCH /directory/contacts`) acceptaient 2000 contacts × 25
 * identifiants par appel sous le seul plafond global de requêtes : un annuaire
 * inversé à grande échelle. Elles partagent désormais UN seau d'identifiants
 * par compte : une synchronisation légitime d'un gros carnet passe, un balayage
 * répété est refusé en 429 dans l'enveloppe `sendError`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({
  ...(jest.requireActual('../../../../utils/logger') as object),
  logError: jest.fn(),
  logWarn: jest.fn(),
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: async (_viewer: unknown, ids: string[]) =>
      new Map(ids.map((id) => [id, { showOnline: false, showLastSeenTimestamp: false }])),
  }),
}));

import { matchContacts } from '../../../../routes/users/contacts-match';
import { syncContactsDirectory } from '../../../../routes/users/contacts-directory';
import { directoryContactsRoutes } from '../../../../routes/directory/contacts';
import {
  CONTACT_IDENTIFIER_BUDGET,
  CONTACT_IDENTIFIER_BUDGET_CODE,
} from '../../../../utils/contact-identifier-budget';

const MOI = '507f1f77bcf86cd799439011';

function prismaDouble() {
  return {
    user: {
      findMany: jest.fn<any>(async () => []),
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })),
    },
    userContact: {
      upsert: jest.fn<any>(async () => ({})),
      deleteMany: jest.fn<any>(async () => ({ count: 0 })),
    },
    userPreferences: { findMany: jest.fn<any>(async () => []) },
    userPreference: { findMany: jest.fn<any>(async () => []) },
    friendRequest: { findMany: jest.fn<any>(async () => []) },
  };
}

async function monter(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prismaDouble() as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true, type: 'user', userId: MOI,
      registeredUser: { id: MOI, role: 'USER' },
    };
  });
  await matchContacts(app);
  await syncContactsDirectory(app);
  await app.register(directoryContactsRoutes, { prefix: '/directory' });
  await app.ready();
  return app;
}

/** Un lot de `taille` contacts, `parContact` e-mails chacun, uniques par `graine`. */
function lot(graine: string, taille: number, parContact = 1) {
  return Array.from({ length: taille }, (_, i) => ({
    displayName: `Contact ${i}`,
    emails: Array.from({ length: parContact }, (_, j) => `${graine}-${i}-${j}@exemple.fr`),
  }));
}

describe('un gros carnet légitime passe', () => {
  it('5 000 contacts à 3 identifiants, en lots de 2 000, sont tous synchronisés', async () => {
    const app = await monter();
    const tailles = [2000, 2000, 1000];

    const statuts = [];
    for (const [index, taille] of tailles.entries()) {
      const res = await app.inject({
        method: 'PUT',
        url: '/directory/contacts',
        payload: { contacts: lot(`carnet${index}`, taille, 3), isFinalBatch: index === tailles.length - 1 },
      });
      statuts.push(res.statusCode);
    }

    expect(statuts).toEqual([200, 200, 200]);
    await app.close();
  });
});

describe('un balayage répété est refusé', () => {
  it('au-delà du seau horaire, match répond 429 dans l’enveloppe sendError', async () => {
    const app = await monter();
    const lotsPourVider = Math.ceil(CONTACT_IDENTIFIER_BUDGET.perHour / 2000);

    for (let i = 0; i < lotsPourVider; i += 1) {
      const ok = await app.inject({ method: 'POST', url: '/users/me/contacts/match', payload: { contacts: lot(`s${i}`, 2000) } });
      expect(ok.statusCode).toBe(200);
    }
    const refus = await app.inject({ method: 'POST', url: '/users/me/contacts/match', payload: { contacts: lot('trop', 1) } });

    expect(refus.statusCode).toBe(429);
    expect(refus.json()).toMatchObject({ success: false, code: CONTACT_IDENTIFIER_BUDGET_CODE });
    expect(typeof refus.json().error).toBe('string');
    expect(Number(refus.headers['retry-after'])).toBeGreaterThan(0);
    await app.close();
  });

  it('le seau est PARTAGÉ : épuisé par match, il ferme aussi sync et /directory/contacts', async () => {
    const app = await monter();
    const lotsPourVider = Math.ceil(CONTACT_IDENTIFIER_BUDGET.perHour / 2000);
    for (let i = 0; i < lotsPourVider; i += 1) {
      await app.inject({ method: 'POST', url: '/users/me/contacts/match', payload: { contacts: lot(`p${i}`, 2000) } });
    }

    const sync = await app.inject({ method: 'POST', url: '/users/me/contacts/sync', payload: { contacts: lot('x', 1) } });
    const patch = await app.inject({ method: 'PATCH', url: '/directory/contacts', payload: { contacts: lot('y', 1) } });

    expect(sync.statusCode).toBe(429);
    expect(patch.statusCode).toBe(429);
    await app.close();
  });

  it('un lot compte ses IDENTIFIANTS, pas sa requête : 800 contacts × 25 e-mails épuisent le seau en un appel', async () => {
    const app = await monter();

    const premier = await app.inject({ method: 'POST', url: '/users/me/contacts/match', payload: { contacts: lot('lourd', 800, 25) } });
    const second = await app.inject({ method: 'POST', url: '/users/me/contacts/match', payload: { contacts: lot('encore', 1) } });

    expect(premier.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    await app.close();
  });

  it('un carnet vide ne coûte rien', async () => {
    const app = await monter();
    const statuts = [];
    for (let i = 0; i < 5; i += 1) {
      statuts.push((await app.inject({ method: 'POST', url: '/users/me/contacts/match', payload: { contacts: [] } })).statusCode);
    }
    expect(statuts.every((s) => s === 200)).toBe(true);
    await app.close();
  });
});
