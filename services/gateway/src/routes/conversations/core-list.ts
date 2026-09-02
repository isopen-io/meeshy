/**
 * Surface LISTE de `conversations/core.ts` — `GET /conversations` (pagination,
 * delta-sync, aperçu de dernier message, pont ✦, présence des participants).
 * Extrait de `core.ts` lors du découpage #4284 ; voir `core.ts` pour le point
 * d'entrée `registerCoreRoutes` qui appelle ce registrar.
 */
import { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { resolveParticipantAvatar, resolveParticipantDisplayName } from '@meeshy/shared/utils/participant-helpers';
import { canViewExactMemberCount, presentMemberCount } from '@meeshy/shared/utils/member-visibility';
import {
  generateDefaultConversationTitle,
  resolveUserLanguagesOrdered
} from '@meeshy/shared/utils/conversation-helpers';
import {
  buildLastMessagePreviewTranslations,
  truncateMessagePreview
} from './utils/last-message-preview';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationListResponseSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { conversationActiveMemberCountSelect } from './utils/active-member-count';
import { loadConversationTombstones } from './utils/delta-tombstones';
import { sendUnauthorized, sendInternalError } from '../../utils/response';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { presenceFor, viewerFromRequest } from '../users/presence-gate';
import { validatePagination, buildCursorPaginationMeta } from '../../utils/pagination';
import { sendWithETag } from '../../utils/etag';
import { sharedPlaceFromMetadata } from '../../services/location/sharedPlace';
import { resolveVisibleLastMessages } from '../../services/resolveVisibleLastMessage';
import { HISTORY_FLOOR_PARTICIPANT_SELECT, loadHistoryFloorsOrFail } from '../../services/historyFloor';
import {
  ConversationBridgeService,
  type BridgeOrchestratorInput
} from '../../services/ConversationBridgeService';
import { AgentHttpClient } from '../../services/AgentHttpClient';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';
import { resolveCapabilities } from '@meeshy/shared/utils/reading-modes';
import { ReadingModePreferenceSchema, type ReadingModePreference } from '@meeshy/shared/types/reading-modes';
import type { ConversationType } from '@meeshy/shared/types/conversation';
import {
  conversationListParticipantSelect,
  conversationUserPreferencesSelect,
  conversationLastMessagePreviewSelect
} from './core-selects';

const logger = enhancedLogger.child({ module: 'conversations/core' });

/**
 * Enregistre `GET /conversations` (liste paginée des conversations de
 * l'utilisateur courant).
 */
export function registerConversationListRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any
) {
  // Route pour obtenir toutes les conversations de l'utilisateur
  fastify.get<{ Querystring: { limit?: string; offset?: string; before?: string; includeCount?: string; type?: string; withUserId?: string; updatedSince?: string } }>('/conversations', {
    schema: {
      description: 'Get all conversations for the authenticated user with pagination support',
      tags: ['conversations'],
      summary: 'List user conversations',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string', description: 'Maximum number of conversations to return (max 50, default 15)' },
          offset: { type: 'string', description: 'Number of conversations to skip for pagination (default 0)' },
          before: { type: 'string', description: 'Cursor for pagination: get conversations before this conversation ID (by lastMessageAt)' },
          includeCount: { type: 'string', enum: ['true', 'false'], description: 'Include total count of conversations' },
          type: { type: 'string', enum: ['direct', 'group', 'public', 'global', 'broadcast'], description: 'Filter by conversation type' },
          withUserId: { type: 'string', description: 'Filter direct conversations that include this user ID as a participant' },
          updatedSince: { type: 'string', description: 'ISO8601 timestamp — return only conversations updated after this time' }
        }
      },
      // `403` a été RETIRÉ de cette liste avec le correctif ci-dessous : plus
      // aucun refus de cette route ne le sert. Sa garde `optionalAuth` est
      // construite `{ requireAuth: false, allowAnonymous: true }`
      // (`routes/conversations/index.ts:26`), régime sous lequel les DEUX
      // branches de refus de `createUnifiedAuthMiddleware` sont mortes — celle
      // du 401 est gardée par `options.requireAuth`, celle du 403 par
      // `!options.allowAnonymous`. Le déclarer encore décrirait un corps que
      // rien n'émet.
      response: {
        200: conversationListResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string; before?: string; includeCount?: string; type?: string; withUserId?: string; updatedSince?: string } }>, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;

      /**
       * PAS DE SESSION ⇒ 401, JAMAIS 403 (#4789, la forme de #4760 sur la route
       * la plus appelée du produit).
       *
       * Ce refus disait « Authentication required » au statut d'un refus de
       * DROIT. Les deux situations ne sont pas la même : « je ne sais pas qui tu
       * es » (401) contre « je sais qui tu es et ce n'est pas pour toi » (403).
       * Seul le second est ce que servent les dix-huit « Unauthorized access to
       * this conversation » de la surface `conversations/` (mesuré) — ils
       * refusent un NON-MEMBRE et restent 403 à juste titre.
       *
       * CE QUE LE 403 COÛTAIT, MESURÉ CLIENT PAR CLIENT.
       * `APIClient.mapUnauthorized` (`packages/MeeshySDK/.../APIClient.swift`)
       * est le site UNIQUE qui décide qu'une réponse veut dire « ta session est
       * morte », et il n'est atteint que par la branche 401 : un membre dont le
       * jeton expirait en ouvrant sa liste de conversations recevait 403, que
       * `APIClient.swift:785` traduit en `MeeshyError.forbidden` — « NOT an
       * auth/session problem » — sans jamais appeler
       * `AuthManager.handleUnauthorized()`. Aucun rafraîchissement, aucune
       * reconnexion proposée. `apps/web` rafraîchit sur 401. Android est NEUTRE
       * (`AuthExpiryInterceptor.EXPIRY_CODES = {401, 403}` contient déjà 401 —
       * il JUSTIFIE d'ailleurs son 403 en citant la phrase de CE site, ce qui
       * fait de ce commentaire-là un suivi). `apps/web-v3` portait une ligne
       * `status === 403` écrite POUR ce défaut (`lib/api/compte.ts`) ; elle
       * disparaît avec lui.
       *
       * `UNAUTHORIZED` n'est pas inventé : `ErrorCode.UNAUTHORIZED`
       * (`packages/shared/types/errors.ts`) le déclare et `ErrorStatusMap` le
       * mappe sur 401.
       *
       * LA GARDE NE REFUSE RIEN, C'EST BIEN ICI QUE ÇA SE TRANCHE :
       * `optionalAuth` est `{ requireAuth: false, allowAnonymous: true }`. Un
       * jeton absent, expiré ou révoqué arrive donc jusqu'ici avec un
       * `authContext` non authentifié — c'est le cas NOMINAL d'un retour après
       * quelques jours, pas un incident.
       */
      if (!authRequest.authContext.isAuthenticated) {
        return sendUnauthorized(reply, 'Authentication required to access conversations', { code: 'UNAUTHORIZED' });
      }

      const userId = authRequest.authContext.userId;

      // Paramètres de pagination. Default 30 (compromise between perf and
      // round-trips); max 100 to let large-account clients fetch their full
      // list in fewer pages — previously capped at 50, which forced 88+
      // conversation accounts through 2 pages and exposed pagination bugs
      // (offset stagnation, hasMore mis-reads) for any partial sync.
      // SSOT `validatePagination` clamps NaN/negative/zero: a malformed
      // querystring (`?limit=abc`, `?limit=-1`) would otherwise reach Prisma as
      // `take: NaN`/negative and throw a `PrismaClientValidationError` → HTTP 500
      // on caller-controlled input. The schema declares `limit`/`offset` as plain
      // strings (no AJV coercion), so the guard has to live here.
      const { limit, offset } = validatePagination(request.query.offset, request.query.limit, { defaultLimit: 30, maxLimit: 100 });
      const includeCount = request.query.includeCount === 'true';

      // OPTIMIZED: Filtres optionnels pour éviter de charger toutes les conversations
      const typeFilter = request.query.type;
      const withUserId = request.query.withUserId;
      const beforeCursor = request.query.before;
      const updatedSince = request.query.updatedSince;

      // === PERFORMANCE INSTRUMENTATION ===
      const perfStart = performance.now();
      const perfTimings: Record<string, number> = {};

      let t0 = performance.now();

      // Build the where clause with optional filters.
      //
      // `deletedForMe` matches en deux temps : valeur null explicite OU champ
      // absent. Sans le `isSet: false` (filtre MongoDB-only de Prisma), les
      // documents Participant herites ne possedant pas le champ `deletedForMe`
      // du tout (cree avant l'introduction du concept, 10 docs sur 716 dans
      // l'instance prod du 2026-05-11) etaient exclus de la liste — les
      // conversations DM correspondantes (Bertine, Suz, etc.) disparaissaient
      // meme apres pull-to-refresh. Le `NOT: { not: null }` precedent et le
      // `deletedForMe: null` simple ont la meme limite : ils ne matchent que
      // les champs presents avec valeur null.
      const whereClause: any = {
        participants: {
          some: {
            userId: userId,
            isActive: true,
            OR: [
              { deletedForMe: null },
              { deletedForMe: { isSet: false } }
            ]
          }
        },
        isActive: true
      };

      // Add type filter if specified
      if (typeFilter) {
        whereClause.type = typeFilter;
      }

      // Add withUserId filter - find conversations where BOTH users are members
      if (withUserId) {
        whereClause.participants = {
          every: {
            OR: [
              { userId: userId, isActive: true },
              { userId: withUserId, isActive: true }
            ]
          }
        };
        // Override to use AND with both conditions
        whereClause.AND = [
          { participants: { some: { userId: userId, isActive: true } } },
          { participants: { some: { userId: withUserId, isActive: true } } }
        ];
        delete whereClause.participants;
      }

      // Visibilité DM vide — Prisme design doc 2026-08-04. Ajouté APRÈS le
      // bloc withUserId ci-dessus (qui reconstruit whereClause.participants
      // /.AND) pour ne jamais être écrasé par lui : un OR à la racine du
      // whereClause se combine par ET implicite avec .AND/.participants,
      // quel que soit leur contenu.
      whereClause.OR = [
        { type: { not: 'direct' } },
        {
          // `NOT: { firstMessageSentAt: null }` seul ne matche PAS les
          // documents où le champ est ABSENT sur le connecteur MongoDB de
          // Prisma (il ne matche que present-et-non-null) — il exclurait donc
          // à tort tout DM legacy (créé avant cette migration, jamais
          // backfillé). Les deux branches sont nécessaires : déjà posé (message
          // envoyé) OU absent (legacy, avant migration) ⇒ visible.
          OR: [
            { NOT: { firstMessageSentAt: null } },
            { firstMessageSentAt: { isSet: false } }
          ]
        },
        { participants: { some: { userId, role: 'creator' } } },
        { participants: { none: { role: 'creator' } } } // aucun créateur identifiable ⇒ comportement actuel
      ];

      // Cursor-based pagination: filter by lastMessageAt of the cursor conversation
      let cursorLastMessageAt: Date | null = null;
      if (beforeCursor) {
        const cursorConversation = await prisma.conversation.findFirst({
          where: { id: beforeCursor },
          select: { lastMessageAt: true }
        });
        if (cursorConversation?.lastMessageAt) {
          cursorLastMessageAt = cursorConversation.lastMessageAt;
          whereClause.lastMessageAt = { lt: cursorLastMessageAt };
        }
      }

      // Filtre delta-sync. DEUX consommateurs, qui doivent rester d'accord sur
      // ce que « mis à jour » veut dire :
      //   - iOS   : `ConversationSyncEngine.deltaSyncCore`
      //   - web   : `syncConversationsDelta` (use-conversations-delta-sync.ts)
      // Il porte son propre index (`@@index([isActive, updatedAt])`). La borne
      // est STRICTE (`gt`) : un client qui repasse son dernier `updatedAt` ne
      // re-télécharge pas la ligne qu'il détient déjà.
      let isDeltaPage = false;
      let deltaSince: Date | null = null;
      if (updatedSince) {
        const sinceDate = new Date(updatedSince);
        if (!isNaN(sinceDate.getTime())) {
          whereClause.updatedAt = { gt: sinceDate };
          isDeltaPage = true;
          deltaSince = sinceDate;
        }
      }

      // Le delta ci-dessus est UPSERT-ONLY : son `whereClause` exige une
      // conversation `isActive` et un participant actif sans `deletedForMe`,
      // donc une conversation qui SORT de la vue (fermée, quittée, bannie,
      // supprimée-pour-moi depuis un autre appareil) ne revient dans aucune
      // réponse. Rien ne la retirait du cache client avant la réconciliation
      // complète — 24 h sur iOS (`fullReconcileInterval`) comme sur le web
      // (`FULL_RECONCILE_INTERVAL_MS`).
      //
      // Les tombstones partent EN PARALLÈLE de la page (elles ne dépendent que
      // de `since`), sont ids-only, cappées, et n'existent QUE sur une page
      // delta : le chemin chaud de l'écran de liste ne paie rien.
      //
      // Le `.catch` n'est pas une ceinture de plus sur les bretelles du module :
      // la promesse est créée ICI et attendue 400 lignes plus bas. Tout `throw`
      // entre les deux (la page principale qui rejette, par exemple) la
      // laisserait sans écouteur — et sous le `--unhandled-rejections=throw` par
      // défaut de Node 22, un rejet non écouté termine le PROCESS. Que
      // `loadConversationTombstones` avale déjà ses erreurs est une propriété du
      // COLLABORATEUR, pas une garantie de ce site d'appel (cf. leçon 230).
      const tombstonesPromise = deltaSince
        ? loadConversationTombstones(prisma, {
            userId: authRequest.authContext.type === 'anonymous' ? null : userId,
            since: deltaSince
          }).catch(() => ({ ids: [] as string[], truncated: true }))
        : null;

      // L'ORDRE d'une page delta n'est pas cosmétique : il décide si une page
      // TRONQUÉE est rattrapable.
      //
      // Le `limit` est plafonné à 100 (voir plus haut) et les deux clients
      // avancent leur watermark au max des `updatedAt` REÇUS. Trié par
      // `lastMessageAt` décroissant — l'ordre de l'écran de liste, sans aucun
      // rapport avec le filtre — les lignes coupées ne sont pas « les plus
      // anciennes mises à jour » : le prochain `updatedSince` passe PAR-DESSUS
      // et ne les revoit qu'à la réconciliation complète (1×/24 h sur iOS).
      // Pendant ce temps la liste affiche des compteurs de non-lus et des
      // aperçus périmés sans qu'aucun signal ne l'indique.
      //
      // Trié par `updatedAt` croissant, les lignes coupées sont exactement
      // celles dont l'`updatedAt` est SUPÉRIEUR à celui de la dernière ligne
      // rendue : le watermark qui les enjambait pointe désormais dessus, et
      // l'appel delta suivant les rend. La troncature devient une pagination
      // naturelle, sans aucun changement client. `id` départage les égalités
      // pour que deux appels identiques rendent la même page.
      //
      // Résidu assumé : plus de `limit` conversations portant la MÊME
      // milliseconde d'`updatedAt` (écriture en masse) débordent d'une page que
      // la borne stricte `gt` ne peut pas reprendre. Le web traite déjà une page
      // PLEINE comme une preuve d'incomplétude et escalade vers la relecture
      // complète (`DELTA_PAGE_LIMIT`, use-conversations-delta-sync.ts) : c'est
      // ce cas-là, et lui seul, qui reste à sa charge.
      //
      // Le curseur `before` garde la main : il BORNE sur `lastMessageAt`, donc
      // une page ordonnée par `updatedAt` le rendrait incohérent. Aucun client
      // ne combine les deux aujourd'hui — la garde existe pour que celui qui
      // essaiera obtienne une pagination cohérente plutôt qu'un mélange.
      const orderBy = isDeltaPage && !beforeCursor
        ? [{ updatedAt: 'asc' as const }, { id: 'asc' as const }]
        : { lastMessageAt: 'desc' as const };

      t0 = performance.now();
      const conversations = await prisma.conversation.findMany({
        where: whereClause,
        skip: beforeCursor ? 0 : offset,
        take: limit,
        select: {
          id: true,
          title: true,
          type: true,
          identifier: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          lastMessageAt: true,
          banner: true,
          avatar: true,
          communityId: true,
          // Effectif compté par la base, PAS la colonne dénormalisée du même
          // nom : voir `conversationActiveMemberCountSelect`. La ligne de liste
          // en dépend visiblement (badge de groupe iOS `memberCount > 1`,
          // saturation de la couleur d'accent `min(memberCount/100, 1) × 0.2`),
          // et la colonne rendait `0` pour toute conversation créée depuis la
          // migration héritée : badge absent, et couleur d'accent différente
          // entre la liste et le fil ouvert, qui lui compte.
          _count: { select: conversationActiveMemberCountSelect },
          isAnnouncementChannel: true,
          participants: {
            take: 5,
            where: {
              isActive: true
            },
            select: conversationListParticipantSelect
          },
          // User preferences (pin/mute/archive/tags/catégorie/customName/reaction)
          userPreferences: {
            where: { userId: userId },
            take: 1,
            select: conversationUserPreferencesSelect
          },
          messages: {
            where: {
              deletedAt: null
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: conversationLastMessagePreviewSelect
          }
        },
        orderBy
      });
      perfTimings.conversationsQuery = performance.now() - t0;

      // Optimisation : Calculer tous les unreadCounts avec le système de curseur
      const conversationIds = conversations.map(c => c.id);

      // `authContext.userId` porte un `User.id` pour un compte mais un
      // `Participant.id` pour un invité de lien partagé (branche anonyme
      // d'`UnifiedAuthService`, documentée dans `utils/access-control.ts`) : la
      // COLONNE se branche sur la NATURE de la clé, exactement comme
      // `GET /conversations/search`.
      const isAnonymousViewer = authRequest.authContext.type === 'anonymous';

      // Le PLANCHER d'historique du lecteur, conversation par conversation :
      // l'aperçu de liste est une lecture comme une autre, et le dernier message
      // GLOBAL d'un salon peut précéder l'arrivée de ce lecteur. Une lecture
      // batchée de SES lignes (`services/historyFloor` lit ce qu'il faut) — le
      // top-5 ci-dessous ne projette pas ces champs, et un `select` qui les
      // porterait multiplierait cinq lignes par conversation sur le fil.
      // Fail-closed : une conversation dont le plancher est ILLISIBLE perd son
      // aperçu plutôt que de le servir sans borne.
      t0 = performance.now();
      const readerJoins = userId && conversationIds.length > 0
        ? await prisma.participant.findMany({
            where: {
              conversationId: { in: conversationIds },
              isActive: true,
              ...(isAnonymousViewer ? { id: userId } : { userId })
            },
            select: { conversationId: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT }
          })
        : [];
      const { floors: historyFloors, unreadableConversationIds } = await loadHistoryFloorsOrFail(prisma, readerJoins);
      const unreadableFloors = new Set(unreadableConversationIds);
      perfTimings.historyFloors = performance.now() - t0;

      // L'aperçu de la ligne de liste obéit au masquage personnel du lecteur.
      // Le `take: 1` imbriqué ne peut pas porter de filtre par conversation
      // (Prisma applique UN `where` à toute la sélection imbriquée), donc la
      // question est tranchée après coup — et seules les conversations dont
      // l'aperçu est effectivement masqué paient une requête de reprise. Un
      // lecteur qui n'a rien masqué paie une lecture indexée qui ne rend rien.
      t0 = performance.now();
      const visibleLastMessages = await resolveVisibleLastMessages(prisma, {
        // `authContext.userId` porte le jeton de session pour un participant
        // anonyme, pas un ObjectId — le passer ferait échouer les deux lectures
        // (rattrapées, mais une erreur par requête de liste pour rien). Un
        // anonyme ne possède de ligne dans NI l'une NI l'autre table.
        userId: authRequest.authContext.type === 'anonymous' ? null : userId,
        candidates: conversations.map(c => {
          const preview = (c as any).messages?.[0];
          return {
            conversationId: c.id,
            message: preview ? { id: preview.id, createdAt: preview.createdAt } : null,
            clearHistoryBefore: (c as any).userPreferences?.[0]?.clearHistoryBefore ?? null
          };
        }),
        query: { select: conversationLastMessagePreviewSelect as unknown as Record<string, unknown> },
        historyFloors
      });
      for (const conversation of conversations) {
        if (unreadableFloors.has(conversation.id)) {
          (conversation as any).messages = [];
          continue;
        }
        if (!visibleLastMessages.has(conversation.id)) continue;
        const replacement = visibleLastMessages.get(conversation.id);
        (conversation as any).messages = replacement ? [replacement] : [];
      }
      perfTimings.personalPreviewHiding = performance.now() - t0;

      // Extract current user's participant data from already-fetched participants (take:5 per conv).
      // For DMs and small groups the current user is always in the first 5 — zero extra DB queries.
      // Only fall back to a batch query for large groups where the current user wasn't in top 5.
      const currentUserRoleMap = new Map<string, string>();
      const currentUserJoinedAtMap = new Map<string, Date | null>();
      // Participant.id du LECTEUR par conversation — G-123 : c'est la clé qui
      // relie une conversation à son curseur de lecture (`lastOpenedAt` de
      // l'orchestrateur, voir plus bas). Repose sur la même résolution que les
      // deux maps ci-dessus (top-5 + repli batché) : aucune requête de plus.
      const currentUserParticipantIdMap = new Map<string, string>();
      const convsMissingCurrentUser: string[] = [];

      // Comparer un `Participant.id` à la colonne `userId` ne matche RIEN — pas
      // une erreur, une map vide : le rôle du lecteur disparaissait, et avec
      // lui son droit à l'effectif ENTIER. Un admin de groupe anonyme (que
      // `canViewExactMemberCount` autorise explicitement) était donc plafonné à
      // « 199+ » ici et servi entier par la recherche : deux réponses pour un
      // même lecteur. D'où `isAnonymousViewer`, résolu plus haut.
      if (userId) {
        for (const conv of conversations) {
          const found = (conv as any).participants.find((p: any) =>
            isAnonymousViewer ? p.id === userId : p.userId === userId
          );
          if (found) {
            currentUserRoleMap.set(conv.id, found.role);
            currentUserJoinedAtMap.set(conv.id, found.joinedAt);
            currentUserParticipantIdMap.set(conv.id, found.id);
          } else {
            convsMissingCurrentUser.push(conv.id);
          }
        }
        if (convsMissingCurrentUser.length > 0) {
          const remaining = await prisma.participant.findMany({
            where: {
              conversationId: { in: convsMissingCurrentUser },
              isActive: true,
              ...(isAnonymousViewer ? { id: userId } : { userId })
            },
            select: { id: true, conversationId: true, role: true, joinedAt: true }
          });
          for (const p of remaining) {
            currentUserRoleMap.set(p.conversationId, p.role);
            currentUserJoinedAtMap.set(p.conversationId, p.joinedAt);
            currentUserParticipantIdMap.set(p.conversationId, p.id);
          }
        }
      }

      // === OPTIMIZED: Parallelize independent queries ===
      // firstName/lastName now fetched via conversationListParticipantSelect.user.select —
      // memberUsers query eliminated (iter-8).
      t0 = performance.now();

      const { MessageReadStatusService } = await import('../../services/MessageReadStatusService.js');
      const readStatusService = new MessageReadStatusService(prisma);

      const [totalCount, unreadCountMap] = await Promise.all([
        // Count (if requested) - skip when using cursor pagination
        (!beforeCursor && (includeCount || offset === 0))
          ? prisma.conversation.count({ where: whereClause })
          : Promise.resolve(0),

        // Unread counts — iter-4: appel direct par userId (2+N queries vs 4×N)
        conversationIds.length > 0
          ? readStatusService.getUnreadCountsForUser(userId, conversationIds)
          : Promise.resolve(new Map<string, number>()),
      ]);

      perfTimings.parallelQueries = performance.now() - t0;

      // Override runtime de isOnline : la DB peut être obsolète (heartbeat manqué,
      // crash gateway, déconnexion non détectée). La source de vérité est `connectedUsers`
      // Map du SocketIOManager, exposée via le décorateur `presenceChecker`.
      const presenceChecker = fastify.presenceChecker;

      // Présence des co-participants : régime STRICT (2026-08-25) — la
      // co-participation n'ouvre plus rien, seul le viewer (soi/ADMIN+/ami)
      // voit isOnline/lastActiveAt d'un co-participant qui ne l'est pas.
      const presenceViewer = viewerFromRequest(request);
      const presenceVis = await getPresenceVisibilityService(prisma).resolveForTargets(
        presenceViewer,
        conversations.flatMap((conversation) => [
          ...conversation.participants.slice(0, 5).map((m: any) => m.userId),
          conversation.messages[0]?.sender?.userId,
        ]).filter((uid): uid is string => !!uid)
      );

      // Calculate hasMore. Two strategies:
      //   1. When we have a real `totalCount` (includeCount=true OR
      //      offset===0 — see L401-405), `hasMore = offset + N < total`.
      //   2. When totalCount is a sentinel `0` (skipped to save a query),
      //      fall back to "the page is full" → `length === limit`. This
      //      is conservative: if the page is exactly full we assume there
      //      MIGHT be another, and let the next request settle it.
      // Previously, branch (1) fired even when `totalCount===0` (because
      // includeCount=false and offset>0 still skipped the count query),
      // making `hasMore` falsely false and freezing infinite scroll.
      let hasMore: boolean;
      if (totalCount > 0 && (includeCount || offset === 0)) {
        hasMore = offset + conversations.length < totalCount;
      } else {
        hasMore = conversations.length === limit;
      }

      // Prisme Linguistique du lecteur : systemLanguage → regionalLanguage →
      // customDestinationLanguage → deviceLocale. Résolu UNE fois pour la page
      // entière, depuis l'utilisateur déjà chargé (et mis en cache) par le
      // middleware d'auth — aucune requête supplémentaire sur ce hot path.
      // `resolveUserLanguagesOrdered` est la seule autorité du dépôt sur cet
      // ordre : ne jamais le réimplémenter ici.
      const viewerPrefs = authRequest.authContext.registeredUser as
        | {
            systemLanguage?: string | null;
            regionalLanguage?: string | null;
            customDestinationLanguage?: string | null;
            deviceLocale?: string | null;
          }
        | undefined;
      const viewerLanguages = viewerPrefs
        ? resolveUserLanguagesOrdered(viewerPrefs, {
            deviceLocale: viewerPrefs.deviceLocale ?? undefined
          })
        : [];

      // ── Le pont ✦ (G-123) ──────────────────────────────────────────────
      // Attaché DANS cette passe, jamais dans une passe séparée : `buildBridgeData`
      // a besoin d'`unreadCountMap`, qui vient d'être calculé ci-dessus — le
      // pont se calcule donc APRÈS, mais sans requête additionnelle PAR
      // CONVERSATION (`ConversationBridgeService` reste à 5 requêtes
      // constantes, cf. son fichier). `unreadCount === 0` est filtré avant
      // même d'entrer dans la passe : ces conversations ne coûtent rien et
      // n'auront jamais de pont (contrat gelé §3.2, LWS-4).
      const bridgeCandidates = conversations
        .map((conversation) => ({
          conversationId: conversation.id,
          unreadCount: unreadCountMap.get(conversation.id) || 0
        }))
        .filter((candidate) => candidate.unreadCount > 0);

      let bridgeByConversation = new Map<string, { bridge: ConversationBridge; lastReadAt?: Date }>();

      if (bridgeCandidates.length > 0) {
        try {
          // A6 — `orchestratorInputs` porte l'entrée RÉELLE de l'orchestrateur
          // pour que `suggestedMode` soit la vraie décision de
          // `resolveOrchestratorDecision`, pas sa branche par défaut :
          //   - `stickyChoice`  : `UserConversationPreferences.readingMode`,
          //     déjà chargé par `userPreferences` (G-121) — ZÉRO requête de plus ;
          //   - `lastOpenedAt`  : le curseur de lecture du VIEWER, en UNE
          //     lecture batchée sur les participants déjà résolus
          //     (`currentUserParticipantIdMap`, top-5 + repli) — jamais une
          //     par conversation ;
          //   - `capabilities`  : `resolveCapabilities` (loi partagée), avec
          //     `activeParticipantCount: null` — aucune définition serveur
          //     honnête d'« actif » n'existe (jamais `0`, un chiffre fabriqué) ;
          //   - `isFlagEnabled: true` : la Lentille est un drapeau CLIENT
          //     (UserDefaults / ProcessInfo), le serveur n'en connaît pas
          //     l'état par requête — précalculer en supposant le drapeau actif
          //     est sans risque, un client drapeau-éteint ignore `bridge`
          //     entièrement.
          //
          // Une conversation dont le participant du lecteur n'a pas pu être
          // résolu (anonyme, ou repli manqué) est ABSENTE d'`orchestratorInputs` :
          // `lastOpenedAt: null` affirmerait « jamais ouverte », une donnée que
          // l'absence de résolution ne permet pas de connaître honnêtement.
          // Le service retombe alors sur sa branche par défaut pour CETTE
          // conversation — dégradation prévue, jamais une fabrication.
          const bridgeConvIds = new Set(bridgeCandidates.map((c) => c.conversationId));
          const viewerParticipantIds = [...currentUserParticipantIdMap.entries()]
            .filter(([convId]) => bridgeConvIds.has(convId))
            .map(([, participantId]) => participantId);

          const lastOpenedAtByConversation = new Map<string, Date | null>();
          // R6-6 — mutualisée avec `ConversationBridgeService.buildBridgeData` :
          // cette lecture couvre les MÊMES participants que sa propre requête
          // `conversationReadCursor` interne (même conversations, même
          // lecteur) ; `lastReadMessageCreatedAt` est lu en plus, pour rien de
          // plus, afin que la map ci-dessous puisse servir aux DEUX besoins.
          const cursorsByParticipant = new Map<
            string,
            { lastReadAt: Date | null; lastReadMessageCreatedAt: Date | null }
          >();
          if (viewerParticipantIds.length > 0) {
            const participantToConversation = new Map(
              [...currentUserParticipantIdMap.entries()].map(([convId, participantId]) => [participantId, convId])
            );
            const cursors = await prisma.conversationReadCursor.findMany({
              where: { participantId: { in: viewerParticipantIds } },
              select: { participantId: true, lastReadAt: true, lastReadMessageCreatedAt: true }
            });
            for (const cursor of cursors) {
              cursorsByParticipant.set(cursor.participantId, {
                lastReadAt: cursor.lastReadAt ?? null,
                lastReadMessageCreatedAt: cursor.lastReadMessageCreatedAt ?? null
              });
              const convId = participantToConversation.get(cursor.participantId);
              if (convId) lastOpenedAtByConversation.set(convId, cursor.lastReadAt ?? null);
            }
          }

          const now = new Date();
          const orchestratorInputs = new Map<string, BridgeOrchestratorInput>();

          for (const conversation of conversations) {
            if (!bridgeConvIds.has(conversation.id)) continue;
            if (!currentUserParticipantIdMap.has(conversation.id)) continue;

            const prefs = (conversation as any).userPreferences?.[0];
            const parsedPreference = ReadingModePreferenceSchema.safeParse(prefs?.readingMode);
            const stickyChoice: ReadingModePreference = parsedPreference.success
              ? parsedPreference.data
              : 'auto';

            const capabilities = resolveCapabilities({
              identity: { isAnonymous: isAnonymousViewer },
              isFlagEnabled: true,
              conversationType: conversation.type as ConversationType,
              // G-123 : aucun décompte serveur honnête d'« actif » — JAMAIS 0.
              activeParticipantCount: null
            });

            orchestratorInputs.set(conversation.id, {
              lastOpenedAt: lastOpenedAtByConversation.get(conversation.id) ?? null,
              now,
              stickyChoice,
              capabilities,
              isFlagEnabled: true
            });
          }

          // G-127 — top-up agent, OPTIONNEL et borné, REST seulement.
          // `AGENT_HOST` absent (comme le client ZMQ de `server.ts`, même
          // convention) ⇒ `agentClient` reste `undefined`, et
          // `buildBridgeData` ne consulte jamais l'agent : plancher G-122
          // strictement inchangé. Ce paramètre n'existe PAS sur l'interface
          // `UnreadBridgeBuilder` du chemin socket
          // (`emitUnreadCountsToRecipients`) — le fan-out temps réel d'un
          // compteur de non-lus ne paie donc jamais cet appel HTTP.
          const agentHost = process.env.AGENT_HOST;
          const agentHttpPort = process.env.AGENT_HTTP_PORT || '3200';
          const agentClient = agentHost
            ? new AgentHttpClient(`http://${agentHost}:${agentHttpPort}`)
            : undefined;

          const bridgeService = new ConversationBridgeService(prisma);
          bridgeByConversation = await bridgeService.buildBridgeData({
            viewerId: userId,
            candidates: bridgeCandidates,
            orchestratorInputs,
            // R6-6 — évite la seconde lecture de `conversationReadCursor`
            // que le service ferait sinon lui-même sur ces mêmes participants.
            cursorsByParticipant,
            ...(agentClient ? { agent: agentClient } : {})
          });
        } catch (error) {
          // Posture d'échec identique à celle du service : le pont est un
          // confort, la liste est le produit. Aucune ligne n'affiche un pont
          // faux ; toutes perdent seulement leur pont.
          logger.warn('bridge attach failed for conversation list, serving no bridge', { error });
          bridgeByConversation = new Map();
        }
      }

      // Mapper les conversations avec unreadCount et merge user data
      const conversationsWithUnreadCount = conversations.map((conversation) => {
        const unreadCount = unreadCountMap.get(conversation.id) || 0;
        const bridgeEntry = bridgeByConversation.get(conversation.id);

        // Merge presence override. firstName/lastName now come directly from m.user
        // (participant select was extended in iter-8 — no separate memberUsers query needed).
        const isDirect = conversation.type === 'direct';
        const membersWithUser = conversation.participants
          .slice(0, 5)
          .map((m: any) => {
            const liveOnline = presenceChecker?.isOnline(m.userId ?? m.id);
            // Entrée absente (sans compte, ou inscrit non résolu) : UN site,
            // `presenceFor` — masqué, sauf ADMIN+. Jamais `undefined` ici.
            const vis = presenceFor(presenceViewer, presenceVis, m.userId);
            const hideOnline = !vis.showOnline;
            const hideLastSeen = !vis.showLastSeenTimestamp;
            return {
              ...m,
              // Bannière de profil top-level : le schéma participant (minimal) est
              // plat et strippe `user`, donc on lève la bannière au niveau
              // participant pour la remontée en DM. Réservé aux DM — en groupe le
              // client ignore `participantBanner` (évite le sur-transfert).
              // Note : `Participant` n'a pas de colonne `banner`, seule `User` en a.
              banner: isDirect ? (m.user?.banner ?? null) : null,
              isOnline: hideOnline ? false : (liveOnline === undefined ? m.isOnline : liveOnline),
              lastActiveAt: hideLastSeen ? null : m.lastActiveAt,
              user: m.userId
                ? {
                    ...m.user,
                    isOnline: hideOnline ? false : (liveOnline === undefined ? m.user?.isOnline : liveOnline),
                    lastActiveAt: hideLastSeen ? null : m.user?.lastActiveAt
                  }
                : null
            };
          });

        // Pour les DMs, pas de titre obligatoire — le frontend résout le nom de l'interlocuteur
        // Pour les groupes/publics, s'assurer qu'un titre existe
        const displayTitle = conversation.type === 'direct'
          ? (conversation.title || null)
          : (conversation.title && conversation.title.trim() !== ''
              ? conversation.title
              : generateDefaultConversationTitle(
                  membersWithUser.map((m: any) => ({
                    id: m.userId,
                    displayName: m.user?.displayName,
                    username: m.user?.username,
                    firstName: m.user?.firstName,
                    lastName: m.user?.lastName
                  })),
                  userId
                ));

        const latestMessage = conversation.messages[0] as
          | { translations?: unknown; originalLanguage?: string | null }
          | undefined;

        // `_count` est retiré du spread : c'est une forme d'agrégat Prisma que
        // le schéma wire ne déclare pas, et le champ que les clients lisent est
        // `memberCount`. Le laisser passer paierait la sérialisation d'un objet
        // que `fast-json-stringify` strippe.
        const { _count: activeMembers, ...conversationData } = conversation as typeof conversation & {
          _count: { participants: number };
        };

        return {
          ...conversationData,
          // Cap 199+ : l'effectif ENTIER est réservé aux lecteurs autorisés —
          // ADMIN/BIGBOSS/MODERATOR plateforme, OU creator/admin de CETTE
          // conversation. Le second titre est ce que ce site ignorait : un
          // admin de groupe administrait 250 personnes sans jamais pouvoir en
          // lire l'effectif. `currentUserRoleMap` porte déjà son rôle, résolu
          // plus haut par le top-5 et son repli batché — aucune requête de plus.
          ...presentMemberCount(activeMembers.participants, {
            viewerSeesExactCount: canViewExactMemberCount({
              platformRole: authRequest.authContext.registeredUser?.role ?? null,
              conversationRole: currentUserRoleMap.get(conversation.id) ?? null
            })
          }),
          participants: membersWithUser,
          title: displayTitle,
          // Prisme Linguistique de la ligne de liste. Ces deux champs sont posés
          // au niveau CONVERSATION et non dans `lastMessage` parce que c'est là
          // que le client les attend depuis toujours
          // (`MeeshyConversation.lastMessageTranslations`), et parce que la
          // carte compacte `{ langue: aperçu }` n'a pas la forme de
          // `Message.translations` (un tableau de `MessageTranslation`) : deux
          // formes sous un même nom auraient dérivé.
          lastMessageOriginalLanguage: latestMessage?.originalLanguage ?? null,
          lastMessageTranslations: buildLastMessagePreviewTranslations({
            translations: latestMessage?.translations,
            originalLanguage: latestMessage?.originalLanguage,
            viewerLanguages: viewerLanguages
          }),
          lastMessage: (() => {
            const msg = conversation.messages[0];
            if (!msg) return null;
            // `translations` (JSON brut, potentiellement chiffré, une entrée par
            // langue de la conversation) et `originalLanguage` sont consommés
            // ci-dessus pour construire la carte d'aperçu ; les laisser fuiter
            // dans le spread renverrait le blob complet à chaque ligne.
            const { translations: _rawTranslations, originalLanguage: _originalLanguage, ...msgRest } =
              msg as typeof msg & { translations?: unknown; originalLanguage?: string | null };
            const sender = msg.sender as any;
            const senderLiveOnline = sender
              ? presenceChecker?.isOnline(sender.userId ?? sender.id)
              : undefined;
            const senderVis = sender ? presenceFor(presenceViewer, presenceVis, sender.userId) : undefined;
            // Lot 3 : hisser metadata.location en `location` top-level. Un
            // message géolocalisé SANS légende a un `content` vide — hisser
            // la position ne fabrique aucun texte de repli ; c'est au client
            // de décider comment rendre l'aperçu (ex. via `messageType` ou la
            // seule présence de `location`), pas au serveur.
            const place = sharedPlaceFromMetadata((msg as { metadata?: unknown }).metadata);
            return {
              ...msgRest,
              content: truncateMessagePreview(msg.content),
              ...(place ? { location: place } : {}),
              sender: sender && senderVis ? {
                ...sender,
                username: sender.user?.username ?? sender.username ?? null,
                firstName: sender.user?.firstName ?? null,
                lastName: sender.user?.lastName ?? null,
                displayName: resolveParticipantDisplayName(sender),
                avatar: resolveParticipantAvatar(sender),
                isOnline: senderVis.showOnline
                  ? (senderLiveOnline ?? sender.user?.isOnline ?? sender.isOnline ?? null)
                  : false,
                lastActiveAt: senderVis.showLastSeenTimestamp
                  ? (sender.user?.lastActiveAt ?? sender.lastActiveAt ?? null)
                  : null,
              } : null
            };
          })(),
          unreadCount,
          // Le pont ✦ (G-123). ABSENT — jamais `null`, jamais un objet vide —
          // quand `unreadCount === 0` ou que la passe n'a rien à annoncer
          // (contrat gelé §3.2). `lastReadAt` voyage À CÔTÉ du pont et reste
          // ABSENT sans curseur (arbitrage REV-4 : une absence ne s'affirme
          // jamais).
          ...(bridgeEntry ? { bridge: bridgeEntry.bridge } : {}),
          ...(bridgeEntry?.lastReadAt ? { lastReadAt: bridgeEntry.lastReadAt } : {}),
          currentUserRole: currentUserRoleMap.get(conversation.id) || null,
          currentUserJoinedAt: currentUserJoinedAtMap.get(conversation.id) || null
        };
      });

      const totalTime = performance.now() - perfStart;
      logger.debug('CONVERSATIONS_PERF', {
        conversationsQuery: perfTimings.conversationsQuery?.toFixed(2),
        parallelQueries: perfTimings.parallelQueries?.toFixed(2),
        total: totalTime.toFixed(2)
      });

      // Build cursor pagination meta
      const lastConversation = conversationsWithUnreadCount.length > 0
        ? conversationsWithUnreadCount[conversationsWithUnreadCount.length - 1]
        : null;
      const cursorPaginationMeta = buildCursorPaginationMeta(
        limit,
        conversationsWithUnreadCount.length,
        lastConversation?.id ?? null
      );

      // NOTE: Cannot use sendSuccess() — response includes top-level `pagination` and
      // `cursorPagination` fields that iOS SDK (ConversationListResponse) and web
      // (conversations.service.ts) parse at root level. Migration to sendSuccess requires
      // a coordinated client update (breaking change).
      const tombstones = tombstonesPromise ? await tombstonesPromise : null;

      const responseBody = {
        success: true,
        data: conversationsWithUnreadCount,
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore
        },
        cursorPagination: cursorPaginationMeta,
        // Bloc additif, présent UNIQUEMENT sur une page delta. Il entre dans le
        // corps hashé par `sendWithETag` : un 304 ne peut donc pas masquer une
        // sortie de vue qui vient d'apparaître.
        ...(tombstones
          ? {
              meta: {
                deletedConversationIds: tombstones.ids,
                deletedConversationIdsTruncated: tombstones.truncated
              }
            }
          : {})
      };
      // T15 — ETag + If-None-Match→304: don't re-send an unchanged conversation
      // list body. `sendWithETag` sets ETag + Cache-Control: private, no-cache
      // (always revalidate) and short-circuits with a body-less 304 on a match.
      if (sendWithETag(request, reply, responseBody)) return;
      reply.send(responseBody);

    } catch (error) {
      logger.error('error fetching conversations', { error });
      return sendInternalError(reply, 'Error retrieving conversations');
    }
  });
}
