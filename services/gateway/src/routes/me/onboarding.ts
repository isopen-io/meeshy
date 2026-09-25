/**
 * `GET`/`PATCH /me/onboarding` — l'onboarding post-inscription (#7729).
 *
 * L'état vit sur `User` (`onboardingCompletedAt`, `onboardingSteps`) et se
 * calcule dans `OnboardingService`, seul site : éligibilité, fenêtre de 7
 * jours, pré-cochage depuis l'engagement, régime protégé, suggestions. La
 * route authentifie, valide le corps par le schéma Zod PARTAGÉ et sérialise.
 *
 * Montage AUTONOME au préfixe `/me` (`onRequest: [fastify.authenticate]`),
 * même patron que `me/engagement.ts`.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ONBOARDING_STEP_IDS, OnboardingPatchBodySchema } from '@meeshy/shared/types/onboarding';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { OnboardingService } from '../../services/onboarding/OnboardingService';
import {
  sendBadRequest,
  sendInternalError,
  sendNotFound,
  sendSuccess,
  sendUnauthorized,
} from '../../utils/response.js';
import { logError } from '../../utils/logger';
import { AUTH_ERROR_CODES } from '../../utils/auth-error-codes';

export type MeOnboardingRoutesOptions = {
  readonly now?: () => Date;
};

function onboardingRateLimitConfig() {
  return {
    max: 60,
    timeWindow: '1 minute',
    hook: 'preHandler' as const,
    skipOnError: true,
    keyGenerator: (request: FastifyRequest) => {
      const userId = request.auth?.userId;
      return userId ? `me:onboarding:${userId}` : `me:onboarding:ip:${request.ip}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: 'Trop de requêtes (me/onboarding). Veuillez patienter.',
      statusCode: 429,
    }),
  };
}

const stepIdsSchema = { type: 'array', items: { type: 'string', enum: [...ONBOARDING_STEP_IDS] } } as const;

/**
 * Le sérialiseur n'écrit QUE ces propriétés : un champ ajouté par erreur à une
 * suggestion (présence, date de naissance) ne peut pas partir.
 */
const suggestionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    username: { type: 'string' },
    displayName: { type: 'string' },
    avatarUrl: { type: ['string', 'null'] },
    languages: { type: 'array', items: { type: 'string' } },
  },
} as const;

const onboardingResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      additionalProperties: false,
      properties: {
        eligible: { type: 'boolean' },
        completedAt: { type: ['string', 'null'] },
        seenSteps: stepIdsSchema,
        prefilledSteps: stepIdsSchema,
        globalConversationId: { type: ['string', 'null'] },
        protectedRegime: { type: 'boolean' },
        storyDefaultVisibility: { type: 'string', enum: ['public', 'friends'] },
        suggestions: { type: 'array', items: suggestionSchema },
        // #7907 — l'adresse est-elle vérifiée, et la story passera-t-elle la
        // garde du courriel (vérifié, OU première story du compte) ?
        emailVerified: { type: 'boolean' },
        canPublishStory: { type: 'boolean' },
        // #7910 — demandes d'ami ENVOYÉES par le compte, toujours en attente.
        pendingFriendRequests: { type: 'integer', minimum: 0 },
        // #7908 — ce que chaque geste créditera à l'élan courant.
        stepRewards: {
          type: 'object',
          additionalProperties: false,
          properties: {
            global: { type: 'integer', minimum: 0 },
            story: { type: 'integer', minimum: 0 },
            friendship: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
  },
} as const;

const errorResponses = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  404: errorResponseSchema,
  429: errorResponseSchema,
  500: errorResponseSchema,
} as const;

export async function meOnboardingRoutes(fastify: FastifyInstance, options: MeOnboardingRoutesOptions = {}) {
  const now = options.now ?? (() => new Date());
  const service = new OnboardingService(fastify.prisma);

  fastify.get(
    '/onboarding',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: onboardingRateLimitConfig() },
      schema: {
        description:
          "État de l'onboarding post-inscription (#7729) de l'utilisateur AUTHENTIFIÉ : éligibilité " +
          '(compte créé depuis le 2026-09-24, non fini, de moins de 7 jours — au-delà, le parcours est clos), ' +
          'étapes vues, étapes déjà faites par l\'engagement, Meeshy Global, régime protégé (âge inconnu ou ' +
          '< 18 ans) et au plus 6 suggestions sans croisement de classe d\'âge (adulte, mineur, inconnu) ni présence. ' +
          'Depuis #7907/#7908/#7910 : courriel vérifié, story publiable, demandes envoyées en attente, points de chaque geste à l\'élan courant.',
        tags: ['me', 'onboarding'],
        summary: 'Get onboarding state',
        response: { 200: onboardingResponseSchema, ...errorResponses },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.auth?.userId;
      if (!userId) return sendUnauthorized(reply, 'Authentication required', { code: AUTH_ERROR_CODES.UNAUTHORIZED });
      try {
        const state = await service.getState(userId, now());
        if (!state) return sendNotFound(reply, 'USER_NOT_FOUND');
        reply.header('Cache-Control', 'private, no-cache');
        return sendSuccess(reply, state);
      } catch (error) {
        logError(fastify.log, '[GET /me/onboarding]', error);
        return sendInternalError(reply, 'Error reading onboarding state');
      }
    },
  );

  fastify.patch(
    '/onboarding',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: onboardingRateLimitConfig() },
      schema: {
        description:
          "Enregistre une étape vue de l'onboarding (#7729) — `{ step, outcome: 'done' | 'skipped' }` — ou " +
          "clôt le parcours — `{ finish: true }`. Idempotent. `finish` ou les cinq étapes vues posent " +
          '`completedAt`. Rend l\'état complet, même forme que le GET.',
        tags: ['me', 'onboarding'],
        summary: 'Record onboarding progress',
        response: { 200: onboardingResponseSchema, ...errorResponses },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.auth?.userId;
      if (!userId) return sendUnauthorized(reply, 'Authentication required', { code: AUTH_ERROR_CODES.UNAUTHORIZED });
      const body = OnboardingPatchBodySchema.safeParse(request.body);
      if (!body.success) return sendBadRequest(reply, 'Invalid onboarding update', { code: 'VALIDATION_ERROR' });
      try {
        const state = await service.recordStep(userId, body.data, now());
        if (!state) return sendNotFound(reply, 'USER_NOT_FOUND');
        reply.header('Cache-Control', 'private, no-cache');
        return sendSuccess(reply, state);
      } catch (error) {
        logError(fastify.log, '[PATCH /me/onboarding]', error);
        return sendInternalError(reply, 'Error recording onboarding progress');
      }
    },
  );
}
