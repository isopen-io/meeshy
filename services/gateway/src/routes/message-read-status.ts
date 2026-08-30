/**
 * Les QUATRE portes historiques d'accusés de ce module sont désormais des
 * ADAPTATEURS de la collection unique (#4349, suivi de #4179).
 *
 * `POST /conversations/:conversationId/receipts` (écriture) et son jumeau en
 * lecture vivent dans `routes/conversations/receipts.ts`, avec les gardes
 * communes — appartenance du `messageId` à la conversation, anti-spoof
 * généralisé depuis `delivery-receipt`, plancher d'historique, cardinalité
 * bornée des deux côtés — et l'unique définition de `markedCount`.
 *
 * Ce fichier ne porte plus AUCUN calcul : il traduit des chemins et remet en
 * forme la charge utile historique que les clients décodent déjà. Les
 * gestionnaires et le dimensionnement du débit sont IMPORTÉS, jamais recopiés :
 * une fusion qui recopie un gestionnaire recrée le doublon qu'elle prétend
 * fermer. Même patron que `routes/me/categories.ts` face à
 * `routes/me/preferences/categories.ts` (#4359).
 *
 * `POST /conversations/:conversationId/mark-as-read` partage LITTÉRALEMENT son
 * gestionnaire avec `POST /conversations/:id/mark-read`
 * (`routes/conversations/messages.ts`) : `receiptHandlers(...).markReadAlias`,
 * la même référence de fonction servie aux deux adresses. C'est la duplication
 * exacte que #4179 avait relevée (« mêmes `MarkReadBodySchema`,
 * `markMessagesAsRead` et `broadcastReadStatus`, vérifié ») ; elle ne peut plus
 * diverger.
 */

import { FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../middleware/auth.js';
import { validateParams, validateQuery } from '../validation/helpers.js';
import {
  MessageIdParamSchema,
  ConversationIdParamSchema,
  ReadStatusesQuerySchema,
  DeliveryReceiptParamsSchema,
} from '../validation/message-read-status-schemas.js';
import {
  createReceiptWriteRateLimitConfig,
  receiptContext,
  receiptHandlers,
  type DeliveryReceiptAliasParams,
  type MessageReadStatusAliasParams,
  type ReadStatusesAliasQuery,
  type ReceiptParams,
} from './conversations/receipts.js';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'MessageReadStatusRoutes' });

export default async function messageReadStatusRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  if (!prisma) {
    logger.error('Missing required service: prisma');
    return;
  }

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
  // conversation. Le badge d'un invité ne pouvait donc que monter.
  const requiredAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: true,
  });

  const handlers = receiptHandlers(receiptContext(fastify, prisma));

  // Le débit des écritures — 120/min par COMPTE, `hook: 'preHandler'`, sans
  // bypass `isLocalIp`. UN seul dimensionnement pour les cinq portes
  // d'écriture ; voir `createReceiptWriteRateLimitConfig` pour pourquoi le hook
  // n'est pas un détail (sans lui, la clé `user:` est une fiction qui compte
  // par adresse partagée).
  const receiptWriteRateLimit = { rateLimit: createReceiptWriteRateLimitConfig() };

  /**
   * GET /messages/:messageId/read-status — ADAPTATEUR.
   * Agrégat nominatif d'UN message. Successeur : `detail=summary` sur la
   * collection (#4179 c.9, migration CLIENT — hors territoire de #4349).
   */
  fastify.get<{ Params: MessageReadStatusAliasParams }>(
    '/messages/:messageId/read-status',
    {
      preValidation: [requiredAuth],
      preHandler: [validateParams(MessageIdParamSchema)],
    },
    handlers.messageReadStatusAlias
  );

  /**
   * GET /conversations/:conversationId/read-statuses — ADAPTATEUR.
   * `detail=summary` de la collection, remis dans sa forme historique : la
   * carte NUE `messageId → agrégat`, sans l'enveloppe `{ detail, messageIds }`.
   */
  fastify.get<{ Params: ReceiptParams; Querystring: ReadStatusesAliasQuery }>(
    '/conversations/:conversationId/read-statuses',
    {
      preValidation: [requiredAuth],
      preHandler: [validateParams(ConversationIdParamSchema), validateQuery(ReadStatusesQuerySchema)],
    },
    handlers.conversationReadStatusesAlias
  );

  /**
   * POST /conversations/:conversationId/mark-as-read — ADAPTATEUR.
   * MÊME référence de gestionnaire que `POST /conversations/:id/mark-read`.
   */
  fastify.post<{ Params: ReceiptParams }>(
    '/conversations/:conversationId/mark-as-read',
    {
      config: receiptWriteRateLimit,
      preValidation: [requiredAuth],
      preHandler: [validateParams(ConversationIdParamSchema)],
    },
    handlers.markReadAlias
  );

  /**
   * POST /conversations/:conversationId/mark-as-received — ADAPTATEUR.
   * `type: 'received'` : le curseur de LIVRAISON pour toute la conversation.
   */
  fastify.post<{ Params: ReceiptParams }>(
    '/conversations/:conversationId/mark-as-received',
    {
      config: receiptWriteRateLimit,
      preValidation: [requiredAuth],
      preHandler: [validateParams(ConversationIdParamSchema)],
    },
    handlers.markReceivedAlias
  );

  /**
   * POST /conversations/:conversationId/messages/:messageId/delivery-receipt —
   * ADAPTATEUR. `type: 'delivered'` : la forme PAR MESSAGE de `received`,
   * appelée par l'extension de notification iOS pour un destinataire HORS LIGNE
   * (l'extension ne tient aucun socket, donc l'auto-livraison en ligne du
   * gateway ne part jamais pour lui et l'auteur reste bloqué sur une coche).
   *
   * C'est l'anti-spoof de CETTE porte — le `messageId` appartient à la
   * conversation et n'est pas de l'appelant — qui a été généralisé aux cinq
   * écritures, plutôt qu'une garde inventée.
   */
  fastify.post<{ Params: DeliveryReceiptAliasParams }>(
    '/conversations/:conversationId/messages/:messageId/delivery-receipt',
    {
      config: receiptWriteRateLimit,
      preValidation: [requiredAuth],
      preHandler: [validateParams(DeliveryReceiptParamsSchema)],
    },
    handlers.deliveryReceiptAlias
  );
}
