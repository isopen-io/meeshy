/**
 * LES ÉCRITURES DU JEU MEESHY (#9375, #9376, #9378) — le contrat est dans
 * `@meeshy/shared/types/game-routes` (adresses, codes d'erreur) et
 * `@meeshy/shared/types/game` (schémas) ; cette route n'en invente aucun.
 *
 *   POST /me/game/missions/:missionId/reroll   changer une mission (1 Meesh, 1×/jour)
 *   POST /me/game/chest/claim                  ouvrir le coffre du jour
 *   POST /me/game/flame/freezes                acheter un gel (1 Meesh, 2 en réserve)
 *   POST /me/game/flame/relight                rallumer une Flamme (3 Meeshes, 48 h, 1×/mois)
 *   POST /me/game/guide/seen                   mémoriser les clés de guide vues
 *
 * Aucune ne prend d'`userId` : l'utilisateur est celui de l'authentification.
 * Toutes portent un `requestId` (8 à 64 caractères) qui les rend idempotentes —
 * rejouer une écriture rend son résultat, jamais une seconde écriture. Un REFUS
 * de l'état du compte est un 409 avec le code du contrat ; un corps mal formé,
 * un 400.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { EngagementAxisKey } from '@meeshy/shared/types/engagement';
import { EngagementService } from '../../services/engagement/EngagementService';
import { FlameService } from '../../services/game/FlameService';
import { GameBlockService } from '../../services/game/GameBlockService';
import { MissionService } from '../../services/game/MissionService';
import { gameRateLimitConfig, okResponse, refusalResponse, requestIdSchema, runGameWrite, writeBody } from './game-shared';
import { meGameWave2Routes } from './game-wave2';

export type GameRoutesOptions = {
  /** Le crédit des points de jeu — l'`EngagementService` partagé, remplaçable en test. */
  readonly engagement?: { creditGamePoints(userId: string, points: number, axisKey: EngagementAxisKey): Promise<void> };
};

const guideBody = {
  type: 'object',
  required: ['requestId', 'keys'],
  properties: {
    requestId: requestIdSchema,
    keys: { type: 'array', minItems: 1, maxItems: 32, items: { type: 'string', minLength: 1, maxLength: 64 } },
  },
  additionalProperties: false,
} as const;

export async function meGameRoutes(fastify: FastifyInstance, options: GameRoutesOptions = {}) {
  const engagement = options.engagement ?? new EngagementService(fastify.prisma);
  const creditPoints = (userId: string, points: number, axisKey: EngagementAxisKey) =>
    engagement.creditGamePoints(userId, points, axisKey);
  const missions = new MissionService(fastify.prisma, { creditPoints });
  const flame = new FlameService(fastify.prisma);
  const blocks = new GameBlockService(fastify.prisma, { missions });

  const write = runGameWrite;

  fastify.post(
    '/game/missions/:missionId/reroll',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('reroll', 10, true) },
      schema: {
        description: 'Change UNE mission du jour : 1 Meesh, une fois par jour, même difficulté (#9376). Idempotent par `requestId`.',
        tags: ['me', 'game'],
        summary: 'Reroll a daily mission',
        params: { type: 'object', required: ['missionId'], properties: { missionId: { type: 'string', minLength: 1, maxLength: 64 } } },
        body: writeBody,
        response: { 200: okResponse, 401: errorResponseSchema, 409: refusalResponse, 429: errorResponseSchema, 500: errorResponseSchema },
      },
    },
    (request: FastifyRequest<{ Params: { missionId: string }; Body: { requestId: string } }>, reply: FastifyReply) =>
      write(request, reply, (userId) =>
        missions.reroll({ userId, missionId: request.params.missionId, requestId: request.body.requestId }),
      ),
  );

  fastify.post(
    '/game/chest/claim',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('chest', 10, true) },
      schema: {
        description: 'Ouvre le coffre du jour, réclamable une fois les trois missions faites (#9375). Idempotent.',
        tags: ['me', 'game'],
        summary: 'Claim the daily chest',
        body: writeBody,
        response: { 200: okResponse, 401: errorResponseSchema, 409: refusalResponse, 429: errorResponseSchema, 500: errorResponseSchema },
      },
    },
    (request: FastifyRequest<{ Body: { requestId: string } }>, reply: FastifyReply) =>
      write(request, reply, (userId) => missions.claimChest({ userId, requestId: request.body.requestId })),
  );

  fastify.post(
    '/game/flame/freezes',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('freeze', 10, true) },
      schema: {
        description: 'Achète un gel de Flamme : 1 Meesh, 2 en réserve au plus (#9376). Idempotent par `requestId`.',
        tags: ['me', 'game'],
        summary: 'Buy a flame freeze',
        body: writeBody,
        response: { 200: okResponse, 401: errorResponseSchema, 409: refusalResponse, 429: errorResponseSchema, 500: errorResponseSchema },
      },
    },
    (request: FastifyRequest<{ Body: { requestId: string } }>, reply: FastifyReply) =>
      write(request, reply, (userId) => flame.buyFreeze({ userId, requestId: request.body.requestId })),
  );

  fastify.post(
    '/game/flame/relight',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('relight', 10, true) },
      schema: {
        description: 'Rallume une Flamme éteinte depuis moins de 48 h : 3 Meeshes, une fois par mois (#9376). Idempotent.',
        tags: ['me', 'game'],
        summary: 'Relight the flame',
        body: writeBody,
        response: { 200: okResponse, 401: errorResponseSchema, 409: refusalResponse, 429: errorResponseSchema, 500: errorResponseSchema },
      },
    },
    (request: FastifyRequest<{ Body: { requestId: string } }>, reply: FastifyReply) =>
      write(request, reply, (userId) => flame.relight({ userId, requestId: request.body.requestId })),
  );

  fastify.post(
    '/game/guide/seen',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('guide', 60, false) },
      schema: {
        description: 'Mémorise les clés de guide (étapes d’intégration, moments de Mee et Meo) déjà vues (#9378).',
        tags: ['me', 'game'],
        summary: 'Mark guide keys as seen',
        body: guideBody,
        response: { 200: okResponse, 401: errorResponseSchema, 409: refusalResponse, 429: errorResponseSchema, 500: errorResponseSchema },
      },
    },
    (request: FastifyRequest<{ Body: { requestId: string; keys: string[] } }>, reply: FastifyReply) =>
      write(request, reply, async (userId) => ({ guideSeen: await blocks.markGuideSeen(userId, request.body.keys) })),
  );

  // La vague 2 (ligues, duo, saison, vitrine, Prestige) : des routes NEUVES à côté de
  // celles-ci, qui partagent leur débit, leur enveloppe et leur exécuteur d'écriture.
  await fastify.register(meGameWave2Routes, {
    creditPoints,
    grantFreeze: (userId) => missions.grantFreeze(userId),
  });
}
