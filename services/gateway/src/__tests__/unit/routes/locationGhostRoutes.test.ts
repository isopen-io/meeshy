/**
 * LE FANTÔME GLOBAL SE RÈGLE HORS DU DRAPEAU SANG (#19203) : `PUT /me/location/ghost`
 * répond drapeau éteint, écrit `User.locationGhostAt` — le même champ que
 * `PUT /me/location/blood-settings` (inchangé, toujours derrière le drapeau) — et rend
 * l'état réglé. Un corps illisible est refusé sans rien écrire.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import locationGhostMeRoutes from '../../../routes/me/location-ghost';
import bloodLocationMeRoutes from '../../../routes/me/blood-location';
import { MOI, bloodLocationWorld } from '../../helpers/blood-location-world';

async function app(world: ReturnType<typeof bloodLocationWorld>, as: string): Promise<FastifyInstance> {
  const fastify = Fastify();
  fastify.decorateRequest('user', null);
  fastify.decorate('authenticate', async (request: { user: unknown }) => {
    request.user = { userId: as };
  });
  fastify.decorate('prisma', world.prisma as never);
  await fastify.register(locationGhostMeRoutes, { prefix: '/me' });
  await fastify.register(bloodLocationMeRoutes, { prefix: '/me' });
  await fastify.ready();
  return fastify;
}

const ghostOf = (world: ReturnType<typeof bloodLocationWorld>, userId: string) =>
  world.userRows.find((row) => row.id === userId)?.locationGhostAt ?? null;

let fastify: FastifyInstance | undefined;
const saved = { ...process.env };
beforeEach(() => {
  delete process.env.BLOOD_LOCATION_ENABLED;
  delete process.env.BLOOD_LOCATION_ALLOWLIST;
});
afterEach(async () => {
  await fastify?.close();
  fastify = undefined;
  process.env = { ...saved };
});

describe('PUT /me/location/ghost — le fantôme pour tous, drapeau Sang éteint', () => {
  it('active le fantôme : 200, l\'état réglé, et le champ du compte écrit', async () => {
    const world = bloodLocationWorld();
    fastify = await app(world, MOI);

    const response = await fastify.inject({ method: 'PUT', url: '/me/location/ghost', payload: { ghost: true } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.ghost).toBe(true);
    expect(typeof body.data.ghostAt).toBe('string');
    expect(Object.keys(body.data).sort()).toEqual(['ghost', 'ghostAt']);
    expect(ghostOf(world, MOI)).toBeInstanceOf(Date);
  });

  it('le désactive : l\'état revient à « visible » et le champ est effacé', async () => {
    const world = bloodLocationWorld();
    fastify = await app(world, MOI);
    await fastify.inject({ method: 'PUT', url: '/me/location/ghost', payload: { ghost: true } });

    const response = await fastify.inject({ method: 'PUT', url: '/me/location/ghost', payload: { ghost: false } });

    expect(response.json().data).toEqual({ ghost: false, ghostAt: null });
    expect(ghostOf(world, MOI)).toBeNull();
  });

  it('un fantôme réactivé garde sa date d\'entrée', async () => {
    const world = bloodLocationWorld();
    fastify = await app(world, MOI);
    const first = (await fastify.inject({ method: 'PUT', url: '/me/location/ghost', payload: { ghost: true } })).json().data.ghostAt;

    const again = (await fastify.inject({ method: 'PUT', url: '/me/location/ghost', payload: { ghost: true } })).json().data.ghostAt;

    expect(again).toBe(first);
  });

  it('un corps illisible est refusé et n\'écrit rien', async () => {
    const world = bloodLocationWorld();
    fastify = await app(world, MOI);

    const response = await fastify.inject({ method: 'PUT', url: '/me/location/ghost', payload: { ghost: 'oui' } });

    expect(response.statusCode).toBe(400);
    expect(ghostOf(world, MOI)).toBeNull();
  });

  it('blood-settings reste derrière le drapeau : 404 drapeau éteint, rétrocompatible', async () => {
    fastify = await app(bloodLocationWorld(), MOI);
    expect((await fastify.inject({ method: 'PUT', url: '/me/location/blood-settings', payload: { ghost: true } })).statusCode).toBe(404);
  });
});
