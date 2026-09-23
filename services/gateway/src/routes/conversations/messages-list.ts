/**
 * Surface LISTE DES MESSAGES (issue #4284 — découpage de `messages.ts`, 2945
 * lignes, en fichiers frères par responsabilité). Porte la route
 * `GET /conversations/:id/messages` (pagination offset / curseur `before` /
 * fenêtre `around` / watermark `after`, plancher d'historique, masquage
 * personnel, Prisme linguistique, statuts de lecture, enrichissement
 * transfert et citation de post). Les AIDES de ce handler (construction du
 * `select`, chargement des accusés, sérialisation d'une ligne, enrichissement
 * transfert/citation) vivent dans `messages-list-query.ts` — ce fichier
 * garde le handler à sa place et appelle ces aides, dans l'ordre où le code
 * les exécutait avant le découpage. Voir `messages.ts` pour le composeur
 * (`registerMessagesRoutes`), qui appelle `registerMessagesListRoute`.
 */
import { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import type { MentionedUser } from '@meeshy/shared/types';
import { sharedPlaceFromMetadata } from '../../services/location/sharedPlace';
import { stickerFromMetadata } from '../../services/stickers/messageSticker';
import {
  HISTORY_FLOOR_PARTICIPANT_SELECT,
  applyHistoryFloor,
  historyFloorFor
} from '../../services/historyFloor';
import { shareLinkHasExpired } from '../../services/shareLinkReadGate';
import { resolveUserLanguage } from '@meeshy/shared/utils/conversation-helpers';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import {
  loadPersonalHistoryHiding,
  applyPersonalHistoryHiding,
  NO_PERSONAL_HIDING
} from '../../services/personalHistoryFilter';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { validatePagination, buildPaginationMeta } from '../../utils/pagination';
import {
  messageSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import {
  refuserAccesConversation,
  verdictAccesConversation,
  type MessagesDeRefusDAcces
} from './utils/access-control';
import { resolveMentionedUsers } from '../../services/MentionService';
import type {
  ConversationParams,
  MessagesQuery
} from './types';
import { sendBadRequest, sendForbidden, sendInternalError } from '../../utils/response.js';
import { sendWithETag } from '../../utils/etag';
import type { PaginationMeta } from '../../utils/pagination';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { presenceMissingEntryPolicy, viewerFromRequest } from '../users/presence-gate';
import { logger } from './messages-shared';
import { withOrphanedSenderRepair } from '../../services/messaging/withOrphanedSenderRepair';
import {
  backfillCitedAttachments,
  type MessageRattrapable,
} from '../../services/messaging/citedAttachmentBackfill';
import {
  resolveCollectionView,
  resolveSearchMessageIds
} from './messages-list-views';
import { MESSAGES_LIST_PAGINATION, messagesListQuerystringSchema } from './messages-querystring';
import {
  buildAfterWatermarkClause,
  buildMessageListSelect,
  loadCurrentUserConsumptionMap,
  loadMessageReadStatusMap,
  mapMessageRowForList,
  enrichForwardedMessagesForList,
  enrichPostReplyMessagesForList,
  parseLanguageFilterParam
} from './messages-list-query';
import type { RawMessageRow } from './messages-list-query-types';
import {
  isEphemeralServableToReader,
  loadEphemeralReaderDeadlines,
} from './ephemeralReaderDeadlines';
import { loadViewOnceReaderStates, projectViewOnceForReader } from '../../services/messaging/viewOnceAudience';

/**
 * LES DEUX REFUS DE CETTE ROUTE NE SONT PAS LE MÊME REFUS (#4792).
 *
 * `nonMembre` garde MOT POUR MOT la phrase que la route servait déjà — un
 * refus d'AUTORISATION, correct en 403. Ce qui change est qu'une session
 * ABSENTE ou MORTE ne le reçoit plus : elle n'a jamais été un refus de droit,
 * et cette route est montée en `optionalAuth` (`{ requireAuth: false,
 * allowAnonymous: true }`, `routes/conversations/index.ts`), une garde qui ne
 * refuse RIEN — c'est donc bien ici que ça se tranche, et le cas nominal d'un
 * retour après quelques jours arrivait jusque là.
 */
const REFUS_DE_LECTURE: MessagesDeRefusDAcces = {
  sansSession: 'Authentication required to read this conversation',
  nonMembre: 'Unauthorized access to this conversation'
};

/**
 * Enregistre la route de liste paginée des messages d'une conversation.
 */
export function registerMessagesListRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any
) {
  fastify.get<{
    Params: ConversationParams;
    Querystring: MessagesQuery;
  }>('/conversations/:id/messages', {
    schema: {
      description: 'Get paginated messages from a conversation with optional cursor-based pagination',
      tags: ['conversations', 'messages'],
      summary: 'Get conversation messages',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      querystring: messagesListQuerystringSchema,
      response: {
        200: {
          type: 'object',
          description: 'MessagesListResponse - aligned with @meeshy/shared/types/api-responses.ts',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              description: 'Array of messages directly',
              items: messageSchema
            },
            pagination: {
              type: 'object',
              description: 'Pagination metadata',
              properties: {
                total: { type: 'integer', description: 'Total number of messages in conversation' },
                offset: { type: 'integer', description: 'Current offset' },
                limit: { type: 'integer', description: 'Page size limit' },
                hasMore: { type: 'boolean', description: 'Whether more messages are available' }
              }
            },
            cursorPagination: {
              type: 'object',
              description: 'Cursor pagination metadata (always present; authoritative for before/around modes). Must stay declared: fast-json-stringify strips undeclared fields, which silently killed client infinite scroll.',
              properties: {
                limit: { type: 'integer', description: 'Page size limit' },
                hasMore: { type: 'boolean', description: 'Whether a further page exists — older messages in backward/around modes, newer ones in forward `after` mode' },
                nextCursor: { type: ['string', 'null'], description: 'Message id to pass as `before` for the next page. Null when the page is empty, and always null in forward `after` mode: that mode resumes from the client-held `createdAt` watermark, never from a backward id cursor.' }
              }
            },
            hasNewer: { type: 'boolean', description: 'Around mode only: whether messages newer than the returned window exist' },
            meta: {
              type: 'object',
              description: 'Response metadata',
              properties: {
                userLanguage: { type: 'string', description: 'User preferred language for translations' },
                mentionedUsers: {
                  type: 'array',
                  description: 'Users @-mentioned in the returned messages',
                  items: {
                    type: 'object',
                    properties: {
                      userId: { type: 'string' },
                      username: { type: 'string' },
                      displayName: { type: ['string', 'null'] },
                      avatar: { type: ['string', 'null'] }
                    }
                  }
                }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    const reqStart = performance.now();
    const timings: Record<string, number> = {};
    try {
      const { id } = request.params;
      const {
        limit: limitStr = String(MESSAGES_LIST_PAGINATION.defaultLimit),
        offset: offsetStr = '0',
        before,
        after,
        around,
        replyToId,
        view,
        parentId,
        q,
        include_translations: includeTranslationsStr = 'true',
        include_replies: includeRepliesStr = 'true',
        languages: languagesStr
      } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Parser les paramètres optionnels d'inclusion
      const includeTranslations = includeTranslationsStr === 'true';
      const includeReplies = includeRepliesStr === 'true';

      // Bandwidth opt-in : filtrage des traductions (texte + audio) aux seules
      // langues du Prisme demandées par le client. Voir `parseLanguageFilterParam`
      // (canonicalisation SSOT, symétrique du chemin socket).
      const languageFilter = parseLanguageFilterParam(languagesStr);
      const hasLanguageFilter = !!languageFilter && languageFilter.length > 0;

      // Forward watermark mode (local-first incremental gap backfill): fetch
      // messages created strictly after the client's high-water mark, oldest
      // first. Only active when not already paging backwards (before) or
      // jumping to a search hit (around). Treated like a cursor read — no
      // total COUNT, no offset pagination.
      const afterClause = (!before && !around) ? buildAfterWatermarkClause(after) : null;
      const afterMode = afterClause !== null;

      // Valider et parser les paramètres de pagination
      const { offset, limit } = validatePagination(offsetStr, limitStr, MESSAGES_LIST_PAGINATION);

      // Résoudre l'ID de conversation réel
      let t0 = performance.now();
      const conversationId = await resolveConversationId(prisma, id);
      timings.resolveConversationId = performance.now() - t0;
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Vérifier les permissions d'accès
      t0 = performance.now();
      const acces = await verdictAccesConversation(prisma, authRequest.authContext, conversationId, id);
      timings.canAccessConversation = performance.now() - t0;

      if (acces.genre !== 'ok') {
        return refuserAccesConversation(reply, acces, REFUS_DE_LECTURE);
      }

      // Resolve the current user's participantId in this conversation
      t0 = performance.now();
      const isAnonymousUser = authRequest.authContext.type === 'anonymous';

      // Ce que CE lecteur a retiré de sa propre vue : le curseur `clear-history`
      // de la conversation et ses `delete-for-me` message par message. Lancé
      // ICI, avant la résolution du participant, et attendu seulement au moment
      // de bâtir la clause — il ne dépend d'aucune des requêtes qui suivent, et
      // les recouvrir lui fait coûter zéro aller-retour sur le chemin le plus
      // chaud du service. Appliqué ensuite à TOUTES les requêtes de cette route
      // (page, COUNT total, sous-requêtes du mode `around`, compteurs
      // older/newer) : un seul oubli suffirait à faire réapparaître un message
      // masqué, soit dans la liste, soit dans un compteur qui promet une page
      // de plus.
      // Le `.catch` n'est pas redondant avec le try/catch interne du module :
      // entre cette ligne et son `await` il y a un `return` (lien de partage
      // échu) après lequel cette promesse n'est plus
      // attendue. « Le callee avale ses erreurs » est une propriété du
      // collaborateur, pas une garantie du site d'appel — cf. `tasks/lessons.md`
      // § Leçon 230.
      const personalHidingPromise = loadPersonalHistoryHiding(prisma, {
        userId: isAnonymousUser ? null : userId,
        conversationId
      }).catch(() => NO_PERSONAL_HIDING);
      const currentParticipant = !isAnonymousUser && userId
        ? await prisma.participant.findFirst({
            where: { userId, conversationId, isActive: true },
            select: { id: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT }
          })
        : null;

      // For anonymous users, also fetch joinedAt and shareLinkId
      const anonymousParticipant = isAnonymousUser && authRequest.authContext.participantId
        ? await prisma.participant.findFirst({
            where: { id: authRequest.authContext.participantId },
            select: { id: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT }
          })
        : null;

      timings.resolveParticipant = performance.now() - t0;
      const currentParticipantId = isAnonymousUser
        ? authRequest.authContext.participantId
        : currentParticipant?.id;

      // Le lien de partage répond ici à DEUX questions distinctes sur la même
      // ligne : la PORTE (lien échu → 403) et le PLANCHER de lecture. Elles
      // restent séparées — la décision de réponse appartient à la route, le
      // plancher est rendu par `historyFloorFor`, qui l'énonce aussi pour
      // `/sync` (forme ensembliste) et pour la galerie de médias.
      // Un seul aller-retour : le module ne charge rien, cette route lit déjà
      // la ligne pour la colonne de la porte.
      //
      // #4827 — `maxUses` N'EST PLUS une de ces colonnes. `currentUses` compte
      // des ADMISSIONS et le prouve par son unique incrément (`claimLinkUse`,
      // `routes/conversations/link-admission.ts`) : une « use » EST une entrée.
      // Le relire ICI faisait d'un compteur d'entrées une garde de PERMISSION
      // — deux notions qu'aucune ligne ne relie — et refusait le fil au DERNIER
      // admis, dont c'est justement l'admission qui vient de remplir le lien :
      // un lien `maxUses:1` était illisible par son unique invité. La borne
      // reste ENTIÈRE côté admission (`services/conversations/linkAdmission.ts`
      // puis le `WHERE` atomique de `claimLinkUse`). Les deux compteurs sortent
      // aussi de la PROJECTION : une colonne qu'on ne sert plus et qui ne
      // décide plus n'a pas à rester à portée de main d'une relecture.
      const participant = isAnonymousUser ? anonymousParticipant : currentParticipant;
      const shareLink = participant?.shareLinkId
        ? await prisma.conversationShareLink.findFirst({
            where: { id: participant.shareLinkId },
            select: { allowViewHistory: true, expiresAt: true }
          })
        : null;
      if (shareLinkHasExpired(shareLink)) {
        return sendForbidden(reply, 'This share link has expired', { code: 'SHARE_LINK_EXPIRED' });
      }
      // Le plancher vaut pour TOUT participant, lien ou non : un membre ajouté
      // après coup, un inscrit dans le salon global, un octroi par date d'un
      // administrateur — la ligne participant porte la réponse, le lien n'est
      // que son dernier repli.
      const historyStartDate: Date | null = participant ? historyFloorFor(participant, shareLink) : null;

      t0 = performance.now();
      const personalHiding = await personalHidingPromise;
      timings.personalHiding = performance.now() - t0;

      // #4340 — la SOUS-COLLECTION lue. Résolue APRÈS toutes les portes
      // (appartenance, lien de partage échu) : un refus de VALIDATION ne se
      // sert jamais avant un refus de DROIT, sans quoi les quatre vues
      // n'auraient plus le même ordre de gardes — ce que ce lot promet
      // précisément.
      //
      // `?replyToId=` (#4177) reste le moyen historique de demander le fil d'un
      // message : il désigne la MÊME sous-collection que `view=thread`, et
      // `resolveCollectionView` en fait un `predicate` identique.
      // `ThreadRepliesLoader.swift` l'envoie en production ; il n'y a rien à
      // migrer côté client.
      const vue = resolveCollectionView({ view, parentId, replyToId, q });
      if (vue.genre === 'refus') {
        return sendBadRequest(reply, vue.message, { code: 'INVALID_VIEW' });
      }

      // Construire la requête avec pagination
      const whereClause: Prisma.MessageWhereInput = {
        conversationId: conversationId, // Utiliser l'ID résolu
        deletedAt: null,
        // Le prédicat de la vue s'AJOUTE, il ne remplace rien — et il est posé
        // à l'identique sur le COUNT plus bas : un prédicat appliqué à la page
        // et pas au total est le défaut que #4177 a corrigé pour `replyToId`,
        // où `hasMore` promettait des pages qu'aucune requête ne pouvait servir.
        ...vue.predicate
      };

      // Apply history restriction if share link disallows viewing history
      if (historyStartDate) {
        whereClause.createdAt = { gte: historyStartDate };
      }

      // Forward watermark filter: createdAt > after (merged with any history gte).
      if (afterMode && afterClause) {
        // `createdAt` n'a jamais porté qu'un filtre objet à ce stade (jamais
        // un littéral `Date`/`string`) — narrowing local pour permettre le
        // spread, que l'union déclarée par `Prisma.MessageWhereInput` interdit.
        const priorCreatedAt = whereClause.createdAt as Prisma.DateTimeFilter | undefined;
        whereClause.createdAt = { ...priorCreatedAt, ...afterClause.createdAt };
      }

      if (before) {
        // Pagination par curseur (pour défilement historique).
        //
        // Oracle d'horodatage fermé (#4177) : sans scope de conversation, un
        // `messageId` volé à un AUTRE fil — accessible ou non à l'appelant —
        // était accepté comme curseur, et son `createdAt` RÉEL bornait cette
        // page : la route révélait ainsi l'instant d'un message qu'elle n'a
        // jamais autorisé à lire. Le mode `around`, plus bas dans ce même
        // handler, scope déjà correctement sa résolution
        // (`applyHistoryFloor({ id: around, conversationId }, …)`) — les deux
        // curseurs de la même route doivent se comporter pareil ici.
        const beforeMessage = await prisma.message.findFirst({
          where: { id: before, conversationId },
          select: { createdAt: true }
        });

        if (beforeMessage) {
          const priorCreatedAt = whereClause.createdAt as Prisma.DateTimeFilter | undefined;
          whereClause.createdAt = {
            ...priorCreatedAt,
            lt: beforeMessage.createdAt
          };
        }
      }


      // Handle "around" mode: load messages around a specific message
      //
      // #4340 — honoré pour la chronologie et le fil seulement (`allowsAround`).
      // La fenêtre construit une liste d'identifiants sans connaître le prédicat
      // de la vue : sur `view=pinned` elle remplirait ses deux moitiés de
      // messages non épinglés puis les perdrait au filtrage — une fenêtre qui
      // rend moins que demandé sans le dire — et sur `view=search` elle
      // écraserait la case `id` que la recherche occupe déjà.
      let isAroundMode = false;
      if (around && !before && vue.allowsAround) {
        isAroundMode = true;
        // La cible n'entre dans la fenêtre que si elle est LISIBLE : sous le
        // plancher, `around` se comporte comme un id inconnu.
        const aroundMessage = await prisma.message.findFirst({
          where: applyHistoryFloor({ id: around, conversationId }, historyStartDate),
          select: { createdAt: true }
        });

        if (aroundMessage) {
          // Get half before and half after the target message
          const halfLimit = Math.floor(limit / 2);

          const beforeFilter: Prisma.DateTimeFilter = { lt: aroundMessage.createdAt };
          if (historyStartDate) beforeFilter.gte = historyStartDate;

          // Les deux moitiés sont filtrées ICI et pas seulement à la fin : sans
          // cela, `take: halfLimit` remplirait sa moitié de messages masqués
          // que la soustraction finale retirerait, et la fenêtre `around`
          // rendrait moins de messages que demandé sans jamais le dire.
          const [messagesBefore, messagesAfter] = await Promise.all([
            prisma.message.findMany({
              where: applyPersonalHistoryHiding(
                { conversationId, deletedAt: null, createdAt: beforeFilter },
                personalHiding
              ),
              orderBy: { createdAt: 'desc' },
              take: halfLimit,
              select: { id: true }
            }),
            prisma.message.findMany({
              where: applyPersonalHistoryHiding(
                { conversationId, deletedAt: null, createdAt: { gt: aroundMessage.createdAt } },
                personalHiding
              ),
              orderBy: { createdAt: 'asc' },
              take: halfLimit,
              select: { id: true }
            })
          ]);

          const allIds = [
            ...messagesBefore.map(m => m.id),
            around,
            ...messagesAfter.map(m => m.id)
          ];
          whereClause.id = { in: allIds };
          // Remove any createdAt filter since we're using id-based filtering —
          // sauf le plancher, qui ne se retire jamais d'une lecture.
          delete whereClause.createdAt;
          if (historyStartDate) whereClause.createdAt = { gte: historyStartDate };
        }
      }

      // #4340 — `view=search` : le prédicat n'est PAS exprimable en une clause
      // Prisma (`Message.translations` est une carte Mongo qu'aucun opérateur ne
      // fouille), donc il se résout en amont, en un ensemble d'identifiants —
      // exactement la case `id: { in: [...] }` que le mode `around` occupe déjà.
      // Les deux requêtes de résolution reçoivent `whereClause`, donc le
      // plancher ET le curseur ; le masquage personnel leur est appliqué chez
      // elles. C'est là que se joue la garde : la recherche rend un message par
      // son CONTENU, donc en connaître un mot suffit à atteindre un historique
      // qu'on n'a pas le droit de lire.
      const searchTerm = vue.searchTerm;
      const searchMode = searchTerm !== undefined;
      if (searchTerm !== undefined) {
        whereClause.id = {
          in: await resolveSearchMessageIds(prisma, {
            base: whereClause,
            hiding: personalHiding,
            term: searchTerm,
            wanted: offset + limit + 1
          })
        };
      }

      const messageSelect: Prisma.MessageSelect = buildMessageListSelect({ includeTranslations, includeReplies });

      // ===== OPTIMISATION: Exécuter les requêtes en parallèle =====
      // Évite le problème N+1 séquentiel (count -> messages -> user)
      const shouldFetchUserPrefs = authRequest.authContext.isAuthenticated && !isAnonymousUser;

      t0 = performance.now();
      const personalWhereClause = applyPersonalHistoryHiding(whereClause, personalHiding);

      const [totalCount, rawMessages, userPrefs] = await Promise.all([
        // 1. Compter le total des messages (pour pagination) - skip when using cursor, around, or forward watermark
        (before || isAroundMode || afterMode || searchMode)
          ? Promise.resolve(0)
          : prisma.message.count({
              where: applyPersonalHistoryHiding(
                applyHistoryFloor(
                  // Même prédicat de vue que la page (#4177, généralisé par
                  // #4340) : sans lui, le total d'un `?replyToId=` comptait
                  // TOUTE la conversation au lieu des seules réponses —
                  // `hasMore` aurait promis des pages de plus qu'aucune
                  // requête suivante ne peut servir. Vaut identiquement pour
                  // `view=pinned`. La recherche, elle, ne compte pas : son
                  // ensemble est déjà borné, et `GET .../messages/search` ne
                  // sert pas non plus de `pagination`.
                  { conversationId: conversationId, deletedAt: null, ...vue.predicate },
                  historyStartDate
                ),
                personalHiding
              )
            }),
        // 2. Récupérer les messages avec toutes les relations. Un expéditeur
        // disparu faisait rejeter la page ENTIÈRE en 500 (#6501) : la lecture
        // répare la conversation, puis se rejoue UNE fois.
        withOrphanedSenderRepair({ prisma, conversationIds: [conversationId] }, () => prisma.message.findMany({
          where: personalWhereClause,
          select: messageSelect,
          // Forward watermark backfill returns oldest-after-watermark first so
          // the client can advance its high-water mark contiguously; all other
          // modes return newest-first.
          // `view=pinned` se lit par DATE D'ÉPINGLE, comme
          // `GET .../pinned-messages` — jamais par date d'écriture.
          orderBy: afterMode ? { createdAt: 'asc' } : vue.orderBy,
          // Cursor reads (before / after): fetch limit+1 to MEASURE hasMore
          // without an extra COUNT query. The probe row is trimmed before
          // returning to the client. `after` was sized to `limit` and inferred
          // hasMore from `length === limit`, which cannot tell an exactly-full
          // FINAL page from a truncated one — every backfill that landed on the
          // boundary claimed more and cost the client a round trip to disprove.
          take: (before || isAroundMode || afterMode || searchMode) ? limit + 1 : limit,
          skip: (before || isAroundMode || afterMode) ? 0 : offset
        })),
        // 3. Récupérer les préférences linguistiques (si authentifié)
        shouldFetchUserPrefs
          ? prisma.user.findFirst({
              where: { id: userId },
              select: {
                systemLanguage: true,
                regionalLanguage: true,
                customDestinationLanguage: true,
                deviceLocale: true
              }
            })
          : Promise.resolve(null)
      ]);
      timings.mainQuery = performance.now() - t0;

      // Le `select` de cette route est composé DYNAMIQUEMENT
      // (`buildMessageListSelect`, selon includeTranslations/includeReplies) :
      // Prisma ne peut donc pas dériver un type de ligne unique de ce `select`.
      // `RawMessageRow` nomme le plancher que ce handler et
      // `messages-list-query.ts` lisent réellement (même patron que
      // `MessageProtectionContext`/`MessageProtectionFields`,
      // `routes/admin/media-protection.ts`) — cast unique, ici, plutôt qu'un
      // `any` répété à chaque site d'usage.
      const messages = rawMessages as unknown as RawMessageRow[];

      // #4177 — travail mort retiré : ce bloc calculait `currentUserReactions`
      // (message-level, via `reaction.findMany`) ET `currentUserConsumption`
      // (par pièce jointe, via `attachmentStatusEntry.findMany`) — deux
      // requêtes Prisma PAR PAGE — puis les deux valeurs étaient
      // SUPPRIMÉES À LA SÉRIALISATION : ni `messageSchema` ni
      // `messageAttachmentSchema` ne les déclarent, donc fast-json-stringify
      // les retirait avant que le moindre client ne les reçoive. Même sort
      // pour `messageSelect.reactions` (bloc `include_reactions`, retiré plus
      // haut) : un TROISIÈME travail — jusqu'à 20 réactions brutes par
      // message — payé pour un champ tout aussi non déclaré. Les trois
      // partaient à la même sérialisation, invisibles depuis toujours.
      // Réintroduire l'un de ces trois calculs exige de le déclarer AUSSI
      // dans le schéma partagé (`packages/shared/types/api-schemas.ts`,
      // hors territoire de ce correctif) — sans quoi il reste mort.

      // Déterminer la langue préférée de l'utilisateur
      const userPreferredLanguage = userPrefs
        ? resolveUserLanguage(userPrefs, { deviceLocale: userPrefs.deviceLocale ?? undefined })
        : 'fr';

      // DEBUG: Log détaillé pour vérifier les transcriptions audio
      // Diagnostic audio verbeux (par message + par attachment) : coûteux sur ce
      // hot-path (GET messages). Gardé derrière LOG_AUDIO_DIAG=true — OFF par
      // défaut en prod. La boucle entière est court-circuitée quand désactivé.
      if (process.env.LOG_AUDIO_DIAG === 'true' && messages.length > 0) {
        logger.debug(`audio-diag: loading ${messages.length} messages for conversation ${conversationId}`);

        // Compter les messages avec attachments audio
        let audioAttachmentCount = 0;
        let audioWithTranscriptionCount = 0;
        let audioWithTranslatedAudiosCount = 0;

        messages.forEach((msg) => {
          if (msg.attachments && msg.attachments.length > 0) {
            msg.attachments.forEach((att) => {
              // Vérifier si c'est un audio
              if (att.mimeType && att.mimeType.startsWith('audio/')) {
                audioAttachmentCount++;

                // Vérifier si l'audio a une transcription
                if (att.transcription) {
                  audioWithTranscriptionCount++;
                  const rawTranscriptionText = att.transcription.text || att.transcription.transcribedText || '';
                  const transcriptionText = rawTranscriptionText ? `${rawTranscriptionText.substring(0, 50)}...` : '(vide)';

                  // Vérifier speakerAnalysis AVANT nettoyage
                  let speakerAnalysisInfo = '';
                  if (att.transcription.speakerAnalysis) {
                    const speakers = att.transcription.speakerAnalysis.speakers || [];
                    const withVoiceChars = speakers.filter((s) => s.voiceCharacteristics).length;
                    speakerAnalysisInfo = ` | speakerAnalysis: ${speakers.length} speaker(s), voiceChars: ${withVoiceChars}/${speakers.length}`;
                    if (withVoiceChars > 0) {
                      const firstSpeaker = speakers.find((s) => s.voiceCharacteristics);
                      speakerAnalysisInfo += `, firstSpeaker: sid=${firstSpeaker.sid}, pitch=${firstSpeaker.voiceCharacteristics.pitch?.mean_hz}Hz, gender=${firstSpeaker.voiceCharacteristics.classification?.estimated_gender}`;
                    }
                  } else {
                    speakerAnalysisInfo = ' | ⚠️ AUCUN speakerAnalysis';
                  }

                  logger.debug(`audio-diag: msg=${msg.id} attachmentId=${att.id} text="${transcriptionText}" lang=${att.transcription.language} confidence=${att.transcription.confidence} source=${att.transcription.source} model=${att.transcription.model} durationMs=${att.transcription.durationMs || att.transcription.audioDurationMs} segments=${att.transcription.segments?.length || 0} speakerCount=${att.transcription.speakerCount} hasTranslations=${!!att.translations}${speakerAnalysisInfo}`);
                } else {
                  logger.debug(`audio-diag: msg=${msg.id} attachmentId=${att.id} no-transcription mimeType=${att.mimeType}`);
                }

                // Vérifier les traductions audio (champ V2: translations au lieu de translatedAudios)
                if (att.translations && typeof att.translations === 'object' && Object.keys(att.translations).length > 0) {
                  audioWithTranslatedAudiosCount++;
                  const langs = Object.keys(att.translations);
                  const translationsInfo = langs.map(lang => {
                    const trans = att.translations[lang];
                    return `${lang}(url="${trans?.url || '⚠️ VIDE'}", cloned=${trans?.cloned}, segments=${trans?.segments?.length || 0})`;
                  }).join(', ');
                  logger.info(`🌍 [CONVERSATIONS] Message ${msg.id} - Audio traductions: attachmentId=${att.id}, ${langs.length} traduction(s) [${translationsInfo}]`);
                }
              }
            });
          }
        });

        const transcriptionRate = audioAttachmentCount > 0 ? `${(audioWithTranscriptionCount / audioAttachmentCount * 100).toFixed(1)}%` : '0%';
        logger.info(`📊 [CONVERSATIONS] Statistiques audio: totalMessages=${messages.length}, audioAttachments=${audioAttachmentCount}, audioWithTranscription=${audioWithTranscriptionCount}, audioWithTranslatedAudios=${audioWithTranslatedAudiosCount}, transcriptionRate=${transcriptionRate}`);
      }

      // #7451 — les échéances d'éphémère de CETTE page, POUR CE LECTEUR.
      // Chargées avant toute autre passe parce qu'elles décident ce qui reste
      // servi : le service d'un éphémère s'arrête à `D(lecteur) + 1 h`, une
      // heure après que la bulle a disparu de son écran et bien avant la
      // destruction du contenu, qui attend le dernier décompte de la room.
      //
      // Le retrait a lieu ICI, sur `messages`, et pas sur la projection : les
      // deux tableaux avancent ensemble jusqu'à la pagination (`splice`), et
      // ne filtrer que le second les aurait désynchronisés.
      const ephemeralDeadlines = await loadEphemeralReaderDeadlines(
        prisma,
        messages,
        currentParticipantId
      );
      if (ephemeralDeadlines.size > 0) {
        const servedAt = new Date();
        const served = messages.filter((message: { id: string }) =>
          isEphemeralServableToReader(
            message as Parameters<typeof isEphemeralServableToReader>[0],
            ephemeralDeadlines.get(message.id),
            servedAt
          )
        );
        if (served.length !== messages.length) {
          messages.length = 0;
          messages.push(...served);
        }
      }

      const readStatusMap = await loadMessageReadStatusMap(
        prisma,
        conversationId,
        messages,
        Boolean(authRequest.authContext?.userId)
      );

      // Présence des expéditeurs : régime STRICT (2026-08-25) — self/ADMIN+/
      // ami seuls, jamais la seule co-participation.
      const listPresenceViewer = viewerFromRequest(request);
      const listMissingEntry = presenceMissingEntryPolicy(listPresenceViewer);
      const senderPresenceVis = await getPresenceVisibilityService(prisma).resolveForTargets(
        listPresenceViewer,
        messages
          .map((message) => message.sender?.userId)
          .filter((uid: string | null | undefined): uid is string => !!uid)
      );

      // #3909 — la progression de lecture du participant sur les pièces
      // jointes de CETTE page. Une requête, bornée aux identifiants rendus.
      const consumptionMap = await loadCurrentUserConsumptionMap(
        prisma,
        messages,
        currentParticipantId
      );

      // Mapper les messages avec les champs alignés au type GatewayMessage de @meeshy/shared/types
      // `mappedMessages` reste non annoté (any[], hérité du retour `any` DÉLIBÉRÉ
      // de `mapMessageRowForList` — voir son doc-comment) : `firstMsg`/`lastMsg`
      // plus bas alimentent `new Date(...)`, qui n'a pas de surcharge acceptant
      // un `Date` déjà construit — un typage `MappedMessageRow[]` casserait ces
      // deux sites pour un gain hors du fichier réservé par ce lot.
      const mappedMessages = messages.map((message) => mapMessageRowForList(message, {
        includeTranslations,
        includeReplies,
        hasLanguageFilter,
        languageFilter,
        currentParticipantId,
        readStatusMap,
        senderPresenceVis,
        listMissingEntry,
        consumptionMap,
        ephemeralDeadlines,
      }));

      // ===== ENRICHIR LES MESSAGES FORWARDÉS =====
      t0 = performance.now();
      await enrichForwardedMessagesForList(prisma, userId, mappedMessages);

      timings.forwardedEnrichment = performance.now() - t0;

      await enrichPostReplyMessagesForList(prisma, mappedMessages);

      // #6164 — la pièce NOMMÉE d'une citation peut tomber hors de la fenêtre
      // `take: 4` du `select` de `replyTo` (répondre à la 5e photo d'un
      // carrousel). On la rattrape par son ID, en UNE requête pour la page —
      // plutôt qu'en faisant payer un `take: 10` à chaque message du fil.
      await backfillCitedAttachments(prisma, mappedMessages as readonly MessageRattrapable[]);

      // Lieu partagé : hisser `metadata.location` en top-level `location` —
      // même miroir que `postReplyTo` ci-dessus, mais sur TOUT message
      // (contrairement à postReplyTo, indépendant de `storyReplyToId`).
      for (const m of mappedMessages) {
        const place = sharedPlaceFromMetadata(m.metadata);
        if (place) m.location = place;
        // Sticker (#4823) — même hoist, même raison : iOS rend la décoration
        // animée depuis `sticker`, le PNG joint n'est que le repli.
        const sticker = stickerFromMetadata(m.metadata);
        if (sticker) m.sticker = sticker;
      }

      // #7578 — une vue unique se sert PAR LECTEUR : qui l'a déjà ouverte ne
      // reçoit plus que l'état (`consumedByMe`), ni texte, ni traduction, ni
      // pièce jointe. Après le hissage ci-dessus, pour retenir aussi le lieu et
      // le sticker. Aucune requête quand la page ne porte aucune vue unique.
      const viewOnceStates = await loadViewOnceReaderStates(prisma, messages, currentParticipantId, (err) =>
        logger.warn('view-once reader states failed — served closed', err)
      );
      if (viewOnceStates.size > 0) {
        mappedMessages.forEach((m, index) => {
          mappedMessages[index] = projectViewOnceForReader(m, viewOnceStates.get(m.id));
        });
      }

      // Marquer les messages comme "reçus" — EFFET DE BORD (statut de livraison
      // propagé aux autres participants via socket). La réponse (mappedMessages)
      // n'en dépend PAS. Déféré en fire-and-forget : l'awaiter ajoutait
      // 50-130ms à CHAQUE fetch de messages (l'endpoint le plus appelé).
      t0 = performance.now();
      if (messages.length > 0 && !authRequest.authContext.isAnonymous && currentParticipantId) {
        const participantIdForReceipt = currentParticipantId;
        void (async () => {
          try {
            const { MessageReadStatusService } = await import('../../services/MessageReadStatusService');
            const readStatusService = new MessageReadStatusService(prisma);
            await readStatusService.markMessagesAsReceived(participantIdForReceipt, conversationId);
          } catch (error) {
            logger.warn('Error marking messages as received:', error);
          }
        })().catch((error: unknown) => logger.warn('Error marking messages as received:', error));
      }
      timings.markAsReceived = performance.now() - t0; // ~0 : dispatch non-bloquant désormais

      // Construire les métadonnées de cursor pagination
      // Cursor reads (before / after) fetched limit+1 rows. More than `limit`
      // back means the probe row exists and there IS more; trim it away.
      const isProbedRead = Boolean(before) || afterMode || searchMode;
      let cursorHasMore: boolean;
      if (isProbedRead && messages.length > limit) {
        cursorHasMore = true;
        // Trim BOTH arrays: `messages` feeds the cursor meta below, but the
        // client receives `mappedMessages` (built before this block) — only
        // trimming `messages` shipped limit+1 rows to the client.
        messages.splice(limit);
        mappedMessages.splice(limit);
      } else if (isProbedRead) {
        cursorHasMore = false;
      } else if (isAroundMode) {
        // `around` construit sa fenêtre par `id: { in: … }` et saute le COUNT :
        // ni la sonde ni le total ne sont disponibles ici. Comportement
        // INCHANGÉ — hors périmètre de #6993, qui vise la première page.
        cursorHasMore = messages.length === limit;
      } else {
        // PREMIÈRE PAGE — la vérité était DÉJÀ dans la réponse (#6993).
        //
        // Ce chemin est le SEUL qui paie un `count()` (`:496-497` le saute pour
        // before/around/after/search), et `pagination.hasMore` en dérive
        // correctement douze lignes plus bas — `buildPaginationMeta` calcule
        // `offset + resultCount < total`. `cursorPagination.hasMore`, lui,
        // DEVINAIT : « la page est pleine, donc il en reste ». Une seule charge
        // portait donc deux `hasMore` contradictoires, et le client lit celui-ci
        // (`apps/web-v2/src/lib/api/messages.ts:50` → `hasOlder`, qui libelle
        // « Sur les N derniers messages » du Résumé Vivant).
        //
        // Les deux règles ne divergent qu'à un seul rang : une pile de
        // `limit` messages exactement, où la page est PLEINE et le fil ÉPUISÉ.
        // À `limit − 1` comme à `limit + 1`, elles rendent le même verdict —
        // c'est pourquoi le témoin de #6993 est écrit sur la pile 50.
        //
        // Le mode `after` a été corrigé de la même devinette vers une MESURE,
        // par la sonde `limit + 1`. Ici la mesure est déjà payée : la lire
        // coûte moins qu'une sonde, et supprime le désaccord plutôt que de le
        // déplacer.
        cursorHasMore = offset + messages.length < totalCount;
      }
      // `nextCursor` is a message id the client passes back as `before` — a
      // BACKWARD cursor. A forward-watermark page is ASCENDING, so its last row
      // is the NEWEST one: handing it over under that contract pointed the
      // client at everything OLDER than the page it had just consumed, and a
      // client following the cursor generically would re-read the history
      // instead of advancing. Forward reads resume from the `after` watermark,
      // which the client already holds — there is no `before` continuation to
      // publish, and claiming one was the lie.
      const lastMessageId = messages.length > 0 ? String(messages[messages.length - 1].id) : null;
      const cursorPaginationMeta = {
        limit,
        hasMore: cursorHasMore,
        nextCursor: afterMode ? null : lastMessageId
      };

      // Format optimisé: data directement = Message[], meta pour userLanguage
      // Aligné avec MessagesListResponse de @meeshy/shared/types
      // Note: pagination offset-based uniquement pour les requêtes sans curseur.
      // Quand before/around est utilisé, seul cursorPagination est pertinent.
      // NOTE: Cannot use sendSuccess() — response includes top-level `cursorPagination`,
      // optional top-level `pagination`, and a `meta.userLanguage` field that iOS SDK
      // (MessagesListResponse / MessagesAPIResponse) and web parse at root level.
      // Migration to sendSuccess requires a coordinated client update (breaking change).
      const mentionContents = mappedMessages
        .map((m) => m.content as string)
        .filter(Boolean);
      const mentionedUsers = mentionContents.length > 0
        ? await resolveMentionedUsers(prisma, mentionContents)
        : [];

      const responsePayload: {
        success: true;
        data: unknown[];
        cursorPagination: typeof cursorPaginationMeta;
        meta: { userLanguage: string; mentionedUsers: MentionedUser[] };
        pagination?: PaginationMeta;
        hasNewer?: boolean;
      } = {
        success: true,
        data: mappedMessages,
        cursorPagination: cursorPaginationMeta,
        meta: {
          userLanguage: userPreferredLanguage,
          mentionedUsers
        }
      };

      if (!before && !isAroundMode && !afterMode && !searchMode) {
        responsePayload.pagination = buildPaginationMeta(totalCount, offset, limit, messages.length);
      }

      // Add around-specific pagination info
      if (isAroundMode) {
        const firstMsg = mappedMessages[0];
        const lastMsg = mappedMessages[mappedMessages.length - 1];
        if (firstMsg) {
          const olderCount = await prisma.message.count({
            where: applyPersonalHistoryHiding(
              applyHistoryFloor(
                { conversationId, deletedAt: null, createdAt: { lt: new Date(firstMsg.createdAt) } },
                historyStartDate
              ),
              personalHiding
            )
          });
          responsePayload.cursorPagination.hasMore = olderCount > 0;
        }
        if (lastMsg) {
          // #3893 point 4 : seul agrégat de cette route sans le plancher
          // appliqué EXPLICITEMENT — sûr aujourd'hui car son prédicat `gt`
          // dérive d'un message déjà borné (`lastMsg` a lui-même passé le
          // plancher), mais c'est le seul des quatre agrégats à ne pas passer
          // par `applyHistoryFloor`, sur une route dont le commentaire dit
          // explicitement « un seul oubli suffirait ». Même patron que
          // `olderCount` ci-dessus.
          const newerCount = await prisma.message.count({
            where: applyPersonalHistoryHiding(
              applyHistoryFloor(
                { conversationId, deletedAt: null, createdAt: { gt: new Date(lastMsg.createdAt) } },
                historyStartDate
              ),
              personalHiding
            )
          });
          responsePayload.hasNewer = newerCount > 0;
        }
      }

      timings.total = performance.now() - reqStart;
      const level = timings.total > 5000 ? 'warn' : 'info';
      logger[level](`⏱️ GET /conversations/${conversationId}/messages`, {
        durationMs: Math.round(timings.total),
        messageCount: messages.length,
        // #4340 — la vue servie : sans elle, quatre sous-collections aux profils
        // de coût très différents se confondent dans la même ligne de journal.
        view: vue.view,
        limit,
        offset,
        before: before || null,
        around: around || null,
        timings: Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Math.round(v)]))
      });

      // T15 — ETag + If-None-Match→304: don't re-send an unchanged message
      // page body. `sendWithETag` sets ETag + Cache-Control: private, no-cache
      // and short-circuits with a body-less 304 on a match. The ETag reflects
      // the filtered result, so it composes with the `after`/`before`/`around`
      // delta-sync modes without special handling.
      if (sendWithETag(request, reply, responsePayload)) return;
      reply.send(responsePayload);

    } catch (error) {
      const totalMs = Math.round(performance.now() - reqStart);
      logger.error(`Error fetching messages (after ${totalMs}ms)`, error);
      return sendInternalError(reply, 'Error retrieving messages');
    }
  });
}
