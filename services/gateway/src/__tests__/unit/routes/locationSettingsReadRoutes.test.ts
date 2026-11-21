/**
 * LA RELECTURE de mes réglages de position (#19452) : le fantôme global se relit HORS du drapeau
 * Sang, pour soi seulement ; le fantôme ciblé et le rayon d'une personne se relisent derrière le
 * drapeau, comme le PUT voisin. Seules mes lignes partent — jamais ce que l'autre a réglé pour moi.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import bloodLocationMeRoutes from '../../../routes/me/blood-location';
import locationSettingsReadMeRoutes from '../../../routes/me/location-settings-read';
import { AMI, MOI, SANG, bloodWorldAvecConsentements } from '../../helpers/blood-location-world';

type World = ReturnType<typeof bloodWorldAvecConsentements>;

async function app(world: World, as: string): Promise<FastifyInstance> {
  const fastify = Fastify();
  fastify.decorateRequest('user', null);
  fastify.decorate('authenticate', async (request: { user: unknown }) => {
    request.user = { userId: as };
  });
  fastify.decorate('prisma', world.prisma as never);
  await fastify.register(bloodLocationMeRoutes, { prefix: '/me' });
  await fastify.register(locationSettingsReadMeRoutes, { prefix: '/me' });
  await fastify.ready();
  return fastify;
}

const userRow = (world: World, id: string) => world.prisma.user.rows.find((row) => row.id === id)!;

let fastify: FastifyInstance | undefined;
const saved = { ...process.env };
afterEach(async () => {
  await fastify?.close();
  fastify = undefined;
  process.env = { ...saved };
});

describe('GET /me/location/ghost — hors drapeau Sang, pour soi', () => {
  beforeEach(() => {
    delete process.env.BLOOD_LOCATION_ENABLED;
    delete process.env.BLOOD_LOCATION_ALLOWLIST;
  });

  it('hors fantôme : ghost faux, ghostAt nul, réponse non mise en cache', async () => {
    fastify = await app(bloodWorldAvecConsentements(), MOI);
    const response = await fastify.inject({ method: 'GET', url: '/me/location/ghost' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, data: { ghost: false, ghostAt: null } });
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('en fantôme : la date d\'entrée part, et rien d\'autre de la ligne du compte', async () => {
    const world = bloodWorldAvecConsentements();
    Object.assign(userRow(world, MOI), { locationGhostAt: new Date('2026-11-10T08:00:00.000Z'), email: 'moi@exemple.fr' });
    fastify = await app(world, MOI);

    expect((await fastify.inject({ method: 'GET', url: '/me/location/ghost' })).json()).toEqual({
      success: true,
      data: { ghost: true, ghostAt: '2026-11-10T08:00:00.000Z' },
    });
  });

  it('le fantôme d\'un autre compte ne colore jamais ma lecture', async () => {
    const world = bloodWorldAvecConsentements();
    Object.assign(userRow(world, SANG), { locationGhostAt: new Date('2026-11-10T08:00:00.000Z') });
    fastify = await app(world, MOI);

    expect((await fastify.inject({ method: 'GET', url: '/me/location/ghost' })).json().data).toEqual({ ghost: false, ghostAt: null });
  });

  it('le fantôme posé par le PUT voisin se relit', async () => {
    process.env.BLOOD_LOCATION_ENABLED = 'true';
    process.env.BLOOD_LOCATION_ALLOWLIST = MOI;
    fastify = await app(bloodWorldAvecConsentements(), MOI);
    await fastify.inject({ method: 'PUT', url: '/me/location/blood-settings', payload: { ghost: true } });

    expect((await fastify.inject({ method: 'GET', url: '/me/location/ghost' })).json().data).toMatchObject({ ghost: true, ghostAt: expect.any(String) });
  });
});

describe('GET /me/location/blood-settings — derrière le drapeau Sang', () => {
  it('drapeau éteint : 404 comme une route inconnue', async () => {
    delete process.env.BLOOD_LOCATION_ENABLED;
    const world = bloodWorldAvecConsentements();
    fastify = await app(world, MOI);
    const unknown = await fastify.inject({ method: 'GET', url: '/me/inconnue' });
    const response = await fastify.inject({ method: 'GET', url: `/me/location/blood-settings?userId=${SANG}` });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe(unknown.json().code);
  });

  describe('drapeau allumé', () => {
    beforeEach(() => {
      process.env.BLOOD_LOCATION_ENABLED = 'true';
      process.env.BLOOD_LOCATION_ALLOWLIST = `${MOI},${SANG}`;
    });

    it('sans réglage : fantôme ciblé faux et rayon par défaut de 500 m', async () => {
      fastify = await app(bloodWorldAvecConsentements(), MOI);
      const response = await fastify.inject({ method: 'GET', url: `/me/location/blood-settings?userId=${SANG}` });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.json()).toEqual({ success: true, data: { userId: SANG, ghost: false, ghostFor: false, proximityRadiusMeters: 500 } });
    });

    it('ce que j\'ai réglé par le PUT se relit : fantôme ciblé, rayon, fantôme global', async () => {
      fastify = await app(bloodWorldAvecConsentements(), MOI);
      await fastify.inject({ method: 'PUT', url: '/me/location/blood-settings', payload: { userId: SANG, ghost: true, proximityRadiusMeters: 1200 } });
      await fastify.inject({ method: 'PUT', url: '/me/location/blood-settings', payload: { ghost: true } });

      expect((await fastify.inject({ method: 'GET', url: `/me/location/blood-settings?userId=${SANG.toUpperCase()}` })).json().data)
        .toEqual({ userId: SANG, ghost: true, ghostFor: true, proximityRadiusMeters: 1200 });
    });

    it('ce que l\'AUTRE a réglé pour moi ne part jamais à côté', async () => {
      const world = bloodWorldAvecConsentements();
      world.consentir(SANG, MOI, { ghostAt: new Date('2026-11-10T08:00:00.000Z'), proximityRadiusMeters: 3000 });
      Object.assign(userRow(world, SANG), { locationGhostAt: new Date('2026-11-10T08:00:00.000Z') });
      fastify = await app(world, MOI);

      expect((await fastify.inject({ method: 'GET', url: `/me/location/blood-settings?userId=${SANG}` })).json().data)
        .toEqual({ userId: SANG, ghost: false, ghostFor: false, proximityRadiusMeters: 500 });
    });

    it('un rayon rangé hors bornes est servi borné à 100–5000', async () => {
      const world = bloodWorldAvecConsentements();
      world.consentir(MOI, SANG, { proximityRadiusMeters: 99_999 });
      world.consentir(MOI, AMI, { proximityRadiusMeters: 3 });
      fastify = await app(world, MOI);

      expect((await fastify.inject({ method: 'GET', url: `/me/location/blood-settings?userId=${SANG}` })).json().data.proximityRadiusMeters).toBe(5000);
      expect((await fastify.inject({ method: 'GET', url: `/me/location/blood-settings?userId=${AMI}` })).json().data.proximityRadiusMeters).toBe(100);
    });

    it('un identifiant absent, invalide ou le mien est refusé', async () => {
      fastify = await app(bloodWorldAvecConsentements(), MOI);
      expect((await fastify.inject({ method: 'GET', url: '/me/location/blood-settings' })).statusCode).toBe(400);
      expect((await fastify.inject({ method: 'GET', url: '/me/location/blood-settings?userId=pas-un-id' })).statusCode).toBe(400);
      expect((await fastify.inject({ method: 'GET', url: `/me/location/blood-settings?userId=${MOI}` })).statusCode).toBe(400);
    });
  });
});
