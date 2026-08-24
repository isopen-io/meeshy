import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SecuritySanitizer } from '../../utils/sanitize';
import { UserRoleEnum, ErrorCode } from '@meeshy/shared/types';
import { createError, sendErrorResponse } from '@meeshy/shared/utils/errors';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationSchema,
  conversationParticipantSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import {
  generateUniqueShareLinkId,
  ensureUniqueShareLinkIdentifier
} from './utils/identifier-generator';
import { sendSuccess, sendBadRequest, sendUnauthorized, sendForbidden, sendNotFound, sendInternalError, sendError } from '../../utils/response';
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache';
import { postJoinSystemMessage } from '../../services/conversations/joinSystemMessage';
import {
  resolveConversationEntry,
  REJOIN_PARTICIPANT_STATE
} from '../../services/conversations/conversationEntryAdmission';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { serializeConversationParticipant } from '@meeshy/shared/utils/participant-helpers';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
const logger = enhancedLogger.child({ module: 'ConversationSharingRoutes' });

/**
 * L'enveloppe rendue par `POST /conversations/:id/new-link`.
 *
 * Exportée pour être exerçable : un test de route mocke `sendSuccess` et
 * n'exerce donc JAMAIS le schéma de réponse — or c'est là que vivait le défaut.
 *
 * Ce schéma déclarait `data: { properties: { link: { type: 'object' } } }`,
 * ce qui se trompait deux fois sur la seule clé nommée : `link` est la chaîne
 * de l'URL d'invitation (sérialisée contre un schéma d'objet, elle sortait
 * `{}`), et `code` / `shareLink` n'étaient pas déclarés du tout, donc retirés.
 * La création rendait `{"success":true,"data":{"link":{}}}` — ni lien, ni code,
 * ni réglages.
 *
 * Les trois clients créent aujourd'hui leurs liens par `POST /links`, ce qui a
 * laissé le défaut vivre sans victime. La porte reste servie : elle doit rendre
 * ce qu'elle produit.
 */
export const conversationShareLinkResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        link: { type: 'string', description: "URL d'invitation complète (`${FRONTEND_URL}/chat/:code`)" },
        code: { type: 'string', description: "Code d'invitation — la part rejouable du lien" },
        shareLink: {
          type: 'object',
          description: 'Le lien de partage créé, avec les réglages retenus',
          properties: {
            id: { type: 'string' },
            linkId: { type: 'string' },
            name: { type: 'string', nullable: true },
            description: { type: 'string', nullable: true },
            maxUses: { type: 'number', nullable: true },
            expiresAt: { type: 'string', format: 'date-time', nullable: true },
            allowAnonymousMessages: { type: 'boolean' },
            allowAnonymousFiles: { type: 'boolean' },
            allowAnonymousImages: { type: 'boolean' },
            allowViewHistory: { type: 'boolean' },
            requireNickname: { type: 'boolean' },
            requireEmail: { type: 'boolean' }
          }
        }
      }
    }
  }
} as const;

/**
 * Enregistre les routes de partage et d'invitation
 */
export function registerSharingRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any,
  requiredAuth: any
) {
  fastify.post<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      maxUses?: number;
      maxConcurrentUsers?: number;
      maxUniqueSessions?: number;
      expiresAt?: string;
      allowAnonymousMessages?: boolean;
      allowAnonymousFiles?: boolean;
      allowAnonymousImages?: boolean;
      allowViewHistory?: boolean;
      requireNickname?: boolean;
      requireEmail?: boolean;
      allowedCountries?: string[];
      allowedLanguages?: string[];
      allowedIpRanges?: string[];
    };
  }>('/conversations/:id/new-link', {
    schema: {
      description: 'Create a new shareable invitation link for a conversation with configurable permissions',
      tags: ['conversations', 'links'],
      summary: 'Create share link',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Link name for identification' },
          description: { type: 'string', description: 'Link description' },
          maxUses: { type: 'number', description: 'Maximum number of times link can be used' },
          maxConcurrentUsers: { type: 'number', description: 'Maximum concurrent users via this link' },
          maxUniqueSessions: { type: 'number', description: 'Maximum unique sessions' },
          expiresAt: { type: 'string', format: 'date-time', description: 'Link expiration date' },
          allowAnonymousMessages: { type: 'boolean', description: 'Allow anonymous users to send messages' },
          allowAnonymousFiles: { type: 'boolean', description: 'Allow anonymous users to send files' },
          allowAnonymousImages: { type: 'boolean', description: 'Allow anonymous users to send images' },
          allowViewHistory: { type: 'boolean', description: 'Allow viewing message history' },
          requireNickname: { type: 'boolean', description: 'Require nickname for anonymous users' },
          requireEmail: { type: 'boolean', description: 'Require email for anonymous users' },
          allowedCountries: { type: 'array', items: { type: 'string' }, description: 'Allowed country codes' },
          allowedLanguages: { type: 'array', items: { type: 'string' }, description: 'Allowed language codes' },
          allowedIpRanges: { type: 'array', items: { type: 'string' }, description: 'Allowed IP ranges' }
        }
      },
      response: {
        200: conversationShareLinkResponseSchema,
        400: errorResponseSchema,
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
      const body = request.body || {};
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Récupérer les informations de la conversation et du membre
      const [conversation, membership] = await Promise.all([
        prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { id: true, type: true, title: true }
        }),
        prisma.participant.findFirst({
          where: {
            conversationId: conversationId,
            userId: currentUserId,
            isActive: true
          }
        })
      ]);

      if (!conversation) {
        return sendNotFound(reply, 'Conversation not found');
      }

      if (!membership) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Récupérer le rôle de l'utilisateur
      const user = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { role: true }
      });

      if (!user) {
        return sendForbidden(reply, 'User not found');
      }

      // Vérifier les permissions pour créer des liens de partage
      const conversationType = conversation.type;
      const userRole = user.role as UserRoleEnum;

      // Interdire la création de liens pour les conversations directes
      if (conversationType === 'direct') {
        return sendForbidden(reply, 'Cannot create share links for direct conversations');
      }

      // Pour les conversations globales, seuls les BIGBOSS peuvent créer des liens
      if (conversationType === 'global') {
        if (userRole !== UserRoleEnum.BIGBOSS) {
          return sendForbidden(reply, 'You do not have the necessary rights to perform this operation');
        }
      }

      // Pour tous les autres types de conversations (group, public, etc.),
      // n'importe qui ayant accès à la conversation peut créer des liens
      // L'utilisateur doit juste être membre de la conversation (déjà vérifié plus haut)

      // Identifiant PUBLIC du lien — compact, opaque, vérifié libre sur les
      // deux colonnes publiques AVANT l'écriture (cf. `generateShareLinkId`).
      const linkId = await generateUniqueShareLinkId(prisma);

      // Identifiant LISIBLE — dérivé du nom, sinon de la description. Sans ni
      // l'un ni l'autre, le repli est compact et opaque, plus horodaté.
      let baseIdentifier = '';
      if (body.name) {
        baseIdentifier = `mshy_${body.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}`;
      } else if (body.description) {
        // Utiliser la description comme base si pas de nom
        baseIdentifier = `mshy_${body.description.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 30)}`;
      }
      const uniqueIdentifier = await ensureUniqueShareLinkIdentifier(prisma, baseIdentifier);

      // Créer le lien avec toutes les options configurables
      const shareLink = await prisma.conversationShareLink.create({
        data: {
          linkId,
          conversationId: conversationId,
          createdBy: currentUserId,
          name: body.name ? SecuritySanitizer.sanitizeText(body.name) : body.name,
          description: body.description ? SecuritySanitizer.sanitizeText(body.description) : body.description,
          maxUses: body.maxUses ?? undefined,
          maxConcurrentUsers: body.maxConcurrentUsers ?? undefined,
          maxUniqueSessions: body.maxUniqueSessions ?? undefined,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
          allowAnonymousMessages: body.allowAnonymousMessages ?? true,
          allowAnonymousFiles: body.allowAnonymousFiles ?? false,
          allowAnonymousImages: body.allowAnonymousImages ?? true,
          allowViewHistory: body.allowViewHistory ?? true,
          requireNickname: body.requireNickname ?? true,
          requireEmail: body.requireEmail ?? false,
          allowedCountries: body.allowedCountries ?? [],
          allowedLanguages: body.allowedLanguages ?? [],
          allowedIpRanges: body.allowedIpRanges ?? [],
          identifier: uniqueIdentifier
        }
      });

      // Retour compatible avec le frontend de service conversations (string du lien complet).
      // `/chat/:linkId` est l'URL canonique (la page qui ouvre la conversation
      // dans la vue courante) ; `/join/:linkId` ne survit qu'en 308 pour les
      // liens déjà en circulation — un lien neuf ne prend pas le détour.
      const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3100'}/chat/${linkId}`;
      return sendSuccess(reply, {
        link: inviteLink,
        code: linkId,
        shareLink: {
          id: shareLink.id,
          linkId,
          name: shareLink.name,
          description: shareLink.description,
          maxUses: shareLink.maxUses,
          expiresAt: shareLink.expiresAt,
          allowAnonymousMessages: shareLink.allowAnonymousMessages,
          allowAnonymousFiles: shareLink.allowAnonymousFiles,
          allowAnonymousImages: shareLink.allowAnonymousImages,
          allowViewHistory: shareLink.allowViewHistory,
          requireNickname: shareLink.requireNickname,
          requireEmail: shareLink.requireEmail
        }
      });

    } catch (error) {
      logger.error('Error creating new conversation link', error as Error);
      return sendInternalError(reply, 'Error creating link');
    }
  });

  // `PATCH /conversations/:id` VIVAIT ICI, en jumeau du `PUT` de `core.ts`.
  // Les deux ont dérivé comme dérivent deux exemplaires d'un même geste : celui-ci
  // n'acceptait que `title`/`description`/`type`, laissait n'importe quel membre
  // actif renommer le groupe, et n'émettait AUCUN `conversation:updated`. Le web lui
  // postait `avatar` et `banner` — non déclarés, donc ignorés en silence sous une
  // réponse 200 : l'interface annonçait « bannière mise à jour » et rien n'était
  // écrit (mesuré en production le 2026-08-24).
  //
  // Le handler de `core.ts` sert désormais les DEUX verbes. Ne pas réintroduire de
  // route de modification ici : les métadonnées d'une conversation ont un seul point
  // d'écriture, et `conversation-update-route.test.ts` le garde sur PUT comme sur PATCH.
  // Récupérer les liens de partage d'une conversation (pour les admins)
  fastify.get('/conversations/:conversationId/links', {
    schema: {
      description: 'Get all shareable links for a conversation (moderators see all links, members see only their own)',
      tags: ['conversations', 'links'],
      summary: 'Get conversation share links',
      params: {
        type: 'object',
        required: ['conversationId'],
        properties: {
          conversationId: { type: 'string', description: 'Conversation ID' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  linkId: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  maxUses: { type: 'number' },
                  currentUses: { type: 'number' },
                  expiresAt: { type: 'string', format: 'date-time' },
                  isActive: { type: 'boolean' },
                  createdAt: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que l'utilisateur est membre de la conversation
      const membership = await prisma.participant.findFirst({
        where: {
          conversationId,
          userId,
          isActive: true
        }
      });

      if (!membership) {
        return sendForbidden(reply, 'You must be a member of this conversation to see its sharing links');
      }

      // Vérifier si l'utilisateur est modérateur/admin de la conversation
      const isModerator = ['creator', 'admin', 'moderator'].includes(membership.role as string);

      // Filtrer les liens selon les droits:
      // - Modérateurs: voient TOUS les liens
      // - Membres normaux: voient uniquement leurs propres liens
      const links = await prisma.conversationShareLink.findMany({
        where: {
          conversationId,
          ...(isModerator ? {} : { creatorId: userId }) // Si pas modérateur, filtrer par créateur
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true
            }
          },
          conversation: {
            select: {
              id: true,
              title: true,
              type: true
            }
          },
        },
        orderBy: { createdAt: 'desc' }
      });

      // NOTE: Cannot use sendSuccess() — response includes a top-level `isModerator`
      // field that iOS SDK (ConversationLinksResponse) and web parse at root level.
      // Migration to sendSuccess requires a coordinated client update (breaking change).
      return reply.send({
        success: true,
        data: links.map(l => ({ ...l, participantCount: l.currentUses })),
        isModerator
      });
    } catch (error) {
      logger.error('Error fetching conversation links', error as Error);
      return sendInternalError(reply, 'Error retrieving conversation links');
    }
  });

  // Route pour rejoindre une conversation via un lien partagé (utilisateurs authentifiés)
  fastify.post('/conversations/join/:linkId', {
    schema: {
      description: 'Join a conversation using an invitation link - validates link permissions and adds user as member',
      tags: ['conversations', 'links'],
      summary: 'Join conversation via link',
      params: {
        type: 'object',
        required: ['linkId'],
        properties: {
          linkId: { type: 'string', description: 'Share link ID to join conversation' }
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
                message: { type: 'string' },
                conversationId: { type: 'string' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { linkId } = request.params as { linkId: string };
      const authRequest = request as UnifiedAuthRequest;
      const userToken = authRequest.authContext;

      if (!userToken) {
        return sendUnauthorized(reply, 'Authentification requise');
      }

      // Accepter linkId OU identifier : iOS partage l'`identifier`, le web le
      // `linkId`. Querier seulement par linkId 404ait toute invitation partagée
      // depuis iOS. Symétrique avec resolveTarget (qui accepte déjà les deux).
      const shareLink = await prisma.conversationShareLink.findFirst({
        where: { OR: [{ linkId }, { identifier: linkId }] },
        include: {
          conversation: true
        }
      });

      if (!shareLink) {
        return sendNotFound(reply, 'Lien de conversation introuvable');
      }

      if (!shareLink.isActive) {
        return sendError(reply, 410, 'Ce lien n\'est plus actif');
      }

      if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
        return sendError(reply, 410, 'This link has expired');
      }

      // Que faire de la ligne `Participant` déjà là — cf.
      // `services/conversations/conversationEntryAdmission.ts`. La recherche qui
      // précédait ne filtrait pas `isActive` et concluait « déjà membre » sur la
      // ligne inactive d'un ancien membre : quitter une conversation rejointe
      // par lien était définitif, et le client naviguait ensuite vers une
      // conversation que `GET /conversations/:id/messages` refuse.
      const entry = await resolveConversationEntry({
        prisma,
        conversationId: shareLink.conversationId,
        userId: userToken.userId,
        // Les trois validations ci-dessus portent sur le LIEN. Aucune ne portait
        // sur ce vers quoi il pointe : une clôture n'éteint aucun lien de
        // partage, si bien qu'un lien qui circule restait joignable après la
        // mort du fil. La ligne est déjà chargée (`include: { conversation }`),
        // la question ne coûte rien.
        conversation: shareLink.conversation,
      });

      if (entry.outcome === 'closed') {
        logger.info('Jointure refusée — conversation close', { conversationId: shareLink.conversationId });
        return sendError(reply, 410, 'Cette conversation est terminée');
      }

      if (entry.outcome === 'banned') {
        logger.warn('Jointure refusée — participant banni', { conversationId: shareLink.conversationId });
        return sendForbidden(reply, 'Vous avez été banni de cette conversation');
      }

      if (entry.outcome === 'already-member') {
        logger.info('Utilisateur déjà membre', { conversationId: shareLink.conversationId });
        return sendSuccess(reply, { message: 'Vous êtes déjà membre de cette conversation', conversationId: shareLink.conversationId });
      }

      // Ajouter l'utilisateur à la conversation
      logger.info('Entrée dans la conversation', { conversationId: shareLink.conversationId, outcome: entry.outcome });
      const joiningUserInfo = await prisma.user.findUnique({
        where: { id: userToken.userId },
        select: { displayName: true, username: true }
      });

      // Le rang et les droits repartent de ce que le lien donne à un nouvel
      // arrivant : un ancien `admin` qui revient par un lien PUBLIC ne récupère
      // pas son rang dans une ligne périmée.
      const linkMemberFields = {
        type: 'user',
        displayName: joiningUserInfo?.displayName || joiningUserInfo?.username || 'User',
        role: 'member',
        permissions: {
          canSendMessages: true,
          canSendFiles: true,
          canSendImages: true,
          canSendVideos: false,
          canSendAudios: false,
          canSendLocations: false,
          canSendLinks: false
        },
        shareLinkId: shareLink.id
      };

      let joinedParticipantId: string;
      if (entry.outcome === 'rejoin' && entry.participantId) {
        // Réintégration sur la ligne existante. `Participant` porte
        // `@@unique([conversationId, userId, sessionTokenHash])` : pour un
        // inscrit — dont `sessionTokenHash` est nul — la clé se réduit à
        // `(conversationId, userId)` et un `create` ici échouerait. Même sans
        // elle, une seconde ligne rendrait l'identité d'expéditeur ambiguë et
        // doublerait le fan-out. `joinedAt` reste celui de la première venue.
        const rejoined = await prisma.participant.update({
          where: { id: entry.participantId },
          data: { ...linkMemberFields, ...REJOIN_PARTICIPANT_STATE }
        });
        joinedParticipantId = rejoined.id;
        invalidateParticipantLookup(entry.participantId, shareLink.conversationId);
      } else {
        const created = await prisma.participant.create({
          data: {
            conversationId: shareLink.conversationId,
            userId: userToken.userId,
            ...linkMemberFields,
            joinedAt: new Date()
          }
        });
        joinedParticipantId = created.id;
      }

      // Incrémenter le compteur d'utilisation du lien
      await prisma.conversationShareLink.update({
        where: { id: shareLink.id },
        data: { currentUses: { increment: 1 } }
      });
      logger.info('Appartenance ouverte', { outcome: entry.outcome });

      // Annoncer l'arrivée — même loi que la porte anonyme. Un retour compte
      // comme une arrivée : les présents ne l'ont pas vu partir non plus.
      await postJoinSystemMessage(
        {
          prisma,
          broadcast: (message, conversationId) =>
            fastify.socketIOHandler?.getManager()?.broadcastMessage(message as never, conversationId)
              ?? Promise.resolve()
        },
        {
          conversationId: shareLink.conversationId,
          participantId: joinedParticipantId,
          displayName: linkMemberFields.displayName,
          isAnonymous: false,
          viaShareLink: true
        }
      );

      // Auto-join the joining user's currently-connected sockets to the
      // conversation room so they receive message:new events immediately
      // without a reconnect (mirrors POST /conversations/:id/participants).
      const joinSocketManager = fastify.socketIOHandler?.getManager();
      if (joinSocketManager) {
        joinSocketManager.joinUserToConversationRoom(userToken.userId, shareLink.conversationId).catch(
          (err: unknown) => logger.error('Failed to auto-join link joiner to conversation room', err as Error)
        );
      }

      // Envoyer des notifications
      const notificationService = fastify.notificationService;
      if (notificationService) {
        try {
          // Récupérer les informations de l'utilisateur qui rejoint
          const joiningUser = await prisma.user.findUnique({
            where: { id: userToken.userId },
            select: {
              username: true,
              displayName: true,
              avatar: true
            }
          });

          if (joiningUser) {
            const userName = joiningUser.displayName || joiningUser.username;

            // 1. Notification de confirmation pour l'utilisateur qui rejoint
            await notificationService.createMemberJoinedNotification({
              recipientUserId: userToken.userId,
              newMemberUserId: userToken.userId,
              conversationId: shareLink.conversationId,
              joinMethod: 'via_link'
            });

            // 2. Notifier les admins et créateurs de la conversation
            const adminsAndCreators = await prisma.participant.findMany({
              where: {
                conversationId: shareLink.conversationId,
                role: { in: ['admin', 'creator'] },
                isActive: true,
                userId: { not: userToken.userId } // Ne pas notifier l'utilisateur lui-même
              },
              select: { userId: true }
            });

            // Une seule diffusion pour tous les administrateurs. La boucle
            // `await` qui précédait tenait la réponse « vous avez rejoint »
            // jusqu'à ce que le dernier d'entre eux soit notifié, et relisait
            // par destinataire un contexte identique pour tous.
            const adminUserIds = adminsAndCreators
              .map((member) => member.userId)
              .filter((id): id is string => !!id);
            if (adminUserIds.length > 0) {
              const notified = await notificationService.createMemberJoinedNotificationsBatch(adminUserIds, {
                newMemberUserId: userToken.userId,
                conversationId: shareLink.conversationId,
                joinMethod: 'via_link'
              });
              logger.debug('Notifications membre rejoint envoyées', { notified, audience: adminUserIds.length });
            }

            logger.debug('Notification confirmation envoyée');
          }
        } catch (notifError) {
          logger.error('Erreur envoi notifications de jointure', notifError as Error);
          // Ne pas bloquer la jointure
        }
      }

      logger.info('Réponse succès join', { conversationId: shareLink.conversationId });
      return sendSuccess(reply, { message: 'Vous avez rejoint la conversation avec succès', conversationId: shareLink.conversationId });

    } catch (error) {
      logger.error('Error joining conversation via link', error as Error);
      return sendInternalError(reply, 'Erreur lors de la jointure de la conversation');
    }
  });

  // Route pour inviter un utilisateur à une conversation
  fastify.post('/conversations/:id/invite', {
    schema: {
      description: 'Invite a user to join a conversation - creates membership and sends notification',
      tags: ['conversations', 'participants'],
      summary: 'Invite user to conversation',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID' }
        }
      },
      body: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'ID of user to invite' }
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
                message: { type: 'string', example: 'User invited successfully' },
                // `membership` déclaré / `member` envoyé : le nouvel adhérent
                // n'a JAMAIS atteint le fil. Aligné sur le nom que portent ses
                // deux voisines (`PATCH …/role`, la liste) — on ne casse pas un
                // contrat qui n'a jamais été honoré.
                participant: conversationParticipantSchema
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User not authenticated');
      }

      const { id: conversationId } = request.params as { id: string };
      const { userId } = request.body as { userId: string };
      const inviterId = authContext.userId;

      // Vérifier que la conversation existe
      const conversation = await fastify.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            where: { isActive: true, type: 'user' },
            select: {
              id: true,
              userId: true,
              role: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  role: true
                }
              }
            }
          }
        }
      });

      if (!conversation) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Vérifier que l'inviteur est membre de la conversation
      const inviterMember = conversation.participants.find(m => m.userId === inviterId);
      if (!inviterMember) {
        return sendForbidden(reply, 'Vous n\'êtes pas membre de cette conversation');
      }

      // Vérifier que l'inviteur a les permissions pour inviter
      const canInvite = 
        inviterMember.role === 'admin' ||
        inviterMember.role === 'creator' ||
        authContext.registeredUser.role === 'ADMIN' ||
        authContext.registeredUser.role === 'BIGBOSS';

      if (!canInvite) {
        return sendForbidden(reply, 'Vous n\'avez pas les permissions pour inviter des utilisateurs');
      }

      // Vérifier que l'utilisateur à inviter existe
      const userToInvite = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          firstName: true,
          lastName: true
        }
      });

      if (!userToInvite) {
        return sendNotFound(reply, 'User not found');
      }

      // `conversation.participants` est chargé avec `where: { isActive: true }` :
      // il ne pouvait donc PAS voir la ligne d'un banni ni celle d'un ancien
      // membre, et le `create` qui suit leur fabriquait une ligne neuve et
      // active — un bannissement défait sans passer par `POST …/unban`, plus une
      // seconde ligne `Participant` pour la même paire.
      const entry = await resolveConversationEntry({
        prisma: fastify.prisma,
        conversationId,
        userId,
        // Déjà chargée pour vérifier l'appartenance de l'inviteur — inviter dans
        // un fil terminé donnait une ligne active dans une conversation que
        // `GET /conversations` ne rend plus et où le premier message est refusé.
        conversation,
      });

      if (entry.outcome === 'closed') {
        return sendError(reply, 410, 'Cette conversation est terminée');
      }

      if (entry.outcome === 'banned') {
        return sendForbidden(reply, 'This user is banned from the conversation — lift the ban first');
      }

      if (entry.outcome === 'already-member') {
        return sendBadRequest(reply, 'This user is already a member of the conversation');
      }

      const invitedMemberFields = {
        type: 'user',
        displayName: userToInvite.displayName || userToInvite.username,
        role: 'member',
        permissions: {
          canSendMessages: true,
          canSendFiles: true,
          canSendImages: true,
          canSendVideos: false,
          canSendAudios: false,
          canSendLocations: false,
          canSendLinks: false
        }
      };

      // La mise en garde qui vivait ici — « ne rien charger qu'aucune surface ne
      // sert, sinon le jour où la dérive `member`/`membership` est corrigée, la
      // présence brute d'un invité part sur le fil » — est LEVÉE, parce que le
      // jour est arrivé et que le gate arrive avec. Le rang ne part plus jamais
      // brut : `serializeConversationParticipant` est le seul chemin vers le fil,
      // et il exige qu'on lui passe la visibilité.
      const invitedMemberInclude = {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
            systemLanguage: true,
            regionalLanguage: true,
            customDestinationLanguage: true,
            createdAt: true,
            updatedAt: true
          }
        }
      };

      const newMember = entry.outcome === 'rejoin' && entry.participantId
        ? await fastify.prisma.participant.update({
            where: { id: entry.participantId },
            data: { ...invitedMemberFields, ...REJOIN_PARTICIPANT_STATE },
            include: invitedMemberInclude
          })
        : await fastify.prisma.participant.create({
            data: {
              conversationId: conversationId,
              userId: userId,
              ...invitedMemberFields,
              joinedAt: new Date(),
              isActive: true
            },
            include: invitedMemberInclude
          });

      if (entry.outcome === 'rejoin' && entry.participantId) {
        invalidateParticipantLookup(entry.participantId, conversationId);
      }

      // Annoncer l'arrivée — troisième des quatre portes, même loi.
      await postJoinSystemMessage(
        {
          prisma: fastify.prisma,
          broadcast: (message, targetConversationId) =>
            fastify.socketIOHandler?.getManager()?.broadcastMessage(message as never, targetConversationId)
              ?? Promise.resolve()
        },
        {
          conversationId,
          participantId: newMember.id,
          displayName: invitedMemberFields.displayName,
          isAnonymous: false,
          viaShareLink: false
        }
      );

      // Auto-join the invited user's currently-connected sockets to the
      // conversation room so they receive message:new events immediately
      // without a reconnect (mirrors POST /conversations/:id/participants).
      const inviteSocketManager = fastify.socketIOHandler?.getManager();
      if (inviteSocketManager) {
        inviteSocketManager.joinUserToConversationRoom(userId, conversationId).catch(
          (err: unknown) => logger.error('Failed to auto-join invited user to conversation room', err as Error)
        );
      }

      // Envoyer une notification à l'utilisateur invité
      const notificationService = fastify.notificationService;
      if (notificationService) {
        try {
          // Récupérer les informations de l'inviteur
          const inviter = await fastify.prisma.user.findUnique({
            where: { id: inviterId },
            select: {
              username: true,
              displayName: true,
              avatar: true
            }
          });

          if (inviter) {
            await notificationService.createConversationInviteNotification({
              invitedUserId: userId,
              inviterId: inviterId,
              inviterUsername: inviter.displayName || inviter.username,
              inviterAvatar: inviter.avatar || undefined,
              conversationId: conversationId,
              conversationTitle: conversation.title,
              conversationType: conversation.type
            });
            logger.debug('Notification invitation envoyée');
          }
        } catch (notifError) {
          logger.error('Erreur envoi notification invitation', notifError as Error);
          // Ne pas bloquer l'invitation
        }
      }

      // PERFORMANCE: Invalider le cache d'autocomplete car la liste des membres a changé
      const mentionService = fastify.mentionService;
      if (mentionService) {
        try {
          await mentionService.invalidateCacheForConversation(conversationId);
          logger.debug('Cache autocomplete invalidé');
        } catch (cacheError) {
          logger.error('Erreur invalidation cache', cacheError as Error);
          // Ne pas bloquer l'invitation
        }
      }

      // Régime `resolvePrefsOnly` : l'inviteur et l'invité partagent désormais
      // une conversation — le contexte d'accès est acquis des deux côtés, seules
      // les préférences de l'invité décident.
      const invitePresenceVis = await getPresenceVisibilityService(prisma).resolvePrefsOnly([userId]);

      return sendSuccess(reply, {
        participant: serializeConversationParticipant(newMember, {
          presence: invitePresenceVis.get(userId)
        }),
        message: `${userToInvite.displayName || userToInvite.username} a été invité à la conversation`
      });

    } catch (error) {
      logger.error('Erreur invitation', error as Error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
