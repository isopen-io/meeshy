import type { FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { createCustomRateLimiter } from '../../utils/rate-limiter.js';
import { callerRateKey } from '../../utils/client-rate-key';
import { sendBadRequest, sendError } from '../../utils/response';

/** Un identifiant MongoDB : 24 caractères hexadécimaux. */
export const OBJECT_ID = /^[0-9a-f]{24}$/i;

export const userIdParams = {
  type: 'object',
  required: ['userId'],
  properties: { userId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
} as const;

/**
 * Le lien tel que les clients le lisent (`RelationLinkView`) — déclaré CHAMP PAR CHAMP :
 * un champ non déclaré est supprimé par le sérialiseur, et un champ déclaré est un
 * champ SERVI. Ni nom, ni présence, ni cool-down n'y figurent, par construction.
 */
export const relationLinkSchema = {
  type: 'object',
  properties: {
    userId: { type: 'string' },
    effectiveLevel: { type: 'string' },
    grantedByMe: { type: 'string' },
    since: { type: 'string', nullable: true },
    progress: {
      type: 'object',
      properties: {
        activeWeeks: { type: 'number' },
        needed: { type: 'number', nullable: true },
        missing: { type: 'array', items: { type: 'string' } },
      },
    },
    eligibleFor: { type: 'string', nullable: true },
  },
} as const;

export const errorResponses = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
  426: errorResponseSchema,
  429: errorResponseSchema,
  500: errorResponseSchema,
} as const;

export const relationLimiter = (fastify: { redis?: unknown }, keyPrefix: string, max: number) =>
  createCustomRateLimiter(
    { max, windowMs: 60_000, keyPrefix, message: 'Trop de requêtes. Patientez une minute.', keyGenerator: callerRateKey },
    (fastify.redis ?? undefined) as never,
  );

/** L'autre personne de la route : un identifiant lisible, qui n'est pas soi. */
export function otherUserOf(request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply): string | null {
  const otherId = request.params.userId;
  if (!OBJECT_ID.test(otherId) || otherId === request.user!.userId) {
    sendBadRequest(reply, 'Identifiant invalide');
    return null;
  }
  return otherId;
}

export const sendCoded = (reply: FastifyReply, status: number, message: string, code: string) =>
  sendError(reply, status, message, { code });
