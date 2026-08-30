import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { transformTranslationsToArray, type MessageTranslationJSON } from '../../utils/translation-transformer';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { TrackingLinkService } from '../../services/TrackingLinkService';
import { AttachmentService } from '../../services/attachments';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { ErrorCode } from '@meeshy/shared/types';
import type { Message } from '@meeshy/shared/types/index';
import { createError, sendErrorResponse } from '@meeshy/shared/utils/errors';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { messageValidationHook } from '../../middleware/rate-limiter';
import {
  messageSchema,
  messageResponseSchema,
  conversationStatsSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
import {
  applyHistoryFloor,
  historyReaderFromAuthContext,
  loadReaderHistoryFloor,
} from '../../services/historyFloor';
import { reconcileEditedMentions } from '../../services/messaging/messageMentions';
import {
  reconcileEditedLinks,
  mergeTrackingLinksIntoMetadata,
} from '../../services/messaging/messageLinks';
import {
  admitMessageEdit,
  isEditRefused,
  CONVERSATION_CLOSED_EDIT_MESSAGE,
} from '../../services/messaging/messageEditAdmission';
import { admitMessageDelete } from '../../services/messaging/messageDeleteAdmission';
import { applyMessageRemovalEffects } from '../../services/messaging/messageRemovalEffects';
import { applyMessageEditEffects } from '../../services/messaging/messageEditEffects';
import {
  admitEditedContent,
  isEditedContentRefused,
  EMPTY_EDIT_REFUSAL_MESSAGE,
} from '../../services/messaging/messageEditContent';
import { emitMentionCreated } from '../../socketio/emitMentionCreated';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { validatePagination } from '../../utils/pagination';
import { broadcastMessageMutation } from '../../socketio/broadcastMessageMutation';
import { buildMessageEditedCore } from '../../socketio/messageEditedPayload';
import type {
  ConversationParams,
  EditMessageBody
} from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError, sendError, sendConflict } from '../../utils/response';
import { ConflictError } from '../../errors/custom-errors';
import { z } from 'zod';
import { CommonSchemas } from '@meeshy/shared/utils/validation';

// Editing allows empty content (unlike sending): the message may carry
// attachments whose caption is being cleared. The attachment-aware emptiness
// check below is the single source of truth, in parity with the socket edit
// path (SocketMessageEditSchema + MessageHandler.handleMessageEdit).
const EditMessageBodySchema = z.object({
  content: z.string().max(10000, 'Message trop long'),
  originalLanguage: CommonSchemas.language.optional(),
});
// Logger dédié pour messages-advanced
const logger = enhancedLogger.child({ module: 'messages-advanced' });

/**
 * `meta.conversationStats`, que `messageResponseSchema` ne porte pas.
 *
 * Le cycle 88 bis a réparé les deux transports d'ÉDITION en les pointant sur
 * `messageResponseSchema` (`{ success, data: messageSchema }`) — la bonne
 * forme, et la charge utile arrive enfin. Mais le transport `PUT` sert un champ
 * de plus que le PATCH : `meta: { conversationStats }`, calculé juste avant la
 * réponse. `messageSchema` ne le déclarant pas, il restait supprimé.
 *
 * Et le transport DELETE, lui, n'avait pas été repris du tout : son schéma est
 * BIEN FORMÉ (`message: { type: 'string' }`) et décrit simplement une autre
 * charge utile que `{messageId, deleted, meta}`. Le balayage des objets nus ne
 * pouvait pas le voir — c'est ce qui a motivé le second balayage
 * (`__tests__/response-payload-mismatch.ts`).
 *
 * Gardé par
 * `__tests__/unit/routes/conversations/message-mutation-serialization.test.ts`.
 */
const conversationStatsMetaSchema = {
  type: 'object',
  properties: { conversationStats: conversationStatsSchema },
} as const;

/**
 * L'expéditeur tel que les DEUX routes d'édition le CHARGENT — un `Participant`,
 * pas un `User`.
 *
 * Trois défauts se sont empilés sur ce champ, et l'ordre compte. Le cycle 88 bis
 * a corrigé l'enveloppe fantôme (`data.message` sur une charge qui n'a jamais
 * porté cette clé) ; le cycle 91 bis a composé l'enveloppe proprement et ajouté
 * `meta` au seul transport qui le calcule. Tant que `data` sortait `{}`, rien de
 * ceci n'était observable — **réparer une enveloppe rend lisibles les défauts de
 * ce qu'elle contenait.**
 *
 * Reste celui-ci. `messageSchema.sender` est `userMinimalSchema`, qui couvre bien
 * le cas participant — il déclare `userId` et `type` pour lui — mais qui est
 * délibérément MINIMAL, quand ces deux routes chargent trois champs de plus.
 * Mesuré au compilateur sur la charge utile réelle :
 *
 * ```
 * in  : { id, userId, displayName, avatar, type, role, language, user: {…} }
 * out : { id, userId, displayName, avatar, type }     ← role, language, user PERDUS
 * ```
 *
 * Élargir `userMinimalSchema` pousserait ces trois champs sur les dizaines de
 * réponses qui l'emploient, dont beaucoup décrivent un vrai `User`. **Le grain
 * juste est celui qui CHARGE** : ce sont ces deux routes qui chargent plus, ce
 * sont elles qui déclarent plus.
 *
 * **`isOnline` est délibérément ABSENT, et c'est la décision du lot.**
 * `userMinimalSchema` le déclare, et la réparation de l'enveloppe a rendu cette
 * déclaration VIVANTE : vérifié au compilateur, un `isOnline` posé sur l'objet
 * serait désormais SERVI. Rien ne fuit aujourd'hui — aucun des deux `select` ne
 * le charge — mais le prochain qui l'ajoute le mettrait sur le fil sans gate et
 * sans qu'un témoin tombe. L'omettre est fail-closed : si le champ apparaît, le
 * sérialiseur le retire. Cela vaut mieux qu'un gate sur une donnée que personne
 * ne charge, lequel est du code mort qui se périme.
 */
const editedMessageSenderSchema = {
  type: 'object',
  nullable: true,
  properties: {
    id: { type: 'string', description: 'Participant ID' },
    userId: { type: 'string', nullable: true, description: 'Real User ID (null for anonymous participants)' },
    displayName: { type: 'string', nullable: true },
    avatar: { type: 'string', nullable: true },
    type: { type: 'string', enum: ['user', 'anonymous', 'bot'] },
    role: { type: 'string', nullable: true },
    language: { type: 'string', nullable: true },
    user: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        username: { type: 'string' },
        displayName: { type: 'string', nullable: true },
        firstName: { type: 'string', nullable: true },
        lastName: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true },
        role: { type: 'string', nullable: true }
      }
    }
  }
} as const;

/**
 * Le message édité, servi À PLAT — la forme commune aux deux transports.
 *
 * Composé depuis `messageSchema` et **non** en descendant dans
 * `messageResponseSchema.properties.data` : plusieurs suites mockent
 * `@meeshy/shared/types/api-schemas` avec un sous-ensemble des exports, et une
 * chaîne d'accès y lève à l'IMPORT, quand un `...spread` d'`undefined` est légal
 * et inerte. La contrainte vient du cycle 91 bis et elle est juste — une
 * première version de ce lot descendait dans `.properties.data.properties` et a
 * fait cesser de CHARGER une suite de 154 témoins.
 */
const editedMessageDataSchema = {
  ...messageSchema,
  description: 'The message as it stands after the edit — served flat, not wrapped',
  properties: {
    ...messageSchema.properties,
    sender: editedMessageSenderSchema,
  },
} as const;

/**
 * L'enveloppe du transport `PUT` : le message à plat, plus les stats que lui
 * seul calcule.
 */
export const editedMessageResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      ...editedMessageDataSchema,
      properties: {
        ...editedMessageDataSchema.properties,
        meta: conversationStatsMetaSchema,
      },
    },
  },
} as const;

/**
 * L'enveloppe du transport `PATCH` : la même, SANS `meta` — ce transport ne
 * calcule pas de statistiques.
 */
export const patchedMessageResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: editedMessageDataSchema,
  },
} as const;

/**
 * Plafond de `GET /conversations/:id/status` : les N messages les plus récents.
 *
 * Cet endpoint charge, PAR message, ses entrées de statut et le participant
 * joint sur chacune — il ne peut pas rester non borné. Le détail exhaustif
 * d'un message précis vit derrière `GET /messages/:messageId/status-details`,
 * qui est paginé ; ce plafond n'y retire donc aucune information.
 */
const CONVERSATION_STATUS_PAGE_SIZE = 50;


/**
 * Enregistre les routes avancées de gestion des messages (edit, delete, reactions, status)
 */
export function registerMessagesAdvancedRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  translationService: MessageTranslationService,
  optionalAuth: any,
  requiredAuth: any
) {
  const socketIOHandler = fastify.socketIOHandler;
  const trackingLinkService = new TrackingLinkService(prisma);
  const attachmentService = new AttachmentService(prisma);

  fastify.put<{
    Params: ConversationParams & { messageId: string };
    Body: EditMessageBody;
  }>('/conversations/:id/messages/:messageId', {
    schema: {
      description: 'Edit an existing message in a conversation (only by message sender)',
      tags: ['conversations', 'messages'],
      summary: 'Edit message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to edit' }
        }
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', description: 'Updated message content', minLength: 1 },
          // PAS de `default: 'fr'`, et c'est le correctif, pas une omission.
          //
          // Fastify active `useDefaults` d'AJV : un `default` dans un schéma de
          // REQUÊTE n'est pas une documentation, c'est une ÉCRITURE dans
          // `request.body` avant que le gestionnaire ne s'exécute (mesuré sous
          // les options AJV de `server.ts`). Le champ n'arrivait donc JAMAIS
          // `undefined`, et la garde qui suit — écrite pour distinguer « je
          // n'affirme rien sur la langue » de « c'est du français » — ne
          // pouvait pas se déclencher. Cette route est la SEULE des quatre
          // entrées d'édition à réécrire `originalLanguage` : sur elle, une
          // omission réétiquetait le message en français, en base ET comme
          // langue SOURCE de la retraduction — un texte anglais ressortant
          // alors traduit comme du français dans toutes les langues du Prisme.
          //
          // **Piège armé, pas panne** — et la distinction est mesurée : les
          // trois clients envoient aujourd'hui la clé (le web la passe en
          // paramètre REQUIS de `handleEditMessage` ; iOS édite par
          // `PUT /messages/:messageId` et Android par `PATCH /messages/:id`,
          // deux routes qui ne portent pas ce champ). Personne ne déclenche
          // donc le défaut — jusqu'au premier appelant qui omettra la clé, en
          // lisant une garde qui a l'air de le couvrir.
          originalLanguage: { type: 'string', description: 'Language code' }
        }
      },
      response: {
        // La charge est le message édité LUI-MÊME (`sendSuccess(reply,
        // messageResponse)`), pas un objet qui le contiendrait. Un
        // enveloppement `data.message` a vécu ici, copié d'un
        // `messageResponseSchema` mort : la clé déclarée étant absente de la
        // charge, `fast-json-stringify` — `additionalProperties: false` par
        // défaut — ne servait pas un message dégradé, il servait `data: {}`.
        200: editedMessageResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth],
    preHandler: [messageValidationHook]
  }, async (request, reply) => {
    try {
      const bodyResult = EditMessageBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return sendBadRequest(reply, 'Validation error', { message: bodyResult.error.message });
      }

      const { id, messageId } = request.params;
      const { content, originalLanguage: claimedLanguage } = bodyResult.data;
      // Canonicalise the client-claimed locale at the write boundary. This REST
      // edit path re-persists `originalLanguage` from the request body (unlike
      // the socket edit path, which reuses the already-canonical stored value),
      // so a raw platform locale (`fr-FR`, `en_US`) would otherwise fragment the
      // stored value + the retranslation source. Irreducible codes kept verbatim.
      //
      // Le champ est OPTIONNEL, et il l'était déjà avec un défaut `'fr'` : une
      // omission RÉÉTIQUETAIT donc le message en français — en base ET comme
      // langue source de la retraduction. Cette route est la seule des quatre
      // entrées d'édition à écrire cette colonne, parce qu'elle est la seule
      // servie par une vue qui porte un sélecteur de langue ; l'omettre veut
      // dire « je n'affirme rien sur la langue », pas « c'est du français ».
      const claimedCanonicalLanguage = claimedLanguage === undefined
        ? undefined
        : normalizeLanguageCode(claimedLanguage) ?? claimedLanguage;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Vérifier que le message existe
      const existingMessage = await prisma.message.findFirst({
        where: {
          id: messageId,
          conversationId: conversationId,
          deletedAt: null
        },
        include: {
          sender: {
            select: { id: true, userId: true }
          },
          // L'état TERMINAL du conteneur, exigé par `admitMessageEdit`. Deux
          // colonnes sur une lecture déjà là : aucun aller-retour de plus.
          conversation: { select: { isActive: true, closedAt: true } },
          attachments: { select: { id: true } }
        }
      });

      if (!existingMessage) {
        return sendNotFound(reply, 'Message not found');
      }

      // L'unique énoncé de « qui peut éditer, et jusqu'à quand »
      // (`messageEditAdmission`). C'est cette route qui portait la règle la plus
      // complète — fenêtre de 24h pour l'auteur, privilège de rôle GLOBAL,
      // modérateur membre actif admis sur le message d'autrui — et c'est donc
      // elle que l'unité partagée reprend. Les trois autres entrées n'en
      // tenaient qu'une partie chacune, et pas la même.
      const admission = await admitMessageEdit({
        prisma,
        editorUserId: userId,
        message: {
          authorUserId: existingMessage.sender?.userId,
          conversationId,
          conversation: existingMessage.conversation,
          createdAt: existingMessage.createdAt,
        },
        onError: (err) => logger.error('Edit - admission lookup failed', err),
      });

      if (isEditRefused(admission)) {
        // 410 pour le fil terminé — le même statut et la même phrase que les
        // portes d'entrée du cycle 70. Un 403 dirait « pas vous », quand le
        // sujet est « plus personne, plus jamais ».
        if (admission.reason === 'conversation-closed') {
          return sendError(reply, 410, CONVERSATION_CLOSED_EDIT_MESSAGE);
        }
        return admission.reason === 'edit-window-expired'
          ? sendForbidden(reply, 'You can no longer edit this message (24-hour limit exceeded)')
          : sendForbidden(reply, 'Vous n\'êtes pas autorisé à modifier ce message');
      }

      // Ce qu'une édition a le droit d'ÉCRIRE (`admitEditedContent`) : le
      // contenu vide n'est admis que si une pièce jointe porte le message
      // (retrait de légende). La règle vivait ici dépliée, en trois exemplaires
      // sur les quatre transports — dont un qui ne l'avait pas du tout.
      const editedContent = admitEditedContent({
        content,
        hasAttachments: (existingMessage.attachments?.length ?? 0) > 0,
      });

      if (isEditedContentRefused(editedContent)) {
        return sendBadRequest(reply, EMPTY_EDIT_REFUSAL_MESSAGE);
      }

      // Ce que ce message doit à ses LIENS, après édition. La réécriture
      // `[[url]]` / `<url>` → `m+<token>` vivait ici, dépliée — donc absente du
      // chemin socket, qui est pourtant le transport d'édition PRIMAIRE et
      // écrivait le texte brut. Et la seconde moitié, le mapping des URLs
      // BRUTES (`metadata.trackingLinks`), n'était recomposée par AUCUN
      // transport : elle n'existait qu'à la création. Les deux sont désormais
      // soudées dans une unité que tous les écrivains appellent.
      const editedLinks = await reconcileEditedLinks({
        linkService: trackingLinkService,
        message: { id: messageId, conversationId },
        content: editedContent.content,
        editorUserId: userId,
        onError: (err) => logger.error('Error processing tracking links in edit', err),
      });
      const processedContent = editedLinks.processedContent;

      // `metadata` est un blob PARTAGÉ (`postReplyTo`, `location`) : fusion, pas
      // affectation. Et il n'est réécrit que si la réconciliation a établi
      // quelque chose — y compris l'ensemble vide, qui dit « ce texte ne porte
      // plus d'URL ». Sur panne, la base garde le mapping qu'elle avait.
      const nextMetadata = editedLinks.reconciled
        ? { metadata: mergeTrackingLinksIntoMetadata(existingMessage.metadata, editedLinks.trackingLinks) }
        : {};

      // Mettre à jour le message avec le contenu traité.
      // Garde de concurrence optimiste, jumelle de celle que portent déjà les
      // trois autres transports d'édition (socket `message:edit`,
      // `PUT /messages/:messageId`, `PATCH /messages/:messageId`) : une
      // suppression concurrente entre la lecture ci-dessus et cette écriture
      // ferait sinon RESSUSCITER la ligne avec un contenu neuf — un `update`
      // par id réussit quel que soit `deletedAt` — et `message:edited`
      // partirait vers des clients qui l'ont déjà retirée. Prisma lève P2025
      // quand rien ne matche : traduit en 404 plus bas, pas en 500.
      // `translations: null` appartient à CETTE écriture : un nouveau contenu
      // périme ses traductions à l'instant où il est écrit. L'invalidation
      // vivait plus bas, dans le bloc de retraduction — donc APRÈS la capture
      // de `updatedMessage`, qui compose la réponse HTTP ET la charge
      // `message:edited`. Les deux emportaient la traduction du texte d'AVANT,
      // et le Prisme Linguistique fait que la plupart des lecteurs ne voient
      // QUE celle-là : ils relisaient l'ancien message, présenté comme la
      // traduction du nouveau.
      const updatedMessage = await prisma.message.update({
        where: { id: messageId, deletedAt: null },
        data: {
          content: processedContent,
          ...(claimedCanonicalLanguage === undefined ? {} : { originalLanguage: claimedCanonicalLanguage }),
          isEdited: true,
          editedAt: new Date(),
          translations: null,
          ...nextMetadata
        },
        include: {
          sender: {
            select: {
              id: true,
              userId: true,
              displayName: true,
              avatar: true,
              type: true,
              role: true,
              language: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  role: true
                }
              }
            }
          },
          replyTo: {
            include: {
              sender: {
                select: {
                  id: true,
                  userId: true,
                  displayName: true,
                  avatar: true,
                  type: true,
                  language: true,
                  user: {
                    select: {
                      id: true,
                      username: true,
                      displayName: true,
                      avatar: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      // Ce que ce message doit à ceux qu'il NOMME, après édition : le lot de
      // mentions doit être RECOMPOSÉ, pas complété. Le corps vivait ici, en
      // double du chemin de création — et il extrayait moins bien : handles
      // bruts seulement, là où la création résout aussi `@Display Name`.
      // Éditer un message contenant `@John Doe` détruisait donc la mention que
      // la création avait validée. Deux extracteurs pour un même champ ne
      // peuvent pas rester d'accord ; il n'y en a plus qu'un.
      //
      // La notification, elle, ne concerne QUE les ENTRANTS : les destinataires
      // du premier envoi ont déjà été prévenus, et renotifier l'ensemble
      // complet ferait de dix corrections de frappe dix pushes pour quelqu'un
      // déjà nommé. Elle vivait ici, dépliée — donc absente du chemin socket,
      // qui ne réconciliait rien du tout ; elle est désormais soudée à la
      // réconciliation, dont elle consomme le seul produit non consommé.
      const editedMentions = await reconcileEditedMentions({
        prisma,
        mentionService: fastify.mentionService,
        notificationService: fastify.notificationService,
        message: {
          id: messageId,
          conversationId,
          senderId: existingMessage.senderId,
          expiresAt: existingMessage.expiresAt,
        },
        content: processedContent,
        editorUserId: userId,
        onError: (err) => logger.error('Edit - Error processing mentions', err)
      });
      // Recopier `validatedUsernames` SANS ce garde-fou rejouerait dans la
      // réponse et dans la diffusion socket l'effacement que l'unité vient
      // d'empêcher en base : quand elle n'a rien pu établir, `updatedMessage`
      // porte déjà la valeur persistée, qui est la bonne.
      if (editedMentions.reconciled) {
        updatedMessage.validatedMentions = [...editedMentions.validatedUsernames];
      }

      // `mention:created` aux ENTRANTS, dans leur salon PERSONNEL. La diffusion
      // qui suit ne fan qu'à `conversation:<id>` : quelqu'un que cette édition
      // vient de nommer n'y est pas forcément. Cette route est la forme
      // CONVERSATION-scopée de l'édition ; le client iOS, lui, emploie
      // `PUT /messages/:messageId` (`routes/messages.ts`) — que les cycles
      // précédents ont désigné ici par erreur, et qui a reçu le même câblage.
      emitMentionCreated({
        io: socketIOHandler?.getManager()?.getIO(),
        newlyMentionedUserIds: editedMentions.newlyMentionedUserIds,
        messageId,
        conversationId,
        editorUserId: userId,
        content: processedContent,
        timestamp: updatedMessage.editedAt ?? new Date(),
        onError: (err) => logger.error('Edit - mention:created fanout failed', err),
      });

      // Déclencher la retraduction automatique du message modifié
      try {
        // Utiliser les instances déjà disponibles dans le contexte Fastify
        const translationService = fastify.translationService;

        // L'invalidation de `translations` en base n'est plus faite ici : elle
        // appartient à l'écriture du contenu, plus haut, et la refaire après la
        // capture de `updatedMessage` rouvrirait la fenêtre que cette écriture
        // vient de fermer. La purge du cache mémoire LRU, elle, vit dans
        // `_processRetranslationAsync`, en tête, pour les QUATRE transports.

        // Créer un objet message pour la retraduction (avec contenu traité incluant tracking links).
        // La langue source est celle qui vient d'être ÉCRITE — donc la valeur
        // stockée quand le corps n'en revendiquait aucune. Repartir d'un `'fr'`
        // par défaut ferait traduire un texte anglais comme du français.
        const messageForRetranslation = {
          id: messageId,
          content: processedContent,
          originalLanguage: claimedCanonicalLanguage ?? existingMessage.originalLanguage,
          conversationId: conversationId,
          senderId: existingMessage.senderId
        };

        // Entrée PUBLIQUE du service, comme sur le handler socket. Le `as any`
        // qui vivait ici visait `_processRetranslationAsync`, la méthode privée
        // que `retranslateMessageAsync` se contente d'exposer : deux vocabulaires
        // pour un même geste, dont un qui perçait l'encapsulation.
        await translationService.retranslateMessageAsync(messageId, messageForRetranslation);
        logger.info(`Edit - Retranslation queued for message ${messageId}`);

      } catch (translationError) {
        logger.error('Erreur lors de la retraduction', translationError);
        // Ne pas faire échouer l'édition si la retraduction échoue
      }

      // Invalider et recalculer les stats pour refléter l'édition
      const stats = await conversationStatsService.getOrCompute(
        prisma,
        id,
        () => []
      );

      // Cet ajustement ne vivait qu'ICI, sur un transport parmi quatre. La
      // liste vit désormais dans `applyMessageEditEffects`.
      await applyMessageEditEffects(prisma, {
        id: messageId,
        conversationId,
        senderId: existingMessage.senderId,
        senderUserId: existingMessage.sender?.userId ?? null,
        previousContent: existingMessage.content,
        content: processedContent,
      });

      // Construire la réponse avec mentions validées (PAS de traductions - elles arriveront via socket).
      // `translations` est stocké en MongoDB sous forme d'objet (clé = langue) mais le contrat API attend
      // un tableau (`[APITextTranslation]` côté iOS) : sans cette transformation, iOS échoue au décodage
      // avec "Type mismatch for type Array<Any> at path data.translations". L'écriture du contenu a déjà
      // invalidé `translations`, donc `updatedMessage` — son produit — porte bien `null`, et le payload
      // reflète cet état : `[]`. Cette phrase désignait auparavant la retraduction qui SUIT, qui invalidait
      // trop tard pour la charge déjà composée.
      const messageResponse = {
        ...updatedMessage,
        conversationId,
        translations: transformTranslationsToArray(
          messageId,
          (updatedMessage as unknown as { translations?: Record<string, MessageTranslationJSON> | null }).translations
        ),
        validatedMentions: updatedMessage.validatedMentions || [],
        meta: { conversationStats: stats }
      };

      logger.info(`Edit - Response includes ${(updatedMessage.validatedMentions || []).length} validated mentions`);

      // Diffuser la mise à jour via Socket.IO (room + aperçu de liste + file
      // de livraison hors ligne — voir broadcastMessageMutation)
      await broadcastMessageMutation({
        prisma,
        manager: socketIOHandler?.getManager(),
        conversationId,
        actorUserId: userId,
        eventType: 'edited',
        messageId,
        // Le NOYAU du contrat vient de `buildMessageEditedCore` (voir le
        // sibling `PUT /messages/:messageId`) : le `as unknown as
        // Record<string, unknown>` qui vivait ici n'était pas une commodité de
        // typage, c'était la marque du transport que le contrat ne gouvernait
        // pas — et qui servait le `Participant.id` en guise de `senderId`.
        payload: {
          ...messageResponse,
          ...buildMessageEditedCore(updatedMessage as unknown as Message, {
            conversationId,
            content: processedContent,
            isEdited: updatedMessage.isEdited,
            editedAt: updatedMessage.editedAt ?? new Date(),
          }),
        },
        onError: (err) => logger.error('[CONVERSATIONS] Erreur lors de la diffusion Socket.IO', err),
      });

      return sendSuccess(reply, messageResponse);

    } catch (error) {
      // P2025 = la garde `deletedAt: null` de l'écriture a mordu : le message a
      // été supprimé entre la lecture et l'écriture. Ce n'est pas une panne, et
      // le rendre en 500 ferait retenter un client qui n'a rien à retenter.
      // Même traduction que sur le sibling `PATCH /messages/:messageId`.
      if ((error as { code?: string })?.code === 'P2025') {
        return sendNotFound(reply, 'Message not found');
      }
      logger.error('Error updating message', error);
      sendInternalError(reply, 'Erreur lors de la modification du message');
    }
  });


  fastify.delete<{
    Params: ConversationParams & { messageId: string };
  }>('/conversations/:id/messages/:messageId', {
    schema: {
      description: 'Delete a message from a conversation (soft delete - marks as deleted)',
      tags: ['conversations', 'messages'],
      summary: 'Delete message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to delete' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              // Le `message` déclaré ici — une STRING — n'a jamais été servi :
              // le handler acquitte `{messageId, deleted, meta}`. Aucune clé ne
              // matchait, donc `data` sortait VIDE, et le client n'apprenait
              // même pas que la suppression avait eu lieu.
              properties: {
                messageId: { type: 'string', description: 'ID of the deleted message' },
                deleted: { type: 'boolean', description: 'Always true on success', example: true },
                meta: conversationStatsMetaSchema
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
      const { id, messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Vérifier que le message existe
      const existingMessage = await prisma.message.findFirst({
        where: {
          id: messageId,
          conversationId: conversationId,
          deletedAt: null
        },
        include: {
          sender: {
            select: { id: true, userId: true }
          },
          attachments: {
            select: { id: true, mimeType: true }
          }
        }
      });

      if (!existingMessage) {
        return sendNotFound(reply, 'Message not found');
      }

      // Qui peut supprimer : `admitMessageDelete`, l'unique énoncé de la règle.
      // Cette copie-ci lisait `membership.user.role` — le rôle GLOBAL — alors
      // que le commentaire qu'elle portait annonçait « les modérateurs/admins de
      // CETTE conversation ». Un admin de conversation qui n'est qu'un `USER`
      // global supprimait donc depuis Android et depuis le composer web, et
      // recevait 403 ici : c'est-à-dire depuis iOS et depuis la vue web, les
      // deux clients qui passent par cette route.
      const { admitted: canDelete } = await admitMessageDelete({
        prisma,
        deleterUserId: userId,
        message: {
          authorUserId: existingMessage.sender?.userId,
          conversationId,
        },
        onError: (err) => logger.error('[CONVERSATIONS] delete admission read failed', err),
      });

      if (!canDelete) {
        return sendForbidden(reply, 'Vous n\'êtes pas autorisé à supprimer ce message');
      }

      // Supprimer les attachments et leurs fichiers physiques
      if (existingMessage.attachments && existingMessage.attachments.length > 0) {
        for (const attachment of existingMessage.attachments) {
          try {
            await attachmentService.deleteAttachment(attachment.id);
          } catch (error) {
            logger.error(`❌ [CONVERSATIONS] Erreur lors de la suppression de l'attachment ${attachment.id}:`, error);
            // Continuer même en cas d'erreur pour supprimer les autres
          }
        }
      }

      // UNE écriture, et c'est le même argument que la ROUTE D'ÉDITION de ce
      // fichier porte trois cents lignes plus haut — « `translations: null`
      // appartient à CETTE écriture ». La famille d'édition a été balayée en
      // entier ; celle de suppression est restée coupée en deux.
      //
      // Séparées, elles ouvraient une fenêtre où la ligne est VIVANTE et
      // dépouillée de ses traductions. Deux prix, et le second est le vrai :
      //
      //   • pendant la fenêtre, tout lecteur d'une autre langue retombe sur
      //     l'original — le Prisme rompu le temps d'un aller-retour ;
      //   • si la SECONDE écriture échoue, cet état est DÉFINITIF. Le message
      //     reste vivant, sans aucune traduction, et rien ne les recalcule :
      //     `MessageTranslationService` le dit de lui-même — « la traduction
      //     correcte était perdue DÉFINITIVEMENT : aucun chemin ne retente une
      //     traduction absente ».
      //
      // L'ordre choisi faisait donc échouer du MAUVAIS côté : l'écriture
      // destructrice committait la première, celle qui la rend inoffensive
      // ensuite. Le dépôt raisonne partout dans l'autre sens (« Échouer ICI
      // laisse le lien ACTIF : c'est le sens sûr »). Fusionner supprime la
      // question plutôt que de choisir un ordre.
      //
      // Elle ferme aussi une course avec l'édition : la garde optimiste de
      // l'édition (`where: { id, deletedAt: null }`) voyait `deletedAt` encore
      // nul dans la fenêtre, acceptait donc l'édition, répondait succès et
      // diffusait `message:edited` — pour une ligne que la seconde écriture
      // effaçait juste après.
      //
      // Forme reprise du handler socket, qui la porte déjà et l'annonce :
      // « Soft delete: atomically clear translations and set deletedAt in one
      // write ».
      await prisma.message.update({
        where: { id: messageId },
        data: { translations: null, deletedAt: new Date() }
      });

      // Les effets DURABLES du retrait — recalcul de `lastMessageAt` et
      // désactivation des `/l/<token>` que ce message emporte. Cette route ne
      // recalculait PAS `lastMessageAt`, alors que les deux autres chemins de
      // suppression le faisaient mot pour mot : supprimer le dernier message
      // depuis iOS ou depuis la vue web — les deux clients qui passent par ici
      // — laissait la liste des conversations triée sur un message devenu
      // invisible. La liste vit désormais dans `applyMessageRemovalEffects`.
      // Le décompte des compteurs a rejoint cette même unité. Il ne vivait
      // qu'ICI, alors que le COMPTAGE ne vivait que dans le handler socket :
      // un message envoyé par REST puis supprimé depuis iOS décrémentait un
      // compteur qu'il n'avait jamais incrémenté.
      await applyMessageRemovalEffects(prisma, {
        id: messageId,
        conversationId,
        senderId: existingMessage.senderId,
        senderUserId: existingMessage.sender?.userId ?? null,
        messageType: existingMessage.messageType,
        attachmentMimeTypes: (existingMessage.attachments ?? []).map((att) => att.mimeType ?? ''),
        content: existingMessage.content,
        metadata: existingMessage.metadata,
      });

      // Invalider et recalculer les stats
      const stats = await conversationStatsService.getOrCompute(
        prisma,
        conversationId,
        () => []
      );

      // Diffuser la suppression via Socket.IO (room + aperçu de liste + file
      // de livraison hors ligne — voir broadcastMessageMutation)
      await broadcastMessageMutation({
        prisma,
        manager: socketIOHandler?.getManager(),
        conversationId,
        actorUserId: userId,
        eventType: 'deleted',
        // L'AUTEUR, pas l'acteur : la pastille de l'acteur bouge aussi quand un
        // modérateur retire le message de quelqu'un d'autre.
        authorId: existingMessage.senderId,
        messageId,
        payload: { messageId, conversationId },
        onError: (err) => logger.error('[CONVERSATIONS] Erreur lors de la diffusion Socket.IO', err),
      });

      return sendSuccess(reply, { messageId, deleted: true, meta: { conversationStats: stats } });

    } catch (error) {
      logger.error('Error deleting message', error);
      sendInternalError(reply, 'Erreur lors de la suppression du message');
    }
  });

  // NOTE: ancienne route /conversations/create-link supprimée (remplacée par /links)


  fastify.patch<{
    Params: { messageId: string };
    Body: { content: string };
  }>('/messages/:messageId', {
    schema: {
      description: 'Edit a message by message ID (alternative to PUT /conversations/:id/messages/:messageId)',
      tags: ['messages'],
      summary: 'Edit message by ID',
      params: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', description: 'Message ID to edit' }
        }
      },
      // `minLength: 1` a vécu ici, et se trompait dans les deux sens : trois
      // espaces le satisfont (le message partait VIDÉ, voir `admitEditedContent`)
      // tandis que la chaîne vide LÉGITIME — celle qui retire la légende d'un
      // message à pièce jointe — était refusée au transport ANDROID seul.
      // La vacuité se décide APRÈS `trim` et en connaissant les pièces jointes ;
      // le schéma ne garde donc que le plafond, en parité avec
      // `EditMessageBodySchema`.
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', description: 'Updated message content', maxLength: 10000 }
        }
      },
      response: {
        // Même enveloppe, même défaut, même correctif que le sibling `PUT` —
        // et c'est CE transport qu'Android emprunte (`@PATCH("messages/{id}")`,
        // `ApiResponse<ApiMessage>`). `data: {}` y levait `MissingFieldException`
        // sur `id`/`conversationId`, que la file d'outbox lisait comme une
        // panne réseau : l'édition, pourtant appliquée, était rejouée sans fin.
        //
        // Ce transport ne calcule PAS de statistiques (le sibling PUT si), d'où
        // l'enveloppe sans `meta` ici et sa variante `+ meta` là-bas.
        200: patchedMessageResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth],
    preHandler: [messageValidationHook]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const { content } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // `deletedAt: null` manquait ici : ce transport lisait — puis réécrivait —
      // un message SUPPRIMÉ. Un `update` par id réussit quel que soit
      // `deletedAt`, donc la ligne ressuscitait avec un contenu neuf, un
      // `message:edited` partait vers des clients qui l'avaient déjà retirée, et
      // l'API répondait succès. Les trois autres entrées gardaient déjà leur
      // lecture ; celle-ci était la dernière sans garde.
      const message = await prisma.message.findFirst({
        where: { id: messageId, deletedAt: null },
        include: {
          sender: {
            select: { userId: true }
          },
          conversation: {
            include: {
              participants: {
                where: {
                  userId: userId,
                  isActive: true
                }
              }
            }
          },
          // Sans elles, la garde de vacuité ne peut pas trancher : c'est la
          // pièce jointe qui autorise un texte vide (retrait de légende).
          attachments: { select: { id: true } }
        }
      });

      if (!message) {
        return sendNotFound(reply, 'Message introuvable');
      }

      // L'unique énoncé de « qui peut éditer, et jusqu'à quand »
      // (`messageEditAdmission`). Cette entrée n'imposait AUCUNE fenêtre de 24h
      // et n'admettait aucun modérateur, là où la route conversation-scopée fait
      // les deux — pour le même geste, sur le même message.
      //
      // L'appartenance à la conversation n'est plus vérifiée pour l'AUTEUR : les
      // trois autres entrées tiennent l'authorship pour suffisant, et rendre la
      // règle commune plus stricte que les trois transports vivants serait une
      // restriction neuve déguisée en unification. « Un auteur qui a quitté la
      // conversation peut-il encore éditer ? » est une question produit à
      // trancher pour les quatre à la fois, pas en passant sur celle-ci.
      const admission = await admitMessageEdit({
        prisma,
        editorUserId: userId,
        message: {
          authorUserId: message.sender?.userId,
          conversationId: message.conversationId,
          // Cette entrée chargeait DÉJÀ la conversation entière par son
          // `include` : l'état terminal était en main, sans personne pour le lire.
          conversation: message.conversation,
          createdAt: message.createdAt,
        },
        onError: (err) => logger.error('Patch edit - admission lookup failed', err),
      });

      if (isEditRefused(admission)) {
        if (admission.reason === 'conversation-closed') {
          return sendError(reply, 410, CONVERSATION_CLOSED_EDIT_MESSAGE);
        }
        if (admission.reason === 'edit-window-expired') {
          return sendForbidden(reply, 'You can no longer edit this message (24-hour limit exceeded)');
        }
        return admission.reason === 'not-a-member'
          ? sendForbidden(reply, 'Unauthorized access to this conversation')
          : sendForbidden(reply, 'Vous ne pouvez modifier que vos propres messages');
      }

      // Ce qu'une édition a le droit d'ÉCRIRE (`admitEditedContent`), désormais
      // énoncé une seule fois pour les quatre transports. Cette entrée était la
      // seule SANS garde : trois espaces suffisaient à vider un message, et un
      // `message:edited` vide partait vers toute la conversation par-dessus le
      // texte déjà écrasé.
      const editedContent = admitEditedContent({
        content,
        hasAttachments: (message.attachments?.length ?? 0) > 0,
      });

      if (isEditedContentRefused(editedContent)) {
        return sendBadRequest(reply, EMPTY_EDIT_REFUSAL_MESSAGE);
      }

      // Les liens `[[url]]` / `<url>` deviennent des `m+<token>` traçables AVANT
      // l'écriture, comme sur les deux autres transports d'édition. Ce PATCH est
      // celui du client ANDROID (`OutboxFlushWorker`, lane `EDIT_MESSAGE`) : il
      // écrivait les crochets en dur, pour toujours, là où le même texte ENVOYÉ
      // produit un lien.
      const patchedLinks = await reconcileEditedLinks({
        linkService: trackingLinkService,
        message: { id: messageId, conversationId: message.conversationId },
        content: editedContent.content,
        editorUserId: userId,
        onError: (err) => logger.error('Error processing tracking links in patch edit', err),
      });
      const processedContent = patchedLinks.processedContent;
      const patchedMetadata = patchedLinks.reconciled
        ? { metadata: mergeTrackingLinksIntoMetadata(message.metadata, patchedLinks.trackingLinks) }
        : {};

      // Mettre à jour le contenu du message (invalide aussi les traductions existantes :
      // la retraduction ci-dessous les recalcule, parité avec PUT /conversations/:id/messages/:messageId)
      // Garde de concurrence optimiste, jumelle de celle du sibling
      // `PUT /messages/:messageId` : une suppression concurrente entre la
      // lecture et cette écriture ferait sinon ressusciter la ligne. Prisma
      // accepte un filtre non-unique aux côtés de l'id et lève P2025 quand rien
      // ne matche — traduit en 404 plus bas, pas en 500.
      const editedAt = new Date();
      const updatedMessage = await prisma.message.update({
        where: { id: messageId, deletedAt: null },
        data: {
          content: processedContent,
          isEdited: true,
          editedAt,
          translations: null,
          ...patchedMetadata
        },
        include: {
          sender: {
            select: {
              id: true,
              userId: true,
              displayName: true,
              avatar: true,
              role: true,
              user: { select: { username: true } }
            }
          }
        }
      });

      // Les effets DURABLES de l'édition — l'écart de mots et de caractères sur
      // les compteurs. Même unité que les trois autres transports.
      await applyMessageEditEffects(prisma, {
        id: messageId,
        conversationId: message.conversationId,
        senderId: message.senderId,
        senderUserId: message.sender?.userId ?? null,
        previousContent: message.content,
        content: processedContent,
      });

      // Ce que cette édition doit aux gens qu'elle NOMME. Même unité que le
      // sibling PUT et que le chemin socket : le lot est RECOMPOSÉ, et seuls
      // les ENTRANTS sont notifiés. Ce transport ne touchait aucune mention —
      // éditer « salut @alice » en « salut @bob » depuis le web laissait Alice
      // mentionnée et ne nommait jamais Bob.
      const editedMentions = await reconcileEditedMentions({
        prisma,
        mentionService: fastify.mentionService,
        notificationService: fastify.notificationService,
        message: {
          id: messageId,
          conversationId: message.conversationId,
          senderId: message.senderId,
          expiresAt: message.expiresAt,
        },
        content: processedContent,
        editorUserId: userId,
        onError: (err) => logger.error('Patch edit - Error processing mentions', err)
      });
      // Même garde que le sibling PUT : quand la réconciliation n'a RIEN pu
      // établir, la valeur persistée que porte `updatedMessage` est la bonne,
      // et un `[]` recopié effacerait un surlignage vivant.
      if (editedMentions.reconciled) {
        (updatedMessage as { validatedMentions?: string[] }).validatedMentions = [...editedMentions.validatedUsernames];
      }

      // `mention:created` aux seuls ENTRANTS, dans leur salon PERSONNEL : la
      // diffusion qui suit ne fan qu'à `conversation:<id>`.
      emitMentionCreated({
        io: socketIOHandler?.getManager()?.getIO(),
        newlyMentionedUserIds: editedMentions.newlyMentionedUserIds,
        messageId,
        conversationId: message.conversationId,
        editorUserId: userId,
        content: processedContent,
        timestamp: editedAt,
        onError: (err) => logger.error('Patch edit - mention:created fanout failed', err),
      });

      // Déclencher la retraduction automatique du message modifié (parité avec le sibling PUT)
      try {
        const translationService = fastify.translationService;

        const messageForRetranslation = {
          id: messageId,
          content: processedContent,
          originalLanguage: message.originalLanguage,
          conversationId: message.conversationId,
          senderId: message.senderId
        };

        // Entrée PUBLIQUE du service (voir le sibling PUT) : `retranslateMessageAsync`
        // expose `_processRetranslationAsync`, que ce `as any` atteignait de force.
        await translationService.retranslateMessageAsync(messageId, messageForRetranslation);
      } catch (translationError) {
        logger.error('Erreur lors de la retraduction', translationError);
        // Ne pas faire échouer l'édition si la retraduction échoue
      }

      const messageResponse = {
        ...updatedMessage,
        conversationId: message.conversationId,
        translations: transformTranslationsToArray(
          messageId,
          (updatedMessage as unknown as { translations?: Record<string, MessageTranslationJSON> | null }).translations
        )
      };

      // Diffuser la mise à jour via Socket.IO (parité avec le sibling PUT :
      // room + aperçu de liste + file de livraison hors ligne)
      await broadcastMessageMutation({
        prisma,
        manager: socketIOHandler?.getManager(),
        conversationId: message.conversationId,
        actorUserId: userId,
        eventType: 'edited',
        messageId,
        // Même noyau, même raison que sur les deux siblings d'édition : ce
        // transport est celui du client ANDROID, et il servait lui aussi le
        // `Participant.id` en guise de `senderId`.
        payload: {
          ...messageResponse,
          ...buildMessageEditedCore(updatedMessage as unknown as Message, {
            conversationId: message.conversationId,
            content: processedContent,
            isEdited: updatedMessage.isEdited,
            editedAt,
          }),
        },
        onError: (err) => logger.error('[CONVERSATIONS] Erreur lors de la diffusion Socket.IO', err),
      });

      return sendSuccess(reply, messageResponse);

    } catch (error) {
      // P2025 = la garde `deletedAt: null` de l'écriture a mordu : le message a
      // été supprimé entre la lecture et l'écriture. Ce n'est pas une panne, et
      // le rendre en 500 ferait retenter un client qui n'a rien à retenter.
      if ((error as { code?: string })?.code === 'P2025') {
        return sendNotFound(reply, 'Message introuvable');
      }
      logger.error('Error updating message', error);
      sendInternalError(reply, 'Erreur lors de la modification du message');
    }
  });


  fastify.get<{
    Params: ConversationParams;
    Querystring: { offset?: string; limit?: string };
  }>('/conversations/:id/reactions', {
    schema: {
      description: 'Get reactions from messages in a conversation, one page of the most recent reaction rows at a time (grouped by message ID, with emoji counts and user information).',
      tags: ['conversations', 'reactions'],
      summary: 'Get conversation reactions (paginated)',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Number of reaction rows to skip (default: 0)' },
          limit: { type: 'string', description: 'Maximum number of reaction rows to scan for this page (default: 100, max: 100)' }
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
                reactions: {
                  type: 'array',
                  description: 'This page of reactions, grouped by message'
                },
                total: { type: 'number', description: 'Total reaction rows across the conversation (not just this page)' },
                // #4165 critère 2 : de quoi demander la suite, maintenant que
                // cette route rend une PAGE plutôt que la conversation entière.
                hasMore: { type: 'boolean', description: 'Whether more reaction rows exist beyond this page' }
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
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Une réaction NOMME un message et l'identité de qui l'a posée : sur un
      // message d'AVANT l'arrivée du lecteur, elle révèle l'existence de ce
      // message, son id et qui était là. Le plancher borne donc le PRÉDICAT qui
      // sélectionne les messages réagis, au même titre que leur contenu.
      const reactionsFloor = await loadReaderHistoryFloor(prisma, {
        conversationId,
        reader: historyReaderFromAuthContext(authRequest.authContext)
      });

      const reactionsWhere = {
        message: applyHistoryFloor({ conversationId: conversationId, deletedAt: null }, reactionsFloor)
      };

      // BORNÉ (#4165) — c'était le PIRE cas nommé par l'audit : `findMany` sur
      // TOUTE la conversation, sans `take` ni pagination, une jointure
      // participant par ligne. Un fil actif de plusieurs dizaines de milliers
      // de réactions payait cette charge à CHAQUE ouverture de l'écran de
      // détail. `take`/`skip` posent la borne DANS la requête Prisma (pas un
      // slice après coup) ; `total` reste le VRAI compte (via `.count()`, sur
      // le MÊME `where` — un aller-retour indexé, sans commune mesure avec le
      // `findMany` qu'il remplace) pour que `hasMore` et l'affichage d'un
      // total exact restent corrects malgré la troncature de la page.
      const { offset, limit } = validatePagination(
        request.query.offset,
        request.query.limit,
        { defaultLimit: 100, maxLimit: 100 }
      );

      const [reactions, total] = await Promise.all([
        prisma.reaction.findMany({
          where: reactionsWhere,
          include: {
            participant: {
              select: {
                id: true,
                displayName: true,
                avatar: true,
                type: true,
                user: { select: { username: true } }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit
        }),
        prisma.reaction.count({ where: reactionsWhere })
      ]);

      // Grouper les réactions par messageId et emoji
      const reactionsByMessage = new Map<string, any>();

      for (const reaction of reactions) {
        if (!reactionsByMessage.has(reaction.messageId)) {
          reactionsByMessage.set(reaction.messageId, {});
        }

        const messageReactions = reactionsByMessage.get(reaction.messageId);
        if (!messageReactions[reaction.emoji]) {
          messageReactions[reaction.emoji] = {
            emoji: reaction.emoji,
            count: 0,
            users: []
          };
        }

        messageReactions[reaction.emoji].count++;
        messageReactions[reaction.emoji].users.push({
          participantId: reaction.participantId,
          isAnonymous: reaction.participant.type === 'anonymous',
          user: { ...reaction.participant, username: reaction.participant.user?.username }
        });
      }

      // Convertir en tableau
      const reactionsArray = Array.from(reactionsByMessage.entries()).map(([messageId, emojis]) => ({
        messageId,
        reactions: Object.values(emojis)
      }));

      return sendSuccess(reply, {
        reactions: reactionsArray,
        total,
        hasMore: offset + reactions.length < total
      });

    } catch (error) {
      logger.error('Error fetching conversation reactions', error);
      return sendInternalError(reply, 'Error retrieving reactions');
    }
  });

  // #4188 — `POST` et `DELETE /conversations/:id/messages/:messageId/reactions`
  // ont été RETIRÉES : aucun appelant sur les trois clients. iOS passe par
  // `ReactionService.swift` → `POST /reactions` (forme plate), Android par
  // `ReactionApi.kt` → `POST /reactions`, le web par le socket `reaction:add`
  // (`websocket.service.ts`). La porte VIVANTE est la forme plate ; ces deux
  // jumelles imbriquées n'étaient qu'un second chemin vers la même règle.

  /**
   * GET /conversations/:id/status
   * Récupère les statuts de lecture de tous les messages d'une conversation
   */
  fastify.get<{
    Params: ConversationParams;
  }>('/conversations/:id/status', {
    schema: {
      description: 'Get read/delivery status for all messages in a conversation. Returns aggregated counts and detailed per-user status for each message. Useful for displaying message receipts and read indicators.',
      tags: ['conversations', 'status'],
      summary: 'Get all conversation message statuses',
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
                statuses: {
                  type: 'array',
                  description: 'Status information for all messages'
                },
                // Idem : `total` était servi et supprimé.
                total: { type: 'number', description: 'Number of messages covered by this status page' }
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
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Le plancher d'historique du lecteur borne cette page comme il borne
      // `GET …/messages` : `id`, `senderId`, `createdAt` et les accusés
      // NOMINATIFS d'un message d'avant l'arrivée SONT l'historique, moins le
      // texte. Une métadonnée fuit ce que le contenu tait.
      const statusFloor = await loadReaderHistoryFloor(prisma, {
        conversationId,
        reader: historyReaderFromAuthContext(authRequest.authContext)
      });

      // BORNÉE. Sans `take`, ce handler chargeait CHAQUE message non supprimé
      // de la conversation, chacun avec ses entrées de statut et le participant
      // joint sur chacune — sur un fil de plusieurs dizaines de milliers de
      // messages, un déni de service qu'un simple participant déclenchait.
      const messages = await prisma.message.findMany({
        where: applyHistoryFloor({ conversationId: conversationId, deletedAt: null }, statusFloor),
        select: {
          id: true,
          senderId: true,
          createdAt: true,
          statusEntries: {
            select: {
              participantId: true,
              deliveredAt: true,
              readAt: true,
              participant: {
                select: {
                  id: true,
                  userId: true,
                  displayName: true,
                  avatar: true,
                  type: true,
                  user: { select: { username: true } }
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: CONVERSATION_STATUS_PAGE_SIZE
      });

      const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
      const readStatusService = new MessageReadStatusService(prisma);

      // Le résumé se CALCULE. Les colonnes `deliveredCount`/`readCount`/
      // `deliveredToAllAt`/`readByAllAt` de la ligne Message n'ont aucun
      // écrivain : les lire revenait à servir `{0, 0, null, null}` à côté
      // d'`entries` qui, elles, portaient les vraies dates — une charge utile
      // qui se contredisait elle-même.
      const summaries = await readStatusService.getConversationReadStatuses(
        conversationId,
        messages.map(message => message.id)
      );

      // Ces `entries` exposent des accusés NOMINATIFS — identité et horodatage
      // de lecture. Le gate `showReadReceipts` s'y applique donc au même titre
      // qu'au résumé ; il y manquait entièrement.
      const visibleParticipantIds = new Set(
        (await readStatusService.filterReadReceiptVisible(
          messages.flatMap(message => message.statusEntries.map(entry => entry.participant))
        )).map(participant => participant.id)
      );

      const statuses = messages.map(message => {
        const summary = summaries.get(message.id);
        return {
          messageId: message.id,
          senderId: message.senderId,
          summary: {
            deliveredCount: summary?.receivedCount ?? 0,
            readCount: summary?.readCount ?? 0,
            recipientCount: summary?.totalMembers ?? 0
          },
          entries: message.statusEntries
            .filter(entry => visibleParticipantIds.has(entry.participantId))
            .map(entry => ({
              participantId: entry.participantId,
              isAnonymous: entry.participant.type === 'anonymous',
              deliveredAt: entry.deliveredAt,
              readAt: entry.readAt,
              user: { ...entry.participant, username: entry.participant.user?.username }
            }))
        };
      });

      return sendSuccess(reply, {
        statuses,
        total: messages.length
      });

    } catch (error) {
      logger.error('Error fetching conversation statuses', error);
      return sendInternalError(reply, 'Error retrieving statuses');
    }
  });


}
