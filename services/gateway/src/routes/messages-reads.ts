/**
 * Routes messages — surface LECTURE : GET /messages/:messageId, GET
 * /messages/:messageId/translations, GET /messages/:messageId/status-details,
 * GET /attachments/:attachmentId/status-details. Issue #4284. Point d'entrée :
 * messages.ts.
 */
import { FastifyInstance } from 'fastify';
import { UnifiedAuthRequest } from '../middleware/auth.js';
import { attachmentFullSelect } from '../services/attachments/attachmentIncludes';
import { hoistLocationOnto } from '../services/location/sharedPlace';
import { HISTORY_FLOOR_PARTICIPANT_SELECT, loadHistoryFloor, loadReaderHistoryFloor, historyReaderFromAuthContext, type HistoryFloorJoin } from '../services/historyFloor';
import { transformTranslationsToArray, type MessageTranslationJSON } from '../utils/translation-transformer';
import { validatePagination } from '../utils/pagination';
import { getPresenceVisibilityService } from '../services/PresenceVisibilityService';
import {
  applyPresenceVisibilityAsOffline,
  type PresenceVisibility,
} from '@meeshy/shared/utils/presence-visibility';
import { presenceFor, viewerFromRequest } from './users/presence-gate';
import { validateParams, validateQuery } from '../validation/helpers.js';
import {
  MessageParamsSchema,
  AttachmentParamsSchema,
  MessageStatusDetailsQuerySchema,
} from '../validation/messages-schemas.js';
import { errorResponseSchema, messageSchema } from '@meeshy/shared/types/api-schemas';
import {
  sendSuccess,
  sendPaginatedSuccess,
  sendNotFound,
  sendForbidden,
  sendInternalError,
} from '../utils/response.js';
import { logger, type MessageParams, type MessagesRouteDeps } from './messages-shared';

/**
 * L'expéditeur tel que `GET /messages/:messageId` le CHARGE — un `Participant`,
 * et son `User` imbriqué.
 *
 * `messageSchema.sender` est `userMinimalSchema` : il couvre le participant
 * (il déclare `userId` et `type` pour lui) mais reste MINIMAL, et ce `select`
 * charge en plus le bloc `user`. Le grain juste est celui qui CHARGE — c'est
 * cette route qui charge plus, c'est elle qui déclare plus, localement.
 *
 * **Différence assumée avec `editedMessageSenderSchema`** (cycle 93,
 * `conversations/messages-advanced.ts`), et c'est pourquoi les deux ne
 * fusionnent pas en un `participantSenderSchema` partagé : les deux routes ne
 * chargent pas le même participant. Là-bas c'est `role` + `language` sans
 * `isOnline` (fail-closed : le `select` ne le charge pas). Ici c'est l'inverse
 * — pas de `role`/`language`, mais `isOnline` sur les DEUX porteurs, chargé
 * DÉLIBÉRÉMENT et gaté à la source par `applyPresenceVisibilityAsOffline`
 * (critère STRICT — `resolveForTargets` : soi-même, ADMIN/BIGBOSS, ou ami
 * accepté de l'expéditeur, jamais la seule co-présence dans la conversation ;
 * directive produit du 2026-08-25). Le déclarer est donc juste, et la garde
 * reste où elle doit être : dans le handler, pas dans le sérialiseur.
 */
const messageDetailSenderSchema = {
  type: 'object',
  nullable: true,
  properties: {
    id: { type: 'string', description: 'Participant ID' },
    userId: { type: 'string', nullable: true, description: 'Real User ID (null for anonymous participants)' },
    displayName: { type: 'string', nullable: true },
    avatar: { type: 'string', nullable: true },
    isOnline: { type: 'boolean', description: 'Presence — gated by applyPresenceVisibilityAsOffline in the handler' },
    type: { type: 'string', enum: ['user', 'anonymous', 'bot'] },
    user: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        username: { type: 'string' },
        avatar: { type: 'string', nullable: true },
        isOnline: { type: 'boolean', description: 'Presence — gated with the same visibility as its participant' }
      }
    }
  }
} as const;

/**
 * L'enveloppe RÉELLE de `GET /messages/:messageId`.
 *
 * Ce qu'elle remplace était la dernière ligne de `FROZEN_INVENTORY`, et la
 * seule de la **forme 3** : un schéma qui décrit le MESSAGE (`id`, `content`,
 * `sender`…) quand `sendSuccess` répond `{ success, data }`. Aucune de ses
 * déclarations ne matchait, `success`/`data` n'étaient pas déclarés, et
 * l'`additionalProperties: true` du bloc laissait la charge utile traverser
 * ENTIÈRE et non gouvernée. Le balayage la signalait donc en FAUX POSITIF —
 * `sender: { type: 'object' }` n'y vidait rien, il masquait au contraire une
 * fuite de présence ACTIVE, fermée au cycle 88 par le gate du handler.
 *
 * Aligner ce schéma était « un lot en soi » parce que déclarer partiellement ce
 * qui passait entier TRONQUE. Les 42 clés servies ont donc été relevées
 * mécaniquement depuis le `select` et les surcharges du handler, puis passées
 * au sérialiseur : la mesure a fait apparaître les DEUX défauts que
 * l'enveloppe inerte cachait — `translations` servi en CARTE là où le contrat
 * dit tableau (corrigé dans le handler), et `encryptionMode` absent de
 * `messageSchema` (corrigé dans le schéma partagé, où il manquait pour la
 * liste aussi). *Réparer une enveloppe rend lisibles les défauts de ce qu'elle
 * contenait.*
 *
 * Composée depuis `messageSchema` et **non** en descendant dans
 * `messageResponseSchema.properties.data` : plusieurs suites mockent
 * `@meeshy/shared/types/api-schemas` avec un sous-ensemble des exports, et une
 * chaîne d'accès y lève à l'IMPORT (cycles 91 bis et 93, deux suites qui ont
 * cessé de CHARGER).
 */
export const messageDetailResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      ...messageSchema,
      description: 'The message, served flat — never wrapped under `data.message`',
      properties: {
        ...messageSchema.properties,
        sender: messageDetailSenderSchema,
        // Le `select` charge la conversation POUR LE CONTRÔLE D'ACCÈS (le 403
        // vingt lignes plus bas), et l'étalement `...message` la sert depuis
        // toujours. Le `where` ne rend que la ligne de l'APPELANT
        // (`{ userId, isActive: true }`) : c'est sa propre appartenance, jamais
        // celle d'un tiers. Déclarée telle qu'elle est servie — la retirer
        // serait un changement de contrat, qui se décide sur des preuves de
        // consommation client, pas en passant.
        conversation: {
          type: 'object',
          nullable: true,
          description: "Caller's own participation row, loaded for the access check",
          properties: {
            participants: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  userId: { type: 'string', nullable: true },
                  role: { type: 'string', nullable: true }
                }
              }
            }
          }
        },
        // Les trois compteurs sont servis DEUX fois : à plat (les trois clients
        // y décodent leurs coches) et groupés ici. Le doublon est antérieur à ce
        // lot et parfaitement servi aujourd'hui ; le déclarer maintient la
        // charge utile à l'identique.
        statusSummary: {
          type: 'object',
          description: 'Grouped mirror of the three flat delivery counters',
          properties: {
            deliveredCount: { type: 'number' },
            readCount: { type: 'number' },
            recipientCount: { type: 'number' }
          }
        }
      }
    }
  }
} as const;

export function registerMessagesReadRoutes(fastify: FastifyInstance, deps: MessagesRouteDeps): void {
  const { prisma, requiredAuth } = deps;

  // Route pour récupérer un message spécifique
  // OPTIMISÉ: N'inclut plus les statusEntries - utilise les champs dénormalisés
  fastify.get<{
    Params: MessageParams;
  }>('/messages/:messageId', {
    schema: {
      description: 'Get a specific message by ID with all associated data',
      tags: ['messages'],
      summary: 'Get message details',
      response: {
        200: {
          description: 'Message details',
          ...messageDetailResponseSchema
        },
        404: {
          description: 'Message not found',
          ...errorResponseSchema
        }
      }
    },
    preValidation: [requiredAuth],
    preHandler: [validateParams(MessageParamsSchema)]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Récupérer le message avec ses détails (sans statusEntries - évite N+1)
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          deletedAt: null
        },
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          content: true,
          originalLanguage: true,
          messageType: true,
          messageSource: true,
          isEdited: true,
          editedAt: true,
          deletedAt: true,
          replyToId: true,
          forwardedFromId: true,
          forwardedFromConversationId: true,
          expiresAt: true,
          isViewOnce: true,
          maxViewOnceCount: true,
          viewOnceCount: true,
          isBlurred: true,
          pinnedAt: true,
          effectFlags: true,
          pinnedBy: true,
          validatedMentions: true,
          createdAt: true,
          updatedAt: true,
          // Aucune colonne dénormalisée de statut n'est lue : les cinq ont
          // perdu leur écrivain au passage aux curseurs
          // (`updateMessageComputedStatus` est un no-op assumé). Le bloc de
          // statut est calculé plus bas.
          reactionSummary: true,
          reactionCount: true,
          encryptedContent: true,
          encryptionMetadata: true,
          isEncrypted: true,
          encryptionMode: true,
          translations: true,
          // Rappel projet : tout champ lu doit figurer dans le select. Sans
          // `metadata` ici, un message géolocalisé affiché en entier (bulle
          // complète, cette route) ne montrait jamais sa position.
          metadata: true,
          sender: {
            select: {
              id: true,
              userId: true,
              displayName: true,
              avatar: true,
              isOnline: true,
              type: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  avatar: true,
                  isOnline: true
                }
              }
            }
          },
          conversation: {
            select: {
              participants: {
                where: { userId: userId, isActive: true },
                // La ligne du lecteur porte aussi son PLANCHER d'historique
                // (`historyFloorFor`) : lue ici, dans la même requête.
                select: { userId: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT }
              }
            }
          },
          attachments: { select: attachmentFullSelect }
        }
      });

      if (!message) {
        return sendNotFound(reply, 'Message non trouvé');
      }

      // Vérifier que l'utilisateur a accès à cette conversation
      const [readerRow] = (message as any).conversation.participants as Array<HistoryFloorJoin | undefined>;
      if (!readerRow) {
        return sendForbidden(reply, 'Accès non autorisé à ce message');
      }

      // Un message d'AVANT l'arrivée du lecteur n'existe pas pour lui — même
      // réponse qu'un id inconnu, comme la racine de fil sous le plancher.
      const historyFloor = await loadHistoryFloor(prisma, readerRow);
      if (historyFloor && message.createdAt < historyFloor) {
        return sendNotFound(reply, 'Message non trouvé');
      }

      // Le résumé se CALCULE — les colonnes dénormalisées de la ligne Message
      // n'ont aucun écrivain et valaient donc toujours `{0, 0, null, null}`.
      // Même source de vérité que la liste de messages et que le canal socket,
      // opt-out `showReadReceipts` compris. Le détail par participant reste
      // derrière GET /messages/:messageId/status-details.
      // Le résumé est un ENRICHISSEMENT : son échec — rejet comme jet
      // synchrone — ne doit pas emporter le message, qui est le contenu
      // demandé. D'où le try/catch plutôt qu'un `.catch()`, qui ne rattraperait
      // que le premier des deux.
      let summary: {
        totalMembers: number;
        receivedCount: number;
        readCount: number;
        deliveredToAllAt: Date | null;
        readByAllAt: Date | null;
      } | undefined;
      try {
        const { MessageReadStatusService } = await import('../services/MessageReadStatusService');
        const readStatusService = new MessageReadStatusService(prisma);
        const summaries = await readStatusService.getConversationReadStatuses(
          (message as any).conversationId,
          [messageId]
        );
        summary = summaries.get(messageId);
      } catch (err) {
        logger.warn('[MESSAGES] Failed to compute read status summary', err as Error);
      }

      // Présence de l'expéditeur : gate STRICT (directive produit 2026-08-25).
      // Être co-participant ACTIF de cette conversation (le 403 vingt lignes
      // plus haut) donne accès au MESSAGE, jamais à la présence de son auteur —
      // une conversation n'est pas une relation. `isOnline`/`lastActiveAt` ne
      // se montrent donc qu'à soi-même, à un ADMIN/BIGBOSS, ou à un ami accepté
      // de l'expéditeur (sous ses préférences `showOnlineStatus`/`showLastSeen`).
      // Tout autre lecteur reçoit `isOnline: false` sur les DEUX porteurs — la
      // ligne `Participant` (`sender.isOnline`) ET le `User` imbriqué
      // (`sender.user.isOnline`), qui voyagent tous deux depuis le `select`.
      //
      // Ce site N'EST PAS une non-fuite accidentelle, contrairement à ce que
      // le balayage `{ type: 'object' }` laissait croire : le schéma de cette
      // route décrit le message quand `sendSuccess` répond `{ success, data }`,
      // si bien que ses déclarations ne s'appliquent à rien et que `data`
      // traverse entier (voir la note sur `sender` dans le schéma). `isOnline`
      // brut atteignait donc réellement le fil sans ce gate.
      //
      // Un expéditeur ANONYME (`userId` absent) n'a pas de ligne `User` à
      // résoudre via `resolveForTargets` (elle est indexée par `User.id`) —
      // rien n'est demandé au résolveur, et sa carte reste vide. Le sort d'une
      // entrée ABSENTE (anonyme, ou inscrit non résolu) n'est pas réécrit ici :
      // `presenceFor` (`presence-gate`) applique la loi partagée — révélé à
      // ADMIN/BIGBOSS, à qui la directive garantit la présence de façon
      // inconditionnelle, masqué sinon — et ne rend jamais `undefined`.
      const viewer = viewerFromRequest(request);
      const senderUserId = (message as { sender?: { userId?: string | null } }).sender?.userId;
      const senderVisibilityById = senderUserId
        ? await getPresenceVisibilityService(prisma).resolveForTargets(viewer, [senderUserId])
        : new Map<string, PresenceVisibility>();
      const senderVisibility = presenceFor(viewer, senderVisibilityById, senderUserId);
      const gatedSender = (message as { sender?: Record<string, unknown> | null }).sender
        ? (() => {
            const raw = (message as unknown as { sender: Record<string, unknown> }).sender;
            const gated = applyPresenceVisibilityAsOffline(
              raw as unknown as { isOnline: boolean | null },
              senderVisibility,
            ) as Record<string, unknown>;
            const nested = raw.user as { isOnline: boolean | null } | null | undefined;
            return nested
              ? {
                  ...gated,
                  user: applyPresenceVisibilityAsOffline(nested, senderVisibility),
                }
              : gated;
          })()
        : (message as { sender?: unknown }).sender;

      // hoistLocationOnto hisse metadata.location en champ top-level `location`
      // — Lot 1 : ce message est affiché en entier, sans hoist la position
      // resterait invisible même si elle a bien été validée à l'écriture.
      return sendSuccess(reply, hoistLocationOnto({
        ...message,
        sender: gatedSender,
        // `Message.translations` est une CARTE Mongo (`langue → {text, …}`),
        // jamais un tableau — le contrat, lui, déclare un TABLEAU d'objets
        // `{targetLanguage, translatedContent, …}`, et c'est ce que décodent
        // les clients (`APIMessage.translations: [APITextTranslation]?`).
        //
        // Les DEUX autres transports de ce fichier appliquaient déjà
        // `transformTranslationsToArray` (l'édition, la suppression) ; ce
        // GET-ci étalait `...message` et servait donc la carte BRUTE. Le
        // symptôme n'était pas côté web (permissif) mais sur le chemin PUSH :
        // l'extension de notification appelle cette route, dépose le blob dans
        // l'App Group, et `NSEPendingMessageConsumer` le décode en `APIMessage`
        // — où `translations` se décode avec un `try` NON tolérant, contrairement
        // à ses voisins `callSummary`/`trackingLinks`. Une carte y fait donc
        // échouer le décodage du message ENTIER, le consommateur SUPPRIME le
        // fichier, et le démarrage à froid depuis une notification se retrouve
        // sans son message — la garantie même que cette route avait été choisie
        // pour rétablir, reperdue une couche plus bas, pour tout message portant
        // au moins une traduction.
        translations: transformTranslationsToArray(
          messageId,
          (message as unknown as { translations?: Record<string, MessageTranslationJSON> | null }).translations
        ),
        // Les mêmes valeurs écrasent aussi les champs de premier niveau issus
        // du `select` : les trois clients y décodent leurs coches de livraison.
        // Les laisser au contenu de la ligne aurait servi zéro ici pendant que
        // la liste de messages sert le compte réel — deux vérités pour un même
        // message, selon l'endpoint interrogé.
        deliveredCount: summary?.receivedCount ?? 0,
        readCount: summary?.readCount ?? 0,
        recipientCount: summary?.totalMembers ?? 0,
        // Les DATES du seuil « tous servis » sortaient encore de la ligne, donc
        // valaient `null` en permanence — alors que les trois clients lisent
        // `readByAllAt != null` comme la PREUVE que tous ont lu.
        deliveredToAllAt: summary?.deliveredToAllAt ?? null,
        readByAllAt: summary?.readByAllAt ?? null,

        statusSummary: {
          deliveredCount: summary?.receivedCount ?? 0,
          readCount: summary?.readCount ?? 0,
          recipientCount: summary?.totalMembers ?? 0
        }
      } as unknown as Record<string, unknown>));

    } catch (error) {
      logger.error('Error fetching message', error as Error);
      return sendInternalError(reply, 'Erreur lors de la récupération du message');
    }
  });

  // Route pour récupérer les traductions d'un message
  fastify.get<{
    Params: MessageParams;
  }>('/messages/:messageId/translations', {
    preValidation: [requiredAuth],
    preHandler: [validateParams(MessageParamsSchema)]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que le message existe et que l'utilisateur a accès
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          deletedAt: null
        },
        select: {
          id: true,
          content: true,
          originalLanguage: true,
          translations: true,
          conversationId: true
        }
      });

      if (!message) {
        return sendNotFound(reply, 'Message non trouvé');
      }

      // Vérifier que l'utilisateur est membre de la conversation
      const membership = await prisma.participant.findFirst({
        where: {
          conversationId: message.conversationId,
          userId: userId,
          isActive: true
        }
      });

      if (!membership) {
        return sendForbidden(reply, 'Accès non autorisé à cette conversation');
      }

      return sendSuccess(reply, {
        messageId: message.id,
        originalContent: message.content,
        originalLanguage: message.originalLanguage,
        translations: transformTranslationsToArray(
          message.id,
          message.translations as Record<string, any>
        )
      });

    } catch (error) {
      logger.error('Error fetching message translations', error as Error);
      return sendInternalError(reply, 'Erreur lors de la récupération des traductions du message');
    }
  });

  // ===========================================================================
  // ROUTES DÉTAILS DE STATUT AVEC PAGINATION CURSOR (évite N+1)
  // ===========================================================================

  // Route pour récupérer les détails de statut d'un message avec pagination offset/limit
  // Utiliser UNIQUEMENT quand l'utilisateur demande explicitement les détails
  fastify.get<{
    Params: MessageParams;
    Querystring: {
      offset?: string;
      limit?: string;
      filter?: 'all' | 'delivered' | 'read' | 'unread';
    };
  }>('/messages/:messageId/status-details', {
    preValidation: [requiredAuth],
    preHandler: [validateParams(MessageParamsSchema), validateQuery(MessageStatusDetailsQuerySchema)]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const { offset = '0', limit = '20', filter = 'all' } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que le message existe et que l'utilisateur a accès
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          deletedAt: null
        },
        include: {
          conversation: {
            include: {
              participants: {
                // `isActive: true` : quitter une conversation en ferme aussi
                // les accusés de lecture. La ligne `Participant` laissée
                // derrière par un départ répondait encore ici.
                where: { userId: userId, isActive: true },
                select: { userId: true }
              }
            }
          }
        }
      });

      if (!message || !message.conversation.participants.length) {
        return sendNotFound(reply, 'Message non trouvé ou accès non autorisé');
      }

      // Utiliser le service pour récupérer les détails paginés
      const { MessageReadStatusService } = await import('../services/MessageReadStatusService.js');
      const readStatusService = new MessageReadStatusService(prisma);

      // SSOT guard: `?offset`/`?limit` are plain strings (validated by
      // `MessageStatusDetailsQuerySchema`, no numeric coercion), so a malformed
      // value would otherwise reach the service as `NaN` skip/take → HTTP 500.
      const { offset: pageOffset, limit: pageLimit } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });

      // #4179 -- le plancher d'historique s'applique ICI, pas seulement dans le
      // service. Un accuse de lecture est NOMINATIF (qui a lu, et quand) : c'est
      // de l'historique au meme titre que le texte du message, et un membre
      // arrive apres coup ne doit pas apprendre qui lisait avant lui. Le service
      // sait deja refuser -- il accepte `historyFloor` depuis ce lot -- mais tant
      // que cette route ne le lui PASSE pas, la garde est ecrite, testee, et
      // n'atteint personne en production. Les deux autres lectures nominatives
      // du meme service le posent deja ; celle-ci etait la derniere sans.
      const historyFloor = await loadReaderHistoryFloor(prisma, {
        conversationId: message.conversationId,
        reader: historyReaderFromAuthContext(authRequest.authContext),
      });

      const statusDetails = await readStatusService.getMessageStatusDetails(messageId, {
        offset: pageOffset,
        limit: pageLimit,
        filter,
        historyFloor
      });

      return sendPaginatedSuccess(reply, statusDetails.statuses, statusDetails.pagination);

    } catch (error) {
      logger.error('Error fetching message status details', error as Error);
      return sendInternalError(reply, 'Erreur lors de la récupération des détails de statut');
    }
  });

  // Route pour récupérer les détails de statut d'un attachment avec pagination offset/limit
  // Utiliser UNIQUEMENT quand l'utilisateur ouvre les détails d'un attachment
  fastify.get<{
    Params: { attachmentId: string };
    Querystring: {
      offset?: string;
      limit?: string;
      filter?: 'all' | 'viewed' | 'downloaded' | 'listened' | 'watched';
    };
  }>('/attachments/:attachmentId/status-details', {
    preValidation: [requiredAuth],
    preHandler: [validateParams(AttachmentParamsSchema)]
  }, async (request, reply) => {
    try {
      const { attachmentId } = request.params;
      const { offset = '0', limit = '20', filter = 'all' } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que l'attachment existe et que l'utilisateur a accès
      const attachment = await prisma.messageAttachment.findFirst({
        where: { id: attachmentId },
        include: {
          message: {
            include: {
              conversation: {
                include: {
                  participants: {
                    // `isActive: true` — même règle que la garde du message :
                    // un ancien membre ne lit plus, et n'écrit plus, les reçus
                    // d'une conversation qu'il a quittée.
                    where: { userId: userId, isActive: true },
                    select: { userId: true }
                  }
                }
              }
            }
          }
        }
      });

      if (!attachment || !attachment.message.conversation.participants.length) {
        return sendNotFound(reply, 'Attachment non trouvé ou accès non autorisé');
      }

      // Utiliser le service pour récupérer les détails paginés
      const { MessageReadStatusService } = await import('../services/MessageReadStatusService.js');
      const readStatusService = new MessageReadStatusService(prisma);

      // SSOT guard: same string-schema pagination as the message variant above.
      const { offset: pageOffset, limit: pageLimit } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });
      const statusDetails = await readStatusService.getAttachmentStatusDetails(attachmentId, {
        offset: pageOffset,
        limit: pageLimit,
        filter
      });

      return sendPaginatedSuccess(reply, statusDetails.statuses, statusDetails.pagination);

    } catch (error) {
      logger.error('Error fetching attachment status details', error as Error);
      return sendInternalError(reply, 'Erreur lors de la récupération des détails de statut de l\'attachment');
    }
  });
}
