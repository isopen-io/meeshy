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

import { FastifyInstance, FastifyRequest } from 'fastify';
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
import { depreciee, type AdresseDepreciee } from '../utils/deprecation.js';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'MessageReadStatusRoutes' });

// ── #4423 — QUATRE des cinq portes DISENT enfin qu'elles sont en sursis ───────
/**
 * Posée en `onRequest` — donc AVANT `preValidation`/`preHandler`/le débit —
 * l'annonce part sur TOUTE réponse, succès (200) comme refus
 * (401/403/404/429) : c'est l'ADRESSE qui est en sursis, pas son seul chemin
 * heureux (même doctrine que `conversations/sharing.ts`, voir
 * `conversation-links-deprecation.test.ts`). Aucun `Sunset` : le retrait réel
 * se décide sur le compteur d'accès (#4275), jamais sur une date posée ici —
 * même doctrine que `me/permissions` et `me/categories` (livrées la même nuit).
 *
 * La CINQUIÈME, `GET /messages/:messageId/read-status`, N'ANNONCE RIEN — voir
 * son propre doc-comment plus bas (§ « NE PORTE PAS d'annonce ») : c'est la
 * seule des six portes sans `conversationId` nulle part sur la requête, et un
 * `Link` en gabarit désinforme plus qu'il n'informe.
 */
const DEPUIS_ALIAS_RECEIPTS = '2026-08-30';

/**
 * Les TROIS écritures dont le `type` d'accusé est enfermé dans le CHEMIN
 * historique (« mark-as-read », « mark-as-received », « delivery-receipt »)
 * pointent le MÊME successeur : la collection lit `type` dans le CORPS,
 * jamais dans l'URL — comme `ANNONCE_ALIAS_FRIENDS.agir` (`routes/friends.ts`)
 * le fait déjà pour accepter/refuser une demande d'ami. `messageId` (sur
 * `delivery-receipt`) voyage de même façon, dans `messageIds` du corps.
 */
const successeurReceiptsEcriture = (request: FastifyRequest): string =>
  `/api/v1/conversations/${encodeURIComponent((request.params as ReceiptParams).conversationId)}/receipts`;
const ANNONCE_RECEIPTS_ECRITURE: AdresseDepreciee = {
  depuis: DEPUIS_ALIAS_RECEIPTS,
  successeur: successeurReceiptsEcriture,
};

/** `detail=summary` est un paramètre de QUERY sur la collection : il voyage dans le `Link`. */
const ANNONCE_READ_STATUSES: AdresseDepreciee = {
  depuis: DEPUIS_ALIAS_RECEIPTS,
  successeur: (request) =>
    `/api/v1/conversations/${encodeURIComponent((request.params as ReceiptParams).conversationId)}/receipts?detail=summary`,
};

/**
 * `GET /messages/:messageId/read-status` NE PORTE PAS d'annonce, et c'est
 * mesuré, pas oublié (revue #4423, suivi de la garde
 * `deprecated-alias-headers-guard.test.ts` § « un successeur en gabarit
 * n'indique aucune migration »).
 *
 * Cette porte est la SEULE des six sans `conversationId` — ni dans son
 * chemin, ni dans une query validée (`MessageIdParamSchema` est `.strict()`,
 * `messageId` seul), ni dans un en-tête (aucune convention `X-Conversation-*`
 * dans ce dépôt), ni posé par un hook antérieur (`onRequest` est le PREMIER
 * hook du cycle Fastify — rien ne s'exécute avant lui). Le résoudre exigerait
 * une lecture Mongo DANS `onRequest`, sur une route chaude, ce que ce lot
 * exclut explicitement.
 *
 * `AdresseDepreciee.successeur` est REQUIS (`utils/deprecation.ts`,
 * non optionnel) : `depreciee`/`annoncerDepreciation` composent
 * INCONDITIONNELLEMENT un en-tête `Link` depuis lui — il n'existe aujourd'hui
 * AUCUNE forme « `Deprecation` sans `Link` ». Un premier essai a servi
 * `:conversationId` en clair dans le `Link` (« la collection, filtrée à CE
 * message, `:conversationId` restant à la charge de l'appelant qui le connaît
 * déjà ») ; la garde élargie l'a refusé, à raison — un `Link` que le client ne
 * peut pas suivre tel quel désinforme plus qu'il n'informe (`Deprecation`
 * SANS successeur suivable serait honnête ; un GABARIT qui a l'air résolu ne
 * l'est pas). Deux issues restent ouvertes pour qui voudrait annoncer CETTE
 * porte proprement : élargir `utils/deprecation.ts` pour qu'un
 * `AdresseDepreciee` sans `successeur` pose `Deprecation` seul (hors
 * territoire de #4423 — fichier `utils/`), ou constater qu'aucun client ne
 * l'appelle (mesuré au moment de #4423 : zéro appelant REST dans `apps/`,
 * `packages/MeeshySDK/`) et la retirer plutôt que l'annoncer.
 */

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
   * GET /messages/:messageId/read-status — ADAPTATEUR, SANS annonce de
   * dépréciation — décision mesurée, voir le doc-comment ci-dessus (§ « NE
   * PORTE PAS d'annonce »). `detail=summary` sur la collection reste sa
   * cible conceptuelle (#4179 c.9, migration CLIENT — hors territoire de
   * #4349) ; ce lot (#4423) n'a simplement trouvé aucun moyen HONNÊTE de la
   * faire suivre par un `Link`.
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
      onRequest: depreciee(ANNONCE_READ_STATUSES),
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
      onRequest: depreciee(ANNONCE_RECEIPTS_ECRITURE),
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
      onRequest: depreciee(ANNONCE_RECEIPTS_ECRITURE),
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
      onRequest: depreciee(ANNONCE_RECEIPTS_ECRITURE),
      config: receiptWriteRateLimit,
      preValidation: [requiredAuth],
      preHandler: [validateParams(DeliveryReceiptParamsSchema)],
    },
    handlers.deliveryReceiptAlias
  );
}
