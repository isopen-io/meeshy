/**
 * `tool.translation_request` (#8959) — une traduction ou une transcription
 * demandée À LA MAIN par un compte inscrit. Site UNIQUE de la règle : les huit
 * portes (REST bloquante et non bloquante, socket, pièces jointes, voix)
 * l'appellent au lieu de la réécrire.
 *
 * Seule une demande ACCEPTÉE rapporte : jamais un refus, une validation
 * échouée ni un anonyme (qui n'a pas de compteur). Le plafond est par JOUR
 * (catalogue) ; la conversation, quand elle est connue, fait en plus avancer
 * son état « N (M) ». Le crédit est hors du chemin de la réponse et ne fait
 * jamais échouer la demande.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EngagementService } from '../engagement/EngagementService';

export type TranslationRequestEngagement = Pick<EngagementService, 'recordActivity'>;

/**
 * Le moteur, construit au PREMIER crédit et non à l'enregistrement de la
 * route : `fastify.prisma` peut n'être décoré qu'après, et un crédit ne doit
 * jamais faire échouer le montage d'une route.
 */
export function lazyTranslationRequestEngagement(prismaOf: () => PrismaClient): TranslationRequestEngagement {
  let instance: EngagementService | null = null;
  return {
    recordActivity: (userId, operationKey, options) => {
      instance ??= new EngagementService(prismaOf());
      return instance.recordActivity(userId, operationKey, options);
    },
  };
}

/** L'identité de l'appelant, telle que la porte la connaît. */
export type TranslationRequester = {
  readonly userId?: string | null;
  readonly isAnonymous?: boolean | null;
};

export function creditTranslationRequest(params: {
  readonly engagement: TranslationRequestEngagement | null;
  readonly requester: TranslationRequester | null | undefined;
  readonly conversationId?: string | null;
  readonly onError: (error: unknown) => void;
}): void {
  const { engagement, requester, conversationId, onError } = params;
  const userId = requester?.userId;
  if (!engagement || !userId || requester?.isAnonymous) return;
  void Promise.resolve()
    .then(() =>
      engagement.recordActivity(userId, 'tool.translation_request', conversationId ? { conversationId } : {})
    )
    .catch(onError);
}

/**
 * Le crochet `onResponse` d'une route de traduction : crédite quand la réponse
 * PARTIE est un succès (2xx). Une route aux nombreuses sorties réussies
 * (résultat en cache, tâche lancée, synchrone) n'a ainsi qu'un seul site de
 * crédit, qui ne peut en oublier aucune ni payer un refus.
 */
export function creditAcceptedTranslationRequest(params: {
  readonly engagement: TranslationRequestEngagement | null;
  readonly requesterOf: (request: FastifyRequest) => TranslationRequester | null | undefined;
  readonly onError: (error: unknown) => void;
}): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    if (reply.statusCode < 200 || reply.statusCode >= 300) return;
    creditTranslationRequest({
      engagement: params.engagement,
      requester: params.requesterOf(request),
      onError: params.onError,
    });
  };
}
