/**
 * Surface DÉTAIL de `conversations/core.ts` — `GET /conversations/check-identifier/:identifier`,
 * `GET /conversations/:id` et `GET /conversations/:id/analysis`. Extrait de
 * `core.ts` lors du découpage #4284 ; voir `core.ts` pour le point d'entrée
 * `registerCoreRoutes` qui appelle ces registrars.
 */
import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationResponseSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation, resolveCallerParticipant } from './utils/access-control';
import { sendSuccess, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { presenceFor, viewerFromRequest } from '../users/presence-gate';
import { generateDefaultConversationTitle } from '@meeshy/shared/utils/conversation-helpers';
import { canViewExactMemberCount, presentMemberCount } from '@meeshy/shared/utils/member-visibility';
import type { ConversationParams } from './types';
import { conversationDetailInclude, conversationUserPreferencesSelect } from './core-selects';

const logger = enhancedLogger.child({ module: 'conversations/core' });

/**
 * Enregistre `GET /conversations/check-identifier/:identifier`.
 */
export function registerCheckIdentifierRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  // Route pour vérifier la disponibilité d'un identifiant de conversation
  fastify.get('/conversations/check-identifier/:identifier', {
    schema: {
      description: 'Check if a conversation identifier is available for use',
      tags: ['conversations'],
      summary: 'Check identifier availability',
      params: {
        type: 'object',
        required: ['identifier'],
        properties: {
          identifier: { type: 'string', description: 'Conversation identifier to check' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                available: { type: 'boolean', description: 'Whether the identifier is available' },
                identifier: { type: 'string', description: 'The checked identifier' }
              }
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
      const { identifier } = request.params as { identifier: string };

      // Vérifier si l'identifiant existe déjà
      const existingConversation = await prisma.conversation.findFirst({
        where: {
          identifier: {
            equals: identifier,
            mode: 'insensitive'
          }
        },
        select: { id: true }
      });

      return sendSuccess(reply, {
        available: !existingConversation,
        identifier
      });
    } catch (error) {
      logger.error('error checking identifier availability', { error });
      return sendInternalError(reply, 'Failed to check identifier availability');
    }
  });
}

/**
 * Enregistre `GET /conversations/:id` (détail d'une conversation).
 */
export function registerConversationDetailRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any
) {
  // Route pour obtenir une conversation par ID
  fastify.get<{ Params: ConversationParams }>('/conversations/:id', {
    schema: {
      description: 'Get a specific conversation by ID including participants, settings, and last message',
      tags: ['conversations'],
      summary: 'Get conversation details',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      response: {
        200: conversationResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;

      // Vérifier que l'utilisateur est authentifié
      if (!authRequest.authContext.isAuthenticated) {
        return sendForbidden(reply, 'Authentication required to access this conversation');
      }

      const { id } = request.params;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);

      if (!canAccess) {
          return sendForbidden(reply, 'Access denied: you are not a member of this conversation or it no longer exists', { code: 'CONVERSATION_ACCESS_DENIED' });
      }

      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId },
        include: {
          ...conversationDetailInclude,
          userPreferences: {
            where: { userId: authRequest.authContext.userId },
            take: 1,
            select: conversationUserPreferencesSelect
          }
        }
      });

      if (!conversation) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Pour les DMs, pas de titre — le frontend résout le nom de l'interlocuteur
      const displayTitle = (conversation as any).type === 'direct'
        ? (conversation.title || null)
        : (conversation.title && conversation.title.trim() !== ''
            ? conversation.title
            : generateDefaultConversationTitle(
                conversation.participants.map((m: any) => ({
                  id: m.userId,
                  displayName: m.user?.displayName,
                  username: m.user?.username,
                  firstName: m.user?.firstName,
                  lastName: m.user?.lastName
                })),
                userId
              ));

      // Calculer le unreadCount pour l'utilisateur courant.
      // `resolveCallerParticipant` et pas un `where: { userId }` ecrit a la main :
      // pour un invite de lien partage, `authContext.userId` PORTE un
      // `Participant.id` (branche anonyme d'`UnifiedAuthService`), donc la clause
      // manuelle comparait un id de participant a la colonne `userId` et ne
      // matchait rien. Le compteur retombait silencieusement a 0 — et ce 0
      // ecrasait ensuite le badge que le socket venait de pousser juste.
      let unreadCount = 0;
      // Le rôle du lecteur DANS cette conversation, pour l'effectif servi plus
      // bas. Il ne peut pas se lire dans `conversation.participants` : cette
      // liste est bornée à `CONVERSATION_DETAIL_PARTICIPANTS_CAP` (100), donc
      // aveugle dans le seul cas où le plafond joue. Le participant appelant est
      // déjà résolu ici pour le compteur de non-lus — il porte le rôle avec lui.
      let callerConversationRole: string | null = null;
      try {
        const participant = await resolveCallerParticipant(prisma, authRequest.authContext, conversationId);
        if (participant) {
          callerConversationRole = participant.role;
          const { MessageReadStatusService } = await import('../../services/MessageReadStatusService.js');
          const readStatusService = new MessageReadStatusService(prisma);
          unreadCount = await readStatusService.getUnreadCount(participant.id, conversationId);
        }
      } catch (unreadError) {
        logger.warn('failed to compute unreadCount for conversation', { conversationId, error: unreadError });
      }

      // Marquer automatiquement les notifications de cette conversation comme lues —
      // délégué au service (1 seul update Mongo filtré sur context.conversationId,
      // émet notification:counts pour resynchroniser cloche/badge) et fire-and-forget :
      // effet de bord non essentiel, hors du chemin critique de la réponse
      // (même pattern que posts/interactions.ts pour markPostNotificationsAsRead).
      fastify.notificationService
        ?.markConversationNotificationsAsRead(userId, conversationId)
        .catch((notifError: unknown) => {
          logger.error('error marking auto notifications for conversation', { conversationId, error: notifError });
        });

      // NOTE : l'ancien bloc `meta.conversationStats` (getOrCompute + payload)
      // a été retiré — `conversationSchema` ne déclare pas `meta`, donc
      // fast-json-stringify le strippait du wire : calcul DB coûteux
      // (message.groupBy plein scan à froid, TTL 1h) pour un résultat jeté.
      // Les clients consomment les stats via l'event Socket.IO
      // `conversation:stats`, qui se recompute seul (updateOnNewMessage).
      // Même régime strict que la liste : self/ADMIN+/ami (cf. GET /conversations).
      const detailPresenceViewer = viewerFromRequest(request);
      const presenceVis = await getPresenceVisibilityService(prisma).resolveForTargets(
        detailPresenceViewer,
        conversation.participants
          .map((m: any) => m.userId)
          .filter((uid: string | null): uid is string => !!uid)
      );
      const gatedParticipants = conversation.participants.map((m: any) => {
        const liveOnline = fastify.presenceChecker?.isOnline(m.userId ?? m.id);
        const vis = presenceFor(detailPresenceViewer, presenceVis, m.userId);
        return {
          ...m,
          isOnline: vis.showOnline ? (liveOnline === undefined ? m.isOnline : liveOnline) : false,
          lastActiveAt: vis.showLastSeenTimestamp ? m.lastActiveAt : null
        };
      });

      const { _count, ...conversationData } = conversation;
      return sendSuccess(reply, {
        ...conversationData,
        participants: gatedParticipants,
        title: displayTitle,
        // Même cap 199+ que la liste : deux surfaces, une seule présentation,
        // et le même droit de voir l'effectif ENTIER (`canViewExactMemberCount`).
        ...presentMemberCount(_count.participants, {
          viewerSeesExactCount: canViewExactMemberCount({
            platformRole: authRequest.authContext.registeredUser?.role ?? null,
            conversationRole: callerConversationRole
          })
        }),
        // Le rang était résolu ici depuis toujours — pour décider du plafond
        // d'effectif juste au-dessus — et n'était pas servi. Les clients
        // ouvrant une conversation par sa fiche (notification, lien) n'avaient
        // donc AUCUN moyen de savoir qu'ils l'administrent. Même clé que la
        // ligne de liste : une seule notion, un seul nom.
        currentUserRole: callerConversationRole,
        unreadCount
      });

    } catch (error) {
      logger.error('error fetching conversation', { error });
      return sendInternalError(reply, 'Error retrieving conversation');
    }
  });
}

/**
 * Enregistre `GET /conversations/:id/analysis` (analyse agent d'une conversation).
 */
export function registerConversationAnalysisRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  // Route pour obtenir l'analyse agent d'une conversation
  fastify.get<{ Params: ConversationParams }>('/conversations/:id/analysis', {
    schema: {
      description: 'Get agent analysis for a conversation (summary, tone, participant profiles)',
      tags: ['conversations'],
      summary: 'Get conversation analysis',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      response: {
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;
      const { id } = request.params;
      const userId = authRequest.authContext.userId;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Access denied');
      }

      const TRAIT_FIELDS_MAP: Record<string, string[]> = {
        communication: ['Verbosity', 'Formality', 'ResponseSpeed', 'InitiativeRate', 'Clarity', 'Argumentation'],
        personality: ['SocialStyle', 'Assertiveness', 'Agreeableness', 'Humor', 'Emotionality', 'Openness', 'Confidence', 'Creativity', 'Patience', 'Adaptability'],
        interpersonal: ['Empathy', 'Politeness', 'Leadership', 'ConflictStyle', 'Supportiveness', 'Diplomacy', 'TrustLevel'],
        emotional: ['EmotionalStability', 'Positivity', 'Sensitivity', 'StressResponse'],
      };

      function buildTraits(role: Record<string, any>) {
        const traits: Record<string, Record<string, { label: string; score: number }>> = {};
        let hasAny = false;
        for (const [cat, fields] of Object.entries(TRAIT_FIELDS_MAP)) {
          const catTraits: Record<string, { label: string; score: number }> = {};
          for (const field of fields) {
            const label = role[`trait${field}`];
            const score = role[`trait${field}Score`];
            if (label != null && score != null) {
              const key = field.charAt(0).toLowerCase() + field.slice(1);
              catTraits[key] = { label, score };
              hasAny = true;
            }
          }
          if (Object.keys(catTraits).length > 0) traits[cat] = catTraits;
        }
        return hasAny ? traits : null;
      }

      const [summary, roles, snapshots] = await Promise.all([
        prisma.agentConversationSummary.findUnique({
          where: { conversationId }
        }),
        prisma.agentUserRole.findMany({
          where: { conversationId },
        }),
        prisma.agentAnalysisSnapshot.findMany({
          where: {
            conversationId,
            snapshotDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { snapshotDate: 'asc' },
        }),
      ]);

      // Enrichir les roles avec username/displayName
      const userIds = roles.map(r => r.userId);
      const users = userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true, firstName: true, lastName: true, avatar: true }
          })
        : [];

      const userMap = new Map(users.map(u => [u.id, u]));

      const participantProfiles = roles.map((role: Record<string, any>) => {
        const user = userMap.get(role.userId);
        return {
          userId: role.userId,
          username: user?.username ?? null,
          displayName: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.username : null,
          avatar: user?.avatar ?? null,
          personaSummary: role.personaSummary,
          tone: role.tone,
          vocabularyLevel: role.vocabularyLevel,
          typicalLength: role.typicalLength,
          emojiUsage: role.emojiUsage,
          topicsOfExpertise: role.topicsOfExpertise,
          catchphrases: role.catchphrases,
          commonEmojis: role.commonEmojis,
          reactionPatterns: role.reactionPatterns,
          messagesAnalyzed: role.messagesAnalyzed,
          confidence: role.confidence,
          traits: buildTraits(role),
          dominantEmotions: role.dominantEmotions ?? [],
          relationshipMap: role.relationshipMap ?? {},
          sentimentScore: role.sentimentScore ?? null,
          engagementLevel: role.engagementLevel ?? null,
          locked: role.locked,
        };
      });

      return sendSuccess(reply, {
        conversationId,
        summary: summary ? {
          text: summary.summary,
          currentTopics: summary.currentTopics,
          overallTone: summary.overallTone,
          messageCount: summary.messageCount,
          updatedAt: summary.updatedAt,
          healthScore: summary.healthScore ?? null,
          engagementLevel: summary.engagementLevel ?? null,
          conflictLevel: summary.conflictLevel ?? null,
          dynamique: summary.dynamique ?? null,
          dominantEmotions: summary.dominantEmotions ?? [],
        } : null,
        participantProfiles,
        history: snapshots.map(s => ({
          snapshotDate: s.snapshotDate.toISOString(),
          overallTone: s.overallTone,
          healthScore: s.healthScore,
          engagementLevel: s.engagementLevel,
          conflictLevel: s.conflictLevel,
          topTopics: s.topTopics,
          dominantEmotions: s.dominantEmotions,
          messageCountAtSnapshot: s.messageCountAtSnapshot,
          participantSnapshots: s.participantSnapshots,
        })),
      });

    } catch (error) {
      logger.error('error fetching conversation analysis', { error });
      return sendInternalError(reply, 'Error fetching conversation analysis');
    }
  });
}
