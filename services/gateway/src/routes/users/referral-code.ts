/**
 * `GET /users/me/referral-code` — le code de parrainage INTRINSÈQUE au
 * compte de l'appelant (#3690), généré paresseusement au premier accès.
 * Distinct de `GET /users/:userId/affiliate-token` (`devices.ts`), qui sert
 * un jeton de CAMPAGNE créé explicitement — jamais l'inverse.
 *
 * `me` seulement : l'id vient de `authContext.userId`, jamais d'un paramètre
 * d'URL — aucune surface pour lire le code d'un AUTRE compte.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendUnauthorized, sendInternalError } from '../../utils/response';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { AuthenticatedRequest } from './types';
import { ensureReferralCode } from '../../services/ReferralCodeService';

export async function getReferralCode(fastify: FastifyInstance) {
  fastify.get('/users/me/referral-code', {
    onRequest: [fastify.authenticate],
    schema: {
      description: "Get the caller's intrinsic referral code, generated on first access.",
      tags: ['users'],
      summary: 'Get my referral code',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                referralCode: { type: 'string' },
              },
            },
          },
        },
        401: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const referralCode = await ensureReferralCode(fastify.prisma, authContext.userId);
      return sendSuccess(reply, { referralCode });
    } catch (error) {
      logError(fastify.log, '[REFERRAL-CODE] Error fetching referral code', error);
      return sendInternalError(reply, 'Failed to fetch referral code');
    }
  });
}
