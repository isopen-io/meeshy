import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { MessagingService } from '../../services/messaging/MessagingService';
import { createUnifiedAuthMiddleware } from '../../middleware/auth';
import { PrivacyPreferencesService } from '../../services/PrivacyPreferencesService';
import { ConversationBridgeService } from '../../services/ConversationBridgeService';

// Le fragment vit dans `utils/message-sender-select.ts` (partagé avec le delta
// `/sync`, qui ne peut pas importer ce module de routes) et reste ré-exporté ici
// pour les appelants historiques.
import { messageSenderUserSelect } from './utils/message-sender-select';
export { messageSenderUserSelect };

// #4284 — découpage par responsabilité : chaque route vit désormais dans un
// fichier frère (`messages-<surface>.ts`), et ce fichier ne fait plus que les
// enregistrer, DANS L'ORDRE ORIGINAL de déclaration (Fastify n'exige pas cet
// ordre pour des chemins distincts, mais `route-manifest.json` le reflète).
// `SendMessageBodySchema` et `buildAfterWatermarkClause` restent importables
// depuis CE fichier (tests + appelants historiques) via ré-export explicite.
import { registerMessagesListRoute } from './messages-list';
import { registerMarkReadRoute, registerMarkUnreadRoute } from './messages-read-status';
import { registerSendMessageRoute } from './messages-send';
import { registerMessagePinRoutes } from './messages-pin';
import { registerMessageViewOnceRoutes } from './messages-view-once';
import { registerMessageSearchRoute } from './messages-search';

export { SendMessageBodySchema } from './messages-send';
export { buildAfterWatermarkClause } from './messages-list-query';

/**
 * Enregistre les routes de base de gestion des messages (GET, POST, mark-read, mark-unread)
 */
export function registerMessagesRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  translationService: MessageTranslationService,
  optionalAuth: any,
  requiredAuth: any
) {
  // Authentification des routes de LECTURE (mark-read / read / mark-unread).
  //
  // `requiredAuth` porte `allowAnonymous: false` et sert tout le reste de ce
  // fichier ; le suivi de lecture est la seule famille qui ne peut pas
  // l'accepter. Un invité de lien partagé lit la conversation (`optionalAuth`
  // sur le GET), y envoie des messages (`optionalAuth` sur le POST) et y réagit
  // (`routes/reactions.ts`), mais se voyait refuser la seule opération qui
  // REMET SON BADGE À ZÉRO — et le serveur lui pousse pourtant ce badge
  // (`emitUnreadCountsToRecipients`, `ROOMS.user(userId ?? id)`). Son compteur
  // ne pouvait donc que monter.
  //
  // `requireAuth: true` reste : c'est « authentifié, avec ou sans compte », pas
  // `optionalAuth` (`requireAuth: false`), qui laisserait passer un appelant
  // sans jeton du tout. Le curseur de lecture est indexé sur `Participant.id`
  // depuis toujours : rien en aval ne suppose un `User`.
  const participantAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: true
  });

  const socketIOHandler = fastify.socketIOHandler;
  const privacyPreferencesService = new PrivacyPreferencesService(prisma);
  // G-123 — cf. la même attache aux trois portes de `routes/message-read-status.ts`.
  const bridgeService = new ConversationBridgeService(prisma);

  // `MessagingService` is stateless across requests, so it is built once and
  // reused. The POST /messages handler previously re-imported the module and
  // reconstructed the whole dependency graph (validator, processor,
  // AttachmentService, …) on every send — pure overhead on the send hot path.
  // Construction is lazy so `fastify.notificationService` is read only after
  // it has been decorated (decoration order vs route registration is not
  // guaranteed).
  let messagingService: MessagingService | undefined;
  function getMessagingService(): MessagingService {
    if (!messagingService) {
      messagingService = new MessagingService(
        prisma,
        translationService,
        fastify.notificationService
      );
    }
    return messagingService;
  }

  registerMessagesListRoute(fastify, prisma, optionalAuth);

  registerMarkReadRoute(fastify, prisma, participantAuth, {
    socketIOHandler,
    privacyPreferencesService,
    bridgeService
  });

  registerSendMessageRoute(fastify, prisma, optionalAuth, getMessagingService, socketIOHandler);

  registerMarkUnreadRoute(fastify, prisma, participantAuth);

  registerMessagePinRoutes(fastify, prisma, requiredAuth, socketIOHandler);

  registerMessageViewOnceRoutes(fastify, prisma, requiredAuth, socketIOHandler);

  registerMessageSearchRoute(fastify, prisma, optionalAuth);
}
