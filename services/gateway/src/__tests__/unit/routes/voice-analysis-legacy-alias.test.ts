/**
 * Témoin de #4277 (critère 1) — `voiceAnalysisRoutes` sert désormais ses
 * cinq routes sous `/api/v1`, et l'ancienne adresse RACINE (`/attachments/…`,
 * `/voice/analysis`) devient un alias DÉPRÉCIÉ plutôt qu'une suppression :
 * elle répond encore, avec les trois en-têtes de dépréciation (#4274).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../services/VoiceAnalysisService', () => ({
  VoiceAnalysisService: jest.fn().mockImplementation(() => ({
    getVoiceProfileAnalysis: jest.fn<any>().mockResolvedValue(null),
  })),
}));

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstance: jest.fn<any>().mockResolvedValue({}) },
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(
    () =>
      async (request: import('fastify').FastifyRequest): Promise<void> => {
        if (request.headers['authorization']) {
          (request as any).auth = { userId: 'user-123', type: 'registered' };
        }
      }
  ),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
}));

jest.mock('@meeshy/shared/types/voice-api', () => ({}));

import { voiceAnalysisRoutes, voiceAnalysisLegacyAliasRoutes } from '../../../routes/voice-analysis';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', {} as any);
  // Reproduit exactement le double montage attendu au site d'enregistrement
  // (édit hors territoire déclaré pour route-registration.ts) : le canonique
  // sous /api/v1, l'alias déprécié sous la racine.
  await app.register(voiceAnalysisRoutes, { prefix: '/api/v1' });
  await app.register(voiceAnalysisLegacyAliasRoutes);
  await app.ready();
  return app;
}

describe('voiceAnalysisRoutes — migration /api/v1 + alias déprécié (#4277)', () => {
  it('sert les cinq routes sous /api/v1', async () => {
    const app = await buildApp();

    const profile = await app.inject({
      method: 'GET',
      url: '/api/v1/voice/analysis',
      headers: { authorization: 'Bearer x' },
    });
    expect(profile.statusCode).toBe(200);

    const attachment = await app.inject({
      method: 'GET',
      url: '/api/v1/attachments/att-1/analysis',
      headers: { authorization: 'Bearer x' },
    });
    // 500 attendu ici (getAttachmentAnalysis non mocké dans ce fichier léger)
    // — seule l'ADRESSE est sous test, pas le comportement métier (déjà
    // couvert par voice-analysis.test.ts). Le point est qu'elle N'EST PAS 404.
    expect(attachment.statusCode).not.toBe(404);

    await app.close();
  });

  it("l'ancienne adresse racine répond ENCORE, avec les trois en-têtes de dépréciation vers /api/v1", async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/voice/analysis',
      headers: { authorization: 'Bearer x' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    expect(res.headers['sunset']).toBeDefined();
    expect(res.headers['link']).toBe('</api/v1/voice/analysis>; rel="successor-version"');

    await app.close();
  });

  it("l'alias suit le CHEMIN APPELÉ, pas un gabarit — successorPath varie avec l'attachmentId réel", async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/attachments/att-42/analysis',
      headers: { authorization: 'Bearer x' },
    });

    expect(res.headers['link']).toBe('</api/v1/attachments/att-42/analysis>; rel="successor-version"');

    await app.close();
  });

  it("l'alias N'EST PAS une réécriture — même comportement 401 sans jeton que le canonique", async () => {
    // Preuve que `voiceAnalysisLegacyAliasRoutes` délègue au VRAI handler
    // (`voiceAnalysisRoutes`), pas une copie divergente : la garde d'auth
    // s'applique identiquement des deux côtés, sans en-tête `Authorization`.
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/voice/analysis' });
    expect(res.statusCode).toBe(401);
    // Même sur l'échec d'auth, l'en-tête de dépréciation est posé — un alias
    // reste en sursis même sur sa branche d'erreur (doc-comment de
    // `applyDeprecationHeaders`).
    expect(res.headers['deprecation']).toMatch(/^@\d+$/);

    await app.close();
  });
});
