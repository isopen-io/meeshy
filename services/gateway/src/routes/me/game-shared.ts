/**
 * Ce que les routes du jeu partagent (#9375 à #9392) — le débit par COMPTE, les
 * schémas d'enveloppe et l'exécuteur d'écriture qui sert un REFUS motivé en 409
 * avec le code du contrat. Un seul site : les deux vagues de routes (`game.ts`,
 * `game-wave2.ts`) ne réécrivent aucun de ces morceaux.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { GameRefusal } from '../../services/game/GameRefusal';
import { AUTH_ERROR_CODES } from '../../utils/auth-error-codes';
import { logError } from '../../utils/logger';
import { sendError, sendInternalError, sendSuccess, sendUnauthorized } from '../../utils/response.js';

/**
 * Débit par COMPTE. Les dépenses de Meeshes sont FAIL-CLOSED (une panne du
 * magasin de débit les ferme : on ne dépense pas une monnaie pendant que sa
 * garde est aveugle, le refus ne coûte rien) ; les lectures et les gestes qui
 * ne touchent aucune valeur restent ouverts.
 */
export function gameRateLimitConfig(name: string, max: number, failClosed: boolean) {
  return {
    max,
    timeWindow: '1 minute',
    hook: 'preHandler' as const,
    skipOnError: !failClosed,
    keyGenerator: (request: FastifyRequest) => {
      const userId = request.auth?.userId;
      return userId ? `me:game:${name}:${userId}` : `me:game:${name}:ip:${request.ip}`;
    },
    errorResponseBuilder: () => ({ success: false, error: 'Trop de requêtes. Veuillez patienter.', statusCode: 429 }),
  };
}

export const requestIdSchema = { type: 'string', minLength: 8, maxLength: 64 } as const;

export const writeBody = {
  type: 'object',
  required: ['requestId'],
  properties: { requestId: requestIdSchema },
  additionalProperties: false,
} as const;

/** La forme exacte est celle du schéma partagé, vérifiée par les tests de contrat. */
export const okResponse = {
  type: 'object',
  properties: { success: { type: 'boolean' }, data: { type: 'object', additionalProperties: true } },
} as const;

/**
 * Le 409 déclare EN PLUS les champs d'appoint que `sendError` étale à la racine
 * (`reason`, `balance`, `details`) : sans quoi le sérialiseur les supprime, et
 * l'écran ne saurait pas POURQUOI le geste est refusé.
 */
export const refusalResponse = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    reason: { type: 'string' },
    balance: { type: 'number' },
    requiredLevel: { type: 'number' },
    status: { type: 'string' },
  },
} as const;

/** Authentifie, exécute, sert le résultat ou le refus motivé. */
export async function runGameWrite<T>(request: FastifyRequest, reply: FastifyReply, work: (userId: string) => Promise<T>) {
  const userId = request.auth?.userId;
  if (!userId) return sendUnauthorized(reply, 'Authentication required', { code: AUTH_ERROR_CODES.UNAUTHORIZED });
  try {
    return sendSuccess(reply, await work(userId));
  } catch (error) {
    if (error instanceof GameRefusal) {
      return sendError(reply, 409, error.code, { code: error.code, ...(error.details ? { details: { ...error.details } } : {}) });
    }
    logError('Error in game write', error, { source: 'me-game-routes' });
    return sendInternalError(reply, 'GAME_WRITE_FAILED');
  }
}
