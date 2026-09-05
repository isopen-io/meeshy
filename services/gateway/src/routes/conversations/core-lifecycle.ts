/**
 * Surface CYCLE DE VIE de `conversations/core.ts` — `POST /conversations`,
 * `PUT`/`PATCH /conversations/:id` et `DELETE /conversations/:id`. Extrait de
 * `core.ts` lors du découpage #4284 ; voir `core.ts` pour le point d'entrée
 * `registerCoreRoutes` qui appelle ces registrars.
 */
import { FastifyInstance } from 'fastify';
import { isMemberCreator, MemberRole } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole } from '../../utils/conversation-authority';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { ErrorCode } from '@meeshy/shared/types';
import { createError, sendErrorResponse } from '@meeshy/shared/utils/errors';
import { ConversationSchemas, validateSchema } from '@meeshy/shared/utils/validation';
import { generateDefaultConversationTitle } from '@meeshy/shared/utils/conversation-helpers';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationResponseSchema,
  errorResponseSchema,
  createConversationRequestSchema,
  updateConversationRequestSchema
} from '@meeshy/shared/types/api-schemas';
import { isBlockedBetween } from '../../utils/blocking';
import { sendSuccess, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { presenceFor, viewerFromRequest } from '../users/presence-gate';
import {
  generateConversationIdentifier,
  generateCompactConversationIdentifier,
  ensureUniqueConversationIdentifier
} from './utils/identifier-generator';
import type {
  ConversationParams,
  CreateConversationBody
} from './types';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { ConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import { emitToConversationParticipants } from '../../socketio/emitToConversationParticipants';
import { announceConversationClosed } from '../../socketio/announceConversationClosed';
import { deactivateShareLinksOnClose } from '../../services/conversations/shareLinkClosure';
import { SecuritySanitizer } from '../../utils/sanitize.js';

const logger = enhancedLogger.child({ module: 'conversations/core' });

/**
 * Les huit réglages que `PUT /conversations/:id` peut annoncer sur
 * `conversation:updated`, DÉRIVÉS du contrat plutôt que redéclarés.
 *
 * Ce que la dérivation garde, et qu'un `Record<string, unknown>` ne gardait
 * pas : un neuvième réglage ajouté ici ne compile pas tant qu'il n'est pas
 * déclaré sur `ConversationUpdatedEventData`. C'est par cette carte ouverte que
 * les huit voyageaient sans contrat, alors que les trois clients les lisent.
 *
 * Une clé ABSENTE veut dire « ce réglage n'a pas bougé », jamais « remets-le à
 * zéro » — d'où la composition par spreads conditionnels, qui n'en pose aucune
 * quand la requête ne l'a pas changée.
 */
type ConversationMetadataChanges = Partial<Pick<
  ConversationUpdatedEventData,
  'title' | 'description' | 'avatar' | 'banner' | 'defaultWriteRole'
  | 'isAnnouncementChannel' | 'slowModeSeconds' | 'autoTranslateEnabled'
>>;

/**
 * Enregistre `POST /conversations` (création d'une conversation).
 */
export function registerCreateConversationRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any
) {
  // Route pour créer une nouvelle conversation
  fastify.post<{ Body: CreateConversationBody }>('/conversations', {
    schema: {
      description: 'Create a new conversation (direct, group, or public) with specified participants',
      tags: ['conversations'],
      summary: 'Create conversation',
      body: createConversationRequestSchema,
      response: {
        200: conversationResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    try {
      // Valider les données avec Zod
      const validatedData = validateSchema(
        ConversationSchemas.create,
        request.body,
        'create-conversation'
      );

      const { type, title: rawTitle, description: rawDescription, participantIds = [], communityId, identifier } = validatedData as { type: string; title?: string; description?: string; participantIds?: string[]; communityId?: string; identifier?: string };
      const title = rawTitle !== undefined ? SecuritySanitizer.sanitizeText(rawTitle) : undefined;
      const description = rawDescription !== undefined ? SecuritySanitizer.sanitizeText(rawDescription) : undefined;

      // Utiliser le nouveau système d'authentification unifié
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        throw createError(ErrorCode.UNAUTHORIZED, 'Authentication required to create conversation');
      }

      const userId = authContext.userId;

      // Prevent creating conversation with oneself
      if (type === 'direct' && participantIds.length === 1 && participantIds[0] === userId) {
        throw createError(ErrorCode.INVALID_OPERATION, 'Vous ne pouvez pas créer une conversation avec vous-même');
      }

      // Also check if userId is in participantIds (in case of manipulation)
      if (participantIds.includes(userId)) {
        throw createError(ErrorCode.INVALID_OPERATION, 'Vous ne devez pas vous inclure dans la liste des participants');
      }

      // Note: La validation de l'identifier est maintenant gérée par CommonSchemas.conversationIdentifier dans Zod

      // Validate community access if communityId is provided
      if (communityId) {
        const community = await prisma.community.findFirst({
          where: { id: communityId },
          include: { members: true }
        });

        if (!community) {
          return sendNotFound(reply, 'Community not found');
        }

        // Check if user is member of the community
        const isMember = community.createdBy === userId ||
                        community.members.some(member => member.userId === userId);

        if (!isMember) {
          return sendForbidden(reply, 'You must be a member of this community to create a conversation');
        }
      }

      // Generate identifier
      let finalIdentifier: string;
      if (identifier) {
        // Use custom identifier with mshy_ prefix
        finalIdentifier = `mshy_${identifier}`;
        // Ensure uniqueness
        finalIdentifier = await ensureUniqueConversationIdentifier(prisma, finalIdentifier);
      } else {
        // Une DM n'a pas de titre a rendre lisible : son ancien identifiant
        // derivait des deux userId (`mshy_direct-<id1>-<id2>-<horodate>`,
        // ~72 car.) et publiait donc ses deux membres. On emet un identifiant
        // COMPACT et opaque. Les conversations TITREES gardent leur forme
        // lisible — c'est ce que promet le schema Prisma, et un groupe nomme
        // n'expose l'identite de personne.
        const baseIdentifier = type === 'direct'
          ? generateCompactConversationIdentifier()
          : generateConversationIdentifier(title);
        finalIdentifier = await ensureUniqueConversationIdentifier(prisma, baseIdentifier);
      }

      // S'assurer que participantIds ne contient pas de doublons, n'inclut pas le créateur,
      // et ne contient pas de valeurs null/undefined/empty
      const uniqueParticipantIds = [...new Set(participantIds)]
        .filter((id: any) => id && id !== userId && typeof id === 'string' && id.trim().length > 0);

      // Block enforcement applies to DIRECT conversations only (group / community /
      // public / global / broadcast are never block-enforced). Bidirectional: reject
      // if the creator blocked the other party OR the other party blocked the creator.
      if (type === 'direct' && uniqueParticipantIds.length === 1) {
        const blocked = await isBlockedBetween(prisma, userId, uniqueParticipantIds[0]);
        if (blocked) {
          throw createError(ErrorCode.USER_BLOCKED);
        }

        // Idempotence DM — une conversation directe entre deux users est
        // UNIQUE. Sans ce check, chaque « Nouvelle conversation → Créer »
        // fabriquait une DM de plus (2 DM identiques observées en prod le
        // 2026-07-03 pendant les tests d'appel) : on rouvre l'existante
        // (200) au lieu d'en créer une deuxième. Les archivées comptent —
        // recréer la DM d'un contact archivé doit la ROUVRIR, pas la
        // dupliquer. Groupes : jamais dédupliqués (même-membres légitime).
        const existingDirect = await prisma.conversation.findFirst({
          where: {
            type: 'direct',
            AND: [
              { participants: { some: { userId, isActive: true } } },
              { participants: { some: { userId: uniqueParticipantIds[0], isActive: true } } }
            ]
          },
          // Des doublons historiques existent (5 DM atabeth↔jcnm datant
          // d'avant ce fix) : rouvrir la plus RÉCEMMENT ACTIVE, pas une
          // arbitraire — sinon l'utilisateur retombe sur une DM morte.
          orderBy: { lastMessageAt: 'desc' },
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true,
                    banner: true
                  }
                }
              }
            }
          }
        });
        if (existingDirect) {
          const callerParticipant = existingDirect.participants.find((p: any) => p.userId === userId);
          const creatorParticipant = existingDirect.participants.find((p: any) => isMemberCreator(p.role ?? 'member'));
          // `!firstMessageSentAt` est ambigu (absent ET null donnent `null`
          // côté client JS) mais sans risque ici : le flip ci-dessous est
          // gardé par un `updateMany({ where: { firstMessageSentAt: null } })`
          // qui ne matche jamais un champ absent (legacy) — 0 ligne, no-op.
          // Ne jamais retirer ce garde sans revoir cette ambiguïté.
          const isEmptyDirect = existingDirect.type === 'direct' && !existingDirect.firstMessageSentAt;

          if (isEmptyDirect && creatorParticipant && !isMemberCreator(callerParticipant?.role ?? 'member')) {
            // Le destinataire silencieux réinitie lui-même la conversation —
            // intention mutuelle aussi explicite qu'un message. On la rend
            // visible désormais des deux côtés (Prisme design doc 2026-08-04).
            const flip = await prisma.conversation.updateMany({
              where: { id: existingDirect.id, firstMessageSentAt: null },
              data: { firstMessageSentAt: new Date() }
            });
            if (flip.count > 0) {
              existingDirect.firstMessageSentAt = new Date();
              try {
                const socketIOHandler = fastify.socketIOHandler;
                const io = socketIOHandler?.getManager()?.getIO();
                if (io && creatorParticipant.userId) {
                  io.to(ROOMS.user(creatorParticipant.userId)).emit(SERVER_EVENTS.CONVERSATION_NEW, {
                    conversationId: existingDirect.id,
                    conversationType: existingDirect.type,
                    title: existingDirect.title,
                    creatorId: creatorParticipant.userId,
                    participantIds: existingDirect.participants.map((p: any) => p.userId).filter(Boolean),
                    createdAt: existingDirect.createdAt instanceof Date
                      ? existingDirect.createdAt.toISOString()
                      : String(existingDirect.createdAt)
                  });
                }
              } catch (broadcastError) {
                logger.error('error broadcasting CONVERSATION_NEW on DM reinitiation', { error: broadcastError });
              }
            }
          }

          return sendSuccess(reply, {
            ...existingDirect,
            title: existingDirect.title || null
          }, { statusCode: 200 });
        }
      }

      const allUserIds = [userId, ...uniqueParticipantIds];
      const allUsers = await prisma.user.findMany({
        where: { id: { in: allUserIds } },
        select: { id: true, displayName: true, username: true, avatar: true }
      });
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const defaultPermissions = {
        canSendMessages: true,
        canSendFiles: true,
        canSendImages: true,
        canSendVideos: false,
        canSendAudios: false,
        canSendLocations: false,
        canSendLinks: false
      };

      const creatorUser = userMap.get(userId);
      // Broadcast = announcement channel with admin-only write
      const isBroadcast = type === 'broadcast';

      const conversation = await prisma.conversation.create({
        data: {
          identifier: finalIdentifier,
          type,
          title,
          description,
          communityId: communityId || null,
          ...(isBroadcast ? { isAnnouncementChannel: true, defaultWriteRole: 'admin' } : {}),
          // Explicite (pas juste omis) : Prisma/MongoDB omettrait le champ si
          // on ne le posait pas, ce qui le laisserait ABSENT plutôt que
          // `null` — voir Prisme design doc 2026-08-04 (DM vide et silencieux
          // jusqu'au premier message).
          ...(type === 'direct' ? { firstMessageSentAt: null } : {}),
          participants: {
            create: [
              {
                userId,
                type: 'user',
                displayName: creatorUser?.displayName || creatorUser?.username || 'User',
                role: 'creator',
                permissions: defaultPermissions
              },
              ...uniqueParticipantIds.map((participantId: string) => {
                const pUser = userMap.get(participantId);
                return {
                  userId: participantId,
                  type: 'user',
                  displayName: pUser?.displayName || pUser?.username || 'User',
                  role: 'member',
                  permissions: defaultPermissions
                };
              })
            ]
          }
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true,
                  banner: true
                }
              }
            }
          }
        }
      });

      // Si la conversation est créée dans une communauté, ajouter automatiquement
      // tous les participants à la communauté s'ils n'y sont pas déjà
      if (communityId) {
        const allUserIds = [userId, ...uniqueParticipantIds];

        // Récupérer les membres actuels de la communauté
        const existingMembers = await prisma.communityMember.findMany({
          where: {
            communityId,
            userId: { in: allUserIds }
          },
          select: { userId: true }
        });

        const existingUserIds = existingMembers.map(member => member.userId);
        const newUserIds = allUserIds.filter(id => !existingUserIds.includes(id));

        // Ajouter les nouveaux membres à la communauté
        if (newUserIds.length > 0) {
          await prisma.communityMember.createMany({
            data: newUserIds.map(userId => ({
              communityId,
              userId
            }))
          });
        }
      }

      // Pour les DMs, pas de titre — le frontend résout le nom de l'interlocuteur
      const displayTitle = type === 'direct'
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

      // Diffuser le nouvel event typé CONVERSATION_NEW à TOUS les participants
      // — y compris le créateur — dans leurs user-rooms respectives. Avant ce
      // change, le créateur n'avait AUCUN signal socket (la boucle de
      // notifications ci-dessous itère uniquement sur `uniqueParticipantIds`
      // qui exclut `userId`), ce qui forçait les clients iOS et web à
      // implémenter un workaround local (ConversationCreatedBroadcaster sur
      // iOS) pour faire apparaître la nouvelle conversation immédiatement.
      // Avec CONVERSATION_NEW, la source de vérité reste sur le gateway et
      // tous les clients (web, iOS, future plateformes) reçoivent le même
      // payload typé. La notification:new legacy reste émise en parallèle
      // pour compat avec les anciens clients pendant ~3 mois.
      try {
        const socketIOHandler = fastify.socketIOHandler;
        const socketManager = socketIOHandler?.getManager();
        const io = socketManager?.getIO();
        if (io) {
          const allParticipantIds = [userId, ...uniqueParticipantIds];
          // Auto-join every already-connected participant's sockets to the
          // conversation room BEFORE announcing it. Without this, connected
          // participants are in `connectedUsers` (so never offline-queued)
          // but not in ROOMS.conversation(id) — every message:new for the
          // new conversation is silently missed until their next reconnect.
          for (const participantId of allParticipantIds) {
            socketManager.joinUserToConversationRoom(participantId, conversation.id).catch(
              (err: unknown) => logger.error('Failed to auto-join participant to new conversation room', { participantId, error: err })
            );
          }
          const conversationNewPayload = {
            conversationId: conversation.id,
            conversationType: type,
            title: displayTitle,
            creatorId: userId,
            participantIds: allParticipantIds,
            createdAt: conversation.createdAt instanceof Date
              ? conversation.createdAt.toISOString()
              : String(conversation.createdAt)
          };
          // Un direct fraîchement créé (0 message) reste silencieux pour les
          // autres participants — seul le créateur voit sa conversation
          // vide apparaître immédiatement (Prisme design doc 2026-08-04).
          const emitParticipantIds = type === 'direct' ? [userId] : allParticipantIds;
          for (const participantId of emitParticipantIds) {
            io.to(ROOMS.user(participantId)).emit(
              SERVER_EVENTS.CONVERSATION_NEW,
              conversationNewPayload
            );
          }
        }
      } catch (broadcastError) {
        logger.error('error broadcasting CONVERSATION_NEW', { error: broadcastError });
        // Non bloquant : la conversation est créée, les clients la verront
        // au prochain delta sync ou via la notification legacy ci-dessous.
      }

      // Envoyer des notifications aux participants invités — sauf pour un
      // direct fraîchement créé (0 message) : silencieux à la création, voir
      // Prisme design doc 2026-08-04.
      const notificationService = fastify.notificationService;
      if (notificationService && uniqueParticipantIds.length > 0 && type !== 'direct') {
        try {
          // Le créateur est déjà chargé dans userMap (userId ∈ allUserIds) :
          // pas de second aller-retour DB.
          const creator = userMap.get(userId);

          if (creator) {
            // Notifications d'invitation indépendantes : fan-out parallèle (O(1) latence).
            await Promise.all(
              uniqueParticipantIds.map(async (participantId) => {
                await notificationService.createConversationInviteNotification({
                  invitedUserId: participantId,
                  inviterId: userId,
                  inviterUsername: creator.displayName || creator.username,
                  inviterAvatar: creator.avatar || undefined,
                  conversationId: conversation.id,
                  conversationTitle: displayTitle,
                  conversationType: type
                });
                logger.debug('invitation notification sent', { participantId, conversationId: conversation.id });
              })
            );
          }
        } catch (notifError) {
          logger.error('error sending invitation notifications', { error: notifError });
          // Ne pas bloquer la création de la conversation
        }
      }

      return sendSuccess(reply, {
        ...conversation,
        title: displayTitle
      }, { statusCode: 201 });

    } catch (error) {
      sendErrorResponse(reply, error as Error, 'create-conversation');
    }
  });
}

/**
 * Enregistre `PUT`/`PATCH /conversations/:id` (mise à jour des métadonnées).
 */
export function registerUpdateConversationRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  // Route pour mettre à jour une conversation
  // `PUT` ET `PATCH` sur un SEUL handler. Ce sont deux verbes pour un seul
  // geste — « modifie ces champs-là » — et les avoir écrits deux fois, dans
  // deux fichiers, a produit exactement ce qu'une duplication produit : deux
  // contrats qui divergent. Le jumeau vivait dans `sharing.ts` et n'acceptait
  // que `title`/`description`/`type` ; le web lui postait `avatar` et `banner`,
  // qu'il ignorait en silence tout en répondant 200 — bannière et avatar
  // restaient vides pendant que l'interface annonçait le succès (mesuré en
  // production le 2026-08-24). Il ne diffusait par ailleurs AUCUN
  // `conversation:updated`, et laissait n'importe quel membre renommer le
  // groupe. Il a été supprimé : ici est le seul point d'écriture des
  // métadonnées d'une conversation.
  //
  // Garde : `conversation-update-route.test.ts` rejoue chaque cas SUR LES DEUX
  // VERBES — un handler qui se remettrait à diverger y rougirait.
  fastify.route<{
    Params: ConversationParams;
    Body: Partial<CreateConversationBody>;
  }>({
    method: ['PUT', 'PATCH'],
    url: '/conversations/:id',
    schema: {
      description: 'Update conversation metadata (title, description, avatar, banner) and container settings - requires creator/admin/moderator role. PUT and PATCH are equivalent: both apply only the fields present in the body.',
      tags: ['conversations'],
      summary: 'Update conversation',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      body: updateConversationRequestSchema,
      response: {
        200: conversationResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth],
    handler: async (request, reply) => {
    try {
      const { id } = request.params;
      const { title: rawTitle, description: rawDescription, avatar, banner, defaultWriteRole, isAnnouncementChannel, slowModeSeconds, autoTranslateEnabled } = request.body as {
        title?: string
        description?: string
        avatar?: string | null
        banner?: string | null
        defaultWriteRole?: string
        isAnnouncementChannel?: boolean
        slowModeSeconds?: number
        autoTranslateEnabled?: boolean
      };
      const title = rawTitle !== undefined ? SecuritySanitizer.sanitizeText(rawTitle) : undefined;
      const description = rawDescription !== undefined ? SecuritySanitizer.sanitizeText(rawDescription) : undefined;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // « ID or identifier », dit le schéma — et seul le jumeau supprimé le
      // tenait. Ici, `where: { conversationId: id }` recevait le `mshy_…` tel
      // quel, ne trouvait aucune appartenance, et répondait 403 à un créateur
      // parfaitement légitime qui avait ouvert sa conversation par son
      // identifiant lisible. Toutes les routes voisines résolvent d'abord.
      const conversationId = id === 'meeshy' ? id : await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Vérifier les permissions d'administration
      // Le `select` ramène le TYPE du conteneur par la relation que cette
      // requête d'appartenance charge déjà — la garde du tête-à-tête ci-dessous
      // en dépend, et aucune requête de plus n'est émise pour l'obtenir.
      const membership = await prisma.participant.findFirst({
        where: {
          conversationId: conversationId,
          userId: userId,
          isActive: true
        },
        select: {
          role: true,
          conversation: { select: { type: true } }
        }
      });

      // Le rang ne se filtre PLUS dans la requête : un administrateur de la
      // plateforme simple membre n'y était pas refusé — sa ligne n'était même
      // pas chargée, et le point de contrôle n'existait pas là où on le
      // cherchait (#3941). La requête ramène l'appartenance, la loi décide.
      const actor = {
        conversationRole: membership?.role,
        platformRole: authRequest.authContext.registeredUser?.role,
      };

      if (!actorHasMinimumRole(actor, MemberRole.MODERATOR) && id !== "meeshy") {
        return sendForbidden(reply, 'Vous n\'êtes pas autorisé à modifier cette conversation');
      }

      // Interdire la modification de la conversation globale
      if (id === "meeshy") {
        return sendForbidden(reply, 'The global conversation cannot be modified');
      }

      // Le rang d'écriture, le canal d'annonces et le mode lent sont des
      // PERMISSIONS : un modérateur de conversation ne les touche pas. La
      // restriction lit la même colonne que la garde ci-dessus, en sens
      // INVERSE — l'une accorde, l'autre retient — et les deux doivent donc
      // se déplacer ensemble (#4008, #3941).
      if (!actorHasMinimumRole(actor, MemberRole.ADMIN)) {
        if (defaultWriteRole !== undefined || isAnnouncementChannel !== undefined ||
            slowModeSeconds !== undefined || autoTranslateEnabled !== undefined) {
          return sendForbidden(reply, 'Les modérateurs ne peuvent pas modifier les permissions');
        }
      }

      // Le rang d'écriture, le canal d'annonces et le mode lent décrivent la
      // POLICE d'un conteneur À HIÉRARCHIE. Un tête-à-tête n'en a pas : ses
      // rôles `creator`/`member` nomment qui a ouvert le fil, pas une autorité
      // sur l'autre partie (cf. WRITE_HIERARCHY_FREE_TYPES dans
      // `conversationWriteAdmission`). Les laisser passer permettait à
      // l'initiateur de faire TAIRE son pair, refusé ensuite à chaque envoi,
      // et sans recours : ce même PUT lui répond 403 puisqu'il est `member`.
      //
      // Le filtre ne porte QUE sur ces trois champs. `autoTranslateEnabled`,
      // `title`, `description`, `avatar` et `banner` ne décrivent aucune
      // hiérarchie et restent modifiables sur un tête-à-tête.
      //
      // Un type inconnu reste permissif — idiome documenté du module
      // d'admission. Ce n'est pas un trou : la garde qui protège réellement le
      // pair est la règle d'admission, qui lit le type sur la ligne AUTORITAIRE
      // de conversation. Ici on empêche l'écriture d'un réglage sans effet, et
      // l'événement `conversation:updated` qui l'annoncerait aux clients.
      if (membership?.conversation?.type === 'direct' &&
          (defaultWriteRole !== undefined || isAnnouncementChannel !== undefined ||
           slowModeSeconds !== undefined)) {
        return sendForbidden(reply, 'Un tête-à-tête n\'a pas de hiérarchie d\'écriture : ces réglages ne s\'y appliquent pas');
      }

      const conversationInclude = {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                banner: true
              }
            }
          }
        }
      } as const;

      const updateData = {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(avatar !== undefined && { avatar }),
        ...(banner !== undefined && { banner }),
        ...(defaultWriteRole !== undefined && { defaultWriteRole }),
        ...(isAnnouncementChannel !== undefined && { isAnnouncementChannel }),
        ...(slowModeSeconds !== undefined && { slowModeSeconds }),
        ...(autoTranslateEnabled !== undefined && { autoTranslateEnabled }),
      };

      // Un corps qui ne nomme aucun champ connu n'est pas une erreur du client :
      // c'est une écriture vide. Prisma, lui, refuse un `data` vide et levait —
      // la route répondait 500 à un `{}`. On rend l'état courant, sans écrire et
      // sans annoncer un changement qui n'a pas eu lieu.
      // Gate de présence des co-participants. `conversationParticipantSchema`
      // DÉCLARE `isOnline`/`lastActiveAt`, et l'`include` ci-dessus ramène tous
      // les scalaires de `Participant` : ces deux champs atteignaient le fil
      // BRUTS. Régime STRICT (2026-08-25) : self/ADMIN+/ami seuls voient la
      // présence d'un co-participant ; un id ABSENT de la carte (participant
      // sans compte) est masqué, sauf pour un viewer ADMIN+.
      //
      // Défini ici, appliqué aux DEUX sorties : la branche « rien à écrire »
      // rend les mêmes lignes que la branche nominale, donc la même donnée à
      // garder. Une porte posée sur une seule des deux n'est pas une porte.
      const updatePresenceViewer = viewerFromRequest(request);
      const gatePresence = async <P extends { userId: string | null; isOnline: boolean | null; lastActiveAt: Date | null }>(
        participants: P[]
      ) => {
        const vis = await getPresenceVisibilityService(prisma).resolveForTargets(
          updatePresenceViewer,
          participants
            .map((p) => p.userId)
            .filter((uid): uid is string => !!uid)
        );
        return participants.map((p) => {
          const prefs = presenceFor(updatePresenceViewer, vis, p.userId);
          return {
            ...p,
            isOnline: prefs.showOnline ? p.isOnline : false,
            lastActiveAt: prefs.showLastSeenTimestamp ? p.lastActiveAt : null,
          };
        });
      };

      if (Object.keys(updateData).length === 0) {
        const unchanged = await prisma.conversation.findUnique({
          where: { id: conversationId },
          include: conversationInclude
        });
        if (!unchanged) {
          return sendNotFound(reply, 'Conversation not found');
        }
        return sendSuccess(reply, {
          ...unchanged,
          participants: await gatePresence(unchanged.participants),
        });
      }

      const updatedConversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: updateData,
        include: conversationInclude
      });

      // Typé sur le contrat, pas `Record<string, unknown>` : une carte ouverte
      // est une absence de déclaration qui a l'air d'en être une, et c'est par
      // celle-ci que les huit réglages voyageaient sans contrat. La forme
      // `Pick` est ce qui garde la liste D'ICI et celle du contrat ensemble —
      // un neuvième réglage ajouté ici ne compile pas tant qu'il n'est pas
      // déclaré là-bas.
      const changedFields: ConversationMetadataChanges = {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(avatar !== undefined && { avatar }),
        ...(banner !== undefined && { banner }),
        ...(defaultWriteRole !== undefined && { defaultWriteRole }),
        ...(isAnnouncementChannel !== undefined && { isAnnouncementChannel }),
        ...(slowModeSeconds !== undefined && { slowModeSeconds }),
        ...(autoTranslateEnabled !== undefined && { autoTranslateEnabled }),
      }

      const socketIOHandler = fastify.socketIOHandler
      const io = socketIOHandler?.getManager()?.getIO()
      if (io) {
        // La room de conversation ne suffit pas, et c'est le MÊME raisonnement
        // qui a fait naître `emitConversationPreviewUpdate` pour l'autre moitié
        // de ce payload : un participant posé sur l'écran de LISTE a quitté
        // `conversation:<id>` et n'est joignable que par sa room personnelle.
        // Sans elle, un renommage — ou un changement d'avatar, de bannière, de
        // mode lent, de canal d'annonce — n'atteignait que ceux qui avaient le
        // fil ouvert. La ligne de liste de tous les autres gardait l'ancien
        // titre jusqu'à un rechargement complet.
        //
        // Le helper chaîne les rooms (au plus UNE copie par socket, même pour
        // un client qui est à la fois dans le fil et dans sa room) et nomme la
        // room d'un participant sans compte par son `Participant.id`
        // (`userId ?? id`) — la seule ligne que chaque copie de ce code avait
        // ratée. Les participants inactifs sont écartés : quitter une
        // conversation, c'est cesser d'en recevoir les métadonnées.
        //
        // Le payload ne porte AUCUNE clé `lastMessage*`, et c'est délibéré :
        // le tri-état client distingue « clé absente » (cet événement ne parle
        // pas du dernier message) de « clé nulle » (la carte du Prisme est
        // périmée). Un `lastMessageTranslations: null` posé ici effacerait une
        // traduction parfaitement valide sur toutes les lignes de liste.
        emitToConversationParticipants({
          io,
          conversationId,
          participants: updatedConversation.participants.filter(p => p.isActive),
          event: SERVER_EVENTS.CONVERSATION_UPDATED,
          payload: {
            conversationId,
            ...changedFields,
            updatedBy: { id: userId },
            updatedAt: new Date().toISOString(),
          },
        })
      }

      // La route jumelle supprimée gardait la présence ; le `PUT`, jamais.
      // Porter ce qu'un exemplaire avait de PLUS fait partie de la
      // consolidation — sans quoi unifier revient à choisir la moins bonne des
      // deux moitiés.
      return sendSuccess(reply, {
        ...updatedConversation,
        participants: await gatePresence(updatedConversation.participants),
      });

    } catch (error) {
      logger.error('error updating conversation', { error });
      return sendInternalError(reply, 'Error updating conversation');
    }
    }
  });
}

/**
 * Enregistre `DELETE /conversations/:id` (suppression douce d'une conversation).
 */
export function registerDeleteConversationRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  // Route pour supprimer une conversation
  fastify.delete<{ Params: ConversationParams }>('/conversations/:id', {
    schema: {
      description: 'Delete a conversation (soft delete - marks as inactive) - requires creator role',
      tags: ['conversations'],
      summary: 'Delete conversation',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
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
                message: { type: 'string', example: 'Conversation supprimée avec succès' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Interdire la suppression de la conversation globale
      if (id === "meeshy") {
        return sendForbidden(reply, 'The global conversation cannot be deleted');
      }

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Vérifier les permissions d'administration
      const membership = await prisma.participant.findFirst({
        where: {
          conversationId: conversationId,
          userId: userId,
          isActive: true
        },
        select: { role: true }
      });

      if (!actorHasMinimumRole(
        {
          conversationRole: membership?.role,
          platformRole: authRequest.authContext.registeredUser?.role,
        },
        MemberRole.ADMIN,
      )) {
        return sendForbidden(reply, 'Vous n\'êtes pas autorisé à supprimer cette conversation');
      }

      // Marquer la conversation comme inactive plutôt que de la supprimer
      const now = new Date()
      // Les participants sont ramenés PAR l'écriture : le fan-out ci-dessous a
      // besoin de nommer leurs rooms personnelles, et une seconde requête pour
      // les lire pourrait tomber sur un état déjà modifié.
      //
      // #3740 — la clôture éteint aussi les liens de partage encore actifs de
      // ce fil, dans la MÊME transaction : un lien qui reste actif après un
      // 410 est un contrôle qui ment (voir `shareLinkClosure.ts`).
      const [closedConversation] = await prisma.$transaction([
        prisma.conversation.update({
          where: { id: conversationId },
          data: { isActive: false, closedAt: now, closedBy: userId },
          include: { participants: { select: { id: true, userId: true, isActive: true } } }
        }),
        deactivateShareLinksOnClose(prisma, conversationId),
      ]);

      // Broadcast closure to all members — ce que le commentaire annonçait sans
      // que le code le fasse. Adressée à la seule room de conversation, la
      // clôture n'atteignait que les membres ayant le fil OUVERT ; tous les
      // autres gardaient la ligne dans leur liste et n'apprenaient la fermeture
      // qu'en tapant dessus. Même raison que le renommage ci-dessus : la room
      // personnelle est le seul endroit où joindre un client posé sur la liste.
      //
      // `announceConversationClosed` et non l'émission directe : fermer un fil
      // éteint aussi ce qu'il portait de vivant (les partages de position en
      // cours), et cette décision ne se répète pas sur les trois chemins de
      // clôture — elle vit dans l'unité qui les sert tous.
      const closureManager = fastify.socketIOHandler?.getManager()
      announceConversationClosed({
        io: closureManager?.getIO(),
        manager: closureManager,
        conversationId,
        participants: closedConversation.participants.filter(p => p.isActive),
        closedBy: userId,
        closedAt: now
      })

      return sendSuccess(reply, { message: 'Conversation supprimée avec succès' });

    } catch (error) {
      logger.error('error deleting conversation', { error });
      return sendInternalError(reply, 'Erreur lors de la suppression de la conversation');
    }
  });
}
