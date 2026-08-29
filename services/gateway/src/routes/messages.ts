import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth.js';
import { AttachmentService } from '../services/attachments/index.js';
import { attachmentMediaSelect, attachmentFullSelect, attachmentForwardPreviewSelect } from '../services/attachments/attachmentIncludes';
import { hoistLocationOnto } from '../services/location/sharedPlace';
import { HISTORY_FLOOR_PARTICIPANT_SELECT, loadHistoryFloor, type HistoryFloorJoin } from '../services/historyFloor';
import { MessageTranslationService } from '../services/message-translation/MessageTranslationService';
import { transformTranslationsToArray, type MessageTranslationJSON } from '../utils/translation-transformer';
import { validatePagination } from '../utils/pagination';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { emitToConversationParticipants } from '../socketio/emitToConversationParticipants';
import { broadcastMessageMutation } from '../socketio/broadcastMessageMutation';
import { buildMessageEditedCore } from '../socketio/messageEditedPayload';
import type { Message } from '@meeshy/shared/types/index';
import { getPresenceVisibilityService } from '../services/PresenceVisibilityService';
import {
  applyPresenceVisibilityAsOffline,
  type PresenceVisibility,
} from '@meeshy/shared/utils/presence-visibility';
import { presenceFor, viewerFromRequest } from './users/presence-gate';
import { emitMentionCreated } from '../socketio/emitMentionCreated';
import { reconcileEditedMentions } from '../services/messaging/messageMentions';
import {
  reconcileEditedLinks,
  mergeTrackingLinksIntoMetadata,
} from '../services/messaging/messageLinks';
import {
  admitMessageEdit,
  isEditRefused,
  CONVERSATION_CLOSED_EDIT_MESSAGE,
} from '../services/messaging/messageEditAdmission';
import { admitMessageDelete } from '../services/messaging/messageDeleteAdmission';
import { applyMessageRemovalEffects } from '../services/messaging/messageRemovalEffects';
import { applyMessageEditEffects } from '../services/messaging/messageEditEffects';
import {
  admitEditedContent,
  isEditedContentRefused,
  EMPTY_EDIT_REFUSAL_MESSAGE,
} from '../services/messaging/messageEditContent';
import { TrackingLinkService } from '../services/TrackingLinkService';
import { validateParams, validateBody, validateQuery } from '../validation/helpers.js';
import {
  MessageParamsSchema,
  AttachmentParamsSchema,
  UpdateMessageBodySchema,
  MessageStatusDetailsQuerySchema,
  AttachmentStatusBodySchema,
} from '../validation/messages-schemas.js';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { errorResponseSchema, messageSchema } from '@meeshy/shared/types/api-schemas';
import {
  sendSuccess,
  sendPaginatedSuccess,
  sendBadRequest,
  sendNotFound,
  sendForbidden,
  sendInternalError,
  sendError,
} from '../utils/response.js';

const logger = enhancedLogger.child({ module: 'MessagesRoutes' });

interface MessageParams {
  messageId: string;
}

interface UpdateMessageBody {
  content?: string;
  isEdited?: boolean;
}

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

export default async function messageRoutes(fastify: FastifyInstance) {
  // Récupérer prisma décoré par le serveur
  const prisma = fastify.prisma;

  // Instancier les services
  const attachmentService = new AttachmentService(prisma);
  const translationService = fastify.translationService;
  const socketIOHandler = fastify.socketIOHandler;
  const trackingLinkService = new TrackingLinkService(prisma);

  // Middleware d'authentification requis pour les messages
  const requiredAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

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

  // Route pour éditer un message
  fastify.put<{
    Params: MessageParams;
    Body: UpdateMessageBody;
  }>('/messages/:messageId', {
    preValidation: [requiredAuth],
    preHandler: [validateParams(MessageParamsSchema), validateBody(UpdateMessageBodySchema)]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const { content } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // La lecture n'ENCODE plus la règle d'admission. Elle filtrait
      // `sender: { userId }` — donc la ligne d'un message qu'on n'a pas écrit
      // n'atteignait jamais la décision, et aucun modérateur ne pouvait être
      // admis ici alors que l'UI web le lui propose. Une politique qui se cache
      // dans un `where` est une politique qu'on ne peut plus unifier.
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          deletedAt: null
        },
        include: {
          sender: { select: { userId: true } },
          // L'état TERMINAL du conteneur, exigé par `admitMessageEdit`. Deux
          // colonnes sur une lecture déjà là : aucun aller-retour de plus.
          conversation: { select: { isActive: true, closedAt: true } },
          attachments: { select: attachmentMediaSelect }
        }
      });

      if (!message) {
        return sendNotFound(reply, 'Message not found or you are not authorized to modify it');
      }

      // L'unique énoncé de « qui peut éditer, et jusqu'à quand »
      // (`messageEditAdmission`). Ce transport — celui du client iOS —
      // n'imposait AUCUNE fenêtre de 24h, là où le socket et la route
      // conversation-scopée la refusent : un iPhone éditait un message vieux de
      // trois ans que le web refusait d'éditer.
      //
      // Les refus non temporels gardent le **404** que cette route rendait déjà,
      // plutôt que le 403 de la route conversation-scopée : passer à 403 ferait
      // de cette route un oracle d'existence pour qui sonde des ObjectIds. Une
      // seule politique, deux vocabulaires de transport.
      const admission = await admitMessageEdit({
        prisma,
        editorUserId: userId,
        message: {
          authorUserId: message.sender?.userId,
          conversationId: message.conversationId,
          conversation: message.conversation,
          createdAt: message.createdAt,
        },
        onError: (err) => logger.error('Edit - admission lookup failed', err as Error),
      });

      if (isEditRefused(admission)) {
        // Le 404 indistinct de cette route protège d'un oracle d'existence — il
        // ne s'applique donc PAS ici. `admitMessageEdit` ne tranche la clôture
        // que sur une décision qui allait être ADMISE : qui reçoit ce 410 avait
        // déjà prouvé son droit d'éditer, et n'apprend rien qu'il ne pouvait
        // apprendre autrement. Lui rendre un 404 le ferait réessayer sans fin.
        if (admission.reason === 'conversation-closed') {
          return sendError(reply, 410, CONVERSATION_CLOSED_EDIT_MESSAGE);
        }
        return admission.reason === 'edit-window-expired'
          ? sendForbidden(reply, 'You can no longer edit this message (24-hour limit exceeded)')
          : sendNotFound(reply, 'Message not found or you are not authorized to modify it');
      }

      // Ce qu'une édition a le droit d'ÉCRIRE (`admitEditedContent`) : un
      // message ne peut pas devenir vide, sauf si une pièce jointe le porte.
      //
      // `content` est OPTIONNEL dans `UpdateMessageBodySchema` — retirer la
      // légende d'un message à pièce jointe consiste précisément à l'omettre.
      // Le `content.trim()` qui vivait plus bas jetait alors un TypeError, que
      // le catch traduisait en 500 : le seul cas que la garde autorise
      // explicitement était le seul que l'écriture ne savait pas traiter. C'est
      // pourquoi l'unité rend le texte À ÉCRIRE en même temps que son verdict —
      // il n'y a plus de `trim` d'appelant pour diverger d'elle.
      const contentAdmission = admitEditedContent({
        content,
        hasAttachments: (message.attachments?.length ?? 0) > 0,
      });

      if (isEditedContentRefused(contentAdmission)) {
        return sendBadRequest(reply, EMPTY_EDIT_REFUSAL_MESSAGE);
      }

      const trimmedContent = contentAdmission.content;

      // Les liens `[[url]]` / `<url>` deviennent des `m+<token>` traçables AVANT
      // l'écriture, exactement comme à l'envoi et comme sur les deux autres
      // transports d'édition. Le contenu traité est ensuite le SEUL en
      // circulation : base, mentions, retraduction, payload diffusé.
      const reconciledLinks = await reconcileEditedLinks({
        linkService: trackingLinkService,
        message: { id: messageId, conversationId: message.conversationId },
        content: trimmedContent,
        editorUserId: userId,
        onError: (err) => logger.error('Error processing tracking links in edit', err as Error),
      });
      const editedContent = reconciledLinks.processedContent;

      // Le mapping des URLs BRUTES n'était recomposé par aucun transport
      // d'édition : il n'existait qu'à la création. Écrit seulement s'il a été
      // ÉTABLI — sur panne, la base garde celui qu'elle avait.
      const nextMetadata = reconciledLinks.reconciled
        ? { metadata: mergeTrackingLinksIntoMetadata(message.metadata, reconciledLinks.trackingLinks) }
        : {};

      // Mettre à jour le message — garde de concurrence optimiste : n'écrire
      // que si le message est toujours non supprimé. Un `DELETE` concurrent
      // entre la lecture ci-dessus et cette écriture ferait sinon ressusciter
      // la ligne avec le contenu édité (un `update` par id réussit quel que
      // soit `deletedAt`), et l'API répondrait succès pour un message que le
      // client a déjà retiré. Miroir du garde `updateMany` du handler socket
      // `handleMessageEdit`.
      //
      // `translations: null` appartient à CETTE écriture, pas à une seconde plus
      // bas : un nouveau contenu périme ses traductions à l'instant où il est
      // écrit. Séparées, les deux écritures ouvraient une fenêtre — traversée
      // par la réconciliation des mentions, le fan-out `mention:created` et la
      // relecture qui compose la réponse — pendant laquelle la ligne portait le
      // texte d'APRÈS et les traductions d'AVANT. La relecture tombait dedans :
      // la réponse HTTP et la charge `message:edited` diffusée à toute la
      // conversation emportaient la traduction du texte périmé, et le Prisme
      // Linguistique fait que la plupart des lecteurs ne voient QUE celle-là.
      // Les trois autres transports d'édition invalident déjà dans l'écriture
      // du contenu ; celui-ci était le dernier à ne pas le faire.
      const editedAt = new Date();
      const editResult = await prisma.message.updateMany({
        where: { id: messageId, deletedAt: null },
        data: {
          content: editedContent,
          isEdited: true,
          editedAt,
          translations: null,
          ...nextMetadata
        }
      });

      if (editResult.count === 0) {
        return sendNotFound(reply, 'Message not found or you are not authorized to modify it');
      }

      // Les effets DURABLES de l'édition — l'écart de mots et de caractères sur
      // les compteurs de la conversation. Ce transport — celui qu'emploie iOS —
      // ne les ajustait pas. La liste vit dans `applyMessageEditEffects`, une
      // fois pour les quatre transports.
      await applyMessageEditEffects(prisma, {
        id: messageId,
        conversationId: message.conversationId,
        senderId: message.senderId,
        senderUserId: message.sender?.userId ?? null,
        previousContent: message.content,
        content: editedContent,
      });

      // Ce que cette édition doit aux gens qu'elle NOMME. Ce transport — celui
      // que le client iOS emploie réellement (`MessageService.editMessage` →
      // `PUT /messages/:id`) — n'écrivait AUCUNE mention : ni ligne `Mention`,
      // ni `validatedMentions`, ni notification. Éditer « salut @alice » en
      // « salut @bob » laissait Alice mentionnée et ne nommait jamais Bob.
      // Les deux unités partagées existaient déjà ; les commentaires qui les
      // accompagnent désignaient même cette route par son chemin — mais elles
      // avaient été câblées sur `PUT /conversations/:id/messages/:messageId`,
      // qu'aucun client n'appelle pour éditer.
      //
      // L'appel précède la relecture : `reconcileEditedMentions` écrit
      // `validatedMentions` en base, et `findUniqueOrThrow` rend alors l'état
      // réconcilié sans qu'aucun recopiage conditionnel soit nécessaire. Quand
      // la réconciliation n'a RIEN pu établir, la ligne porte toujours la
      // valeur précédente — qui est la bonne, et qu'un `[]` recopié aurait
      // effacée.
      const editedMentions = await reconcileEditedMentions({
        prisma,
        mentionService: fastify.mentionService,
        notificationService: fastify.notificationService,
        message: { id: messageId, conversationId: message.conversationId, senderId: message.senderId },
        content: editedContent,
        editorUserId: userId,
        onError: (err) => logger.error('Edit - Error processing mentions', err as Error),
      });

      // `mention:created` aux seuls ENTRANTS, dans leur salon PERSONNEL : la
      // diffusion qui suit ne fan qu'à `conversation:<id>`, où quelqu'un que
      // cette édition vient de nommer n'est pas forcément assis.
      emitMentionCreated({
        io: socketIOHandler?.getManager()?.getIO(),
        newlyMentionedUserIds: editedMentions.newlyMentionedUserIds,
        messageId,
        conversationId: message.conversationId,
        editorUserId: userId,
        content: editedContent,
        timestamp: editedAt,
        onError: (err) => logger.error('Edit - mention:created fanout failed', err as Error),
      });

      const updatedMessage = await prisma.message.findUniqueOrThrow({
        where: { id: messageId },
        include: {
          sender: {
            select: {
              id: true,
              userId: true,
              displayName: true,
              avatar: true,
              user: { select: { username: true } }
            }
          }
        }
      });

      // Déclencher la retraduction automatique du message modifié.
      // L'invalidation de `translations` n'est plus faite ici : elle appartient
      // à l'écriture du contenu, plus haut, et la faire deux fois rouvrirait la
      // fenêtre que cette écriture vient de fermer.
      try {
        const messageForRetranslation = {
          id: messageId,
          content: editedContent,
          originalLanguage: message.originalLanguage,
          conversationId: message.conversationId,
          senderId: message.senderId
        };

        // `retranslateMessageAsync` est l'entrée PUBLIQUE prévue pour ce geste —
        // celle qu'emploie le handler socket. Les deux routes REST appelaient
        // `_processRetranslationAsync` derrière un `as any`, c'est-à-dire le même
        // geste sous un second vocabulaire, au prix d'une assertion de type qui
        // perçait l'encapsulation du service.
        if (translationService) {
          await translationService.retranslateMessageAsync(messageId, messageForRetranslation);
        } else {
          logger.warn('MessageTranslationService non disponible, retraduction non effectuée');
        }

      } catch (translationError) {
        logger.error('Erreur lors de la retraduction', translationError as Error);
        // Ne pas faire échouer l'édition si la retraduction échoue
      }

      // Transformer `translations` (Object stocké en MongoDB) en Array conforme
      // au contrat API consommé par iOS (`[APITextTranslation]`) et web. Sans
      // cette transformation, le client reçoit `translations: { "fr": {...} }`
      // au lieu d'un tableau et échoue au décodage ("Type mismatch for type
      // Array<Any> at path data.translations"). L'ÉCRITURE DU CONTENU a déjà
      // invalidé `translations` en base, donc cette relecture rapporte `null` et
      // le payload reflète cet état : `[]`. Cette phrase créditait auparavant
      // l'invalidation qui vivait dans le bloc de retraduction — placée APRÈS
      // la relecture, elle arrivait trop tard pour la charge déjà composée.
      const transformedMessage = {
        ...updatedMessage,
        translations: transformTranslationsToArray(
          messageId,
          (updatedMessage as unknown as { translations?: Record<string, MessageTranslationJSON> | null }).translations
        )
      };

      // Diffuser la mise à jour via Socket.IO (room + aperçu de liste + file
      // de livraison hors ligne — voir broadcastMessageMutation)
      await broadcastMessageMutation({
        prisma,
        manager: socketIOHandler?.getManager(),
        conversationId: message.conversationId,
        actorUserId: userId,
        eventType: 'edited',
        messageId,
        // Le NOYAU du contrat vient de `buildMessageEditedCore`, source unique
        // partagée avec les deux producteurs socket. Étalé APRÈS la ligne
        // relue, il n'ajoute rien qui ne soit déjà servi — il corrige la seule
        // valeur que l'étalement brut servait fausse : `senderId`, qui portait
        // le `Participant.id` de la colonne là où les clients comparent un
        // `User.id` pour reconnaître leurs propres bulles.
        payload: {
          ...transformedMessage,
          ...buildMessageEditedCore(updatedMessage as unknown as Message, {
            conversationId: message.conversationId,
            content: editedContent,
            isEdited: updatedMessage.isEdited,
            editedAt,
          }),
        },
        onError: (err) => logger.error('Erreur lors de la diffusion Socket.IO', err as Error),
      });

      return sendSuccess(reply, {
        ...transformedMessage,
        message: 'Message modifié avec succès'
      });

    } catch (error) {
      logger.error('Error updating message', error as Error);
      return sendInternalError(reply, 'Erreur lors de la modification du message');
    }
  });

  // Route pour supprimer un message (soft delete)
  fastify.delete<{
    Params: MessageParams;
  }>('/messages/:messageId', {
    preValidation: [requiredAuth],
    preHandler: [validateParams(MessageParamsSchema)]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que le message existe
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          deletedAt: null
        },
        include: {
          sender: {
            select: {
              id: true,
              userId: true,
              displayName: true,
              user: { select: { username: true } }
            }
          },
          // Ni l'appartenance ni la conversation ne sont jointes ici :
          // `admitMessageDelete` lit la première lui-même (avec le filtre
          // `isActive: true` que cette jointure n'avait jamais, et seulement
          // quand l'acteur n'est PAS l'auteur), et `applyMessageRemovalEffects`
          // relit `lastMessageAt` au plus près de son écriture conditionnelle.
          // Le chemin nominal coûte donc deux lectures de moins qu'avant.
          // `mimeType` est capturé ICI, avec l'admission : les attachements
          // sont supprimés quelques lignes plus bas, et le décompte des
          // compteurs de conversation ne pourrait plus les relire.
          attachments: {
            select: {
              id: true,
              mimeType: true
            }
          }
        }
      });

      if (!message) {
        return sendNotFound(reply, 'Message non trouvé');
      }

      // Qui peut supprimer : `admitMessageDelete`, l'unique énoncé de la règle.
      // Cette copie-ci — la route qu'ANDROID emploie — avait dérivé sur deux
      // points que rien ne mesurait :
      //   - elle joignait les participants SANS `isActive: true`, donc une ligne
      //     laissée derrière par un départ conservait indéfiniment le droit de
      //     supprimer ;
      //   - elle testait `registeredUser?.role === 'CREATOR'`, absent de l'enum
      //     `UserRole` : une branche qui ne pouvait jamais être vraie et qui
      //     donnait à lire une permission inexistante.
      // Le rôle global se lit désormais en BASE et non dans le jeton : un rôle
      // révoqué depuis l'émission du jeton ne supprime plus.
      const { admitted: canDelete } = await admitMessageDelete({
        prisma,
        deleterUserId: userId,
        message: {
          authorUserId: message.sender?.userId,
          conversationId: message.conversationId,
        },
        onError: (err) => logger.error('delete admission read failed', err as Error),
      });

      if (!canDelete) {
        return sendForbidden(reply, 'Vous n\'êtes pas autorisé à supprimer ce message');
      }

      // Supprimer les attachments et leurs fichiers physiques
      if (message.attachments && message.attachments.length > 0) {
        for (const attachment of message.attachments) {
          try {
            await attachmentService.deleteAttachment(attachment.id);
          } catch (error) {
            logger.error('Erreur suppression attachment', error as Error);
            // Continuer même en cas d'erreur pour supprimer les autres
          }
        }
      }

      // UNE écriture — jumelle exacte de celle de `messages-advanced.ts`, et
      // même argument que la route d'ÉDITION de CE fichier deux cents lignes
      // plus haut : « `translations: null` appartient à CETTE écriture, pas à
      // une seconde plus bas ». Cette phrase-là finissait sur « celui-ci était
      // le dernier à ne pas le faire » — vrai de la famille d'ÉDITION, qui a
      // été balayée en entier. La famille de SUPPRESSION ne l'avait pas été.
      //
      // Séparées, elles ouvraient une fenêtre où la ligne est VIVANTE et
      // dépouillée de ses traductions. Le prix qui compte n'est pas la fenêtre
      // mais son échec : si la SECONDE écriture échoue, le message reste vivant
      // sans aucune traduction, DÉFINITIVEMENT — `MessageTranslationService`
      // écrit lui-même qu'« aucun chemin ne retente une traduction absente ».
      // L'écriture destructrice committait donc en premier, et celle qui la
      // rend inoffensive en second : l'échec tombait du mauvais côté.
      //
      // Elle ferme aussi la course avec l'édition, dont la garde optimiste
      // (`where: { id, deletedAt: null }`, décrite plus haut) lisait `deletedAt`
      // encore nul pendant la fenêtre : l'édition était acceptée et diffusée
      // pour une ligne que l'écriture suivante effaçait.
      //
      // Forme reprise du handler socket, seul des quatre écrivains à la porter
      // avec les deux champs dans le même `update`.
      await prisma.message.update({
        where: { id: messageId },
        data: { translations: null, deletedAt: new Date() }
      });

      // Les effets DURABLES du retrait — recalcul de `lastMessageAt` et
      // désactivation des `/l/<token>` que ce message emporte. La liste vit
      // dans `applyMessageRemovalEffects`, une fois pour les quatre écrivains.
      await applyMessageRemovalEffects(prisma, {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        senderUserId: message.sender?.userId ?? null,
        messageType: message.messageType,
        attachmentMimeTypes: (message.attachments ?? []).map((att) => att.mimeType ?? ''),
        content: message.content,
        metadata: message.metadata,
      });

      // Diffuser la suppression via Socket.IO (room + aperçu de liste + file
      // de livraison hors ligne — voir broadcastMessageMutation)
      await broadcastMessageMutation({
        prisma,
        manager: socketIOHandler?.getManager(),
        conversationId: message.conversationId,
        actorUserId: userId,
        eventType: 'deleted',
        // L'AUTEUR, pas l'acteur : la pastille de l'acteur bouge aussi quand un
        // modérateur retire le message de quelqu'un d'autre.
        authorId: message.senderId,
        messageId,
        payload: { messageId, conversationId: message.conversationId },
        onError: (err) => logger.error('Erreur lors de la diffusion Socket.IO', err as Error),
      });

      return sendSuccess(reply, { message: 'Message supprimé avec succès' });

    } catch (error) {
      logger.error('Error deleting message', error as Error);
      return sendInternalError(reply, 'Erreur lors de la suppression du message');
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
      const statusDetails = await readStatusService.getMessageStatusDetails(messageId, {
        offset: pageOffset,
        limit: pageLimit,
        filter
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

  // Route pour marquer un attachment comme écouté/vu/téléchargé
  fastify.post<{
    Params: { attachmentId: string };
    Body: {
      action: 'listened' | 'watched' | 'viewed' | 'downloaded';
      playPositionMs?: number;
      durationMs?: number;
      complete?: boolean;
      wasZoomed?: boolean;
      stretches?: Array<{ startMs: number; endMs: number; endedBy: string }>;
      language?: string;
    };
  }>('/attachments/:attachmentId/status', {
    preValidation: [requiredAuth],
    preHandler: [validateParams(AttachmentParamsSchema), validateBody(AttachmentStatusBodySchema)]
  }, async (request, reply) => {
    try {
      const { attachmentId } = request.params;
      const { action, playPositionMs, durationMs, complete, wasZoomed, stretches, language } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      if (!action || !['listened', 'watched', 'viewed', 'downloaded'].includes(action)) {
        return sendBadRequest(reply, 'Action invalide. Valeurs acceptées: listened, watched, viewed, downloaded');
      }

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
                    select: { id: true, userId: true }
                  }
                }
              }
            }
          }
        }
      });

      const participant = attachment?.message.conversation.participants[0];
      if (!attachment || !participant) {
        return sendNotFound(reply, 'Attachment non trouvé ou accès non autorisé');
      }

      // Utiliser le service pour mettre à jour le statut.
      // `AttachmentStatusEntry.participantId` attend un PARTICIPANT.id —
      // passer `authContext.userId` (User.id pour un inscrit) écrivait des
      // lignes orphelines que toute lecture filtrait (`if (!participant)
      // return null`) : l'onglet « Écouté » restait vide pour tout le monde
      // et la reprise cross-device ne retrouvait rien. Même règle que la
      // route mark-read ci-dessus (« participantId, pas userId »).
      const { MessageReadStatusService } = await import('../services/MessageReadStatusService.js');
      const readStatusService = new MessageReadStatusService(prisma);

      switch (action) {
        case 'listened':
          await readStatusService.markAudioAsListened(participant.id, attachmentId, {
            playPositionMs,
            listenDurationMs: durationMs,
            complete,
            stretches,
            language
          });
          break;
        case 'watched':
          await readStatusService.markVideoAsWatched(participant.id, attachmentId, {
            watchPositionMs: playPositionMs,
            watchDurationMs: durationMs,
            complete,
            stretches,
            language
          });
          break;
        case 'viewed':
          await readStatusService.markImageAsViewed(participant.id, attachmentId, {
            viewDurationMs: durationMs,
            wasZoomed,
            language
          });
          break;
        case 'downloaded':
          await readStatusService.markAttachmentAsDownloaded(participant.id, attachmentId);
          break;
      }

      // Diffuser le statut via Socket.IO
      try {
        const socketIOManager = socketIOHandler.getManager();
        if (socketIOManager) {
          const room = ROOMS.conversation(attachment.message.conversationId);
          const percentage = playPositionMs !== undefined && durationMs !== undefined && durationMs > 0
            ? Math.min(100, Math.round((playPositionMs / durationMs) * 100))
            : undefined;
          socketIOManager.getIO().to(room).emit(SERVER_EVENTS.ATTACHMENT_STATUS_UPDATED, {
            attachmentId,
            messageId: attachment.messageId,
            conversationId: attachment.message.conversationId,
            userId,
            action,
            updatedAt: new Date(),
            ...(playPositionMs !== undefined && { playPositionMs }),
            ...(durationMs !== undefined && { durationMs }),
            ...(percentage !== undefined && { percentage })
          });
        }
      } catch (socketError) {
        logger.error('Erreur lors de la diffusion Socket.IO', socketError as Error);
      }

      return sendSuccess(reply, { message: `Attachment marqué comme ${action}` });

    } catch (error) {
      logger.error('Error updating attachment status', error as Error);
      return sendInternalError(reply, 'Erreur lors de la mise à jour du statut de l\'attachment');
    }
  });
}
