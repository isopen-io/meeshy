/**
 * Édition d'un message — `PUT /conversations/:id/messages/:messageId` et
 * `PATCH /messages/:messageId`.
 *
 * Fichier extrait de `messages-advanced.ts` (issue #4284, découpage par
 * responsabilité — aucun changement de comportement). Les deux transports
 * partagent la même admission d'édition (`messageEditAdmission`), la même
 * garde de contenu (`messageEditContent`) et le même retraitement des liens /
 * mentions ; ils sont donc regroupés ici plutôt que dans deux fichiers
 * séparés. Point d'entrée : `messages-advanced.ts`.
 */
import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { transformTranslationsToArray, type MessageTranslationJSON } from '../../utils/translation-transformer';
import { TrackingLinkService } from '../../services/TrackingLinkService';
import { conversationStatsService } from '../../services/ConversationStatsService';
import type { Message } from '@meeshy/shared/types/index';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { messageValidationHook } from '../../middleware/rate-limiter';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { editedMessageResponseSchema, patchedMessageResponseSchema } from './messages-advanced-shared';
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
import { applyMessageEditEffects } from '../../services/messaging/messageEditEffects';
import {
  admitEditedContent,
  isEditedContentRefused,
  EMPTY_EDIT_REFUSAL_MESSAGE,
} from '../../services/messaging/messageEditContent';
import { emitMentionCreated } from '../../socketio/emitMentionCreated';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { broadcastMessageMutation } from '../../socketio/broadcastMessageMutation';
import { buildMessageEditedCore } from '../../socketio/messageEditedPayload';
import type {
  ConversationParams,
  EditMessageBody
} from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError, sendError } from '../../utils/response';
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

/** Dépendances construites une seule fois par `registerMessagesAdvancedRoutes`. */
type EditRouteDeps = {
  socketIOHandler: FastifyInstance['socketIOHandler'];
  trackingLinkService: TrackingLinkService;
};

/**
 * `PUT /conversations/:id/messages/:messageId` — édition d'un message,
 * forme CONVERSATION-scopée (client web).
 */
export function registerEditMessagePutRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
  { socketIOHandler, trackingLinkService }: EditRouteDeps
) {
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


}

/**
 * `PATCH /messages/:messageId` — édition d'un message, forme par ID
 * (client Android, alternative au sibling `PUT` ci-dessus).
 */
export function registerEditMessagePatchRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
  { socketIOHandler, trackingLinkService }: EditRouteDeps
) {
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


}
