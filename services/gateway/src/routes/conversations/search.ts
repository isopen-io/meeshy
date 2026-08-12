import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  generateDefaultConversationTitle,
  resolveUserLanguagesOrdered
} from '@meeshy/shared/utils/conversation-helpers';
import { resolveParticipantAvatar, resolveParticipantDisplayName } from '@meeshy/shared/utils/participant-helpers';
import { MessageReadStatusService } from '../../services/MessageReadStatusService.js';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationMinimalSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import type { SearchQuery } from './types';
import { sendSuccess, sendInternalError } from '../../utils/response';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { sharedPlaceFromMetadata } from '../../services/location/sharedPlace';
import {
  buildLastMessagePreviewTranslations,
  truncateMessagePreview
} from './utils/last-message-preview';

const logger = enhancedLogger.child({ module: 'ConversationSearchRoutes' });

/**
 * Enregistre les routes de recherche de conversations
 */
export function registerSearchRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  // Route pour rechercher des conversations
  fastify.get<{ Querystring: SearchQuery }>('/conversations/search', {
    schema: {
      description: 'Search conversations by title or participant names',
      tags: ['conversations'],
      summary: 'Search conversations',
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', description: 'Search query string', minLength: 1 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: conversationMinimalSchema
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { q } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      if (!q || q.trim().length === 0) {
        return sendSuccess(reply, []);
      }

      // Step 1: Find matching user IDs by name search
      const matchingUsers = await prisma.user.findMany({
        where: {
          isActive: true,
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
            { displayName: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 100,
      });
      const matchingUserIds = matchingUsers.map(u => u.id);

      // Step 2: Find conversations matching by participant userId OR by title
      const participantMatchFilter = matchingUserIds.length > 0
        ? [
            { title: { contains: q, mode: 'insensitive' as const } },
            { participants: { some: { userId: { in: matchingUserIds }, isActive: true } } },
          ]
        : [{ title: { contains: q, mode: 'insensitive' as const } }];

      const conversations = await prisma.conversation.findMany({
        where: {
          isActive: true,
          AND: [
            { OR: participantMatchFilter },
            {
              OR: [
                { type: 'public' },
                { type: 'global' },
                { participants: { some: { userId, isActive: true } } },
              ],
            },
          ],
        },
        include: {
          _count: { select: { participants: { where: { isActive: true } } } },
          participants: {
            where: { isActive: true },
            select: {
              id: true,
              userId: true,
              displayName: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                },
              },
            },
            take: 5,
          },
          messages: {
            where: {
              deletedAt: null
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              sender: {
                select: {
                  id: true,
                  userId: true,
                  displayName: true,
                  avatar: true,
                  user: {
                    select: {
                      id: true,
                      username: true,
                      displayName: true,
                      avatar: true,
                      isOnline: true,
                    },
                  },
                },
              },
              attachments: { take: 1 },
              _count: { select: { attachments: true } },
            },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 50,
      });

      // Compute unread counts — iter-4: appel direct par userId (2+N queries vs 4×N)
      const readStatusService = new MessageReadStatusService(prisma);
      const conversationIds = conversations.map(c => c.id);
      const unreadCountMap = conversationIds.length > 0
        ? await readStatusService.getUnreadCountsForUser(userId, conversationIds)
        : new Map<string, number>();

      // Prisme Linguistique du lecteur : systemLanguage → regionalLanguage →
      // customDestinationLanguage → deviceLocale. Résolu UNE fois pour la page,
      // depuis l'utilisateur déjà chargé par le middleware d'auth — aucune
      // requête supplémentaire. `resolveUserLanguagesOrdered` est la seule
      // autorité du dépôt sur cet ordre : ne jamais le réimplémenter ici.
      // Même code que `GET /conversations` (core.ts), volontairement — les deux
      // routes servent la MÊME ligne de liste et doivent la résoudre pareil.
      const viewerPrefs = authRequest.authContext.registeredUser as
        | {
            systemLanguage?: string | null;
            regionalLanguage?: string | null;
            customDestinationLanguage?: string | null;
            deviceLocale?: string | null;
          }
        | undefined;
      const viewerLanguages = viewerPrefs
        ? resolveUserLanguagesOrdered(viewerPrefs, {
            deviceLocale: viewerPrefs.deviceLocale ?? undefined
          })
        : [];

      // Présence des expéditeurs de lastMessage : gate showOnlineStatus —
      // même règle que GET /conversations (cf. core.ts).
      const senderPresenceVis = await getPresenceVisibilityService(prisma).resolvePrefsOnly(
        conversations
          .map((conversation) => (conversation.messages[0]?.sender as any)?.userId)
          .filter((uid: string | null | undefined): uid is string => !!uid)
      );

      // Transformer les conversations pour un payload léger (search)
      const results = conversations.map((conversation) => {
        const displayTitle = (conversation as any).type === 'direct'
          ? (conversation.title || null)
          : (conversation.title && conversation.title.trim() !== ''
              ? conversation.title
              : generateDefaultConversationTitle(
                  conversation.participants.map((m: any) => ({
                    id: m.userId,
                    displayName: m.user?.displayName,
                    username: m.user?.username,
                  })),
                  userId
                ));

        const unreadCount = unreadCountMap.get(conversation.id) || 0;

        const msg = conversation.messages[0];
        const sender = msg?.sender as any;
        // `_count.attachments` MUST be propagated so the iOS conv-row can
        // render the "+N" badge when `attachments` above is truncated by
        // Prisma's `take: 1`. Fastify silently strips fields not declared
        // in the response schema (cf. feedback_fastify_schema_strips_fields)
        // AND a hand-mapped object like this one drops anything we don't
        // copy explicitly — both layers can blank the field. Mirror exactly
        // what `core.ts` does via `{ ...msg }`.
        // Lot 3 : `metadata` (donc `metadata.location`) est déjà récupéré par
        // le `include` Prisma ci-dessus (aucun `select` restrictif sur
        // `messages`), mais était jusqu'ici jeté par cette reconstruction
        // manuelle — la donnée était payée puis perdue. Hisser explicitement.
        const place = sharedPlaceFromMetadata((msg as { metadata?: unknown } | undefined)?.metadata);
        const lastMessage = msg ? {
          id: msg.id,
          // Même borne que `GET /conversations` : la carte d'aperçu traduite
          // ci-dessous est tronquée par `buildLastMessagePreviewTranslations`,
          // et servir l'original en entier ferait dépendre le poids de la ligne
          // de la langue du lecteur. Le contenu complet passe toujours par
          // `GET /conversations/:id/messages`.
          content: truncateMessagePreview(msg.content),
          senderId: msg.senderId,
          messageType: msg.messageType,
          createdAt: msg.createdAt,
          sender: sender ? {
            id: sender.id,
            userId: sender.userId,
            username: sender.user?.username ?? null,
            displayName: resolveParticipantDisplayName(sender),
            avatar: resolveParticipantAvatar(sender),
            isOnline: senderPresenceVis.get(sender.userId ?? '')?.showOnline === false
              ? false
              : (sender.user?.isOnline ?? false),
          } : null,
          attachments: msg.attachments || [],
          _count: (msg as any)._count,
          ...(place ? { location: place } : {}),
        } : null;

        return {
          id: conversation.id,
          identifier: conversation.identifier,
          title: displayTitle,
          type: conversation.type,
          avatar: conversation.avatar,
          banner: conversation.banner,
          isActive: conversation.isActive,
          communityId: conversation.communityId,
          memberCount: (conversation as any)._count?.participants ?? 0,
          lastMessage,
          // Prisme Linguistique de la ligne de liste — jumeau de `core.ts`.
          // Les deux colonnes vivent dans le MÊME document Mongo que le message
          // et le `include` ci-dessus (sans `select` restrictif) les rapportait
          // déjà : la donnée était payée puis jetée par ce mapping manuel,
          // exactement comme `metadata.location` avant le Lot 3. Elles sont
          // posées au niveau CONVERSATION et non dans `lastMessage` parce que
          // c'est là que les clients les lisent
          // (`MeeshyConversation.resolvedLastMessagePreview`,
          // `formatLastMessage` côté web) et que la carte compacte
          // `{ langue: aperçu }` n'a pas la forme de `Message.translations`.
          lastMessageOriginalLanguage: msg?.originalLanguage ?? null,
          lastMessageTranslations: buildLastMessagePreviewTranslations({
            translations: (msg as { translations?: unknown } | undefined)?.translations,
            originalLanguage: msg?.originalLanguage,
            viewerLanguages
          }),
          lastMessageAt: conversation.lastMessageAt,
          createdAt: conversation.createdAt,
          unreadCount,
        };
      });

      return sendSuccess(reply, results);
    } catch (error) {
      logger.error('Error searching conversations', error as Error);
      sendInternalError(reply, 'Erreur lors de la recherche de conversations');
    }
  });
}
