/**
 * `POST /me/meesh/mint` — la réponse ÉTENDUE (#9374, #9378) : l'ancienne forme
 * (`status`, `balance`, `mintedLifetime`) reste servie à l'identique, le reçu de
 * la pièce s'y ajoute, et le tout passe le schéma PARTAGÉ du contrat.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { meeshMintResponseSchema } from '@meeshy/shared/types/game';

const mint = jest.fn<any>();

jest.mock('../../../../services/meesh/MeeshService', () => ({
  MeeshService: jest.fn().mockImplementation(() => ({ mint })),
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

import { meMeeshRoutes } from '../../../../routes/me/meesh';

const USER_ID = '68a000000000000000000001';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {} as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER_ID, isAuthenticated: true };
  });
  await app.register(meMeeshRoutes, { prefix: '/api/v1/me' });
  await app.ready();
  return app;
}

const post = (app: FastifyInstance) =>
  app.inject({ method: 'POST', url: '/api/v1/me/meesh/mint', payload: { requestId: 'frappe-route-01' } });

describe('POST /me/meesh/mint', () => {
  it('sert le reçu de la pièce à côté de l’ancienne forme, et reste valide au schéma partagé', async () => {
    mint.mockResolvedValueOnce({
      status: 'minted',
      balance: 3,
      mintedLifetime: 3,
      plan: {},
      receipt: { number: 3, edition: 'silver', price: 1221, gloryGained: 100, levelBefore: 20, levelAfter: 16 },
    });
    const app = await buildApp();

    const res = await post(app);

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data).toEqual({
      status: 'minted',
      balance: 3,
      mintedLifetime: 3,
      number: 3,
      edition: 'silver',
      price: 1221,
      gloryGained: 100,
      levelBefore: 20,
      levelAfter: 16,
    });
    expect(meeshMintResponseSchema.safeParse(data).success).toBe(true);
    await app.close();
  });

  it('un rejeu d’une frappe d’avant le jeu (sans reçu) garde la forme ANCIENNE, toujours valide', async () => {
    mint.mockResolvedValueOnce({ status: 'already-minted', balance: 1, mintedLifetime: 1, receipt: null });
    const app = await buildApp();

    const { data } = (await post(app)).json();

    expect(data).toEqual({ status: 'already-minted', balance: 1, mintedLifetime: 1 });
    expect(meeshMintResponseSchema.safeParse(data).success).toBe(true);
    await app.close();
  });

  it('409 INSUFFICIENT_POINTS avec le manque quand les points débitables ne couvrent pas le prix', async () => {
    mint.mockResolvedValueOnce({ status: 'insufficient', plan: { missingPoints: 73 } });
    const app = await buildApp();

    const res = await post(app);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, code: 'INSUFFICIENT_POINTS', missingPoints: 73 });
    await app.close();
  });
});
