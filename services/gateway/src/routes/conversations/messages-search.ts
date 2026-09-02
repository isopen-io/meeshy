/**
 * Surface RECHERCHE DE MESSAGES (issue #4284 — découpage de `messages.ts`,
 * 2945 lignes, en fichiers frères par responsabilité). Porte la route
 * `GET /conversations/:id/messages/search` (recherche par contenu ET
 * traductions, curseur `createdAt`, respecte le masquage personnel et le
 * plancher d'historique). Voir `messages.ts` pour le composeur
 * (`registerMessagesRoutes`), qui appelle `registerMessageSearchRoute`.
 */
import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { hoistLocationOnto } from '../../services/location/sharedPlace';
import {
  applyHistoryFloor,
  historyReaderFromAuthContext,
  loadReaderHistoryFloor
} from '../../services/historyFloor';
import { resolveParticipantAvatar, resolveParticipantDisplayName } from '@meeshy/shared/utils/participant-helpers';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import {
  loadPersonalHistoryHiding,
  applyPersonalHistoryHiding
} from '../../services/personalHistoryFilter';
import { validatePagination } from '../../utils/pagination';
import {
  messageSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import {
  refuserAccesConversation,
  verdictAccesConversation,
  type MessagesDeRefusDAcces
} from './utils/access-control';
import type { ConversationParams } from './types';
import { sendForbidden, sendInternalError } from '../../utils/response.js';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { presenceMissingEntryPolicy, viewerFromRequest } from '../users/presence-gate';
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import { transformTranslationsToArray } from '../../utils/translation-transformer';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { logger } from './messages-shared';

/**
 * LES DEUX REFUS DE CETTE ROUTE NE SONT PAS LE MÊME REFUS (#4792).
 *
 * `nonMembre` garde le mot que la route servait — `'Unauthorized'`, une prose
 * qui disait déjà « authentification » sous le statut d'un refus de DROIT, et
 * qui reste juste pour un non-membre AUTHENTIFIÉ. Ce qui change est le sort de
 * la session ABSENTE ou MORTE : montée en `optionalAuth`, cette route la
 * laissait entrer jusqu'ici puis lui répondait 403, le seul statut qu'aucun
 * client ne lit comme « rafraîchis ta session ».
 */
const REFUS_DE_RECHERCHE: MessagesDeRefusDAcces = {
  sansSession: 'Authentication required to search this conversation',
  nonMembre: 'Unauthorized'
};

/**
 * Enregistre la route de recherche de messages dans une conversation.
 */
export function registerMessageSearchRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any
) {
  // ===== SEARCH MESSAGES IN CONVERSATION =====

  fastify.get<{
    Params: ConversationParams;
    Querystring: { q: string; limit?: string; cursor?: string };
  }>('/conversations/:id/messages/search', {
    schema: {
      description: 'Search messages within a conversation by content or translations',
      tags: ['conversations', 'messages'],
      summary: 'Search messages in conversation',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', description: 'Search query', minLength: 2 },
          limit: { type: 'string', description: 'Max results (default 20)' },
          cursor: { type: 'string', description: 'Message ID cursor for pagination' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: messageSchema },
            cursorPagination: {
              type: 'object',
              properties: {
                hasMore: { type: 'boolean' },
                nextCursor: { type: 'string', nullable: true },
                limit: { type: 'integer' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { q, limit: limitStr = '20', cursor } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Route the page size through the pagination SSOT (as the paged
      // `GET .../messages` above already does). The querystring schema declares
      // `limit` as a bare string with no numeric bounds, so the inline
      // `parseInt(limitStr) || 20` used to reintroduce the exact defect
      // `validatePagination` documents killing: `limit=0` falsy-coerced to a
      // full page instead of the floor of 1, and `limit=-5` flowed through as a
      // NEGATIVE Prisma `take`. Search is cursor-based, so only the limit is used.
      const { limit: searchLimit } = validatePagination('0', limitStr, { maxLimit: 50 });

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Conversation not found');
      }

      const acces = await verdictAccesConversation(prisma, authRequest.authContext, conversationId, id);
      if (acces.genre !== 'ok') {
        return refuserAccesConversation(reply, acces, REFUS_DE_RECHERCHE);
      }

      const queryLower = q.toLowerCase().trim();

      // Build where clause for content search
      const whereClause: any = {
        conversationId,
        deletedAt: null,
        content: { contains: queryLower, mode: 'insensitive' }
      };

      if (cursor) {
        // Oracle d'horodatage fermé (#4177) — même défaut, même correctif que
        // sur `GET .../messages?before=` : sans `conversationId`, un id volé
        // à un AUTRE fil faisait fuiter son `createdAt` RÉEL, qui bornait
        // ensuite CETTE recherche.
        const cursorMsg = await prisma.message.findFirst({
          where: { id: cursor, conversationId },
          select: { createdAt: true }
        });
        if (cursorMsg) {
          whereClause.createdAt = { lt: cursorMsg.createdAt };
        }
      }

      const messageSelect = {
        id: true,
        conversationId: true,
        content: true,
        originalLanguage: true,
        messageType: true,
        translations: true,
        createdAt: true,
        senderId: true,
        // Lot 1 : un résultat de recherche est une bulle complète elle
        // aussi — sans `metadata`, un message géolocalisé trouvé par
        // recherche n'affiche jamais sa position.
        metadata: true,
        sender: {
          // `sender` is a `Participant`, which has no `username`/`isOnline` of
          // its own — those live on the related `User`. Selecting `username`
          // directly on Participant throws PrismaClientValidationError and
          // 500s the whole search. Mirror the canonical message-sender select
          // (cf. pinned-messages route) and pull username via the `user`
          // relation; it is flattened back to the top level below so the
          // userMinimalSchema response serializer keeps it.
          select: {
            id: true,
            userId: true,
            displayName: true,
            avatar: true,
            type: true,
            user: { select: { id: true, username: true, displayName: true, avatar: true, isOnline: true } }
          }
        }
      };

      // La recherche est la surface la plus facile à oublier et la plus
      // révélatrice : elle rend un message par son CONTENU, donc un historique
      // effacé y ressort intégralement dès qu'on en connaît un mot.
      const searchHiding = await loadPersonalHistoryHiding(prisma, {
        userId: authRequest.authContext.type === 'anonymous' ? null : userId,
        conversationId
      });
      // Même raison pour le plancher : chercher un mot est le moyen le plus
      // court de lire ce qui précède son arrivée.
      const searchFloor = await loadReaderHistoryFloor(prisma, {
        conversationId,
        reader: historyReaderFromAuthContext(authRequest.authContext)
      });

      // Search content AND translations in parallel
      const [contentMatches, translationCandidates] = await Promise.all([
        prisma.message.findMany({
          where: applyPersonalHistoryHiding(applyHistoryFloor(whereClause, searchFloor), searchHiding),
          select: messageSelect,
          orderBy: { createdAt: 'desc' },
          take: searchLimit + 1
        }),
        prisma.message.findMany({
          where: applyPersonalHistoryHiding(
            applyHistoryFloor(
              {
                conversationId,
                deletedAt: null,
                NOT: { content: { contains: queryLower, mode: 'insensitive' } },
                translations: { not: { equals: null } },
                ...(cursor ? { createdAt: whereClause.createdAt } : {})
              },
              searchFloor
            ),
            searchHiding
          ),
          select: messageSelect,
          orderBy: { createdAt: 'desc' },
          take: 200
        })
      ]);

      const translationMatches = translationCandidates.filter((msg: any) => {
        if (!msg.translations || typeof msg.translations !== 'object') return false;
        return Object.values(msg.translations).some((t: any) => {
          const text = typeof t === 'string' ? t : t?.text || t?.content || '';
          return text.toLowerCase().includes(queryLower);
        });
      });

      // Merge and deduplicate results
      const seenIds = new Set(contentMatches.map(m => m.id));
      const merged = [...contentMatches];
      for (const tm of translationMatches) {
        if (!seenIds.has(tm.id)) {
          seenIds.add(tm.id);
          merged.push(tm);
        }
      }

      // Sort by createdAt desc and apply limit
      merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const hasMore = merged.length > searchLimit;
      const results = merged.slice(0, searchLimit);

      const lastId = results.length > 0 ? results[results.length - 1].id : null;

      // Régime STRICT (2026-08-25) : self/ADMIN+/ami seuls.
      const msgSearchPresenceViewer = viewerFromRequest(request);
      const searchMissingEntry = presenceMissingEntryPolicy(msgSearchPresenceViewer);
      const searchPresenceVis = await getPresenceVisibilityService(prisma).resolveForTargets(
        msgSearchPresenceViewer,
        results
          .map((msg: any) => msg.sender?.userId)
          .filter((uid: string | null | undefined): uid is string => !!uid)
      );

      // Transform translations JSON → array format for SDK compatibility and
      // flatten the participant `sender` (username/isOnline come from the nested
      // `user` relation) so the userMinimalSchema serializer keeps them.
      const mappedResults = results.map((msg: any) => {
        const sender = msg.sender;
        // Lot 1 : hoistLocationOnto hisse metadata.location en `location`
        // top-level — un résultat de recherche géolocalisé le perdait sinon.
        return hoistLocationOnto({
          ...msg,
          // #4177 — même résolution que `GET .../messages` : `msg.senderId`
          // (spread ci-dessus) est le `Participant.id` BRUT stocké en base,
          // jamais le `User.id` que les clients comparent à LEUR `userId`.
          // Servi tel quel, un résultat de recherche répondait FAUX à « est-ce
          // moi qui ai envoyé ce message ? » pour le même message que la
          // liste principale identifie correctement.
          senderId: sender?.userId ?? sender?.user?.id ?? msg.senderId,
          sender: sender ? applyPresenceVisibilityAsOffline(
            {
              id: sender.id,
              userId: sender.userId,
              displayName: resolveParticipantDisplayName(sender),
              avatar: resolveParticipantAvatar(sender),
              username: sender.user?.username ?? null,
              isOnline: sender.user?.isOnline ?? false
            },
            sender.userId ? searchPresenceVis.get(sender.userId) : undefined,
            { onMissingEntry: searchMissingEntry },
          ) : null,
          translations: msg.translations
            ? transformTranslationsToArray(msg.id, msg.translations as Record<string, any>)
            : undefined
        });
      });

      // NOTE: Cannot use sendSuccess() — response includes a top-level `cursorPagination`
      // field that iOS SDK (MessagesSearchResponse) and web (crud.service.ts) parse at
      // root level. Migration to sendSuccess requires a coordinated client update
      // (breaking change).
      reply.send({
        success: true,
        data: mappedResults,
        cursorPagination: {
          hasMore,
          nextCursor: hasMore ? lastId : null,
          limit: searchLimit
        }
      });

    } catch (error) {
      logger.error('Error searching messages', error);
      return sendInternalError(reply, 'Error searching messages');
    }
  });
}
