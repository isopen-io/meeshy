/**
 * #8959 — synchroniser un carnet qui porte au moins une fiche crédite
 * `social.contacts_synced` (une fois par compte, tenu par le moteur) ; un lot
 * vide ne crédite rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

jest.mock('../../../../utils/logger', () => ({
  ...(jest.requireActual('../../../../utils/logger') as object),
  logError: jest.fn(),
}));

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

const recordActivity = jest.fn<any>(async () => undefined);
jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn<any>().mockImplementation(() => ({ recordActivity })),
}));

import { syncContactsDirectory } from '../../../../routes/users/contacts-directory';

const MOI = '507f1f77bcf86cd799439011';

async function synchroniser(contacts: unknown[]) {
  recordActivity.mockClear();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    userPreferences: { findMany: jest.fn<any>(async () => []) },
    userPreference: { findMany: jest.fn<any>(async () => []) },
    user: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
    },
    userContact: {
      upsert: jest.fn<any>().mockImplementation(async (args: unknown) => args),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
  } as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, type: 'user', userId: MOI, registeredUser: { id: MOI, role: 'USER' } };
  });
  await syncContactsDirectory(app);
  await app.ready();
  const res = await app.inject({ method: 'POST', url: '/users/me/contacts/sync', payload: { contacts } });
  await app.close();
  return res.statusCode;
}

describe('#8959 — `social.contacts_synced`', () => {
  it('crédite le propriétaire quand au moins une fiche est synchronisée', async () => {
    expect(await synchroniser([{ displayName: 'Awa', emails: ['awa@test.com'] }])).toBe(200);

    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(recordActivity).toHaveBeenCalledWith(MOI, 'social.contacts_synced');
  });

  it('ne crédite rien pour un carnet vide', async () => {
    expect(await synchroniser([])).toBe(200);

    expect(recordActivity).not.toHaveBeenCalled();
  });
});
