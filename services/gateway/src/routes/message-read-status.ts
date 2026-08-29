import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth.js';
import { MessageReadStatusService } from '../services/MessageReadStatusService.js';
import { PrivacyPreferencesService } from '../services/PrivacyPreferencesService.js';
import { ConversationBridgeService } from '../services/ConversationBridgeService.js';
import { validateParams, validateQuery } from '../validation/helpers.js';
import { MessageIdParamSchema, ConversationIdParamSchema, ReadStatusesQuerySchema, DeliveryReceiptParamsSchema } from '../validation/message-read-status-schemas.js';
import { MarkReadBodySchema } from '../validation/messages-schemas.js';
import { resolveConversationId } from '../utils/conversation-id-cache.js';
import { resolveCallerParticipant } from './conversations/utils/access-control.js';
import { broadcastReadStatus } from '../socketio/broadcastReadStatus.js';
// #4179 — le plancher d'historique bornait déjà `GET /conversations/:id/status`
// (messages-advanced.ts) mais aucune des DEUX lectures de ce fichier : un
// accusé NOMINATIF (qui a reçu/lu un message, et quand) est de l'historique au
// même titre que le texte du message lui-même — une métadonnée qui fuit ce que
// le contenu tait. Réutilise la même fonction pure que `/status` et
// `threads.ts`, jamais une réécriture locale de la règle.
import { loadReaderHistoryFloor, historyReaderFromAuthContext } from '../services/historyFloor.js';
import { sendSuccess, sendNotFound, sendForbidden, sendBadRequest, sendInternalError } from '../utils/response.js';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { createCustomRateLimiter } from '../utils/rate-limiter.js';
const logger = enhancedLogger.child({ module: 'MessageReadStatusRoutes' });

interface MessageParams {
  messageId: string;
}

interface ConversationParams {
  conversationId: string;
}

interface MessageIdsQuery {
  messageIds?: string;
}

interface DeliveryReceiptRouteParams {
  conversationId: string;
  messageId: string;
}

/**
 * #4179 — `ReadStatusesQuerySchema` (validation/message-read-status-schemas.ts)
 * valide chaque id de la liste CSV mais ne borne jamais leur NOMBRE : un appel
 * pouvait en demander des milliers, chacun déclenchant en aval un aller-retour
 * `MessageStatusEntry`/`ConversationReadCursor`. Plafond aligné sur celui déjà
 * en vigueur côté ÉCRITURE (`MarkReadBodySchema.messageIds`, 200) tout en
 * restant strictement inférieur : une lecture porte plus d'appelants
 * potentiels par requête (un client peut redemander le statut de tout ce qui
 * vient d'apparaître à l'écran) qu'une écriture, qui ne porte que ce qu'UN
 * lecteur vient réellement de voir.
 */
const MAX_READ_STATUSES_MESSAGE_IDS = 100;

export default async function messageReadStatusRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const readStatusService = new MessageReadStatusService(prisma);
  const privacyPreferencesService = new PrivacyPreferencesService(prisma);
  // G-123 — le pont ✦ voyage sur le badge que `broadcastReadStatus` renvoie aux
  // appareils du lecteur. Fourni aux QUATRE portes, pas seulement à celles qui
  // marquent `read` aujourd'hui : c'est l'unité partagée qui décide si le pont
  // se calcule (compteur > 0 après une lecture), et un `type` qui changerait ici
  // ne doit pas perdre le pont en silence.
  const bridgeService = new ConversationBridgeService(prisma);

  // Middleware d'authentification.
  //
  // `allowAnonymous: true` — un invité de lien partagé est un participant de
  // plein droit : il lit, il envoie (`POST /conversations/:id/messages`,
  // `optionalAuth`) et il réagit (`routes/reactions.ts`, « Les anonymes peuvent
  // aussi réagir »). Le serveur COMPTE d'ailleurs ses non-lus — `getUnreadCount`
  // résout `Participant.id` autant que `User.id`, et `emitUnreadCountsToRecipients`
  // adresse `ROOMS.user(userId ?? id)`, la room que `AuthHandler` fait rejoindre
  // aux sockets anonymes précisément « because joining anything else had already
  // left anonymous participants without their unread badge ».
  //
  // Il ne lui manquait que la moitié qui REMET À ZÉRO : cette porte, fermée par
  // `allowAnonymous: false`, renvoyait 403 avant même de regarder la
  // conversation. Le badge d'un invité ne pouvait donc que monter — la webapp
  // avait fini par débrancher son propre suivi de lecture pour les sessions
  // anonymes (`bubble-stream-page.tsx`, « la route mark-as-read est JWT-only »)
  // plutôt que d'encaisser un 403 par flush.
  const requiredAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: true
  });

  // Rate limiter for write operations that broadcast to conversation rooms.
  // #4179 — relevé de 30 à 120 req/min par utilisateur. À 30, une conversation
  // active épuisait SEULE le quota que `mark-as-received` et `mark-as-read`
  // PARTAGENT (le doc-comment de `ConversationSyncEngine._markAsReceivedTasks`,
  // iOS, l'explique : la coalescence côté client à 1s existe justement à cause
  // de ce partage) — au point de faire rejeter des accusés de LECTURE par un
  // flot d'accusés de RÉCEPTION que rien ne rejoue jamais. 120 est ce qui
  // permet à iOS de cesser d'étrangler ses accusés de lecture pour protéger son
  // propre quota de réception. `isLocalIp` n'intervient plus ici depuis #4137 —
  // la clé `user:` ci-dessous porte tout l'effet du limiteur.
  const readReceiptWriteLimiter = createCustomRateLimiter({
    max: 120,
    windowMs: 60 * 1000,
    keyPrefix: 'read-receipt',
    message: 'Too many read-receipt updates. Please slow down.',
    keyGenerator: (request: FastifyRequest) => {
      /* istanbul ignore next -- keyGenerator is called by rate-limiter middleware; mocked in tests, never invoked directly */
      const authRequest = request as UnifiedAuthRequest;
      /* istanbul ignore next */
      return `user:${authRequest.authContext?.userId ?? request.ip ?? 'unknown'}`;
    }
  });

  /**
   * GET /messages/:messageId/read-status
   * Récupère le statut de lecture d'un message spécifique
   */
  fastify.get<{
    Params: MessageParams;
  }>('/messages/:messageId/read-status', {
    preValidation: [requiredAuth],
    preHandler: [validateParams(MessageIdParamSchema)]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;

      // Vérifier que le message existe
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        // `createdAt` : plancher d'historique ci-dessous. Absent avant #4179 —
        // cette porte n'avait alors aucun moyen de savoir si le message datait
        // d'avant l'arrivée de l'appelant.
        select: { id: true, conversationId: true, createdAt: true }
      });

      if (!message) {
        return sendNotFound(reply, 'Message non trouvé');
      }

      // Vérifier que l'utilisateur a accès à cette conversation.
      //
      // L'appartenance était filtrée EN RELATION (`conversation.participants`,
      // `where: { userId, isActive }`) — une cinquième copie de la règle, et la
      // seule que `resolveCallerParticipant` ne pouvait pas couvrir sans
      // détacher la lecture du message. Elle est détachée : `isActive: true` y
      // survit intacte, et un invité de lien partagé cesse d'être invisible à sa
      // propre conversation.
      const membership = await resolveCallerParticipant(prisma, authRequest.authContext, message.conversationId);

      if (!membership) {
        return sendForbidden(reply, 'Accès non autorisé à ce message');
      }

      // #4179 — cette porte rendait déjà un accusé NOMINATIF (qui a reçu/lu, et
      // quand — `getMessageReadStatus`) sans jamais consulter le plancher
      // d'historique, alors que `GET /conversations/:id/status` l'applique pour
      // la même donnée. Un membre pouvait ainsi interroger le statut d'un
      // message envoyé avant son arrivée (ou avant la date que son lien de
      // partage autorise) — l'accusé de lecture fuyant une information sur un
      // contenu que le message lui-même lui reste caché. Traité comme le
      // message ci-dessus : « pas trouvé », pour ne pas distinguer, depuis
      // l'extérieur, une absence réelle d'une absence de droit.
      const historyFloor = await loadReaderHistoryFloor(prisma, {
        conversationId: message.conversationId,
        reader: historyReaderFromAuthContext(authRequest.authContext)
      });
      if (historyFloor && message.createdAt < historyFloor) {
        return sendNotFound(reply, 'Message non trouvé');
      }

      // Récupérer le statut de lecture
      const status = await readStatusService.getMessageReadStatus(
        messageId,
        message.conversationId
      );

      return sendSuccess(reply, status);

    } catch (error) {
      logger.error('Error fetching message read status', error as Error);
      return sendInternalError(reply, 'Erreur lors de la récupération du statut de lecture');
    }
  });

  /**
   * GET /conversations/:conversationId/read-statuses
   * Récupère les statuts de lecture pour plusieurs messages d'une conversation
   * Query params: messageIds (comma-separated)
   */
  fastify.get<{
    Params: ConversationParams;
    Querystring: MessageIdsQuery;
  }>('/conversations/:conversationId/read-statuses', {
    preValidation: [requiredAuth],
    preHandler: [validateParams(ConversationIdParamSchema), validateQuery(ReadStatusesQuerySchema)]
  }, async (request, reply) => {
    try {
      const { conversationId: rawId } = request.params;
      const { messageIds } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Resolve identifier (e.g. "meeshy") → ObjectId
      const conversationId = await resolveConversationId(prisma, rawId);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation non trouvée');
      }

      // Vérifier l'accès à la conversation
      const membership = await resolveCallerParticipant(prisma, authRequest.authContext, conversationId);

      if (!membership) {
        return sendForbidden(reply, 'Accès non autorisé à cette conversation');
      }

      // Parser les messageIds
      const messageIdArray = messageIds ? messageIds.split(',') : [];

      if (messageIdArray.length === 0) {
        return sendBadRequest(reply, 'Au moins un messageId requis');
      }

      // #4179 — `ReadStatusesQuerySchema` valide chaque id un par un mais ne
      // borne jamais leur NOMBRE (voir MAX_READ_STATUSES_MESSAGE_IDS
      // ci-dessus) : une chaîne CSV de plusieurs milliers d'ids passait la
      // validation Zod intacte et se traduisait en autant de lignes lues côté
      // service. Contrôle posé ICI, dans la route, plutôt que dans le schéma
      // partagé (hors du territoire de ce correctif) — un `messageIds` déjà
      // découpé est le format le plus simple pour vérifier une CARDINALITÉ.
      if (messageIdArray.length > MAX_READ_STATUSES_MESSAGE_IDS) {
        return sendBadRequest(reply, `Trop de messageIds (maximum ${MAX_READ_STATUSES_MESSAGE_IDS})`);
      }

      // #4179 — même plancher d'historique que `GET /messages/:id/read-status`
      // ci-dessus : cette porte rend des comptes agrégés (combien ont reçu/lu),
      // mais ils dérivent des MÊMES curseurs/entrées figées que les vues
      // nominatives, sur des `messageIds` que l'APPELANT choisit — sans
      // plancher, interroger un message antérieur à son arrivée révélait déjà
      // qu'il existe et combien de destinataires l'ont eu, quand `GET
      // /conversations/:id/status` protège la même donnée pour la même
      // conversation.
      const historyFloor = await loadReaderHistoryFloor(prisma, {
        conversationId,
        reader: historyReaderFromAuthContext(authRequest.authContext)
      });

      // Récupérer les statuts
      const statusMap = await readStatusService.getConversationReadStatuses(
        conversationId,
        messageIdArray,
        historyFloor
      );

      // Convertir Map en objet pour JSON
      const statusObject = Object.fromEntries(statusMap);

      return sendSuccess(reply, statusObject);

    } catch (error) {
      logger.error('Error fetching conversation read statuses', error as Error);
      return sendInternalError(reply, 'Erreur lors de la récupération des statuts de lecture');
    }
  });

  /**
   * POST /conversations/:conversationId/mark-as-read
   * Marque tous les messages d'une conversation comme lus
   * (L'utilisateur a ouvert la conversation et scrollé jusqu'au dernier message)
   */
  fastify.post<{
    Params: ConversationParams;
  }>('/conversations/:conversationId/mark-as-read', {
    preValidation: [requiredAuth],
    preHandler: [validateParams(ConversationIdParamSchema), readReceiptWriteLimiter.middleware()]
  }, async (request, reply) => {
    try {
      const { conversationId: rawId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;
      // Un invité de lien partagé n'a pas de ligne `User` : ses préférences de
      // confidentialité sont les valeurs par défaut, pas une lecture en base
      // indexée sur un `Participant.id` pris pour un `User.id`.
      const isAnonymous = authRequest.authContext.isAnonymous === true;

      // Resolve identifier (e.g. "meeshy") → ObjectId
      const conversationId = await resolveConversationId(prisma, rawId);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation non trouvée');
      }

      // Vérifier l'accès à la conversation
      const membership = await resolveCallerParticipant(prisma, authRequest.authContext, conversationId);

      if (!membership) {
        return sendForbidden(reply, 'Accès non autorisé à cette conversation');
      }

      // Suivi de lecture exact. La webapp appelle CE point d'entrée, pas
      // /conversations/:id/mark-read : n'en doter qu'un laisserait le web sur le
      // chemin par fenêtre. Corps absent = client non mis à jour → repli fenêtre.
      let reportedMessageIds: readonly string[] | undefined;
      let reportedLanguage: string | undefined;
      let reportedMessageLanguages: Readonly<Record<string, string>> | undefined;
      let caughtUpToMessageId: string | undefined;
      if (request.body !== undefined && request.body !== null) {
        const bodyResult = MarkReadBodySchema.safeParse(request.body);
        if (!bodyResult.success) {
          return sendBadRequest(reply, 'Corps de requête invalide pour le marquage de lecture');
        }
        reportedMessageIds = bodyResult.data.messageIds;
        reportedLanguage = bodyResult.data.language;
        reportedMessageLanguages = bodyResult.data.messageLanguages;
        caughtUpToMessageId = bodyResult.data.caughtUpToMessageId;
      }

      // Compteur AVANT marquage — nombre de messages marqués comme lus,
      // uniforme avec POST /conversations/:id/mark-read.
      const markedCount = await readStatusService.getUnreadCount(membership.id, conversationId);

      // Marquer comme lu (participantId, pas userId)
      // Même sémantique que /conversations/:id/mark-read : en mode exact,
      // `markedCount` est le nombre d'entrées réellement figées.
      const frozenCount = await readStatusService.markMessagesAsRead(
        membership.id,
        conversationId,
        undefined,
        reportedMessageIds || reportedLanguage || reportedMessageLanguages || caughtUpToMessageId
          ? {
              messageIds: reportedMessageIds,
              language: reportedLanguage,
              messageLanguages: reportedMessageLanguages,
              caughtUpToMessageId
            }
          : undefined
      );
      const effectiveMarkedCount = reportedMessageIds ? frozenCount : markedCount;

      // La préférence `showReadReceipts`, l'identité de contrat de l'acteur et
      // le recalage du badge sur la branche muette vivaient ici en trois pièces
      // séparées, réécrites à chaque porte. Elles sont dans l'unité partagée :
      // c'est elle qui décide, pour les quatre appelants, ce qu'une préférence
      // tait (la diffusion) et ce qu'elle ne tait jamais (le badge de l'acteur).
      try {
        await broadcastReadStatus(
          {
            io: fastify.socketIOHandler?.getManager?.()?.getIO(),
            prisma,
            readStatusService,
            privacyPreferencesService,
            bridgeService
          },
          {
            conversationId,
            participantId: membership.id,
            userId,
            isAnonymous,
            type: 'read'
          }
        );
      } catch (socketError) {
        logger.error('Erreur lors de la diffusion Socket.IO', socketError as Error);
      }

      return sendSuccess(reply, { markedCount: effectiveMarkedCount });

    } catch (error) {
      logger.error('Error marking messages as read', error as Error);
      return sendInternalError(reply, 'Erreur lors de la mise à jour du statut de lecture');
    }
  });

  /**
   * POST /conversations/:conversationId/mark-as-received
   * Marque tous les messages d'une conversation comme reçus
   * (L'utilisateur s'est connecté mais n'a pas encore ouvert la conversation)
   */
  fastify.post<{
    Params: ConversationParams;
  }>('/conversations/:conversationId/mark-as-received', {
    preValidation: [requiredAuth],
    preHandler: [validateParams(ConversationIdParamSchema), readReceiptWriteLimiter.middleware()]
  }, async (request, reply) => {
    try {
      const { conversationId: rawId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;
      // Un invité de lien partagé n'a pas de ligne `User` : ses préférences de
      // confidentialité sont les valeurs par défaut, pas une lecture en base
      // indexée sur un `Participant.id` pris pour un `User.id`.
      const isAnonymous = authRequest.authContext.isAnonymous === true;

      // Resolve identifier (e.g. "meeshy") → ObjectId
      const conversationId = await resolveConversationId(prisma, rawId);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation non trouvée');
      }

      // Vérifier l'accès à la conversation
      const membership = await resolveCallerParticipant(prisma, authRequest.authContext, conversationId);

      if (!membership) {
        return sendForbidden(reply, 'Accès non autorisé à cette conversation');
      }

      // #4179 — `markedCount` a désormais UNE définition dans tout ce fichier :
      // le nombre d'entrées RÉELLEMENT figées. Cette porte servait jusqu'ici le
      // compte de non-lus D'AVANT marquage (`getUnreadCount`) sous ce nom — or
      // « non lu » et « non reçu » sont deux ensembles distincts (un message
      // peut être livré depuis longtemps sans être lu), donc ce nombre pouvait
      // aussi bien sur-compter (aucune nouvelle livraison, mais des non-lus
      // déjà anciens restaient) que sous-compter (peu de non-lus, mais tout un
      // arriéré de livraison venait d'être rattrapé d'un coup). Il suffit de
      // relayer ce que `markMessagesAsReceived` a réellement figé — la requête
      // `getUnreadCount` qui précédait ce marquage est retirée, elle ne servait
      // plus qu'à produire ce nombre faux.
      const markedCount = await readStatusService.markMessagesAsReceived(membership.id, conversationId);

      // Les « received » (accusés de livraison) suivent aussi la préférence
      // `showReadReceipts` — c'est l'unité partagée qui la consulte, et qui
      // n'émet alors AUCUN badge : un `received` n'avance pas de curseur de
      // lecture, donc il n'y a pas d'arriéré à recaler.
      try {
        await broadcastReadStatus(
          {
            io: fastify.socketIOHandler?.getManager?.()?.getIO(),
            prisma,
            readStatusService,
            privacyPreferencesService,
            bridgeService
          },
          {
            conversationId,
            participantId: membership.id,
            userId,
            isAnonymous,
            type: 'received'
          }
        );
      } catch (socketError) {
        logger.error('Erreur lors de la diffusion Socket.IO', socketError as Error);
      }

      return sendSuccess(reply, { markedCount });

    } catch (error) {
      logger.error('Error marking messages as received', error as Error);
      return sendInternalError(reply, 'Erreur lors de la mise à jour du statut de réception');
    }
  });

  /**
   * POST /conversations/:conversationId/messages/:messageId/delivery-receipt
   *
   * Push-driven delivery acknowledgement. Called by the iOS Notification
   * Service Extension when an OFFLINE recipient receives a `new_message`
   * push: the extension holds no socket, so the gateway's online
   * auto-delivery path (`MessageHandler.autoDeliverToOnlineRecipients`)
   * never fires for that recipient and the author stays stuck on a single
   * checkmark. This endpoint marks the message delivered for the
   * authenticated recipient and broadcasts `read-status:updated` so the
   * author's checkmark upgrades from "sent" (✓) to "delivered" (✓✓)
   * without waiting for the recipient to open the app.
   *
   * Behaviour mirrors `mark-as-received`: the delivery cursor is always
   * advanced (keeps unread counts accurate), but the `read-status:updated`
   * broadcast is suppressed when the recipient disabled `showReadReceipts`.
   */
  fastify.post<{
    Params: DeliveryReceiptRouteParams;
  }>('/conversations/:conversationId/messages/:messageId/delivery-receipt', {
    preValidation: [requiredAuth],
    preHandler: [validateParams(DeliveryReceiptParamsSchema), readReceiptWriteLimiter.middleware()]
  }, async (request, reply) => {
    try {
      const { conversationId: rawId, messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;
      // Un invité de lien partagé n'a pas de ligne `User` : ses préférences de
      // confidentialité sont les valeurs par défaut, pas une lecture en base
      // indexée sur un `Participant.id` pris pour un `User.id`.
      const isAnonymous = authRequest.authContext.isAnonymous === true;

      // Resolve identifier (e.g. "meeshy") → ObjectId
      const conversationId = await resolveConversationId(prisma, rawId);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation non trouvée');
      }

      // Vérifier l'accès à la conversation
      const membership = await resolveCallerParticipant(prisma, authRequest.authContext, conversationId);

      if (!membership) {
        return sendForbidden(reply, 'Accès non autorisé à cette conversation');
      }

      // The message must exist and actually belong to this conversation —
      // reject a spoofed or cross-conversation messageId in the push payload.
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { conversationId: true, senderId: true, deletedAt: true }
      });

      if (!message || message.deletedAt || message.conversationId !== conversationId) {
        return sendNotFound(reply, 'Message non trouvé');
      }

      // A recipient never acknowledges delivery of their own message.
      if (message.senderId === membership.id) {
        return sendSuccess(reply, { message: 'Aucune action requise' });
      }

      // Marquer comme reçu (participantId, pas userId)
      await readStatusService.markMessagesAsReceived(
        membership.id,
        conversationId,
        messageId
      );

      // Le receipt ne part à l'auteur que si le destinataire autorise les
      // accusés — décision prise dans l'unité partagée. Le curseur, lui, a été
      // avancé juste au-dessus et l'est dans tous les cas.
      try {
        await broadcastReadStatus(
          {
            io: fastify.socketIOHandler?.getManager?.()?.getIO(),
            prisma,
            readStatusService,
            privacyPreferencesService,
            bridgeService
          },
          {
            conversationId,
            participantId: membership.id,
            userId,
            isAnonymous,
            type: 'received'
          }
        );
      } catch (socketError) {
        logger.error('Erreur lors de la diffusion Socket.IO', socketError as Error);
      }

      return sendSuccess(reply, { message: 'Message marqué comme livré' });

    } catch (error) {
      logger.error('Error processing delivery receipt', error as Error);
      return sendInternalError(reply, 'Erreur lors de la mise à jour du statut de livraison');
    }
  });
}
