/**
 * `PUT /me/birth-date` — la date de naissance, déclarée UNE fois (#9927).
 *
 * Demandée à l'onboarding, facultative : un âge non déclaré ne restreint rien.
 * Sous 13 ans révolus, la déclaration est refusée et rien n'est écrit. De 13 à
 * 17 ans, Meeshy Global passe en lecture seule (règle CALCULÉE depuis
 * `User.birthDate`, qui tombe d'elle-même aux 18 ans). Une date déjà posée ne
 * se redéclare pas — un mineur ne se déclare pas majeur ensuite ; une
 * correction passe par le support.
 *
 * Le journal ne porte jamais la date : seulement la classe d'âge qui en sort.
 *
 * Montage AUTONOME au préfixe `/me`, même patron que `me/onboarding.ts`.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { BirthDateDeclarationBodySchema } from '@meeshy/shared/types/onboarding';
import { parseBirthDateDay } from '@meeshy/shared/utils/age';
import { ErrorCode, ErrorMessages } from '@meeshy/shared/types/errors';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { OnboardingService } from '../../services/onboarding/OnboardingService';
import {
  sendBadRequest,
  sendError,
  sendInternalError,
  sendNotFound,
  sendSuccess,
  sendUnauthorized,
} from '../../utils/response.js';
import { logError } from '../../utils/logger';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { AUTH_ERROR_CODES } from '../../utils/auth-error-codes';

const logger = enhancedLogger.child({ module: 'MeBirthDate' });

export type MeBirthDateRoutesOptions = {
  readonly now?: () => Date;
};

function birthDateRateLimitConfig() {
  return {
    max: 10,
    timeWindow: '1 minute',
    hook: 'preHandler' as const,
    skipOnError: true,
    keyGenerator: (request: FastifyRequest) => {
      const userId = request.auth?.userId;
      return userId ? `me:birth-date:${userId}` : `me:birth-date:ip:${request.ip}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: 'Trop de requêtes (me/birth-date). Veuillez patienter.',
      statusCode: 429,
    }),
  };
}

const birthDateResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ageClass: { type: 'string', enum: ['adult', 'minor'] },
        viewerWriteRestrictionGlobal: { type: 'boolean' },
      },
    },
  },
} as const;

const INVALID_BIRTH_DATE = 'La date de naissance doit être un jour passé, au format AAAA-MM-JJ, il y a moins de 120 ans';

export async function meBirthDateRoutes(fastify: FastifyInstance, options: MeBirthDateRoutesOptions = {}) {
  const now = options.now ?? (() => new Date());
  const service = new OnboardingService(fastify.prisma);

  fastify.put(
    '/birth-date',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: birthDateRateLimitConfig() },
      schema: {
        description:
          "Déclare la date de naissance de l'utilisateur AUTHENTIFIÉ (#9927), UNE seule fois — `{ birthDate: 'AAAA-MM-JJ' }`. " +
          'Moins de 13 ans révolus : 422 AGE_BELOW_MINIMUM, rien n’est écrit. Date future, improbable (plus de 120 ans) ou ' +
          'hors format : 400. Date déjà posée : 409 BIRTH_DATE_ALREADY_SET. Succès : la classe d’âge, et si Meeshy Global ' +
          'est désormais en lecture seule (13-17 ans) ; l’étape `age` de l’onboarding est marquée faite.',
        tags: ['me', 'onboarding'],
        summary: 'Declare birth date (once)',
        response: {
          200: birthDateResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          422: errorResponseSchema,
          429: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.auth?.userId;
      if (!userId) return sendUnauthorized(reply, 'Authentication required', { code: AUTH_ERROR_CODES.UNAUTHORIZED });
      const body = BirthDateDeclarationBodySchema.safeParse(request.body);
      const birthDate = body.success ? parseBirthDateDay(body.data.birthDate) : null;
      if (!birthDate) return sendBadRequest(reply, INVALID_BIRTH_DATE, { code: 'VALIDATION_ERROR' });
      try {
        const outcome = await service.declareBirthDate(userId, birthDate, now());
        switch (outcome.kind) {
          case 'declared':
            logger.info('birth date declared', { userId, ageClass: outcome.ageClass });
            return sendSuccess(reply, {
              ageClass: outcome.ageClass,
              viewerWriteRestrictionGlobal: outcome.viewerWriteRestrictionGlobal,
            });
          case 'already-set':
            return sendError(reply, 409, ErrorMessages[ErrorCode.BIRTH_DATE_ALREADY_SET].fr, {
              code: ErrorCode.BIRTH_DATE_ALREADY_SET,
            });
          case 'below-minimum':
            logger.info('birth date refused below minimum age', { userId });
            return sendError(reply, 422, ErrorMessages[ErrorCode.AGE_BELOW_MINIMUM].fr, {
              code: ErrorCode.AGE_BELOW_MINIMUM,
            });
          case 'invalid':
            return sendBadRequest(reply, INVALID_BIRTH_DATE, { code: 'VALIDATION_ERROR' });
          case 'user-not-found':
            return sendNotFound(reply, 'USER_NOT_FOUND');
        }
      } catch (error) {
        logError(fastify.log, '[PUT /me/birth-date]', error);
        return sendInternalError(reply, 'Error declaring birth date');
      }
    },
  );
}
