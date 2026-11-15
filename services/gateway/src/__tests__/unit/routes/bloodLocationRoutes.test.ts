/**
 * LES ROUTES de la position du Sang (#13937) : drapeau ÉTEINT ⇒ chaque route répond 404 comme une
 * route inconnue ; allumé pour un compte de la liste blanche ⇒ elle répond ; un compte hors liste
 * reste en 404 même drapeau allumé. Le monde est celui de `bloodLocationWorld` : la loi et le
 * consentement sont jugés sur les lectures vraies.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import { recordBloodLocation } from '../../../services/bloodLocation/bloodLocationService';
import bloodLocationMeRoutes from '../../../routes/me/blood-location';
import { registerRelationBloodLocation } from '../../../routes/relations/bloodLocation';
import { A_300_M, MOI, PARIS, SANG, bloodWorldAvecConsentements } from '../../helpers/blood-location-world';

async function app(world: ReturnType<typeof bloodWorldAvecConsentements>, as: string): Promise<FastifyInstance> {
  const fastify = Fastify();
  fastify.decorateRequest('user', null);
  fastify.decorate('authenticate', async (request: { user: unknown }) => {
    request.user = { userId: as };
  });
  fastify.decorate('prisma', world.prisma as never);
  await fastify.register(bloodLocationMeRoutes, { prefix: '/me' });
  await fastify.register(async (scope) => registerRelationBloodLocation(scope), { prefix: '/relations' });
  await fastify.ready();
  return fastify;
}

const ROUTES: ReadonlyArray<readonly [method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown]> = [
  ['POST', '/me/location/blood', PARIS],
  ['DELETE', '/me/location/history', undefined],
  ['GET', '/me/location/consultations', undefined],
  ['PUT', '/me/location/blood-settings', { ghost: true }],
  ['GET', `/relations/${SANG}/location/history`, undefined],
];

let fastify: FastifyInstance | undefined;
const saved = { ...process.env };
afterEach(async () => {
  await fastify?.close();
  fastify = undefined;
  process.env = { ...saved };
});

describe('le drapeau — éteint, aucune route ne répond', () => {
  beforeEach(() => {
    delete process.env.BLOOD_LOCATION_ENABLED;
    delete process.env.BLOOD_LOCATION_ALLOWLIST;
  });

  it.each(ROUTES)('%s %s : 404, comme une route inconnue', async (method, url, payload) => {
    const world = bloodWorldAvecConsentements();
    fastify = await app(world, MOI);
    const unknown = await fastify.inject({ method: 'GET', url: '/me/inconnue' });
    const response = await fastify.inject({ method, url, payload: payload as never });

    expect(response.statusCode).toBe(404);
    expect(world.points.rows).toEqual([]);
    expect(response.json().code).toBe(unknown.json().code);
  });

  it('allumé, un compte hors liste blanche reste en 404', async () => {
    process.env.BLOOD_LOCATION_ENABLED = 'true';
    process.env.BLOOD_LOCATION_ALLOWLIST = SANG;
    fastify = await app(bloodWorldAvecConsentements(), MOI);
    expect((await fastify.inject({ method: 'POST', url: '/me/location/blood', payload: PARIS })).statusCode).toBe(404);
  });
});

describe('le drapeau — allumé pour la liste blanche', () => {
  beforeEach(() => {
    process.env.BLOOD_LOCATION_ENABLED = 'true';
    process.env.BLOOD_LOCATION_ALLOWLIST = `${MOI},${SANG}`;
  });

  it('un point se range, et un Sang consentant lit l\'historique par la route', async () => {
    const world = bloodWorldAvecConsentements();
    const sang = await app(world, SANG);
    expect((await sang.inject({ method: 'POST', url: '/me/location/blood', payload: PARIS })).json()).toMatchObject({ data: { recorded: true } });
    await sang.close();

    fastify = await app(world, MOI);
    const response = await fastify.inject({ method: 'GET', url: `/relations/${SANG}/location/history` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.items).toEqual([{ latitude: PARIS.latitude, longitude: PARIS.longitude, accuracy: PARIS.accuracy, recordedAt: expect.any(String) }]);
  });

  it('un Sang qui retire le consentement coupe la lecture : 403 RELATION_CONSENT_REQUIRED', async () => {
    const world = bloodWorldAvecConsentements();
    await recordBloodLocation(world.deps, SANG, A_300_M);
    world.consentir(SANG, MOI, { locationHistoryShared: false });
    fastify = await app(world, MOI);

    const response = await fastify.inject({ method: 'GET', url: `/relations/${SANG}/location/history` });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('RELATION_CONSENT_REQUIRED');
  });

  it('une position illisible, un réglage incohérent et un identifiant invalide sont refusés', async () => {
    fastify = await app(bloodWorldAvecConsentements(), MOI);
    expect((await fastify.inject({ method: 'POST', url: '/me/location/blood', payload: { latitude: 200, longitude: 0 } })).statusCode).toBe(400);
    expect((await fastify.inject({ method: 'PUT', url: '/me/location/blood-settings', payload: { proximityRadiusMeters: 300 } })).statusCode).toBe(400);
    expect((await fastify.inject({ method: 'GET', url: '/relations/pas-un-id/location/history' })).statusCode).toBe(400);
  });
});
