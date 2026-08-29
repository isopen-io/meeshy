import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import { sendSuccess, sendUnauthorized, sendForbidden, sendNotFound, sendBadRequest, sendInternalError, sendError } from '../../utils/response.js';
import { TrackingLinkService } from '../../services/TrackingLinkService';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { parseSharedPlace, sharedPlaceFromMetadata } from '../../services/location/sharedPlace';
import { stripClientMessageId } from '../../socketio/utils/message-ack-shaping.js';
import { broadcastLinkMessage } from '../../socketio/broadcastLinkMessage.js';
import { runMessagePostSaveEffects } from '../../services/messaging/messagePostSaveEffects.js';
import { notifyMessageRecipients } from '../../services/messaging/messageNotificationFanOut.js';
import { resolveMessageMentions } from '../../services/messaging/messageMentions.js';
import {
  admitConversationWriteFor,
  isConversationWriteRefused,
  describeConversationWriteRefusal
} from '../../services/messaging/conversationWriteAdmission.js';
import type { ConversationWriteRefused } from '../../services/messaging/conversationWriteAdmission.js';
import type { Prisma } from '@meeshy/shared/prisma/client';
import {
  sendMessageSchema,
  sendMessageBodySchema,
  sendLinkMessageResponseSchema,
  SendMessageInput
} from './types';
import type { SharedPlace } from '../../services/location/sharedPlace';
import { LIVE_MESSAGE_MARK } from '../../services/messaging/liveMessage';

/**
 * La réponse à un refus d'admission, pour les DEUX chemins de lien.
 *
 * Nommée plutôt que recopiée, et pour la raison exacte qui a motivé le `select`
 * partagé ci-dessus : les deux sites portaient un `if/else` BINAIRE — état
 * terminal, sinon « vous n'avez pas le droit ». Cette forme range tout refus
 * futur dans la branche par défaut, et le troisième refus y est arrivé sans
 * qu'un témoin rougisse : le mode lent est un « pas encore », qu'un 403 fait
 * ranger au client comme un échec DÉFINITIF au lieu d'une reprise à programmer.
 *
 * Le code de statut porte la différence — 410 (parti pour de bon), 403 (jamais),
 * 429 + `Retry-After` (pas maintenant) — parce que c'est ce que les files
 * d'attente clientes savent lire sans connaître notre vocabulaire de refus.
 */
function sendWriteRefusal(reply: FastifyReply, refusal: ConversationWriteRefused): void {
  const message = describeConversationWriteRefusal(refusal);

  if (refusal.reason === 'conversation-closed') {
    return sendError(reply, 410, message);
  }

  if (refusal.reason === 'slow-mode-active') {
    // Le décompte est toujours porté par la règle ; le repli à 1 s évite
    // d'annoncer « réessayez dans 0 s » sur un refus, ce qui inviterait à une
    // boucle serrée.
    reply.header('Retry-After', String(refusal.retryAfterSeconds ?? 1));
    return sendError(reply, 429, message, { code: 'SLOW_MODE_ACTIVE' });
  }

  return sendForbidden(reply, message);
}

/**
 * Corps d'un message de lien de partage, construit UNE fois par envoi.
 *
 * Les deux routes servent le même message par deux tuyaux — l'événement socket
 * `link:message:new` pour les autres participants, la réponse 201 pour l'auteur.
 * Deux littéraux jumeaux les faisaient diverger en silence : le cycle 7 a ajouté
 * `conversationId`/`senderId` au seul littéral socket, laissant l'auteur sans
 * moyen de router son propre message. Un objet unique rend la divergence
 * impossible à écrire.
 *
 * Ce que la fonction rend est le payload de l'AUTEUR : il porte le
 * `clientMessageId`, seule clé qui relie le message serveur à la ligne
 * optimiste que l'auteur affiche déjà. Le payload des pairs s'en déduit par
 * `stripClientMessageId` — même règle, même helper que le chemin nominal
 * (Phase 4 §6.2, cf. MessageHandler) : le cid revient à son auteur, jamais à
 * un tiers, qui n'a pas à connaître l'espace d'ids de sa file d'attente.
 *
 * `sender` reste le `Participant` chargé par Prisma : c'est ce que les clients
 * reçoivent déjà du chemin socket, et `linkMessageSchema` décrit cette forme.
 */
function buildLinkMessagePayload(params: {
  message: {
    id: string;
    content: string;
    originalLanguage: string;
    messageType: string;
    clientMessageId?: string | null;
    isEdited: boolean;
    editedAt: Date | null;
    deletedAt: Date | null;
    replyToId: string | null;
    createdAt: Date;
    updatedAt: Date;
    sender?: unknown;
  };
  conversationId: string;
  senderId: string;
  place: SharedPlace | null;
  /**
   * Les usernames retenus par la validation de mentions. Le web surligne
   * DEPUIS ce champ (`use-message-display`) : absent du payload, un `@alice`
   * reconnu par le serveur reste du texte brut chez tous ses lecteurs.
   */
  validatedMentions: readonly string[];
}) {
  const { message, conversationId, senderId, place, validatedMentions } = params;
  return {
    id: message.id,
    ...(message.clientMessageId ? { clientMessageId: message.clientMessageId } : {}),
    // Seul routage dont dispose le destinataire : Socket.IO ne transporte pas
    // le nom de la room côté réception, donc un message sans `conversationId`
    // est indélivrable — le client ne sait pas dans quelle conversation
    // l'insérer. Même valeur que la room.
    conversationId,
    senderId,
    content: message.content,
    originalLanguage: message.originalLanguage,
    messageType: message.messageType,
    isEdited: message.isEdited,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    replyToId: message.replyToId,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    sender: message.sender,
    validatedMentions: [...validatedMentions],
    ...(place ? { location: place } : {})
  };
}

export async function registerMessageRoutes(fastify: FastifyInstance) {
  const trackingLinkService = new TrackingLinkService(fastify.prisma);

  // Envoyer un message via un lien partagé (sessionToken uniquement)
  fastify.post('/links/:identifier/messages', {
    schema: {
      description: 'Send a message as an anonymous user via share link. Requires x-session-token header. The share link must be active, not expired, and allow anonymous messages. The anonymous participant must have message sending permissions. Message content is required — these routes do not serve attachments. Automatically processes and tracks links in message content.',
      tags: ['links', 'messages'],
      summary: 'Send message (anonymous)',
      params: {
        type: 'object',
        required: ['identifier'],
        properties: {
          identifier: {
            type: 'string',
            description: 'Link identifier (linkId or database ID)',
            example: 'mshy_67890abcdef12345_a1b2c3d4'
          }
        }
      },
      headers: {
        type: 'object',
        required: ['x-session-token'],
        properties: {
          'x-session-token': {
            type: 'string',
            description: 'Anonymous session token'
          }
        }
      },
      body: sendMessageBodySchema,
      response: {
        201: {
          description: 'Message sent successfully',
          ...sendLinkMessageResponseSchema
        },
        400: {
          description: 'Bad request - invalid data',
          ...errorResponseSchema
        },
        401: {
          description: 'Session token required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - anonymous messages not allowed or insufficient permissions',
          ...errorResponseSchema
        },
        404: {
          description: 'Share link not found',
          ...errorResponseSchema
        },
        410: {
          description: 'Link expired or inactive',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { identifier } = request.params as { identifier: string };
      const body = sendMessageSchema.parse(request.body);
      // Canonicalise the client-claimed locale at the write boundary — this
      // anonymous share-link path does NOT go through the MessagingService
      // funnel (which normalizes since iteration 218), so clients sending the
      // raw platform locale (`fr-FR`, `en_US`, `FR`) would otherwise persist
      // `Message.originalLanguage` non-canonically and fragment every
      // downstream consumer (NLLB source, translation cache key, language
      // stats). Irreducible codes (`bas`, unknown 2-letter) are kept verbatim.
      const originalLanguage = normalizeLanguageCode(body.originalLanguage) ?? body.originalLanguage;

      const sessionToken = request.headers['x-session-token'] as string;

      if (!sessionToken) {
        return sendUnauthorized(reply, 'Session token requis pour envoyer un message');
      }

      const isLinkId = identifier.startsWith('mshy_');

      let shareLink;
      if (isLinkId) {
        shareLink = await fastify.prisma.conversationShareLink.findUnique({
          where: { linkId: identifier }
        });
      } else {
        shareLink = await fastify.prisma.conversationShareLink.findUnique({
          where: { id: identifier }
        });
      }

      if (!shareLink) {
        return sendNotFound(reply, 'Lien de partage non trouvé');
      }

      const { hashSessionToken } = await import('../../utils/session-token');
      const tokenHash = hashSessionToken(sessionToken);
      const anonymousParticipant = await fastify.prisma.participant.findFirst({
        where: {
          sessionTokenHash: tokenHash,
          type: 'anonymous',
          isActive: true
        }
      });

      const participantShareLink = anonymousParticipant?.anonymousSession?.shareLinkId
        ? await fastify.prisma.conversationShareLink.findUnique({
            where: { id: anonymousParticipant.anonymousSession.shareLinkId },
            select: {
              id: true,
              conversationId: true,
              isActive: true,
              allowAnonymousMessages: true,
              expiresAt: true,
              // L'état TERMINAL du conteneur ET sa police d'écriture. Le lien
              // de partage est le SEUL transport d'envoi d'un invité anonyme :
              // sans cette lecture, fermer une conversation ne fermait rien
              // pour l'inconnu qui détient l'URL, et un canal d'annonces lui
              // restait grand ouvert.
              conversation: {
                select: {
                  type: true,
                  isActive: true,
                  closedAt: true,
                  isAnnouncementChannel: true,
                  defaultWriteRole: true
                }
              }
            }
          })
        : null;

      if (!anonymousParticipant || !participantShareLink) {
        return sendUnauthorized(reply, 'Session invalide ou non autorisée pour ce lien');
      }

      if (!participantShareLink.isActive) {
        return sendError(reply, 410, 'Ce lien n\'est plus actif');
      }

      if (participantShareLink.expiresAt && new Date() > participantShareLink.expiresAt) {
        return sendError(reply, 410, 'Ce lien a expiré');
      }

      if (!participantShareLink.allowAnonymousMessages) {
        return sendForbidden(reply, 'Les messages anonymes ne sont pas autorisés pour ce lien');
      }

      // Même garde, même prédicat partagé que le jumeau authentifié ci-dessous :
      // ce chemin contourne lui aussi le point de convergence. Les droits du
      // LIEN vérifiés autour disent ce que le lien autorise ; ils ne disent rien
      // de ce que la conversation accepte, et un lien anonyme ouvert sur un
      // canal d'annonces est précisément la contradiction que ce garde tranche.
      const anonymousAdmission = await admitConversationWriteFor(fastify.prisma, {
        conversation: participantShareLink.conversation,
        conversationId: participantShareLink.conversationId,
        senderParticipantId: anonymousParticipant.id
      });
      if (isConversationWriteRefused(anonymousAdmission)) {
        return sendWriteRefusal(reply, anonymousAdmission);
      }

      if (!anonymousParticipant.permissions.canSendMessages) {
        return sendForbidden(reply, 'Vous n\'êtes pas autorisé à envoyer des messages');
      }


      // Traiter les liens dans le message AVANT la sauvegarde
      const { processedContent, trackingLinks } = await trackingLinkService.processMessageLinks({
        content: body.content,
        conversationId: participantShareLink.conversationId,
        createdBy: undefined
      });

      // Lieu partagé — ce chemin (participant anonyme via lien de partage)
      // CONTOURNE MessagingService.handleMessage / MessageProcessor.saveMessage,
      // donc la validation `parseSharedPlace` + l'écriture dans
      // `metadata.location` doivent être refaites ICI. Chiffrement : stockage
      // EN CLAIR, même décision assumée que pour le chemin nominal (cf.
      // sharedPlace.ts).
      const sharedPlace = parseSharedPlace(body.location);

      // Créer le message avec le contenu transformé.
      // Phase 4 §6.2 — `clientMessageId` propagé pour le dedup contract.
      // Pas de catch-P2002 ici (chemin anonyme simple) — un retry serveur
      // produit le même cid donc Prisma renvoie une 409 que la couche
      // Fastify mappe en réponse 409 Conflict côté client.
      const message = await fastify.prisma.message.create({
        data: {
          conversationId: participantShareLink.conversationId,
          senderId: anonymousParticipant.id,
          content: processedContent,
          originalLanguage,
          messageType: body.messageType,
          clientMessageId: body.clientMessageId,
          ...LIVE_MESSAGE_MARK,
          ...(sharedPlace ? { metadata: { location: sharedPlace } as unknown as Prisma.InputJsonValue } : {})
        },
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
                  firstName: true,
                  lastName: true,
                  displayName: true,
                  avatar: true
                }
              }
            }
          }
        }
      });

      // Mettre à jour les messageIds des TrackingLinks
      if (trackingLinks.length > 0) {
        const tokens = trackingLinks.map(link => link.token);
        await trackingLinkService.updateTrackingLinksMessageId(tokens, message.id);
      }

      // Lieu partagé : hisser `metadata.location` en top-level `location`,
      // même contrat que le chemin nominal (messages.ts / MessageHandler).
      const place = sharedPlaceFromMetadata(message.metadata);

      // Ce que ce message doit à ceux qu'il NOMME : une ligne `Mention`, un
      // `Message.validatedMentions` à jour et le lot d'ids que l'éventail
      // ci-dessous transforme en notification de mention. Ce chemin contournant
      // `MessageProcessor`, rien d'autre ne le fera. Attendu — et non
      // fire-and-forget — parce que ses DEUX sorties partent avec le message :
      // les usernames dans le payload, les ids dans l'éventail. L'unité
      // court-circuite d'elle-même un contenu sans `@`, qui ne coûte donc
      // aucune requête.
      const mentions = await resolveMessageMentions({
        prisma: fastify.prisma,
        mentionService: fastify.mentionService,
        message: {
          id: message.id,
          conversationId: participantShareLink.conversationId,
          senderId: anonymousParticipant.id
        },
        content: message.content,
        onError: (err) => logError(fastify.log, 'Link message mention resolution failed:', err)
      });

      const payload = buildLinkMessagePayload({
        message,
        conversationId: participantShareLink.conversationId,
        senderId: anonymousParticipant.id,
        place,
        validatedMentions: mentions.validatedUsernames
      });

      // Ce que ce message doit à sa conversation — bump de `lastMessageAt`,
      // poussée au translator, statistiques de langue. Ce chemin CONTOURNE
      // `MessagingService.handleMessage`, donc rien d'autre ne les exécutera :
      // sans cet appel, le message reste en langue originale à vie (Prisme
      // Linguistique éteint) et la conversation ne remonte jamais dans la liste
      // triée serveur. L'avancement du curseur de lecture de l'auteur est le
      // seul effet du chemin nominal délibérément absent — cf. le docstring de
      // `runMessagePostSaveEffects`.
      runMessagePostSaveEffects({
        prisma: fastify.prisma,
        translationService: fastify.translationService,
        message: {
          id: message.id,
          conversationId: participantShareLink.conversationId,
          senderId: anonymousParticipant.id,
          // Un anonyme n'a pas d'utilisateur : les compteurs le créditent sous
          // son `Participant.id`, exactement comme le fait `recompute()`.
          senderUserId: null,
          attachmentMimeTypes: [],
          content: message.content,
          messageType: message.messageType,
          replyToId: message.replyToId
        },
        originalLanguage,
        onError: (effect, err) => logError(fastify.log, `Link message post-save effect failed (${effect}):`, err)
      });

      // Ce que ce message doit à ses destinataires quand ils ne REGARDENT pas :
      // la notification. La room, la file hors ligne et la pastille ne parlent
      // qu'à un client ouvert ; un destinataire qui n'a pas l'application au
      // premier plan n'apprend l'existence du message que par un push APNs/FCM.
      // Ce chemin contournant `MessageProcessor`, rien d'autre ne l'enverra.
      // Fire-and-forget avec `.catch` explicite : un push raté ne doit ni
      // allonger le 201 ni le transformer en 500, et une promesse rejetée sans
      // handler tue le processus sous Node 22 (`--unhandled-rejections=throw`).
      void notifyMessageRecipients({
        prisma: fastify.prisma,
        notificationService: fastify.notificationService,
        message,
        senderParticipantId: anonymousParticipant.id,
        conversationId: participantShareLink.conversationId,
        processedContent: message.content,
        validatedMentionUserIds: mentions.validatedUserIds,
        onError: (err) => logError(fastify.log, 'Link message notification fan-out failed:', err)
      }).catch((err) => logError(fastify.log, 'Link message notification fan-out failed:', err));

      // Émettre vers les DEUX audiences (room live + file hors ligne) — voir
      // `broadcastLinkMessage`. Même raison : rien d'autre ne rejouera ce
      // message à un participant déconnecté.
      await broadcastLinkMessage({
        manager: fastify.socketIOHandler.getManager(),
        conversationId: participantShareLink.conversationId,
        senderParticipantId: anonymousParticipant.id,
        messageId: message.id,
        payload: { message: stripClientMessageId(payload) },
        onError: (err) => logError(fastify.log, 'Link message broadcast error:', err)
      });

      return sendSuccess(reply, {
        messageId: message.id,
        message: payload
      }, { statusCode: 201 });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, 'Données invalides');
      }
      logError(fastify.log, 'Send link message error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
