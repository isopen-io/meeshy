/**
 * Un refus de DÉBIT n'est pas une panne serveur (#11462).
 *
 * @fastify/rate-limit `throw`e l'objet que rend `errorResponseBuilder`. Le
 * gestionnaire global le prenait pour une erreur non rattrapée : ligne ERROR
 * « Uncaught error in request handler » à chaque refus (quinze le 2026-10-21
 * sur `GET /calls/active`) et corps REMPLACÉ par « Internal Server Error /
 * An unexpected error occurred » sous le statut 429 — le client ne recevait
 * jamais `RATE_LIMIT_EXCEEDED`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { rateLimitRefusalResponse } from '../rate-limit-refusal';
import { createRateLimitConfig } from '../../middleware/rate-limit';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

async function refusReelDuPlugin(): Promise<unknown> {
  const app = Fastify({ logger: false });
  let capture: unknown = null;
  app.setErrorHandler(async (error, _request, reply) => {
    capture = error;
    return reply.code(429).send({});
  });
  await app.register(rateLimit, { global: false });
  app.get('/geste', { ...createRateLimitConfig(1, '1 minute', 'operations', 'ouvert') }, async () => ({ ok: true }));
  await app.ready();
  await app.inject({ method: 'GET', url: '/geste' });
  await app.inject({ method: 'GET', url: '/geste' });
  await app.close();
  return capture;
}

describe('rateLimitRefusalResponse', () => {
  it("reconnaît le refus RÉELLEMENT lancé par le limiteur d'appels et en fait un corps lisible", async () => {
    const refus = await refusReelDuPlugin();
    expect(rateLimitRefusalResponse(refus)).toEqual({
      statusCode: 429,
      error: 'Too many requests (calls/operations). Please try again later.',
      message: 'Too many requests (calls/operations). Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  }, 20_000);

  it('lit aussi la forme plate des autres limiteurs (error en chaîne)', () => {
    expect(
      rateLimitRefusalResponse({ success: false, error: 'Trop de requêtes. Veuillez réessayer plus tard.', retryAfter: 1000, statusCode: 429 })
    ).toEqual({
      statusCode: 429,
      error: 'Trop de requêtes. Veuillez réessayer plus tard.',
      message: 'Trop de requêtes. Veuillez réessayer plus tard.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  });

  it("ne prend ni une vraie erreur, ni un autre statut, ni une valeur qui n'est pas un objet", () => {
    expect(rateLimitRefusalResponse(Object.assign(new Error('boom'), { statusCode: 429 }))).toBeNull();
    expect(rateLimitRefusalResponse({ statusCode: 500, error: 'x' })).toBeNull();
    expect(rateLimitRefusalResponse(null)).toBeNull();
    expect(rateLimitRefusalResponse('429')).toBeNull();
  });

  it('ne sert que des champs que errorResponseSchema déclare', () => {
    const corps = rateLimitRefusalResponse({ statusCode: 429, error: 'x' });
    const { statusCode: _statut, ...servi } = corps ?? { statusCode: 0 };
    const declares = Object.keys((errorResponseSchema as { properties: Record<string, unknown> }).properties);
    expect(Object.keys(servi).filter((cle) => !declares.includes(cle))).toEqual([]);
  });
});

describe("createRateLimitConfig — le corps du refus suit l'enveloppe d'erreur (error est une chaîne)", () => {
  it('pose error en chaîne plate et code à côté', () => {
    const corps = createRateLimitConfig(1, '1 minute', 'active').config.rateLimit.errorResponseBuilder();
    expect(typeof corps.error).toBe('string');
    expect(corps.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(corps.statusCode).toBe(429);
  });
});
