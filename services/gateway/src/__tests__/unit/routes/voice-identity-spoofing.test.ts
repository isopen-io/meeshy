/**
 * voice-identity-spoofing.test.ts
 *
 * Régression de sécurité pour les routes Voice API
 * (routes/voice/index.ts, routes/voice/translation.ts, routes/voice/types.ts).
 *
 * Faille corrigée : `registerVoiceRoutes` (câblée depuis server.ts:1111 via
 * `registerTranslationRoutes` / `registerAnalysisRoutes`) n'installait AUCUN
 * `preHandler` d'authentification, et `getUserId()` (routes/voice/types.ts)
 * retombait sur l'en-tête brut `x-user-id`, fourni par le client, dès que
 * `request.user` n'était pas défini. Résultat : n'importe quel appelant
 * anonyme, sans le moindre jeton, pouvait usurper l'identité de n'importe
 * quel utilisateur en envoyant simplement `x-user-id: <id-de-la-victime>`.
 * Ce n'est pas une simple fuite de données : le service de traduction vocale
 * exécutait la requête EN TANT QUE la victime (facturation, historique,
 * jobs, quotas) — usurpation d'identité complète (CWE-290 / CWE-807).
 *
 * Important : ce test N'IMPORTE PAS de mock pour `routes/voice/types` — il
 * exerce la VRAIE `getUserId()` et le VRAI câblage de `registerVoiceRoutes`,
 * contrairement à `voice-translation.test.ts` / `voice.routes.test.ts` qui
 * mockent ce module (ou ne touchent pas au code réel du tout) pour tester la
 * seule logique métier des routes. C'est délibéré : un test de sécurité qui
 * mocke la fonction qu'il est censé auditer ne prouve rien.
 *
 * Ces tests DOIVENT échouer sur le code non corrigé (statusCode 200, et
 * l'identifiant de la victime transmis tel quel au service métier) et passer
 * une fois que : (a) chaque route exige l'authentification via
 * `fastify.authenticate` (même mécanisme que routes/translation.ts et
 * routes/translation-non-blocking.ts:268), et (b) `getUserId()` ne lit plus
 * jamais l'en-tête `x-user-id`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ─── Module mocks (must be declared before imports) ──────────────────────────

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
      code: { type: 'string' },
    },
  },
}));

// ─── Import AFTER mocks — code réel, non mocké ───────────────────────────────
// (registerVoiceRoutes → registerTranslationRoutes + registerAnalysisRoutes,
// qui importent tous deux la VRAIE `getUserId` de ./types)

import { registerVoiceRoutes } from '../../../routes/voice/index';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VICTIM_USER_ID = 'victim-alice-real-account-id';
const VALID_TOKEN_FOR_VICTIM = `Bearer valid-session-token-for-${VICTIM_USER_ID}`;

function makeAudioService() {
  return {
    translateSync: jest.fn<any>().mockResolvedValue({
      originalAudio: {
        transcription: 'hello',
        language: 'en',
        confidence: 0.99,
        durationMs: 1000,
      },
      translations: [],
    }),
    translateAsync: jest.fn<any>().mockResolvedValue({ jobId: 'job-123', status: 'pending' }),
    getJobStatus: jest.fn<any>().mockResolvedValue({ jobId: 'job-123', status: 'completed' }),
    cancelJob: jest.fn<any>().mockResolvedValue({ jobId: 'job-123', status: 'cancelled' }),
    transcribeOnly: jest.fn<any>().mockResolvedValue({
      text: 'hello', language: 'en', confidence: 0.99, source: 'whisper', segments: [], durationMs: 1000,
    }),
    analyzeVoice: jest.fn<any>(),
    compareVoices: jest.fn<any>(),
    submitFeedback: jest.fn<any>(),
    getHistory: jest.fn<any>(),
    getUserStats: jest.fn<any>(),
    getSystemMetrics: jest.fn<any>(),
    getHealthStatus: jest.fn<any>().mockResolvedValue({ status: 'healthy' }),
    getSupportedLanguages: jest.fn<any>().mockResolvedValue({ languages: [] }),
  };
}

/**
 * Reproduit le comportement réel de `createUnifiedAuthMiddleware(prisma,
 * { requireAuth: true, allowAnonymous: false })` (middleware/auth.ts), tel
 * que décoré sur `fastify.authenticate` dans server.ts:790 : 401 immédiat en
 * l'absence d'un jeton Bearer valide, sinon peuple `request.user.userId`
 * avec l'identité VÉRIFIÉE — jamais avec une donnée fournie par le client.
 *
 * Avant le correctif, aucune route voice ne référence `fastify.authenticate`
 * dans un `preHandler` : ce décorateur existe donc dans l'app de test mais
 * n'est JAMAIS appelé tant que le correctif n'ajoute pas le `preHandler`.
 */
function buildApp() {
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers.authorization === VALID_TOKEN_FOR_VICTIM) {
      (req as unknown as { user?: { userId: string } }).user = { userId: VICTIM_USER_ID };
      return;
    }
    return reply.status(401).send({ success: false, error: 'AUTH_REQUIRED', message: 'Authentication required' });
  });

  const audioService = makeAudioService();
  registerVoiceRoutes(app, audioService as any, undefined);
  return { app, audioService };
}

describe('Voice API — SECURITY: identité exclusivement depuis la session vérifiée, jamais depuis x-user-id', () => {
  it("refuse (jamais 200) une requête POST /translate portant x-user-id de la victime SANS jeton", async () => {
    const { app, audioService } = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/voice/translate',
      headers: {
        // Appelant anonyme : aucun en-tête Authorization. Aucun client
        // légitime n'envoie x-user-id (cf. tests/e2e/voice-api.e2e.test.ts
        // et voice-translation-benchmark.e2e.test.ts, seuls endroits du
        // dépôt à l'utiliser).
        'x-user-id': VICTIM_USER_ID,
      },
      payload: { audioBase64: 'ZmFrZS1hdWRpbw==', targetLanguages: ['fr'] },
    });

    // Avant correctif : getUserId() retombe sur l'en-tête x-user-id (aucun
    // preHandler ne bloque la requête en amont) → 200, et translateSync()
    // est exécuté AU NOM de la victime.
    expect(res.statusCode).toBe(401);
    expect(audioService.translateSync).not.toHaveBeenCalled();

    await app.close();
  });

  it("refuse (jamais 200) une requête GET /job/:jobId portant x-user-id de la victime SANS jeton", async () => {
    const { app, audioService } = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/voice/job/some-job-id',
      headers: { 'x-user-id': VICTIM_USER_ID },
    });

    expect(res.statusCode).toBe(401);
    expect(audioService.getJobStatus).not.toHaveBeenCalled();

    await app.close();
  });

  it("n'utilise JAMAIS x-user-id pour l'identité, même avec un jeton valide pour un AUTRE compte", async () => {
    const { app, audioService } = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/voice/translate',
      headers: {
        authorization: VALID_TOKEN_FOR_VICTIM,
        // Un attaquant qui possède un jeton valide pour SON PROPRE compte ne
        // doit pas pouvoir se faire passer pour un autre via cet en-tête.
        'x-user-id': 'someone-else-entirely',
      },
      payload: { audioBase64: 'ZmFrZS1hdWRpbw==', targetLanguages: ['fr'] },
    });

    expect(res.statusCode).toBe(200);
    // L'identité utilisée par le service métier doit être celle de la
    // session authentifiée (VICTIM_USER_ID), jamais celle de l'en-tête.
    expect(audioService.translateSync).toHaveBeenCalledWith(
      VICTIM_USER_ID,
      expect.anything()
    );

    await app.close();
  });

  it('autorise un appelant authentifié normalement (Bearer valide, aucun x-user-id)', async () => {
    const { app, audioService } = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/voice/translate',
      headers: { authorization: VALID_TOKEN_FOR_VICTIM },
      payload: { audioBase64: 'ZmFrZS1hdWRpbw==', targetLanguages: ['fr'] },
    });

    expect(res.statusCode).toBe(200);
    expect(audioService.translateSync).toHaveBeenCalledWith(VICTIM_USER_ID, expect.anything());

    await app.close();
  });
});
