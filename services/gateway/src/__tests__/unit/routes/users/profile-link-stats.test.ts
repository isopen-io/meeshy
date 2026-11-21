/**
 * `GET /users/me/profile-link/stats` (#19206, chantier #18857) : le billet « Mon lien » lit
 * ses visites du jour, du mois et sa série de trente jours. Le propriétaire seul : un autre
 * compte ne lit que les siennes, un lecteur sans compte ne lit rien (404 générique), et la
 * réponse ne se garde dans aucun cache. Tout passe par `app.inject`, donc par le VRAI sérialiseur.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }) },
}));

import { profileLinkStatsRoutes } from '../../../../routes/users/profile-link-stats';

const OWNER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439022';
const TODAY = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

type Actor = 'owner' | 'other' | 'guest';

async function read(actor: Actor) {
  const findMany = jest.fn(async (args: any) => (args.where.userId === OWNER ? [{ day: TODAY(), visits: 57 }] : []));
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', { profileLinkVisitDay: { findMany } } as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = actor === 'guest'
      ? { isAuthenticated: true, type: 'session', userId: 'participant-1', registeredUser: null }
      : { isAuthenticated: true, type: 'user', userId: actor === 'owner' ? OWNER : OTHER, registeredUser: { id: actor === 'owner' ? OWNER : OTHER, role: 'USER' } };
  });
  await app.register(profileLinkStatsRoutes);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: '/users/me/profile-link/stats' });
  await app.close();
  return { res, findMany };
}

describe('GET /users/me/profile-link/stats', () => {
  it('rend au propriétaire ses visites du jour, du mois et trente jours de série, sans cache', async () => {
    const { res, findMany } = await read('owner');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    const { data } = res.json();
    expect(data.today).toBe(57);
    expect(data.month).toBe(57);
    expect(data.series).toHaveLength(30);
    expect(data.series[29]).toEqual({ day: TODAY().toISOString().slice(0, 10), visits: 57 });
    expect((findMany.mock.calls[0] as [any])[0].where.userId).toBe(OWNER);
  });

  it("un autre compte ne lit que les siennes : rien de celles du propriétaire ne lui part", async () => {
    const { res, findMany } = await read('other');
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ today: 0, month: 0 });
    expect(findMany.mock.calls.every((call) => (call as [any])[0].where.userId === OTHER)).toBe(true);
  });

  it('un lecteur sans compte reçoit le 404 générique et ne déclenche aucune lecture', async () => {
    const { res, findMany } = await read('guest');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false });
    expect(findMany).not.toHaveBeenCalled();
  });
});
