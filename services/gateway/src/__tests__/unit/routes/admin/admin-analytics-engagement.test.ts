/**
 * Statistiques — deux corrections de l'audit du 2026-10-04.
 *
 * 1. `engagementRate` et `activeUserRate` avaient la MÊME formule (actifs /
 *    total) : deux étiquettes, un seul chiffre. `engagementRate` devient « les
 *    comptes ayant envoyé au moins un message dans la période, rapportés aux
 *    comptes actifs dans la période ».
 * 2. L'activité horaire servait une étiquette « 14h » calculée dans le fuseau
 *    du SERVEUR : chaque tranche sert aussi `startsAt` (ISO), que le client
 *    formate dans le fuseau du lecteur.
 *
 * @jest-environment node
 */
import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({ get: jest.fn(async () => null), set: jest.fn(async () => undefined), del: jest.fn() })),
}));

import { analyticsRoutes } from '../../../../routes/admin/analytics';

type AnyRecord = Record<string, unknown>;

async function build(prisma: AnyRecord): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (request: { authContext?: unknown }) => {
    request.authContext = { isAuthenticated: true, registeredUser: { id: '507f1f77bcf86cd799439011', role: 'ADMIN', username: 'admin' } };
  });
  app.register(analyticsRoutes);
  await app.ready();
  return app;
}

describe('GET /kpis — engagementRate', () => {
  it('rapporte les comptes EXPÉDITEURS de la période aux comptes ACTIFS de la période', async () => {
    // total 200, actifs 50, nouveaux 10 ; 20 comptes distincts ont écrit.
    const aggregateRaw = jest.fn(async () => [{ total: 20 }]);
    const app = await build({
      message: { count: jest.fn(async () => 400), aggregateRaw },
      user: { count: jest.fn<() => Promise<number>>().mockResolvedValueOnce(200).mockResolvedValueOnce(50).mockResolvedValueOnce(10) },
    });
    const data = (await app.inject({ method: 'GET', url: '/kpis?period=7d' })).json().data;
    expect(data.engagementRate).toBe(40); // 20 / 50
    expect(data.activeUserRate).toBe(25); // 50 / 200 — inchangé
    // Les expéditeurs se comptent par COMPTE (Participant → userId), invités exclus.
    const pipeline = JSON.stringify((aggregateRaw.mock.calls[0] as unknown as [{ pipeline: unknown }])[0].pipeline);
    expect(pipeline).toContain('"$lookup"');
    expect(pipeline).toContain('sender.userId');
    await app.close();
  });

  it('vaut 0 sans compte actif — jamais NaN ni Infinity', async () => {
    const app = await build({
      message: { count: jest.fn(async () => 0), aggregateRaw: jest.fn(async () => []) },
      user: { count: jest.fn(async () => 0) },
    });
    expect((await app.inject({ method: 'GET', url: '/kpis' })).json().data.engagementRate).toBe(0);
    await app.close();
  });
});

describe('GET /hourly-activity — startsAt', () => {
  it('sert le début ISO de chaque tranche de trois heures, en ordre chronologique', async () => {
    const app = await build({ message: { count: jest.fn(async () => 3) } });
    const data = (await app.inject({ method: 'GET', url: '/hourly-activity' })).json().data as AnyRecord[];
    expect(data).toHaveLength(8);
    const debuts = data.map((t) => Date.parse(String(t.startsAt)));
    expect(debuts.every((d) => Number.isFinite(d))).toBe(true);
    for (let i = 1; i < debuts.length; i++) expect(debuts[i] - debuts[i - 1]).toBe(3 * 60 * 60 * 1000);
    expect(data[0]).toHaveProperty('hour');
    await app.close();
  });
});
