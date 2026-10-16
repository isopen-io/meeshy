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
  ...jest.requireActual<typeof import('../../../../services/meesh/MeeshService')>('../../../../services/meesh/MeeshService'),
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

describe('POST /me/meesh/mint — aucune Meesh sans débit de points (#10011)', () => {
  it('refuse en 400, sans aucune frappe, un client qui demande à payer en fragments', async () => {
    mint.mockClear();
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/me/meesh/mint', payload: { requestId: 'frappe-route-02', payWith: 'fragments' } });
    expect(res.statusCode).toBe(400);
    expect(mint).not.toHaveBeenCalled();
    await app.close();
  });

  it('frappe en points quand le client le dit, comme quand il ne dit rien', async () => {
    mint.mockClear();
    mint.mockResolvedValue({ status: 'minted', balance: 1, mintedLifetime: 1, plan: {}, receipt: null });
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/me/meesh/mint', payload: { requestId: 'frappe-route-03', payWith: 'points' } });
    expect(res.statusCode).toBe(200);
    expect(mint).toHaveBeenCalledWith(USER_ID, 'frappe-route-03');
    mint.mockReset();
    await app.close();
  });
});

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
      ladder: { levelBefore: 20, levelAfter: 16 },
    });
    expect(meeshMintResponseSchema.safeParse(data).success).toBe(true);
    await app.close();
  });

  it('au-delà de 100, les champs d’hier restent bornés à 100 et la vérité part dans ladder (#9688)', async () => {
    mint.mockResolvedValueOnce({
      status: 'minted',
      balance: 41,
      mintedLifetime: 41,
      plan: {},
      receipt: { number: 41, edition: 'silver', price: 1541, gloryGained: 1000, levelBefore: 640, levelAfter: 639 },
    });
    const app = await buildApp();

    const { data } = (await post(app)).json();

    expect(data).toMatchObject({ levelBefore: 100, levelAfter: 100, ladder: { levelBefore: 640, levelAfter: 639 } });
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

  it('sert le prix de rang et le facteur du niveau actuel à côté du prix effectif (#10847), et reste valide au schéma partagé', async () => {
    mint.mockResolvedValueOnce({
      status: 'minted',
      balance: 1,
      mintedLifetime: 1,
      plan: {},
      receipt: { number: 1, edition: 'silver', price: 653, gloryGained: 1000, levelBefore: 7, levelAfter: 7, basePrice: 1221, costFactor: 0.535 },
    });
    const app = await buildApp();

    const { data } = (await post(app)).json();

    expect(data).toMatchObject({ price: 653, basePrice: 1221, costFactor: 0.535 });
    expect(meeshMintResponseSchema.safeParse(data).success).toBe(true);
    await app.close();
  });

  it('409 MINT_BLOCKED_BY_DEBT, TYPÉ : la dette d\'étincelles à rembourser avant de frapper', async () => {
    mint.mockResolvedValueOnce({ status: 'blocked-by-debt', sparksDebt: 120 });
    const app = await buildApp();

    const res = await post(app);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, code: 'MINT_BLOCKED_BY_DEBT', sparksDebt: 120 });
    await app.close();
  });

  it('409 TREASURY_LOCKED, TYPÉ : la réserve qui barre la pièce et le rang requis (#10848)', async () => {
    mint.mockResolvedValueOnce({
      status: 'treasury-locked',
      lock: { tier: 'coffre', minHeld: 100, requires: { rank: 'voix', division: 1, division5: 1 } },
    });
    const app = await buildApp();

    const res = await post(app);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      success: false,
      code: 'TREASURY_LOCKED',
      tier: 'coffre',
      minHeld: 100,
      requires: { rank: 'voix', division: 1, division5: 1 },
    });
    await app.close();
  });
});
