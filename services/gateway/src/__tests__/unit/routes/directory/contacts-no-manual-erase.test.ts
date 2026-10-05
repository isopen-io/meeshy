/**
 * Aucun effacement MANUEL du carnet d'adresses (#8284).
 *
 * Décision porteur (2026-09-27) : le carnet synchronisé s'efface à la
 * suppression du compte (`purgeAccountIsolatedData` → `eraseAddressBookOf`),
 * jamais par un geste à part. `DELETE /directory/contacts` n'est donc plus
 * servi, et un appel ne retire rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({
  ...(jest.requireActual('../../../../utils/logger') as object),
  logError: jest.fn(),
}));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined, consume: async () => null }),
}));

import { directoryContactsRoutes } from '../../../../routes/directory/contacts';

const PREFIXE = '/api/v1/directory';
const MOI = '507f1f77bcf86cd799439011';

const table = () => ({ deleteMany: jest.fn(async () => ({ count: 1 })) });

async function monter() {
  const userContact = table();
  const contactJoinNotice = table();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', { userContact, contactJoinNotice } as never);
  app.decorate('authenticate', async (req: { authContext?: unknown }) => {
    req.authContext = { isAuthenticated: true, type: 'user', userId: MOI, registeredUser: { id: MOI, role: 'USER' } };
  });
  await app.register(directoryContactsRoutes, { prefix: PREFIXE });
  await app.ready();
  return { app, userContact, contactJoinNotice };
}

describe("Plus d'effacement manuel du carnet (#8284)", () => {
  it("DELETE /directory/contacts n'est plus servi et ne retire rien", async () => {
    const { app, userContact, contactJoinNotice } = await monter();

    const res = await app.inject({ method: 'DELETE', url: `${PREFIXE}/contacts` });

    expect(res.statusCode).toBe(404);
    expect(userContact.deleteMany).not.toHaveBeenCalled();
    expect(contactJoinNotice.deleteMany).not.toHaveBeenCalled();
    await app.close();
  });
});
