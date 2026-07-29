/**
 * translation-blocking-ownership.test.ts
 *
 * Régression de sécurité pour POST /translate-blocking (routes/translation.ts).
 *
 * Faille corrigée : la route n'avait AUCUN `preHandler` d'authentification
 * (voir l'enregistrement dans server.ts), et sa vérification d'appartenance
 * à la conversation était enfermée dans `if (userId) { ... }`
 * (translation.ts:341-348 avant correctif, commentaire « optionnel, selon vos
 * besoins »). Sans jeton d'authentification, `request.user` reste
 * `undefined` et la garde entière — y compris le refus — était SAUTÉE : un
 * appelant anonyme connaissant un `message_id` obtenait le contenu traduit
 * d'une conversation à laquelle il n'appartient pas
 * (CWE-862 — Missing Authorization / IDOR).
 *
 * Le chemin socket équivalent (`MeeshySocketIOManager.ts:1193-1206`) vérifie
 * systématiquement l'appartenance avant de servir toute traduction — c'est le
 * comportement de référence que ce test impose désormais au REST.
 *
 * Ces tests DOIVENT échouer sur le code non corrigé (statusCode 200 au lieu
 * d'un refus) et passer une fois que : (a) la route exige l'authentification
 * via `fastify.authenticate`, et (b) la vérification d'appartenance est
 * inconditionnelle (une absence d'identité produit un refus, jamais un
 * passage).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: {} },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { translationRoutes } from '../../../routes/translation';

// ─── Constants ────────────────────────────────────────────────────────────────

const MSG_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439033';

// Le message appartient à une conversation entre Alice et Bob UNIQUEMENT.
const ALICE = 'alice-participant-id';
const BOB = 'bob-participant-id';
const INTRUDER = 'intruder-not-a-participant';

const SECRET_MESSAGE_CONTENT = 'Rendez-vous secret à 18h, ne le répète à personne';

const mockTranslationResult = {
  translatedText: 'Secret meeting at 6pm, do not repeat it to anyone',
  sourceLanguage: 'fr',
  targetLanguage: 'en',
  confidenceScore: 0.95,
  processingTime: 0.1,
  modelType: 'basic',
};

function makeMessage() {
  return {
    id: MSG_ID,
    content: SECRET_MESSAGE_CONTENT,
    originalLanguage: 'fr',
    encryptionMode: null,
    conversationId: CONV_ID,
    conversation: { participants: [{ userId: ALICE }, { userId: BOB }] },
  };
}

/**
 * `auth`:
 *   - `false`  → aucun jeton (appelant anonyme).
 *   - `string` → jeton valide pour cet userId (peut être un intrus non
 *     participant de la conversation du message).
 *
 * Reproduit le comportement réel de `createUnifiedAuthMiddleware` appelé
 * avec `{ requireAuth: true }` (middleware/auth.ts:489-517) : 401 immédiat en
 * l'absence de jeton, sinon peuple `request.user.userId` (compat historique
 * conservée pour les routes qui, comme celle-ci, lisent encore
 * `request.user` plutôt que `request.authContext`).
 */
async function buildApp(auth: false | string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    if (auth === false) {
      return reply.status(401).send({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }
    (req as unknown as { user?: { userId: string } }).user = { userId: auth };
  });

  app.decorate('prisma', {
    message: { findUnique: jest.fn<any>().mockResolvedValue(makeMessage()) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  });

  app.decorate('translationService', {
    handleNewMessage: jest.fn<any>().mockResolvedValue({ messageId: MSG_ID }),
    getTranslation: jest.fn<any>().mockResolvedValue(mockTranslationResult),
  });

  await translationRoutes(app);
  await app.ready();
  return app;
}

describe("POST /translate-blocking — SECURITY: la vérification d'appartenance ne doit jamais être contournable", () => {
  it('refuse (jamais 200) un appelant SANS jeton demandant la retraduction d\'un message dont il ne prouve pas être participant', async () => {
    const app = await buildApp(false);

    const res = await app.inject({
      method: 'POST',
      url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'en' },
    });

    // Avant correctif : `if (userId)` est faux (userId undefined) → le bloc
    // entier de vérification est sauté → 200 avec le contenu traduit.
    expect(res.statusCode).not.toBe(200);
    expect([401, 403]).toContain(res.statusCode);
    // Le contenu du message secret ne doit jamais fuiter dans la réponse.
    expect(res.body).not.toContain('Secret meeting');

    await app.close();
  });

  it("refuse avec 403 un appelant AUTHENTIFIÉ qui n'est pas participant de la conversation du message", async () => {
    const app = await buildApp(INTRUDER);

    const res = await app.inject({
      method: 'POST',
      url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'en' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain('Secret meeting');

    await app.close();
  });

  it('autorise un appelant AUTHENTIFIÉ et membre légitime de la conversation', async () => {
    const app = await buildApp(ALICE);

    const res = await app.inject({
      method: 'POST',
      url: '/translate-blocking',
      payload: { message_id: MSG_ID, target_language: 'en' },
    });

    expect(res.statusCode).toBe(200);

    await app.close();
  });
});
