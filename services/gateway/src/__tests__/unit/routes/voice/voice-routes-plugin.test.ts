/**
 * Témoin de #4277 (critères 2 et 4) — `voiceRoutesPlugin` est le point
 * d'entrée CIBLE : un plugin Fastify enregistré SANS condition
 * (`server.register(voiceRoutesPlugin, { prefix, audioTranslateService })`),
 * où l'absence de client ZMQ (`audioTranslateService: null`) se traduit par
 * un 503 EXPLICITE sur TOUTE la surface `/api/v1/voice/*`, jamais par une
 * route absente (404 générique indiscernable d'une route qui n'a jamais
 * existé).
 *
 * @jest-environment node
 */
import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// `registerTranslationRoutes`/`registerAnalysisRoutes` sont déjà couverts par
// leurs propres suites (`voice/translation.test.ts`, `voice/analysis.test.ts`)
// — ici seul le ROUTAGE du plugin (préfixe, 503, non-shadowing) est sous
// test, donc les deux sont doublés par un stub minimal qui pose UNE route
// connue (`/probe`) pour vérifier qu'elle atterrit au bon endroit.
jest.mock('../../../../routes/voice/translation', () => ({
  registerTranslationRoutes: (fastify: any, _svc: unknown, _t: unknown, prefix: string) => {
    fastify.get(`${prefix}/probe`, async () => ({ hit: 'translation-probe' }));
  },
}));
jest.mock('../../../../routes/voice/analysis', () => ({
  registerAnalysisRoutes: () => {},
}));

import { voiceRoutesPlugin } from '../../../../routes/voice/index';

describe('voiceRoutesPlugin — enregistrement inconditionnel + 503 explicite (#4277)', () => {
  it('sert les routes réelles sous le préfixe donné quand le service est disponible', async () => {
    const app = Fastify({ logger: false });
    await app.register(voiceRoutesPlugin, {
      prefix: '/api/v1/voice',
      audioTranslateService: {} as any,
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/v1/voice/probe' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ hit: 'translation-probe' });

    await app.close();
  });

  it('répond 503 EXPLICITE sur toute la surface quand audioTranslateService est null (ZMQ down) — jamais un 404', async () => {
    const app = Fastify({ logger: false });
    await app.register(voiceRoutesPlugin, {
      prefix: '/api/v1/voice',
      audioTranslateService: null,
    });
    await app.ready();

    for (const url of ['/api/v1/voice/translate', '/api/v1/voice/analyze', '/api/v1/voice/anything-not-yet-declared']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('VOICE_SERVICE_UNAVAILABLE');
    }

    await app.close();
  });

  it('le 503 ne dépend PAS d\'une identité — un appelant totalement anonyme le reçoit aussi (ce n\'est pas une question d\'autorisation)', async () => {
    const app = Fastify({ logger: false });
    await app.register(voiceRoutesPlugin, {
      prefix: '/api/v1/voice',
      audioTranslateService: null,
    });
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/api/v1/voice/translate' });
    expect(res.statusCode).toBe(503);

    await app.close();
  });

  it("un catch-all 503 sous /api/v1/voice/* ne masque PAS une route STATIQUE d'un AUTRE plugin sous /api/v1/voice/profile/*", async () => {
    // Reproduit exactement la topologie de route-registration.ts : deux
    // server.register() SÉPARÉS sur la même racine, l'un déclarant un
    // catch-all `/*`, l'autre une route statique sous un préfixe plus long.
    // find-my-way doit préférer le segment STATIQUE, quelle que soit
    // l'encapsulation d'origine.
    const app = Fastify({ logger: false });
    await app.register(voiceRoutesPlugin, {
      prefix: '/api/v1/voice',
      audioTranslateService: null,
    });
    await app.register(
      async (instance) => {
        instance.get('/status', async () => ({ hit: 'profile-status' }));
      },
      { prefix: '/api/v1/voice/profile' }
    );
    await app.ready();

    const profile = await app.inject({ method: 'GET', url: '/api/v1/voice/profile/status' });
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toEqual({ hit: 'profile-status' });

    const down = await app.inject({ method: 'GET', url: '/api/v1/voice/translate' });
    expect(down.statusCode).toBe(503);

    await app.close();
  });
});
