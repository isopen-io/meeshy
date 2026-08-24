import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { UserRoleEnum, ErrorCode } from '@meeshy/shared/types';
import { createError, sendErrorResponse } from '@meeshy/shared/utils/errors';
import { resolveParticipantAvatar, resolveParticipantDisplayName } from '@meeshy/shared/utils/participant-helpers';
import { canViewExactMemberCount, presentMemberCount } from '@meeshy/shared/utils/member-visibility';
import { ConversationSchemas, validateSchema } from '@meeshy/shared/utils/validation';
import {
  generateDefaultConversationTitle,
  resolveUserLanguagesOrdered
} from '@meeshy/shared/utils/conversation-helpers';
import {
  buildLastMessagePreviewTranslations,
  truncateMessagePreview
} from './utils/last-message-preview';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationListResponseSchema,
  conversationResponseSchema,
  errorResponseSchema,
  createConversationRequestSchema,
  updateConversationRequestSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation, resolveCallerParticipant } from './utils/access-control';
import { conversationActiveMemberCountSelect } from './utils/active-member-count';
import { loadConversationTombstones } from './utils/delta-tombstones';
import { isBlockedBetween } from '../../utils/blocking';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError, sendError } from '../../utils/response';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import {
  generateConversationIdentifier,
  generateCompactConversationIdentifier,
  ensureUniqueConversationIdentifier
} from './utils/identifier-generator';
import type {
  ConversationParams,
  CreateConversationBody
} from './types';
import { buildCursorPaginationMeta } from '../../utils/pagination';
import { sendWithETag } from '../../utils/etag';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { ConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events';

/**
 * Les huit réglages que `PUT /conversations/:id` peut annoncer sur
 * `conversation:updated`, DÉRIVÉS du contrat plutôt que redéclarés.
 *
 * Ce que la dérivation garde, et qu'un `Record<string, unknown>` ne gardait
 * pas : un neuvième réglage ajouté ici ne compile pas tant qu'il n'est pas
 * déclaré sur `ConversationUpdatedEventData`. C'est par cette carte ouverte que
 * les huit voyageaient sans contrat, alors que les trois clients les lisent.
 *
 * Une clé ABSENTE veut dire « ce réglage n'a pas bougé », jamais « remets-le à
 * zéro » — d'où la composition par spreads conditionnels, qui n'en pose aucune
 * quand la requête ne l'a pas changée.
 */
type ConversationMetadataChanges = Partial<Pick<
  ConversationUpdatedEventData,
  'title' | 'description' | 'avatar' | 'banner' | 'defaultWriteRole'
  | 'isAnnouncementChannel' | 'slowModeSeconds' | 'autoTranslateEnabled'
>>;
import { emitToConversationParticipants } from '../../socketio/emitToConversationParticipants';
import { announceConversationClosed } from '../../socketio/announceConversationClosed';
import { SecuritySanitizer } from '../../utils/sanitize.js';
import { sharedPlaceFromMetadata } from '../../services/location/sharedPlace';
import { resolveVisibleLastMessages } from '../../services/resolveVisibleLastMessage';
import {
  ConversationBridgeService,
  type BridgeOrchestratorInput
} from '../../services/ConversationBridgeService';
import { AgentHttpClient } from '../../services/AgentHttpClient';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';
import { resolveCapabilities } from '@meeshy/shared/utils/reading-modes';
import { ReadingModePreferenceSchema, type ReadingModePreference } from '@meeshy/shared/types/reading-modes';
import type { ConversationType } from '@meeshy/shared/types/conversation';

const logger = enhancedLogger.child({ module: 'conversations/core' });

export {
  LAST_MESSAGE_PREVIEW_MAX_LENGTH,
  truncateMessagePreview,
} from './utils/last-message-preview';

/**
 * Participant fields fetched + serialized per participant in the GET
 * /conversations LIST response (up to 5 participants × N conversations per
 * page, so per-field over-fetch multiplies).
 *
 * T17 — `permissions` (a ~20-boolean ParticipantPermissions object) is
 * intentionally NOT selected here: no client (iOS SDK/app or web) reads
 * participant permissions in the list view, and the conversation DETAIL
 * endpoint (`GET /conversations/:id`) still fetches it via an unfiltered
 * include. `language` IS kept — the web frontend reads `participant.language`
 * for conversation-title language resolution (`apps/web/utils/user.ts`).
 */
export const conversationListParticipantSelect = {
  id: true,
  conversationId: true,
  type: true,
  userId: true,
  displayName: true,
  avatar: true,
  role: true,
  language: true,
  nickname: true,
  joinedAt: true,
  isActive: true,
  isOnline: true,
  lastActiveAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      firstName: true,
      lastName: true,
      avatar: true,
      banner: true,
      isOnline: true,
      lastActiveAt: true
    }
  }
} as const;

/**
 * Sélection des préférences utilisateur jointes à une conversation (liste ET
 * détail). `customName` DOIT y figurer : c'est lui qui pilote le nom affiché
 * d'un DM côté client (`displayName = customName ?? title ?? …`). Son absence
 * historique créait un flip-flop de titre — la liste froide montrait le nom
 * du participant, puis le premier pin/mute rapportait `customName` via la
 * réponse du PATCH préférences et le titre basculait (vu « sandra raveloson »
 * → « Sany » 2026-07-04). Le champ doit AUSSI être déclaré dans le schema
 * wire (`userPreferences` de la conversation, api-schemas.ts), sinon
 * fast-json-stringify le strippe silencieusement — même piège que `reaction`,
 * sélectionné ici mais absent du wire jusqu'à ce même fix.
 */
export const conversationUserPreferencesSelect = {
  isPinned: true,
  isMuted: true,
  isArchived: true,
  deletedForUserAt: true,
  // Lu SERVEUR-side pour masquer l'aperçu d'un historique effacé (cf.
  // `resolveVisibleLastMessages`). Non déclaré dans le schema wire, donc
  // strippé de la réponse — même sort que `deletedForUserAt`, qui n'y figure
  // que sous la forme `isDeletedForUser`.
  clearHistoryBefore: true,
  tags: true,
  categoryId: true,
  reaction: true,
  customName: true,
  // Choix collant du mode de lecture (G-121). Lu SERVEUR-side pour l'entrée
  // d'orchestrateur du pont ✦ (G-123, workshop A6) — pas déclaré dans le
  // schema wire, donc strippé de la réponse comme `clearHistoryBefore` :
  // aucun client ne lit `readingMode` via CETTE route, `GET
  // /user-preferences/conversations/:id` reste l'unique surface qui l'expose.
  readingMode: true
} as const;

/**
 * Le message d'aperçu de la ligne de liste. Extrait en constante parce qu'il
 * est désormais lu par DEUX requêtes : la sélection imbriquée `take: 1` de la
 * liste, et la reprise ciblée qui cherche le dernier message ENCORE VISIBLE
 * quand celui-là est masqué pour ce lecteur (`clear-history` /
 * `delete-for-me`). Deux copies auraient dérivé, et l'aperçu de repli aurait
 * rendu une bulle amputée de la moitié de ses champs.
 */
export const conversationLastMessagePreviewSelect = {
  id: true,
  content: true,
  createdAt: true,
  senderId: true,
  messageType: true,
  isBlurred: true,
  isViewOnce: true,
  effectFlags: true,
  expiresAt: true,
  // Prisme Linguistique de l'aperçu. Les deux champs vivent dans le
  // MÊME document Mongo que le message (`translations` est une
  // colonne JSON, pas une relation) : les sélectionner ne coûte ni
  // jointure ni requête. Sans eux, la ligne de liste restait dans la
  // langue de l'expéditeur pour tout le monde — cf.
  // `utils/last-message-preview.ts`.
  translations: true,
  originalLanguage: true,
  // Lot 3 : aperçu de conversation — sans `metadata`, un dernier
  // message géolocalisé n'affiche jamais sa position dans la
  // liste des conversations.
  metadata: true,
  sender: {
    select: {
      id: true,
      userId: true,
      displayName: true,
      avatar: true,
      type: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true
        }
      }
    }
  },
  attachments: {
    take: 1, // Optimized: only first attachment for preview
    select: {
      id: true,
      mimeType: true,
      thumbnailUrl: true,
      originalName: true,
      fileSize: true,
      // Media metadata for proper display
      duration: true,    // Audio/Video duration in ms
      width: true,       // Image/Video width
      height: true,      // Image/Video height
      bitrate: true,     // Audio/Video bitrate
      sampleRate: true,  // Audio sample rate
      metadata: true     // Additional metadata (effects, etc.)
    }
  },
  _count: {
    select: { attachments: true }
  }
} as const;

/**
 * Iter 33 (F1) — GET /conversations/:id DETAIL include. Participants are
 * capped: a 500-member group used to ship ~500 KB of hydrated participants on
 * every conversation open. Clients tolerate a partial list (web renders the
 * first 3, iOS resolves DM titles from the first 2) and load the full roster
 * through the dedicated paginated GET /conversations/:id/participants
 * endpoint. The filtered `_count` carries the exact active-member total,
 * surfaced as `memberCount` in the response (declared in
 * `conversationSchema`, so it survives fast-json-stringify).
 *
 * Iter 35 (F8) — strict `select` instead of `include`: the wire schema
 * (`conversationParticipantSchema`) declares no nested `user` and only the
 * scalars below, so fast-json-stringify already stripped the rest — the DB was
 * hydrating dead fields (including the sensitive `sessionTokenHash` and the
 * embedded `anonymousSession` document) for up to 100 participants per open.
 * The nested user is server-side only: `generateDefaultConversationTitle`
 * reads displayName/username/firstName/lastName.
 */
export const CONVERSATION_DETAIL_PARTICIPANTS_CAP = 100;

export const conversationDetailInclude = {
  participants: {
    where: { isActive: true },
    orderBy: { joinedAt: 'asc' },
    take: CONVERSATION_DETAIL_PARTICIPANTS_CAP,
    select: {
      id: true,
      userId: true,
      type: true,
      displayName: true,
      avatar: true,
      role: true,
      permissions: true,
      isActive: true,
      isOnline: true,
      lastActiveAt: true,
      joinedAt: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          firstName: true,
          lastName: true
        }
      }
    }
  },
  _count: {
    select: conversationActiveMemberCountSelect
  }
} as const;

/**
 * Enregistre les routes CRUD de base pour les conversations
 */
export function registerCoreRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any,
  requiredAuth: any
) {
  // Route pour vérifier la disponibilité d'un identifiant de conversation
  fastify.get('/conversations/check-identifier/:identifier', {
    schema: {
      description: 'Check if a conversation identifier is available for use',
      tags: ['conversations'],
      summary: 'Check identifier availability',
      params: {
        type: 'object',
        required: ['identifier'],
        properties: {
          identifier: { type: 'string', description: 'Conversation identifier to check' }
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
                available: { type: 'boolean', description: 'Whether the identifier is available' },
                identifier: { type: 'string', description: 'The checked identifier' }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { identifier } = request.params as { identifier: string };

      // Vérifier si l'identifiant existe déjà
      const existingConversation = await prisma.conversation.findFirst({
        where: {
          identifier: {
            equals: identifier,
            mode: 'insensitive'
          }
        },
        select: { id: true }
      });

      return sendSuccess(reply, {
        available: !existingConversation,
        identifier
      });
    } catch (error) {
      logger.error('error checking identifier availability', { error });
      return sendInternalError(reply, 'Failed to check identifier availability');
    }
  });

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
      response: {
        200: conversationListResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string; before?: string; includeCount?: string; type?: string; withUserId?: string; updatedSince?: string } }>, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;

      // Vérifier que l'utilisateur est authentifié
      if (!authRequest.authContext.isAuthenticated) {
        return sendForbidden(reply, 'Authentication required to access conversations');
      }

      const userId = authRequest.authContext.userId;

      // Paramètres de pagination. Default 30 (compromise between perf and
      // round-trips); max 100 to let large-account clients fetch their full
      // list in fewer pages — previously capped at 50, which forced 88+
      // conversation accounts through 2 pages and exposed pagination bugs
      // (offset stagnation, hasMore mis-reads) for any partial sync.
      const limit = Math.min(parseInt(request.query.limit || '30', 10), 100); // Max 100
      const offset = parseInt(request.query.offset || '0', 10);
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
        query: { select: conversationLastMessagePreviewSelect as unknown as Record<string, unknown> }
      });
      for (const conversation of conversations) {
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

      // `authContext.userId` porte un `User.id` pour un compte mais un
      // `Participant.id` pour un invité de lien partagé (branche anonyme
      // d'`UnifiedAuthService`, documentée dans `utils/access-control.ts`) : la
      // COLONNE se branche sur la NATURE de la clé, exactement comme
      // `GET /conversations/search`. Comparer un `Participant.id` à la colonne
      // `userId` ne matche RIEN — pas une erreur, une map vide : le rôle du
      // lecteur disparaissait, et avec lui son droit à l'effectif ENTIER. Un
      // admin de groupe anonyme (que `canViewExactMemberCount` autorise
      // explicitement) était donc plafonné à « 199+ » ici et servi entier par
      // la recherche : deux réponses pour un même lecteur.
      const isAnonymousViewer = authRequest.authContext.type === 'anonymous';

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

      // Présence des co-participants : montrable (co-participation = contexte
      // d'accès déjà garanti), mais soumise aux préférences showOnlineStatus/
      // showLastSeen de chacun — même règle que le broadcast user:status et le
      // presence:snapshot. Anonymes inchangés.
      const presenceVis = await getPresenceVisibilityService(prisma).resolvePrefsOnly(
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
            const vis = m.userId ? presenceVis.get(m.userId) : undefined;
            const hideOnline = vis?.showOnline === false;
            const hideLastSeen = vis?.showLastSeenTimestamp === false;
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
            const senderVis = sender?.userId ? presenceVis.get(sender.userId) : undefined;
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
              sender: sender ? {
                ...sender,
                username: sender.user?.username ?? sender.username ?? null,
                firstName: sender.user?.firstName ?? null,
                lastName: sender.user?.lastName ?? null,
                displayName: resolveParticipantDisplayName(sender),
                avatar: resolveParticipantAvatar(sender),
                isOnline: senderVis?.showOnline === false
                  ? false
                  : (senderLiveOnline ?? sender.user?.isOnline ?? sender.isOnline ?? null),
                lastActiveAt: senderVis?.showLastSeenTimestamp === false
                  ? null
                  : (sender.user?.lastActiveAt ?? sender.lastActiveAt ?? null),
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

  // Route pour obtenir une conversation par ID
  fastify.get<{ Params: ConversationParams }>('/conversations/:id', {
    schema: {
      description: 'Get a specific conversation by ID including participants, settings, and last message',
      tags: ['conversations'],
      summary: 'Get conversation details',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      response: {
        200: conversationResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;

      // Vérifier que l'utilisateur est authentifié
      if (!authRequest.authContext.isAuthenticated) {
        return sendForbidden(reply, 'Authentication required to access this conversation');
      }

      const { id } = request.params;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);

      if (!canAccess) {
          return sendForbidden(reply, 'Access denied: you are not a member of this conversation or it no longer exists', { code: 'CONVERSATION_ACCESS_DENIED' });
      }

      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId },
        include: {
          ...conversationDetailInclude,
          userPreferences: {
            where: { userId: authRequest.authContext.userId },
            take: 1,
            select: conversationUserPreferencesSelect
          }
        }
      });

      if (!conversation) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Pour les DMs, pas de titre — le frontend résout le nom de l'interlocuteur
      const displayTitle = (conversation as any).type === 'direct'
        ? (conversation.title || null)
        : (conversation.title && conversation.title.trim() !== ''
            ? conversation.title
            : generateDefaultConversationTitle(
                conversation.participants.map((m: any) => ({
                  id: m.userId,
                  displayName: m.user?.displayName,
                  username: m.user?.username,
                  firstName: m.user?.firstName,
                  lastName: m.user?.lastName
                })),
                userId
              ));

      // Calculer le unreadCount pour l'utilisateur courant.
      // `resolveCallerParticipant` et pas un `where: { userId }` ecrit a la main :
      // pour un invite de lien partage, `authContext.userId` PORTE un
      // `Participant.id` (branche anonyme d'`UnifiedAuthService`), donc la clause
      // manuelle comparait un id de participant a la colonne `userId` et ne
      // matchait rien. Le compteur retombait silencieusement a 0 — et ce 0
      // ecrasait ensuite le badge que le socket venait de pousser juste.
      let unreadCount = 0;
      // Le rôle du lecteur DANS cette conversation, pour l'effectif servi plus
      // bas. Il ne peut pas se lire dans `conversation.participants` : cette
      // liste est bornée à `CONVERSATION_DETAIL_PARTICIPANTS_CAP` (100), donc
      // aveugle dans le seul cas où le plafond joue. Le participant appelant est
      // déjà résolu ici pour le compteur de non-lus — il porte le rôle avec lui.
      let callerConversationRole: string | null = null;
      try {
        const participant = await resolveCallerParticipant(prisma, authRequest.authContext, conversationId);
        if (participant) {
          callerConversationRole = participant.role;
          const { MessageReadStatusService } = await import('../../services/MessageReadStatusService.js');
          const readStatusService = new MessageReadStatusService(prisma);
          unreadCount = await readStatusService.getUnreadCount(participant.id, conversationId);
        }
      } catch (unreadError) {
        logger.warn('failed to compute unreadCount for conversation', { conversationId, error: unreadError });
      }

      // Marquer automatiquement les notifications de cette conversation comme lues —
      // délégué au service (1 seul update Mongo filtré sur context.conversationId,
      // émet notification:counts pour resynchroniser cloche/badge) et fire-and-forget :
      // effet de bord non essentiel, hors du chemin critique de la réponse
      // (même pattern que posts/interactions.ts pour markPostNotificationsAsRead).
      fastify.notificationService
        ?.markConversationNotificationsAsRead(userId, conversationId)
        .catch((notifError: unknown) => {
          logger.error('error marking auto notifications for conversation', { conversationId, error: notifError });
        });

      // NOTE : l'ancien bloc `meta.conversationStats` (getOrCompute + payload)
      // a été retiré — `conversationSchema` ne déclare pas `meta`, donc
      // fast-json-stringify le strippait du wire : calcul DB coûteux
      // (message.groupBy plein scan à froid, TTL 1h) pour un résultat jeté.
      // Les clients consomment les stats via l'event Socket.IO
      // `conversation:stats`, qui se recompute seul (updateOnNewMessage).
      // Même politique de présence que la liste : override runtime + gate
      // showOnlineStatus/showLastSeen (cf. GET /conversations).
      const presenceVis = await getPresenceVisibilityService(prisma).resolvePrefsOnly(
        conversation.participants
          .map((m: any) => m.userId)
          .filter((uid: string | null): uid is string => !!uid)
      );
      const gatedParticipants = conversation.participants.map((m: any) => {
        const liveOnline = fastify.presenceChecker?.isOnline(m.userId ?? m.id);
        const vis = m.userId ? presenceVis.get(m.userId) : undefined;
        return {
          ...m,
          isOnline: vis?.showOnline === false ? false : (liveOnline === undefined ? m.isOnline : liveOnline),
          lastActiveAt: vis?.showLastSeenTimestamp === false ? null : m.lastActiveAt
        };
      });

      const { _count, ...conversationData } = conversation;
      return sendSuccess(reply, {
        ...conversationData,
        participants: gatedParticipants,
        title: displayTitle,
        // Même cap 199+ que la liste : deux surfaces, une seule présentation,
        // et le même droit de voir l'effectif ENTIER (`canViewExactMemberCount`).
        ...presentMemberCount(_count.participants, {
          viewerSeesExactCount: canViewExactMemberCount({
            platformRole: authRequest.authContext.registeredUser?.role ?? null,
            conversationRole: callerConversationRole
          })
        }),
        // Le rang était résolu ici depuis toujours — pour décider du plafond
        // d'effectif juste au-dessus — et n'était pas servi. Les clients
        // ouvrant une conversation par sa fiche (notification, lien) n'avaient
        // donc AUCUN moyen de savoir qu'ils l'administrent. Même clé que la
        // ligne de liste : une seule notion, un seul nom.
        currentUserRole: callerConversationRole,
        unreadCount
      });

    } catch (error) {
      logger.error('error fetching conversation', { error });
      return sendInternalError(reply, 'Error retrieving conversation');
    }
  });

  // Route pour créer une nouvelle conversation
  fastify.post<{ Body: CreateConversationBody }>('/conversations', {
    schema: {
      description: 'Create a new conversation (direct, group, or public) with specified participants',
      tags: ['conversations'],
      summary: 'Create conversation',
      body: createConversationRequestSchema,
      response: {
        200: conversationResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    try {
      // Valider les données avec Zod
      const validatedData = validateSchema(
        ConversationSchemas.create,
        request.body,
        'create-conversation'
      );

      const { type, title: rawTitle, description: rawDescription, participantIds = [], communityId, identifier } = validatedData as { type: string; title?: string; description?: string; participantIds?: string[]; communityId?: string; identifier?: string };
      const title = rawTitle !== undefined ? SecuritySanitizer.sanitizeText(rawTitle) : undefined;
      const description = rawDescription !== undefined ? SecuritySanitizer.sanitizeText(rawDescription) : undefined;

      // Utiliser le nouveau système d'authentification unifié
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        throw createError(ErrorCode.UNAUTHORIZED, 'Authentication required to create conversation');
      }

      const userId = authContext.userId;

      // Prevent creating conversation with oneself
      if (type === 'direct' && participantIds.length === 1 && participantIds[0] === userId) {
        throw createError(ErrorCode.INVALID_OPERATION, 'Vous ne pouvez pas créer une conversation avec vous-même');
      }

      // Also check if userId is in participantIds (in case of manipulation)
      if (participantIds.includes(userId)) {
        throw createError(ErrorCode.INVALID_OPERATION, 'Vous ne devez pas vous inclure dans la liste des participants');
      }

      // Note: La validation de l'identifier est maintenant gérée par CommonSchemas.conversationIdentifier dans Zod

      // Validate community access if communityId is provided
      if (communityId) {
        const community = await prisma.community.findFirst({
          where: { id: communityId },
          include: { members: true }
        });

        if (!community) {
          return sendNotFound(reply, 'Community not found');
        }

        // Check if user is member of the community
        const isMember = community.createdBy === userId ||
                        community.members.some(member => member.userId === userId);

        if (!isMember) {
          return sendForbidden(reply, 'You must be a member of this community to create a conversation');
        }
      }

      // Generate identifier
      let finalIdentifier: string;
      if (identifier) {
        // Use custom identifier with mshy_ prefix
        finalIdentifier = `mshy_${identifier}`;
        // Ensure uniqueness
        finalIdentifier = await ensureUniqueConversationIdentifier(prisma, finalIdentifier);
      } else {
        // Une DM n'a pas de titre a rendre lisible : son ancien identifiant
        // derivait des deux userId (`mshy_direct-<id1>-<id2>-<horodate>`,
        // ~72 car.) et publiait donc ses deux membres. On emet un identifiant
        // COMPACT et opaque. Les conversations TITREES gardent leur forme
        // lisible — c'est ce que promet le schema Prisma, et un groupe nomme
        // n'expose l'identite de personne.
        const baseIdentifier = type === 'direct'
          ? generateCompactConversationIdentifier()
          : generateConversationIdentifier(title);
        finalIdentifier = await ensureUniqueConversationIdentifier(prisma, baseIdentifier);
      }

      // S'assurer que participantIds ne contient pas de doublons, n'inclut pas le créateur,
      // et ne contient pas de valeurs null/undefined/empty
      const uniqueParticipantIds = [...new Set(participantIds)]
        .filter((id: any) => id && id !== userId && typeof id === 'string' && id.trim().length > 0);

      // Block enforcement applies to DIRECT conversations only (group / community /
      // public / global / broadcast are never block-enforced). Bidirectional: reject
      // if the creator blocked the other party OR the other party blocked the creator.
      if (type === 'direct' && uniqueParticipantIds.length === 1) {
        const blocked = await isBlockedBetween(prisma, userId, uniqueParticipantIds[0]);
        if (blocked) {
          throw createError(ErrorCode.USER_BLOCKED);
        }

        // Idempotence DM — une conversation directe entre deux users est
        // UNIQUE. Sans ce check, chaque « Nouvelle conversation → Créer »
        // fabriquait une DM de plus (2 DM identiques observées en prod le
        // 2026-07-03 pendant les tests d'appel) : on rouvre l'existante
        // (200) au lieu d'en créer une deuxième. Les archivées comptent —
        // recréer la DM d'un contact archivé doit la ROUVRIR, pas la
        // dupliquer. Groupes : jamais dédupliqués (même-membres légitime).
        const existingDirect = await prisma.conversation.findFirst({
          where: {
            type: 'direct',
            AND: [
              { participants: { some: { userId, isActive: true } } },
              { participants: { some: { userId: uniqueParticipantIds[0], isActive: true } } }
            ]
          },
          // Des doublons historiques existent (5 DM atabeth↔jcnm datant
          // d'avant ce fix) : rouvrir la plus RÉCEMMENT ACTIVE, pas une
          // arbitraire — sinon l'utilisateur retombe sur une DM morte.
          orderBy: { lastMessageAt: 'desc' },
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true,
                    banner: true
                  }
                }
              }
            }
          }
        });
        if (existingDirect) {
          const callerParticipant = existingDirect.participants.find((p: any) => p.userId === userId);
          const creatorParticipant = existingDirect.participants.find((p: any) => p.role === 'creator');
          // `!firstMessageSentAt` est ambigu (absent ET null donnent `null`
          // côté client JS) mais sans risque ici : le flip ci-dessous est
          // gardé par un `updateMany({ where: { firstMessageSentAt: null } })`
          // qui ne matche jamais un champ absent (legacy) — 0 ligne, no-op.
          // Ne jamais retirer ce garde sans revoir cette ambiguïté.
          const isEmptyDirect = existingDirect.type === 'direct' && !existingDirect.firstMessageSentAt;

          if (isEmptyDirect && creatorParticipant && callerParticipant?.role !== 'creator') {
            // Le destinataire silencieux réinitie lui-même la conversation —
            // intention mutuelle aussi explicite qu'un message. On la rend
            // visible désormais des deux côtés (Prisme design doc 2026-08-04).
            const flip = await prisma.conversation.updateMany({
              where: { id: existingDirect.id, firstMessageSentAt: null },
              data: { firstMessageSentAt: new Date() }
            });
            if (flip.count > 0) {
              existingDirect.firstMessageSentAt = new Date();
              try {
                const socketIOHandler = fastify.socketIOHandler;
                const io = socketIOHandler?.getManager()?.getIO();
                if (io && creatorParticipant.userId) {
                  io.to(ROOMS.user(creatorParticipant.userId)).emit(SERVER_EVENTS.CONVERSATION_NEW, {
                    conversationId: existingDirect.id,
                    conversationType: existingDirect.type,
                    title: existingDirect.title,
                    creatorId: creatorParticipant.userId,
                    participantIds: existingDirect.participants.map((p: any) => p.userId).filter(Boolean),
                    createdAt: existingDirect.createdAt instanceof Date
                      ? existingDirect.createdAt.toISOString()
                      : String(existingDirect.createdAt)
                  });
                }
              } catch (broadcastError) {
                logger.error('error broadcasting CONVERSATION_NEW on DM reinitiation', { error: broadcastError });
              }
            }
          }

          return sendSuccess(reply, {
            ...existingDirect,
            title: existingDirect.title || null
          }, { statusCode: 200 });
        }
      }

      const allUserIds = [userId, ...uniqueParticipantIds];
      const allUsers = await prisma.user.findMany({
        where: { id: { in: allUserIds } },
        select: { id: true, displayName: true, username: true, avatar: true }
      });
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const defaultPermissions = {
        canSendMessages: true,
        canSendFiles: true,
        canSendImages: true,
        canSendVideos: false,
        canSendAudios: false,
        canSendLocations: false,
        canSendLinks: false
      };

      const creatorUser = userMap.get(userId);
      // Broadcast = announcement channel with admin-only write
      const isBroadcast = type === 'broadcast';

      const conversation = await prisma.conversation.create({
        data: {
          identifier: finalIdentifier,
          type,
          title,
          description,
          communityId: communityId || null,
          ...(isBroadcast ? { isAnnouncementChannel: true, defaultWriteRole: 'admin' } : {}),
          // Explicite (pas juste omis) : Prisma/MongoDB omettrait le champ si
          // on ne le posait pas, ce qui le laisserait ABSENT plutôt que
          // `null` — voir Prisme design doc 2026-08-04 (DM vide et silencieux
          // jusqu'au premier message).
          ...(type === 'direct' ? { firstMessageSentAt: null } : {}),
          participants: {
            create: [
              {
                userId,
                type: 'user',
                displayName: creatorUser?.displayName || creatorUser?.username || 'User',
                role: 'creator',
                permissions: defaultPermissions
              },
              ...uniqueParticipantIds.map((participantId: string) => {
                const pUser = userMap.get(participantId);
                return {
                  userId: participantId,
                  type: 'user',
                  displayName: pUser?.displayName || pUser?.username || 'User',
                  role: 'member',
                  permissions: defaultPermissions
                };
              })
            ]
          }
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true,
                  banner: true
                }
              }
            }
          }
        }
      });

      // Si la conversation est créée dans une communauté, ajouter automatiquement
      // tous les participants à la communauté s'ils n'y sont pas déjà
      if (communityId) {
        const allUserIds = [userId, ...uniqueParticipantIds];

        // Récupérer les membres actuels de la communauté
        const existingMembers = await prisma.communityMember.findMany({
          where: {
            communityId,
            userId: { in: allUserIds }
          },
          select: { userId: true }
        });

        const existingUserIds = existingMembers.map(member => member.userId);
        const newUserIds = allUserIds.filter(id => !existingUserIds.includes(id));

        // Ajouter les nouveaux membres à la communauté
        if (newUserIds.length > 0) {
          await prisma.communityMember.createMany({
            data: newUserIds.map(userId => ({
              communityId,
              userId
            }))
          });
        }
      }

      // Pour les DMs, pas de titre — le frontend résout le nom de l'interlocuteur
      const displayTitle = type === 'direct'
        ? (conversation.title || null)
        : (conversation.title && conversation.title.trim() !== ''
            ? conversation.title
            : generateDefaultConversationTitle(
                conversation.participants.map((m: any) => ({
                  id: m.userId,
                  displayName: m.user?.displayName,
                  username: m.user?.username,
                  firstName: m.user?.firstName,
                  lastName: m.user?.lastName
                })),
                userId
              ));

      // Diffuser le nouvel event typé CONVERSATION_NEW à TOUS les participants
      // — y compris le créateur — dans leurs user-rooms respectives. Avant ce
      // change, le créateur n'avait AUCUN signal socket (la boucle de
      // notifications ci-dessous itère uniquement sur `uniqueParticipantIds`
      // qui exclut `userId`), ce qui forçait les clients iOS et web à
      // implémenter un workaround local (ConversationCreatedBroadcaster sur
      // iOS) pour faire apparaître la nouvelle conversation immédiatement.
      // Avec CONVERSATION_NEW, la source de vérité reste sur le gateway et
      // tous les clients (web, iOS, future plateformes) reçoivent le même
      // payload typé. La notification:new legacy reste émise en parallèle
      // pour compat avec les anciens clients pendant ~3 mois.
      try {
        const socketIOHandler = fastify.socketIOHandler;
        const socketManager = socketIOHandler?.getManager();
        const io = socketManager?.getIO();
        if (io) {
          const allParticipantIds = [userId, ...uniqueParticipantIds];
          // Auto-join every already-connected participant's sockets to the
          // conversation room BEFORE announcing it. Without this, connected
          // participants are in `connectedUsers` (so never offline-queued)
          // but not in ROOMS.conversation(id) — every message:new for the
          // new conversation is silently missed until their next reconnect.
          for (const participantId of allParticipantIds) {
            socketManager.joinUserToConversationRoom(participantId, conversation.id).catch(
              (err: unknown) => logger.error('Failed to auto-join participant to new conversation room', { participantId, error: err })
            );
          }
          const conversationNewPayload = {
            conversationId: conversation.id,
            conversationType: type,
            title: displayTitle,
            creatorId: userId,
            participantIds: allParticipantIds,
            createdAt: conversation.createdAt instanceof Date
              ? conversation.createdAt.toISOString()
              : String(conversation.createdAt)
          };
          // Un direct fraîchement créé (0 message) reste silencieux pour les
          // autres participants — seul le créateur voit sa conversation
          // vide apparaître immédiatement (Prisme design doc 2026-08-04).
          const emitParticipantIds = type === 'direct' ? [userId] : allParticipantIds;
          for (const participantId of emitParticipantIds) {
            io.to(ROOMS.user(participantId)).emit(
              SERVER_EVENTS.CONVERSATION_NEW,
              conversationNewPayload
            );
          }
        }
      } catch (broadcastError) {
        logger.error('error broadcasting CONVERSATION_NEW', { error: broadcastError });
        // Non bloquant : la conversation est créée, les clients la verront
        // au prochain delta sync ou via la notification legacy ci-dessous.
      }

      // Envoyer des notifications aux participants invités — sauf pour un
      // direct fraîchement créé (0 message) : silencieux à la création, voir
      // Prisme design doc 2026-08-04.
      const notificationService = fastify.notificationService;
      if (notificationService && uniqueParticipantIds.length > 0 && type !== 'direct') {
        try {
          // Le créateur est déjà chargé dans userMap (userId ∈ allUserIds) :
          // pas de second aller-retour DB.
          const creator = userMap.get(userId);

          if (creator) {
            // Notifications d'invitation indépendantes : fan-out parallèle (O(1) latence).
            await Promise.all(
              uniqueParticipantIds.map(async (participantId) => {
                await notificationService.createConversationInviteNotification({
                  invitedUserId: participantId,
                  inviterId: userId,
                  inviterUsername: creator.displayName || creator.username,
                  inviterAvatar: creator.avatar || undefined,
                  conversationId: conversation.id,
                  conversationTitle: displayTitle,
                  conversationType: type
                });
                logger.debug('invitation notification sent', { participantId, conversationId: conversation.id });
              })
            );
          }
        } catch (notifError) {
          logger.error('error sending invitation notifications', { error: notifError });
          // Ne pas bloquer la création de la conversation
        }
      }

      return sendSuccess(reply, {
        ...conversation,
        title: displayTitle
      }, { statusCode: 201 });

    } catch (error) {
      sendErrorResponse(reply, error as Error, 'create-conversation');
    }
  });

  // Route pour mettre à jour une conversation
  // `PUT` ET `PATCH` sur un SEUL handler. Ce sont deux verbes pour un seul
  // geste — « modifie ces champs-là » — et les avoir écrits deux fois, dans
  // deux fichiers, a produit exactement ce qu'une duplication produit : deux
  // contrats qui divergent. Le jumeau vivait dans `sharing.ts` et n'acceptait
  // que `title`/`description`/`type` ; le web lui postait `avatar` et `banner`,
  // qu'il ignorait en silence tout en répondant 200 — bannière et avatar
  // restaient vides pendant que l'interface annonçait le succès (mesuré en
  // production le 2026-08-24). Il ne diffusait par ailleurs AUCUN
  // `conversation:updated`, et laissait n'importe quel membre renommer le
  // groupe. Il a été supprimé : ici est le seul point d'écriture des
  // métadonnées d'une conversation.
  //
  // Garde : `conversation-update-route.test.ts` rejoue chaque cas SUR LES DEUX
  // VERBES — un handler qui se remettrait à diverger y rougirait.
  fastify.route<{
    Params: ConversationParams;
    Body: Partial<CreateConversationBody>;
  }>({
    method: ['PUT', 'PATCH'],
    url: '/conversations/:id',
    schema: {
      description: 'Update conversation metadata (title, description, avatar, banner) and container settings - requires creator/admin/moderator role. PUT and PATCH are equivalent: both apply only the fields present in the body.',
      tags: ['conversations'],
      summary: 'Update conversation',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      body: updateConversationRequestSchema,
      response: {
        200: conversationResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth],
    handler: async (request, reply) => {
    try {
      const { id } = request.params;
      const { title: rawTitle, description: rawDescription, avatar, banner, defaultWriteRole, isAnnouncementChannel, slowModeSeconds, autoTranslateEnabled } = request.body as {
        title?: string
        description?: string
        avatar?: string | null
        banner?: string | null
        defaultWriteRole?: string
        isAnnouncementChannel?: boolean
        slowModeSeconds?: number
        autoTranslateEnabled?: boolean
      };
      const title = rawTitle !== undefined ? SecuritySanitizer.sanitizeText(rawTitle) : undefined;
      const description = rawDescription !== undefined ? SecuritySanitizer.sanitizeText(rawDescription) : undefined;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // « ID or identifier », dit le schéma — et seul le jumeau supprimé le
      // tenait. Ici, `where: { conversationId: id }` recevait le `mshy_…` tel
      // quel, ne trouvait aucune appartenance, et répondait 403 à un créateur
      // parfaitement légitime qui avait ouvert sa conversation par son
      // identifiant lisible. Toutes les routes voisines résolvent d'abord.
      const conversationId = id === 'meeshy' ? id : await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Vérifier les permissions d'administration
      // Le `select` ramène le TYPE du conteneur par la relation que cette
      // requête d'appartenance charge déjà — la garde du tête-à-tête ci-dessous
      // en dépend, et aucune requête de plus n'est émise pour l'obtenir.
      const membership = await prisma.participant.findFirst({
        where: {
          conversationId: conversationId,
          userId: userId,
          role: { in: ['creator', 'admin', 'moderator'] },
          isActive: true
        },
        select: {
          role: true,
          conversation: { select: { type: true } }
        }
      });

      if (!membership && id !== "meeshy") {
        return sendForbidden(reply, 'Vous n\'êtes pas autorisé à modifier cette conversation');
      }

      // Interdire la modification de la conversation globale
      if (id === "meeshy") {
        return sendForbidden(reply, 'The global conversation cannot be modified');
      }

      if (membership?.role === 'moderator') {
        if (defaultWriteRole !== undefined || isAnnouncementChannel !== undefined ||
            slowModeSeconds !== undefined || autoTranslateEnabled !== undefined) {
          return sendForbidden(reply, 'Les modérateurs ne peuvent pas modifier les permissions');
        }
      }

      // Le rang d'écriture, le canal d'annonces et le mode lent décrivent la
      // POLICE d'un conteneur À HIÉRARCHIE. Un tête-à-tête n'en a pas : ses
      // rôles `creator`/`member` nomment qui a ouvert le fil, pas une autorité
      // sur l'autre partie (cf. WRITE_HIERARCHY_FREE_TYPES dans
      // `conversationWriteAdmission`). Les laisser passer permettait à
      // l'initiateur de faire TAIRE son pair, refusé ensuite à chaque envoi,
      // et sans recours : ce même PUT lui répond 403 puisqu'il est `member`.
      //
      // Le filtre ne porte QUE sur ces trois champs. `autoTranslateEnabled`,
      // `title`, `description`, `avatar` et `banner` ne décrivent aucune
      // hiérarchie et restent modifiables sur un tête-à-tête.
      //
      // Un type inconnu reste permissif — idiome documenté du module
      // d'admission. Ce n'est pas un trou : la garde qui protège réellement le
      // pair est la règle d'admission, qui lit le type sur la ligne AUTORITAIRE
      // de conversation. Ici on empêche l'écriture d'un réglage sans effet, et
      // l'événement `conversation:updated` qui l'annoncerait aux clients.
      if (membership?.conversation?.type === 'direct' &&
          (defaultWriteRole !== undefined || isAnnouncementChannel !== undefined ||
           slowModeSeconds !== undefined)) {
        return sendForbidden(reply, 'Un tête-à-tête n\'a pas de hiérarchie d\'écriture : ces réglages ne s\'y appliquent pas');
      }

      const conversationInclude = {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                banner: true
              }
            }
          }
        }
      } as const;

      const updateData = {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(avatar !== undefined && { avatar }),
        ...(banner !== undefined && { banner }),
        ...(defaultWriteRole !== undefined && { defaultWriteRole }),
        ...(isAnnouncementChannel !== undefined && { isAnnouncementChannel }),
        ...(slowModeSeconds !== undefined && { slowModeSeconds }),
        ...(autoTranslateEnabled !== undefined && { autoTranslateEnabled }),
      };

      // Un corps qui ne nomme aucun champ connu n'est pas une erreur du client :
      // c'est une écriture vide. Prisma, lui, refuse un `data` vide et levait —
      // la route répondait 500 à un `{}`. On rend l'état courant, sans écrire et
      // sans annoncer un changement qui n'a pas eu lieu.
      // Gate de présence des co-participants. `conversationParticipantSchema`
      // DÉCLARE `isOnline`/`lastActiveAt`, et l'`include` ci-dessus ramène tous
      // les scalaires de `Participant` : ces deux champs atteignaient le fil
      // BRUTS. Régime `resolvePrefsOnly` — la co-participation est un contexte
      // d'accès garanti des DEUX côtés, seules les préférences s'appliquent, et
      // un id ABSENT de la carte vaut MONTRABLE (un participant sans compte n'a
      // pas de préférences et doit rester visible).
      //
      // Défini ici, appliqué aux DEUX sorties : la branche « rien à écrire »
      // rend les mêmes lignes que la branche nominale, donc la même donnée à
      // garder. Une porte posée sur une seule des deux n'est pas une porte.
      const gatePresence = async <P extends { userId: string | null; isOnline: boolean | null; lastActiveAt: Date | null }>(
        participants: P[]
      ) => {
        const vis = await getPresenceVisibilityService(prisma).resolvePrefsOnly(
          participants
            .map((p) => p.userId)
            .filter((uid): uid is string => !!uid)
        );
        return participants.map((p) => {
          const prefs = p.userId ? vis.get(p.userId) : undefined;
          return {
            ...p,
            isOnline: prefs?.showOnline === false ? false : p.isOnline,
            lastActiveAt: prefs?.showLastSeenTimestamp === false ? null : p.lastActiveAt,
          };
        });
      };

      if (Object.keys(updateData).length === 0) {
        const unchanged = await prisma.conversation.findUnique({
          where: { id: conversationId },
          include: conversationInclude
        });
        if (!unchanged) {
          return sendNotFound(reply, 'Conversation not found');
        }
        return sendSuccess(reply, {
          ...unchanged,
          participants: await gatePresence(unchanged.participants),
        });
      }

      const updatedConversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: updateData,
        include: conversationInclude
      });

      // Typé sur le contrat, pas `Record<string, unknown>` : une carte ouverte
      // est une absence de déclaration qui a l'air d'en être une, et c'est par
      // celle-ci que les huit réglages voyageaient sans contrat. La forme
      // `Pick` est ce qui garde la liste D'ICI et celle du contrat ensemble —
      // un neuvième réglage ajouté ici ne compile pas tant qu'il n'est pas
      // déclaré là-bas.
      const changedFields: ConversationMetadataChanges = {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(avatar !== undefined && { avatar }),
        ...(banner !== undefined && { banner }),
        ...(defaultWriteRole !== undefined && { defaultWriteRole }),
        ...(isAnnouncementChannel !== undefined && { isAnnouncementChannel }),
        ...(slowModeSeconds !== undefined && { slowModeSeconds }),
        ...(autoTranslateEnabled !== undefined && { autoTranslateEnabled }),
      }

      const socketIOHandler = fastify.socketIOHandler
      const io = socketIOHandler?.getManager()?.getIO()
      if (io) {
        // La room de conversation ne suffit pas, et c'est le MÊME raisonnement
        // qui a fait naître `emitConversationPreviewUpdate` pour l'autre moitié
        // de ce payload : un participant posé sur l'écran de LISTE a quitté
        // `conversation:<id>` et n'est joignable que par sa room personnelle.
        // Sans elle, un renommage — ou un changement d'avatar, de bannière, de
        // mode lent, de canal d'annonce — n'atteignait que ceux qui avaient le
        // fil ouvert. La ligne de liste de tous les autres gardait l'ancien
        // titre jusqu'à un rechargement complet.
        //
        // Le helper chaîne les rooms (au plus UNE copie par socket, même pour
        // un client qui est à la fois dans le fil et dans sa room) et nomme la
        // room d'un participant sans compte par son `Participant.id`
        // (`userId ?? id`) — la seule ligne que chaque copie de ce code avait
        // ratée. Les participants inactifs sont écartés : quitter une
        // conversation, c'est cesser d'en recevoir les métadonnées.
        //
        // Le payload ne porte AUCUNE clé `lastMessage*`, et c'est délibéré :
        // le tri-état client distingue « clé absente » (cet événement ne parle
        // pas du dernier message) de « clé nulle » (la carte du Prisme est
        // périmée). Un `lastMessageTranslations: null` posé ici effacerait une
        // traduction parfaitement valide sur toutes les lignes de liste.
        emitToConversationParticipants({
          io,
          conversationId,
          participants: updatedConversation.participants.filter(p => p.isActive),
          event: SERVER_EVENTS.CONVERSATION_UPDATED,
          payload: {
            conversationId,
            ...changedFields,
            updatedBy: { id: userId },
            updatedAt: new Date().toISOString(),
          },
        })
      }

      // La route jumelle supprimée gardait la présence ; le `PUT`, jamais.
      // Porter ce qu'un exemplaire avait de PLUS fait partie de la
      // consolidation — sans quoi unifier revient à choisir la moins bonne des
      // deux moitiés.
      return sendSuccess(reply, {
        ...updatedConversation,
        participants: await gatePresence(updatedConversation.participants),
      });

    } catch (error) {
      logger.error('error updating conversation', { error });
      return sendInternalError(reply, 'Error updating conversation');
    }
    }
  });

  // Route pour supprimer une conversation
  fastify.delete<{ Params: ConversationParams }>('/conversations/:id', {
    schema: {
      description: 'Delete a conversation (soft delete - marks as inactive) - requires creator role',
      tags: ['conversations'],
      summary: 'Delete conversation',
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
                message: { type: 'string', example: 'Conversation supprimée avec succès' }
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
      const { id } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Interdire la suppression de la conversation globale
      if (id === "meeshy") {
        return sendForbidden(reply, 'The global conversation cannot be deleted');
      }

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Vérifier les permissions d'administration
      const membership = await prisma.participant.findFirst({
        where: {
          conversationId: conversationId,
          userId: userId,
          role: { in: ['creator', 'admin'] },
          isActive: true
        }
      });

      if (!membership) {
        return sendForbidden(reply, 'Vous n\'êtes pas autorisé à supprimer cette conversation');
      }

      // Marquer la conversation comme inactive plutôt que de la supprimer
      const now = new Date()
      // Les participants sont ramenés PAR l'écriture : le fan-out ci-dessous a
      // besoin de nommer leurs rooms personnelles, et une seconde requête pour
      // les lire pourrait tomber sur un état déjà modifié.
      const closedConversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: { isActive: false, closedAt: now, closedBy: userId },
        include: { participants: { select: { id: true, userId: true, isActive: true } } }
      });

      // Broadcast closure to all members — ce que le commentaire annonçait sans
      // que le code le fasse. Adressée à la seule room de conversation, la
      // clôture n'atteignait que les membres ayant le fil OUVERT ; tous les
      // autres gardaient la ligne dans leur liste et n'apprenaient la fermeture
      // qu'en tapant dessus. Même raison que le renommage ci-dessus : la room
      // personnelle est le seul endroit où joindre un client posé sur la liste.
      //
      // `announceConversationClosed` et non l'émission directe : fermer un fil
      // éteint aussi ce qu'il portait de vivant (les partages de position en
      // cours), et cette décision ne se répète pas sur les trois chemins de
      // clôture — elle vit dans l'unité qui les sert tous.
      const closureManager = fastify.socketIOHandler?.getManager()
      announceConversationClosed({
        io: closureManager?.getIO(),
        manager: closureManager,
        conversationId,
        participants: closedConversation.participants.filter(p => p.isActive),
        closedBy: userId,
        closedAt: now
      })

      return sendSuccess(reply, { message: 'Conversation supprimée avec succès' });

    } catch (error) {
      logger.error('error deleting conversation', { error });
      return sendInternalError(reply, 'Erreur lors de la suppression de la conversation');
    }
  });

  // Route pour obtenir l'analyse agent d'une conversation
  fastify.get<{ Params: ConversationParams }>('/conversations/:id/analysis', {
    schema: {
      description: 'Get agent analysis for a conversation (summary, tone, participant profiles)',
      tags: ['conversations'],
      summary: 'Get conversation analysis',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      response: {
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;
      const { id } = request.params;
      const userId = authRequest.authContext.userId;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Access denied');
      }

      const TRAIT_FIELDS_MAP: Record<string, string[]> = {
        communication: ['Verbosity', 'Formality', 'ResponseSpeed', 'InitiativeRate', 'Clarity', 'Argumentation'],
        personality: ['SocialStyle', 'Assertiveness', 'Agreeableness', 'Humor', 'Emotionality', 'Openness', 'Confidence', 'Creativity', 'Patience', 'Adaptability'],
        interpersonal: ['Empathy', 'Politeness', 'Leadership', 'ConflictStyle', 'Supportiveness', 'Diplomacy', 'TrustLevel'],
        emotional: ['EmotionalStability', 'Positivity', 'Sensitivity', 'StressResponse'],
      };

      function buildTraits(role: Record<string, any>) {
        const traits: Record<string, Record<string, { label: string; score: number }>> = {};
        let hasAny = false;
        for (const [cat, fields] of Object.entries(TRAIT_FIELDS_MAP)) {
          const catTraits: Record<string, { label: string; score: number }> = {};
          for (const field of fields) {
            const label = role[`trait${field}`];
            const score = role[`trait${field}Score`];
            if (label != null && score != null) {
              const key = field.charAt(0).toLowerCase() + field.slice(1);
              catTraits[key] = { label, score };
              hasAny = true;
            }
          }
          if (Object.keys(catTraits).length > 0) traits[cat] = catTraits;
        }
        return hasAny ? traits : null;
      }

      const [summary, roles, snapshots] = await Promise.all([
        prisma.agentConversationSummary.findUnique({
          where: { conversationId }
        }),
        prisma.agentUserRole.findMany({
          where: { conversationId },
        }),
        prisma.agentAnalysisSnapshot.findMany({
          where: {
            conversationId,
            snapshotDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { snapshotDate: 'asc' },
        }),
      ]);

      // Enrichir les roles avec username/displayName
      const userIds = roles.map(r => r.userId);
      const users = userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true, firstName: true, lastName: true, avatar: true }
          })
        : [];

      const userMap = new Map(users.map(u => [u.id, u]));

      const participantProfiles = roles.map((role: Record<string, any>) => {
        const user = userMap.get(role.userId);
        return {
          userId: role.userId,
          username: user?.username ?? null,
          displayName: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.username : null,
          avatar: user?.avatar ?? null,
          personaSummary: role.personaSummary,
          tone: role.tone,
          vocabularyLevel: role.vocabularyLevel,
          typicalLength: role.typicalLength,
          emojiUsage: role.emojiUsage,
          topicsOfExpertise: role.topicsOfExpertise,
          catchphrases: role.catchphrases,
          commonEmojis: role.commonEmojis,
          reactionPatterns: role.reactionPatterns,
          messagesAnalyzed: role.messagesAnalyzed,
          confidence: role.confidence,
          traits: buildTraits(role),
          dominantEmotions: role.dominantEmotions ?? [],
          relationshipMap: role.relationshipMap ?? {},
          sentimentScore: role.sentimentScore ?? null,
          engagementLevel: role.engagementLevel ?? null,
          locked: role.locked,
        };
      });

      return sendSuccess(reply, {
        conversationId,
        summary: summary ? {
          text: summary.summary,
          currentTopics: summary.currentTopics,
          overallTone: summary.overallTone,
          messageCount: summary.messageCount,
          updatedAt: summary.updatedAt,
          healthScore: summary.healthScore ?? null,
          engagementLevel: summary.engagementLevel ?? null,
          conflictLevel: summary.conflictLevel ?? null,
          dynamique: summary.dynamique ?? null,
          dominantEmotions: summary.dominantEmotions ?? [],
        } : null,
        participantProfiles,
        history: snapshots.map(s => ({
          snapshotDate: s.snapshotDate.toISOString(),
          overallTone: s.overallTone,
          healthScore: s.healthScore,
          engagementLevel: s.engagementLevel,
          conflictLevel: s.conflictLevel,
          topTopics: s.topTopics,
          dominantEmotions: s.dominantEmotions,
          messageCountAtSnapshot: s.messageCountAtSnapshot,
          participantSnapshots: s.participantSnapshots,
        })),
      });

    } catch (error) {
      logger.error('error fetching conversation analysis', { error });
      return sendInternalError(reply, 'Error fetching conversation analysis');
    }
  });
}
