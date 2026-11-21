/**
 * #19280 — PENDANT L'ARRÊT, LA PASSERELLE RÉPOND 503 AVEC SES EN-TÊTES CORS.
 *
 * Traefik n'écarte un conteneur que `starting` ou `unhealthy`. Au SIGTERM la
 * passerelle fermait son port et restait « healthy » : Traefik répondait lui-même
 * 502/504, sans CORS, sur le routeur SAIN. L'arrêt se fait donc en deux temps :
 * (1) la santé passe `unhealthy` et toute requête neuve reçoit 503 + CORS, port
 * ouvert ; (2) après une attente bornée, la fermeture.
 *
 * @jest-environment node
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

import { fastifyCorsOrigin } from '../../../config/cors-origins';
import { CORS_METHODS } from '../../../config/cors-methods';
import {
  createShutdownDrain,
  registerShutdownDrain,
  resolveDrainMs,
  runTwoPhaseShutdown,
} from '../../../utils/shutdown-drain';

const ALLOWED_ORIGIN = 'https://meeshy.me';

const buildServer = async () => {
  const drain = createShutdownDrain();
  const server: FastifyInstance = Fastify();
  await server.register(cors, {
    origin: fastifyCorsOrigin({}),
    credentials: true,
    methods: CORS_METHODS,
  });
  registerShutdownDrain(server, drain);
  server.get('/health', async () => ({ status: 'healthy' }));
  server.get('/api/v1/conversations', async () => ({ ok: true }));
  await server.ready();
  return { server, drain };
};

describe('arrêt en deux temps — phase de vidange (#19280)', () => {
  it('sert normalement tant que la vidange n a pas commencé', async () => {
    const { server } = await buildServer();
    const res = await server.inject({ method: 'GET', url: '/api/v1/conversations', headers: { origin: ALLOWED_ORIGIN } });
    expect(res.statusCode).toBe(200);
    await server.close();
  });

  it('répond 503 avec les en-têtes CORS de la passerelle à toute requête neuve', async () => {
    const { server, drain } = await buildServer();
    drain.begin();
    const res = await server.inject({ method: 'GET', url: '/api/v1/conversations', headers: { origin: ALLOWED_ORIGIN } });
    expect(res.statusCode).toBe(503);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.json()).toMatchObject({ success: false, code: 'SERVICE_SHUTTING_DOWN' });
    await server.close();
  });

  it('répond aussi 503 aux applications natives, qui n envoient aucune origine', async () => {
    const { server, drain } = await buildServer();
    drain.begin();
    const res = await server.inject({ method: 'POST', url: '/api/v1/conversations?limit=10' });
    expect(res.statusCode).toBe(503);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.json()).toMatchObject({ success: false, code: 'SERVICE_SHUTTING_DOWN' });
    await server.close();
  });

  it('ne pose aucune origine en trop pendant la vidange (le refus CORS garde la main)', async () => {
    const { server, drain } = await buildServer();
    drain.begin();
    const res = await server.inject({ method: 'GET', url: '/api/v1/conversations', headers: { origin: 'https://evil.example' } });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    await server.close();
  });

  it('passe la santé en 503 unhealthy dès le début de la vidange, sans toucher la base', async () => {
    const { server, drain } = await buildServer();
    drain.begin();
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'unhealthy', draining: true });
    await server.close();
  });

  it('laisse le prévol de la passerelle saine répondre comme avant la vidange', async () => {
    const { server, drain } = await buildServer();
    drain.begin();
    const res = await server.inject({
      method: 'OPTIONS',
      url: '/api/v1/conversations',
      headers: { origin: ALLOWED_ORIGIN, 'access-control-request-method': 'GET', 'access-control-request-headers': 'x-session-token' },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    await server.close();
  });
});

describe('runTwoPhaseShutdown (#19280)', () => {
  it('commence la vidange, attend la durée bornée, puis seulement ferme', async () => {
    const drain = createShutdownDrain();
    const events: string[] = [];
    await runTwoPhaseShutdown({
      drain,
      drainMs: 15000,
      sleep: async (ms) => { events.push(`sleep:${ms}:draining=${drain.isDraining()}`); },
      close: async () => { events.push('close'); },
    });
    expect(events).toEqual(['sleep:15000:draining=true', 'close']);
  });

  it('ne dort pas quand la durée est nulle, mais passe quand même en vidange', async () => {
    const drain = createShutdownDrain();
    const sleep = jest.fn(async () => undefined);
    await runTwoPhaseShutdown({ drain, drainMs: 0, sleep, close: async () => undefined });
    expect(sleep).not.toHaveBeenCalled();
    expect(drain.isDraining()).toBe(true);
  });

  it('un second signal pendant la vidange rejoint l arrêt en cours, sans rouvrir l attente ni fermer deux fois', async () => {
    const drain = createShutdownDrain();
    const wake: Array<() => void> = [];
    const sleep = jest.fn((_ms: number) => new Promise<void>((resolve) => { wake.push(resolve); }));
    const close = jest.fn(async () => undefined);
    const first = runTwoPhaseShutdown({ drain, drainMs: 20000, sleep, close });
    const second = runTwoPhaseShutdown({ drain, drainMs: 20000, sleep, close });
    await Promise.resolve();
    wake.forEach((resolve) => resolve());
    await Promise.all([first, second]);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('ferme même si l attente échoue', async () => {
    const drain = createShutdownDrain();
    const close = jest.fn(async () => undefined);
    await runTwoPhaseShutdown({ drain, drainMs: 10, sleep: async () => { throw new Error('boom'); }, close });
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('resolveDrainMs (#19280)', () => {
  it('vaut 0 sans configuration (dev, tests)', () => {
    expect(resolveDrainMs({})).toBe(0);
  });
  it('lit GATEWAY_DRAIN_MS', () => {
    expect(resolveDrainMs({ GATEWAY_DRAIN_MS: '20000' })).toBe(20000);
  });
  it('borne la valeur à 60 s et ignore le non-numérique ou négatif', () => {
    expect(resolveDrainMs({ GATEWAY_DRAIN_MS: '999999' })).toBe(60000);
    expect(resolveDrainMs({ GATEWAY_DRAIN_MS: 'abc' })).toBe(0);
    expect(resolveDrainMs({ GATEWAY_DRAIN_MS: '-5' })).toBe(0);
  });
});
