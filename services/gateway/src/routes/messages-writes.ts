/**
 * Routes messages — surface ÉCRITURE : PUT /messages/:messageId (édition),
 * DELETE /messages/:messageId (suppression), POST
 * /attachments/:attachmentId/status (marquage écouté/vu/téléchargé). Issue
 * #4284. Point d'entrée : messages.ts.
 */
import { FastifyInstance } from 'fastify';
import { UnifiedAuthRequest } from '../middleware/auth.js';
import { attachmentMediaSelect } from '../services/attachments/attachmentIncludes';
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
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { loadPrivacyPreferencesCached } from '../services/preferences/privacy-cache';
import { broadcastMessageMutation } from '../socketio/broadcastMessageMutation';
import { buildMessageEditedCore } from '../socketio/messageEditedPayload';
import type { Message } from '@meeshy/shared/types/index';
import { transformTranslationsToArray, type MessageTranslationJSON } from '../utils/translation-transformer';
import { validateParams, validateBody } from '../validation/helpers.js';
import {
  MessageParamsSchema,
  AttachmentParamsSchema,
  UpdateMessageBodySchema,
  AttachmentStatusBodySchema,
} from '../validation/messages-schemas.js';
import {
  sendSuccess,
  sendBadRequest,
  sendNotFound,
  sendForbidden,
  sendInternalError,
  sendError,
} from '../utils/response.js';
import { logger, type MessageParams, type MessagesRouteDeps } from './messages-shared';

interface UpdateMessageBody {
  content?: string;
  isEdited?: boolean;
}

/**
 * L'audience de `attachment-status:updated`, et ce que vaut son verdict.
 *
 * `repli` DÉCLARE que la préférence n'a pas pu être lue : la room qu'il porte
 * n'est pas un choix de l'utilisateur, c'est une posture d'incident. Un booléen
 * `showReadReceipts` seul ne pouvait pas dire ça — il aurait rangé « il a
 * refusé » et « on n'a pas pu demander » sous la même valeur, alors que les
 * deux n'envoient pas chercher au même endroit quand on relit le journal.
 */
type AudienceStatutPiece =
  | { readonly kind: 'lue'; readonly room: string }
  | { readonly kind: 'repli'; readonly room: string; readonly cause: unknown };

/**
 * Choisit la room de `attachment-status:updated` — et ne LÈVE JAMAIS (#4530).
 *
 * ## Ce que ce site était le seul à ne pas avoir
 *
 * `privacy-cache.ts` pose sa règle en toutes lettres : il ne rattrape rien, et
 * « chaque appelant garde son propre repli ». Mesuré, les cinq autres appelants
 * de `loadPrivacyPreferencesCached` le font — `PrivacyPreferencesService`
 * (`getPreferences`, `getPreferencesForUsers`),
 * `MessageReadStatusService._loadReadReceiptOptOuts`, et les deux résolveurs de
 * `preferences/forward-source-visibility`. Celui-ci n'en avait aucun : il
 * héritait du `catch` de la DIFFUSION, qui ne se replie sur rien — il journalise
 * et passe. Une base indisponible faisait donc disparaître l'événement ENTIER,
 * y compris pour les propres appareils de celui qui venait d'écouter, pendant
 * que la route rendait 200 ; rien dans la réponse ne distinguait ce cas du cas
 * nominal. Le `try` de la diffusion n'entourait au départ que l'émission :
 * `85494dee00` y a fait entrer cette lecture, et le `catch` a hérité d'un appel
 * qui tombe pour des raisons ordinaires (base, coupe-circuit, timeout).
 *
 * ## Pourquoi le repli est RESTRICTIF ici, et OUVERT chez les cinq autres
 *
 * L'écart est délibéré, pas une divergence. Les cinq autres décident si un
 * CHAMP part dans une charge qui part de toute façon — se fermer y priverait
 * tout le monde d'un contenu sur la foi d'un incident. Ici la préférence
 * choisit une ADRESSE : la room personnelle porte l'événement à celui qui a agi
 * (ses autres appareils restent synchronisés, ce qui est le service rendu), et
 * n'élargit l'audience à personne — un incident ne publie pas à toute une
 * conversation la position d'écoute de quelqu'un qui l'a peut-être refusée.
 * Doctrine du dépôt : une garde échoue en montrant MOINS, jamais plus. Rien
 * n'est mémoïsé (`privacy-cache` ne cache pas les échecs) : la requête suivante
 * relit et retrouve la room nominale.
 *
 * L'absence de préférence stockée reste PERMISSIVE (`!== false`) : ne rien
 * avoir réglé n'est pas un refus, et seul l'ÉCHEC de la lecture déclenche le
 * repli.
 */
const resolveAudienceStatutPiece = async (
  prisma: MessagesRouteDeps['prisma'],
  userId: string,
  conversationId: string
): Promise<AudienceStatutPiece> => {
  try {
    const prefs = await loadPrivacyPreferencesCached(prisma, [userId]);
    const diffuseAuxAutres = prefs.get(userId)?.showReadReceipts !== false;
    return {
      kind: 'lue',
      room: diffuseAuxAutres ? ROOMS.conversation(conversationId) : ROOMS.user(userId),
    };
  } catch (cause) {
    return { kind: 'repli', room: ROOMS.user(userId), cause };
  }
};

export function registerMessagesWriteRoutes(fastify: FastifyInstance, deps: MessagesRouteDeps): void {
  const { prisma, requiredAuth, attachmentService, translationService, socketIOHandler, trackingLinkService } = deps;

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
          // #3907 — la réciprocité `showReadReceipts` gouverne AUSSI ce flux.
          //
          // Cet événement pousse `userId`, `playPositionMs`, `durationMs` et
          // `percentage` à TOUTE la room, et le web les persiste en cache
          // (`use-socket-cache-sync.ts`). Un participant qui a désactivé ses
          // accusés y annonçait donc en direct où il en est dans un vocal —
          // plus intime que l'accusé texte qu'il a refusé, et sans qu'aucune
          // porte de lecture ne puisse le rattraper : le cache du destinataire
          // le tient déjà.
          //
          // Il n'est pas SILENCIÉ pour autant : la diffusion se replie sur SA
          // room à lui, pour que ses propres appareils restent synchronisés.
          // « Ne pas dire aux autres » n'est pas « ne rien savoir soi-même ».
          //
          // La lecture qui tranche vit dans `resolveAudienceStatutPiece`, qui ne
          // lève jamais : c'est ELLE qui a l'incident, pas la diffusion, et le
          // `catch` ci-dessous ne doit plus l'avaler (#4530).
          const audience = await resolveAudienceStatutPiece(
            prisma,
            userId,
            attachment.message.conversationId
          );
          if (audience.kind === 'repli') {
            logger.error(
              'Préférences de confidentialité illisibles — repli sur la room restrictive, l\'événement part quand même',
              audience.cause,
              { userId, attachmentId, room: audience.room }
            );
          }
          const percentage = playPositionMs !== undefined && durationMs !== undefined && durationMs > 0
            ? Math.min(100, Math.round((playPositionMs / durationMs) * 100))
            : undefined;
          socketIOManager.getIO().to(audience.room).emit(SERVER_EVENTS.ATTACHMENT_STATUS_UPDATED, {
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
        // Ce `catch` ne couvre plus qu'un incident de TRANSPORT — la lecture de
        // préférences a son propre repli, un cran au-dessus. Le message le dit,
        // parce qu'un refus à plusieurs causes possibles doit les SÉPARER : les
        // deux n'envoient pas chercher au même endroit (#4530).
        logger.error(
          'Diffusion Socket.IO en échec — le transport, pas la lecture des préférences',
          socketError as Error,
          { userId, attachmentId }
        );
      }

      return sendSuccess(reply, { message: `Attachment marqué comme ${action}` });

    } catch (error) {
      logger.error('Error updating attachment status', error as Error);
      return sendInternalError(reply, 'Erreur lors de la mise à jour du statut de l\'attachment');
    }
  });
}
