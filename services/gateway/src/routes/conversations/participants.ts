import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UserRoleEnum } from '@meeshy/shared/types';
import { resolveParticipantAvatar, serializeConversationParticipant } from '@meeshy/shared/utils/participant-helpers';
import { resolveTargetParticipant, identifyTarget } from './utils/target-participant';
import {
  ACTIVE_MEMBER_LISTING_LIMIT,
  canViewExactMemberCount,
  isMemberListingRestricted,
  presentMemberCount
} from '@meeshy/shared/utils/member-visibility';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationParticipantSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache';
import { postJoinSystemMessage } from '../../services/conversations/joinSystemMessage';
import {
  resolveParticipantRights,
  resolveEntryRights,
  PARTICIPANT_RIGHT_NAMES,
  type ParticipantRightName,
} from '../../services/participantRights';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { emitConversationMemberCountEvent } from '../../socketio/emitConversationMemberCount';
import { participantUserRooms } from '../../socketio/emitToConversationParticipants';
import { endConversationMembership } from '../../socketio/endConversationMembership';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError, sendError } from '../../utils/response';
import {
  resolveConversationEntry,
  REJOIN_PARTICIPANT_STATE
} from '../../services/conversations/conversationEntryAdmission';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { getPresenceVisibilityService, type PresenceViewer } from '../../services/PresenceVisibilityService';
import { presenceFor, viewerFromRequest } from '../users/presence-gate';
import { isGlobalAdmin, hasMinimumMemberRole, isMemberCreator, memberRoleCasings, MemberRole } from '@meeshy/shared/types/role-types';
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import { sliceByIdCursor, validatePagination } from '../../utils/pagination';
import { z } from 'zod';
const logger = enhancedLogger.child({ module: 'ConversationParticipantsRoutes' });

/**
 * Les rangs qui font un HÔTE de la conversation, tels qu'un `where` Prisma peut
 * les matcher. DÉRIVÉS de la hiérarchie plutôt que retapés : un rang ajouté
 * au-dessus de `moderator` en fera partie sans qu'on ait à y penser, et le
 * dépôt n'a qu'UNE autorité sur « qui est au-dessus de qui »
 * (`hasMinimumMemberRole`).
 *
 * Les DEUX casses y figurent, et ce n'est pas une précaution : le filtre part
 * en BASE, où un `in` Prisma ne connaît pas `mode: 'insensitive'`.
 * `Participant.role` s'écrit en minuscules depuis #3875, mais les lignes
 * écrites AVANT portent encore `'ADMIN'`/`'CREATOR'` tant que
 * `scripts/migrations/normalize-participant-role-casing.ts` n'a pas tourné en
 * production — et le symptôme d'un filtre trop étroit est un administrateur
 * qui ne reçoit tout simplement PAS l'événement, en silence, sans erreur.
 * Deux lignes plus haut, la garde du demandeur replie déjà la casse
 * (`viewerRole.toLowerCase()`) : le filtre de base ne doit pas être le seul
 * endroit du fichier qui l'ignore.
 */
const CONVERSATION_HOST_ROLE_MATCHES: readonly string[] = memberRoleCasings(
  Object.values(MemberRole).filter((role) => hasMinimumMemberRole(role, MemberRole.MODERATOR)),
);

/**
 * `PATCH …/rights` : un instant ISO 8601 (décalage admis), `null` pour retirer,
 * absent pour ne rien dire.
 *
 * Borné au PRÉSENT. Le plancher est un `createdAt: { gte: date }` : une date à
 * venir n'exclut pas seulement le passé, elle exclut aussi les messages À
 * VENIR — y compris ceux que l'intéressé écrit lui-même. Sans cette borne,
 * « ouvrir l'historique depuis le 1er janvier prochain » rendait le participant
 * AVEUGLE à toute la conversation, silencieusement : un mute déguisé en octroi,
 * qu'aucune erreur ne signalait à l'administrateur qui venait de l'écrire.
 */
const HISTORY_VISIBLE_FROM_BODY = z.iso
  .datetime({ offset: true, error: 'historyVisibleFrom must be an ISO 8601 date-time or null' })
  .refine((value) => Date.parse(value) <= Date.now(), {
    error: 'historyVisibleFrom must not be in the future: a future floor hides every message, including the participant\'s own',
  })
  .nullable()
  .optional();

/**
 * Portée du prédicat « en ligne » d'un listing filtré `?onlineOnly=true`.
 *
 * La porte de présence (`resolveForTargets`) ne gouverne que la VALEUR servie.
 * Filtrer sur `Participant.isOnline` AVANT elle — en base pour le listing
 * complet, en mémoire pour le top-99 — livrait à un non-ami la liste exacte
 * des membres en ligne, chacun masqué `isOnline:false` : l'APPARTENANCE à la
 * liste était la fuite. La sélection obéit donc à la même loi que le champ,
 * et ne peut porter que sur les `User.id` dont le viewer a le DROIT de
 * connaître l'état en ligne :
 *
 *  - `'everyone'` — ADMIN/BIGBOSS, que la loi sert FULL : aucune borne ;
 *  - un ensemble — soi-même ∪ amitiés acceptées (`acceptedFriendIds`), la
 *    seule relation que la directive du 2026-08-25 tient pour une
 *    autorisation ; VIDE pour un viewer anonyme, qui ne voit personne en ligne.
 *
 * Ce que la porte MASQUE ensuite (préférence `showOnlineStatus`, blocage,
 * désactivation) sort de la page par `servedOnline` : la sélection en amont ne
 * connaît que l'amitié, la porte connaît le reste.
 */
type OnlineOnlyScope = 'everyone' | ReadonlySet<string>;

async function onlineOnlyScope(prisma: PrismaClient, viewer: PresenceViewer): Promise<OnlineOnlyScope> {
  if (viewer && isGlobalAdmin(viewer.role)) return 'everyone';
  if (!viewer) return new Set();
  const friends = await getPresenceVisibilityService(prisma).acceptedFriendIds(viewer.userId);
  return new Set([...friends, viewer.userId]);
}

const withinOnlineOnlyScope = (scope: OnlineOnlyScope, userId: string | null | undefined): boolean =>
  scope === 'everyone' || (!!userId && scope.has(userId));

const onlineOnlyWhere = (scope: OnlineOnlyScope) => ({
  isOnline: true,
  ...(scope === 'everyone' ? {} : { userId: { in: [...scope] } })
});

/**
 * Une page filtrée « en ligne » ne contient que ce qu'elle SERT en ligne.
 */
const servedOnline = (participant: { readonly isOnline: boolean }): boolean => participant.isOnline === true;

const participantListUserSelect = {
  user: {
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      displayName: true,
      avatar: true,
      role: true,
      isOnline: true,
      lastActiveAt: true,
      systemLanguage: true,
      regionalLanguage: true,
      customDestinationLanguage: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      deactivatedAt: true
    }
  }
} as const;

type ParticipantActivityStat = {
  messageCount?: number;
  lastMessageAt?: string | null;
};

/**
 * Listing restreint : les N participants actifs les plus actifs de la
 * conversation, classés par `ConversationMessageStats.participantStats`
 * (messageCount puis lastMessageAt — clé `statsAuthorKey` : User.id pour un
 * inscrit, Participant.id pour un anonyme), complétés par les présents/anciens
 * quand les stats ne suffisent pas. Filtres et pagination opèrent SUR cette
 * liste bornée : un simple membre ne peut pas énumérer l'annuaire complet,
 * ni par curseur ni par recherche.
 */
async function loadMostActiveParticipants(options: {
  prisma: PrismaClient;
  conversationId: string;
  filters: { onlineOnly?: OnlineOnlyScope; role?: string; search?: string };
  cursor?: string;
  pageLimit: number;
}): Promise<{ participants: any[]; hasMore: boolean; nextCursor: string | null }> {
  const { prisma, conversationId, filters, cursor, pageLimit } = options;

  const statsRow = await prisma.conversationMessageStats.findUnique({
    where: { conversationId },
    select: { participantStats: true }
  });
  const rawStats = statsRow?.participantStats;
  const parsedStats = ((typeof rawStats === 'string' ? JSON.parse(rawStats) : rawStats) ??
    {}) as Record<string, ParticipantActivityStat>;
  const rankedKeys = Object.entries(parsedStats)
    .sort(
      ([, a], [, b]) =>
        (b.messageCount ?? 0) - (a.messageCount ?? 0) ||
        (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')
    )
    .map(([key]) => key)
    .slice(0, ACTIVE_MEMBER_LISTING_LIMIT * 2);

  const ranked = rankedKeys.length > 0
    ? await prisma.participant.findMany({
        where: {
          conversationId,
          isActive: true,
          OR: [{ userId: { in: rankedKeys } }, { id: { in: rankedKeys } }]
        },
        include: participantListUserSelect
      })
    : [];

  const ordered: any[] = [];
  const taken = new Set<string>();
  for (const key of rankedKeys) {
    if (ordered.length >= ACTIVE_MEMBER_LISTING_LIMIT) break;
    const match = ranked.find((p) => !taken.has(p.id) && (p.userId === key || p.id === key));
    if (match) {
      taken.add(match.id);
      ordered.push(match);
    }
  }
  // Le complément se classe par ANCIENNETÉ seule. Il portait `isOnline: 'desc'`
  // en tête, pour un lecteur à qui la porte masque ensuite ce champ : les
  // en-ligne remontaient, et leur POSITION disait ce que le champ taisait. Ce
  // chemin ne sert jamais un viewer privilégié (tout rang plateforme au-dessus
  // de USER est exempté du top-99 par `isMemberListingRestricted`) — la clé de
  // présence n'y a donc aucun ayant droit, et sort sans condition. Pas de
  // stabilisation par la présence servie non plus : cette liste est un rang
  // d'ACTIVITÉ, qu'un « amis en ligne d'abord » briserait.
  if (ordered.length < ACTIVE_MEMBER_LISTING_LIMIT) {
    const fill = await prisma.participant.findMany({
      where: { conversationId, isActive: true, id: { notIn: [...taken] } },
      orderBy: { joinedAt: 'asc' },
      take: ACTIVE_MEMBER_LISTING_LIMIT - ordered.length,
      include: participantListUserSelect
    });
    ordered.push(...fill);
  }

  const searchTerm = filters.search?.trim().toLowerCase() ?? '';
  const filtered = ordered.filter(
    (p) =>
      (!filters.onlineOnly || (p.isOnline && withinOnlineOnlyScope(filters.onlineOnly, p.userId))) &&
      (!filters.role || (p.role ?? '').toLowerCase() === filters.role.toLowerCase()) &&
      (!searchTerm || (p.displayName ?? '').toLowerCase().includes(searchTerm))
  );

  // `filtered` is recomputed on every request from live ranking + presence, so a
  // stale cursor (a member who left the top-N or went offline) must terminate
  // pagination rather than silently restart from page 1. See `sliceByIdCursor`.
  const { page, hasMore, nextCursor } = sliceByIdCursor(filtered, cursor, pageLimit);
  return { participants: page, hasMore, nextCursor };
}

/**
 * Enregistre les routes de gestion des participants
 */
export function registerParticipantsRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any,
  requiredAuth: any
) {
  fastify.get<{
    Params: { id: string };
    Querystring: {
      onlineOnly?: string;
      role?: string;
      search?: string;
      limit?: string;
      cursor?: string;
    };
  }>('/conversations/:id/participants', {
    schema: {
      description: 'Get participants in a conversation with optional filtering and cursor-based pagination',
      tags: ['conversations', 'participants'],
      summary: 'Get conversation participants',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          onlineOnly: { type: 'string', enum: ['true', 'false'], description: 'Filter to only online participants' },
          role: { type: 'string', enum: ['creator', 'admin', 'moderator', 'member'], description: 'Filter by participant role (lowercase, as stored in DB)' },
          search: { type: 'string', description: 'Search participants by name or username' },
          limit: { type: 'string', description: 'Maximum number of participants to return (default: 20, max: 100)' },
          cursor: { type: 'string', description: 'Cursor for pagination (Participant ID)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: conversationParticipantSchema
            },
            pagination: {
              type: 'object',
              nullable: true,
              properties: {
                nextCursor: { type: 'string', nullable: true, description: 'Cursor for next page' },
                hasMore: { type: 'boolean', description: 'Whether there are more results' },
                totalCount: { type: 'integer', nullable: true, description: 'Total number of participants (capped at 199 for non platform admins)' },
                totalCountCapped: { type: 'boolean', nullable: true, description: 'True when totalCount is capped at 199 — display "199+"' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { onlineOnly, role, search, limit, cursor } = request.query;
      const authRequest = request as UnifiedAuthRequest;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Access denied: you are not a member of this conversation or it no longer exists', { code: 'CONVERSATION_ACCESS_DENIED' });
      }

      // SSOT guard: a malformed `?limit` (string schema, no AJV coercion)
      // otherwise makes `parseInt` NaN, and `sliceByIdCursor(items, cursor, NaN)`
      // slices to an empty page for well-formed cursor requests.
      const { limit: pageLimit } = validatePagination(undefined, limit, { defaultLimit: 20, maxLimit: 100 });
      const platformRole = authRequest.authContext.registeredUser?.role ?? null;

      // Le participant du LECTEUR, résolu UNE fois. Son rôle de conversation
      // commande DEUX décisions distinctes : la restriction top-99 du listing
      // ci-dessous, et le droit à l'effectif ENTIER plus bas
      // (`canViewExactMemberCount`). Il était lu paresseusement, sous la seule
      // branche du listing — donc jamais pour un lecteur que son rôle
      // plateforme exemptait du top-99 sans lui ouvrir l'effectif (AUDIT,
      // ANALYST), fût-il créateur de son propre groupe.
      //
      // Même précédence d'identité que resolveCallerParticipant :
      // participantId (anonyme) d'abord, userId (inscrit) ensuite.
      const viewer = await prisma.participant.findFirst({
        where: authRequest.authContext.participantId
          ? { id: authRequest.authContext.participantId, conversationId, isActive: true }
          : { conversationId, userId: authRequest.authContext.userId, isActive: true },
        select: { id: true, role: true, userId: true }
      });
      const conversationRole = viewer?.role ?? null;

      // Restriction top-99 : un USER plateforme (ou anonyme) qui n'est que
      // simple member de la conversation ne voit que les plus actifs — sauf
      // s'il tient un rôle au-dessus de member dans la communauté hôte
      // (un admin de communauté supervise TOUS les membres de ses salons).
      let restricted = false;
      if (isMemberListingRestricted({ platformRole, conversationRole, communityRole: null })) {
        let communityRole: string | null = null;
        const parentCommunity = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { communityId: true }
        });
        if (parentCommunity?.communityId && viewer?.userId) {
          const membership = await prisma.communityMember.findFirst({
            where: {
              communityId: parentCommunity.communityId,
              userId: viewer.userId,
              isActive: true
            },
            select: { role: true }
          });
          communityRole = membership?.role ?? null;
        }
        restricted = isMemberListingRestricted({ platformRole, conversationRole, communityRole });
      }

      // Le viewer de PRÉSENCE (inscrit + rôle, sinon null) se lit AVANT la
      // sélection : un filtre `onlineOnly` ne porte que sur ce qu'il a le
      // droit de voir — voir `OnlineOnlyScope`.
      const presenceViewer = viewerFromRequest(request);
      const onlineOnlyFilter = onlineOnly === 'true' ? await onlineOnlyScope(prisma, presenceViewer) : undefined;

      let paginatedParticipants: any[];
      let hasMore: boolean;
      let nextCursor: string | null;

      if (restricted) {
        const page = await loadMostActiveParticipants({
          prisma,
          conversationId,
          filters: { onlineOnly: onlineOnlyFilter, role, search },
          cursor,
          pageLimit
        });
        paginatedParticipants = page.participants;
        hasMore = page.hasMore;
        nextCursor = page.nextCursor;
      } else {
        const searchTerm = search?.trim() ?? '';
        const whereConditions = {
          conversationId,
          isActive: true,
          ...(onlineOnlyFilter ? onlineOnlyWhere(onlineOnlyFilter) : {}),
          ...(role ? { role: role.toLowerCase() } : {}),
          ...(searchTerm ? { displayName: { contains: searchTerm, mode: 'insensitive' as const } } : {})
        };

        // Cursor-based pagination: skip the cursor record, ordered by id for stable pagination
        const cursorOption = cursor ? { id: cursor } : undefined;

        const participants = await prisma.participant.findMany({
          where: whereConditions,
          include: participantListUserSelect,
          orderBy: { id: 'asc' },
          take: pageLimit + 1,
          ...(cursorOption ? { cursor: cursorOption, skip: 1 } : {})
        });

        hasMore = participants.length > pageLimit;
        paginatedParticipants = hasMore ? participants.slice(0, pageLimit) : participants;
        nextCursor = hasMore ? paginatedParticipants[paginatedParticipants.length - 1]?.id : null;
      }

      // Total count for accurate header display — même cap 199+ que le
      // memberCount des conversations : l'effectif ENTIER est réservé aux
      // lecteurs autorisés (ADMIN/BIGBOSS/MODERATOR plateforme, OU
      // creator/admin de la conversation).
      const totalCount = await prisma.participant.count({
        where: {
          conversationId: conversationId,
          isActive: true
        }
      });
      const presentedTotal = presentMemberCount(totalCount, {
        viewerSeesExactCount: canViewExactMemberCount({ platformRole, conversationRole })
      });

      // Présence des co-participants : régime STRICT (2026-08-25) — self/
      // ADMIN+/ami seuls, jamais la seule co-participation. Un participant
      // sans compte (pas d'entrée possible dans la carte) est masqué, sauf
      // pour un viewer ADMIN+.
      const presenceVis = await getPresenceVisibilityService(prisma).resolveForTargets(
        presenceViewer,
        paginatedParticipants.map(p => p.userId).filter((uid): uid is string => !!uid),
      );

      // Cette projection ÉTAIT la référence de la forme de fil, écrite à la main
      // ici — et c'est précisément parce qu'elle n'existait qu'ici que les deux
      // routes de MUTATION (invite, changement de rang) passaient un rang Prisma
      // brut sans gate. La fabrique partagée est désormais la source unique.
      const formattedParticipants = paginatedParticipants.map(participant =>
        serializeConversationParticipant(participant, {
          presence: presenceFor(presenceViewer, presenceVis, participant.userId)
        })
      );

      // Une page « en ligne » ne SERT que ce qu'elle montre en ligne : ce que
      // la porte vient de masquer (préférence, blocage, désactivation) en
      // sort. Elle peut être plus courte que `limit` ; `hasMore` et
      // `nextCursor` restent ceux de la page LUE — le curseur désigne une
      // ligne qui existe, servie ou non.
      const servedParticipants = onlineOnlyFilter ? formattedParticipants.filter(servedOnline) : formattedParticipants;

      // NOTE: Cannot use sendSuccess() — response includes a top-level `pagination` field
      // (with cursor-based shape: nextCursor/hasMore/totalCount) that iOS SDK
      // (ParticipantsListResponse) and web parse at root level. Migration to sendSuccess
      // requires a coordinated client update (breaking change).
      reply.send({
        success: true,
        data: servedParticipants,
        pagination: {
          nextCursor,
          hasMore,
          totalCount: presentedTotal.memberCount,
          ...(presentedTotal.memberCountCapped ? { totalCountCapped: true } : {})
        }
      });

    } catch (error) {
      logger.error('Error fetching conversation participants', error as Error);
      return sendInternalError(reply, 'Error retrieving participants');
    }
  });

  // Route pour ajouter un participant à une conversation
  /**
   * Fiche d'un participant — pensée pour ceux qui n'ont PAS de compte.
   *
   * Un visiteur entré par lien a rempli un formulaire pour passer la porte, et
   * rien de ce qu'il y a écrit n'était lisible ensuite : les autres membres ne
   * voyaient qu'un pseudo. Un participant sans fiche est un participant qu'on
   * ne peut ni reconnaître, ni accueillir, ni modérer.
   *
   * DEUX CERCLES, et c'est la décision structurante de cette route :
   *
   *   - l'IDENTITÉ (nom, pseudo, langue, arrivée, lien emprunté) est visible de
   *     tout membre — c'est ce que la personne montre en entrant ;
   *   - les COORDONNÉES (email, date de naissance) ne le sont pas. Elles n'ont
   *     été demandées que parce que l'HÔTE a coché `requireEmail` /
   *     `requireBirthday` : elles lui reviennent, à lui et à ses modérateurs.
   *     La salle, elle, contient d'autres visiteurs venus par le même lien
   *     public — leur ouvrir l'email de leurs voisins transformerait une
   *     condition d'entrée en annuaire.
   *
   * Les membres ordinaires reçoivent `hasEmail` / `hasBirthday` : ils savent
   * que la coordonnée existe sans la lire. Sans ces drapeaux, un visiteur qui a
   * fourni son email et un visiteur qui n'en a pas fourni seraient
   * indistinguables.
   */
  fastify.get<{
    Params: { id: string; participantId: string };
  }>('/conversations/:id/participants/:participantId/profile', {
    schema: {
      description: 'Profile card of a conversation participant. Built for anonymous (no-account) visitors: returns the identity they supplied when joining. Contact details (email, birthday) are restricted to conversation admins/moderators — they were only collected because the host required them.',
      tags: ['conversations', 'participants'],
      summary: 'Get participant profile card',
      params: {
        type: 'object',
        required: ['id', 'participantId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          participantId: { type: 'string', description: 'Participant ID' }
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
                participantId: { type: 'string' },
                conversationId: { type: 'string' },
                isAnonymous: { type: 'boolean', description: 'true when the participant has no account' },
                userId: { type: 'string', nullable: true },
                username: { type: 'string', nullable: true },
                displayName: { type: 'string', nullable: true },
                firstName: { type: 'string', nullable: true },
                lastName: { type: 'string', nullable: true },
                avatar: { type: 'string', nullable: true },
                language: { type: 'string', nullable: true },
                country: { type: 'string', nullable: true },
                conversationRole: { type: 'string', nullable: true },
                joinedAt: { type: 'string', format: 'date-time', nullable: true },
                historyVisibleFrom: { type: 'string', format: 'date-time', nullable: true, description: 'History grant by DATE set by a conversation admin: the participant reads everything written since this instant. null = no grant, the ordinary rule applies (admin sees all, otherwise the right frozen at join / the share link). Served to conversation admins, moderators and creators only — a plain member always reads null, whether or not a grant exists.' },
                canGrantHistory: { type: 'boolean', description: 'Can the CURRENT viewer pose or revoke this grant (PATCH …/rights with historyVisibleFrom)? true only for conversation admins and creators — a moderator reads historyVisibleFrom above but cannot write it. Distinct from historyVisibleFrom itself: that field alone cannot tell a non-host apart from a host with no grant posed, both read null.' },
                isOnline: { type: 'boolean' },
                lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
                shareLinkName: { type: 'string', nullable: true, description: 'Name of the share link used to join' },
                hasEmail: { type: 'boolean', description: 'An email was supplied (value withheld from ordinary members)' },
                hasBirthday: { type: 'boolean', description: 'A birthday was supplied (value withheld from ordinary members)' },
                email: { type: 'string', nullable: true, description: 'Admins/moderators only' },
                birthday: { type: 'string', format: 'date-time', nullable: true, description: 'Admins/moderators only' },
                entryCapabilities: {
                  type: 'object',
                  nullable: true,
                  description: 'What this visitor may actually do (rights ?? permissions). Visible to every member; null when the participant has an account.',
                  properties: {
                    canSendMessages: { type: 'boolean' },
                    canSendFiles: { type: 'boolean' },
                    canSendImages: { type: 'boolean' },
                    canSendVideos: { type: 'boolean' },
                    canSendAudios: { type: 'boolean' },
                    canSendLocations: { type: 'boolean' },
                    canSendLinks: { type: 'boolean' },
                    canViewHistory: { type: 'boolean' }
                  }
                },
                entryLink: {
                  type: 'object',
                  nullable: true,
                  description: 'Settings of the share link used to join. Admins/moderators only — the room holds other visitors who came through that same link. IP ranges are never exposed.',
                  properties: {
                    name: { type: 'string', nullable: true },
                    isActive: { type: 'boolean' },
                    expiresAt: { type: 'string', format: 'date-time', nullable: true },
                    maxUses: { type: 'number', nullable: true },
                    currentUses: { type: 'number' },
                    requireNickname: { type: 'boolean' },
                    requireEmail: { type: 'boolean' },
                    requireBirthday: { type: 'boolean' },
                    allowedCountries: { type: 'array', items: { type: 'string' } },
                    allowedLanguages: { type: 'array', items: { type: 'string' } }
                  }
                }
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
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    try {
      const { id, participantId } = request.params;
      const authRequest = request as UnifiedAuthRequest;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Access denied: you are not a member of this conversation', { code: 'CONVERSATION_ACCESS_DENIED' });
      }

      // Chargé SANS filtre d'activité, puis trié : un avis d'arrivée reste dans
      // le fil pour toujours et mène ici longtemps après le départ de son
      // auteur. « Inconnu » et « parti » ne sont pas la même réponse — les
      // confondre sous un 404 nu force le client à dire « fiche indisponible »,
      // qui se lit comme une panne, là où la vérité est un fait de conversation.
      //
      // La fiche n'est pas servie pour autant : seul le CODE distingue, jamais
      // le corps.
      const participant = await prisma.participant.findFirst({
        where: { id: participantId, conversationId },
        include: { user: { select: { id: true, username: true, displayName: true, firstName: true, lastName: true, avatar: true, deactivatedAt: true } } }
      });

      if (!participant) {
        return sendNotFound(reply, 'Participant not found in this conversation');
      }

      if (!participant.isActive) {
        return sendNotFound(reply, 'This person has left the conversation', { code: 'PARTICIPANT_LEFT' });
      }

      // Le rang du LECTEUR dans CETTE conversation décide du second cercle. Un
      // anonyme n'a pas de `User.id` : sa ligne se trouve par `id`, jamais par
      // `userId` — chercher sous la mauvaise colonne rendrait `null`, donc
      // « membre ordinaire », donc un masquage correct pour la mauvaise raison.
      const viewerContext = authRequest.authContext;
      const viewerRow = viewerContext?.userId
        ? await prisma.participant.findFirst({
            where: viewerContext.isAnonymous
              ? { id: viewerContext.userId, conversationId, isActive: true }
              : { userId: viewerContext.userId, conversationId, isActive: true },
            select: { role: true }
          })
        : null;

      const viewerRole = (viewerRow?.role ?? 'member').toLowerCase();
      const viewerHostsTheRoom = viewerRole === 'admin' || viewerRole === 'moderator' || viewerRole === 'creator';

      const profile = participant.anonymousSession?.profile;
      const isAnonymous = participant.type === 'anonymous';

      const shareLink = participant.anonymousSession?.shareLinkId
        ? await prisma.conversationShareLink.findUnique({
            where: { id: participant.anonymousSession.shareLinkId },
            select: {
              name: true,
              isActive: true,
              allowViewHistory: true,
              expiresAt: true,
              maxUses: true,
              currentUses: true,
              requireNickname: true,
              requireEmail: true,
              requireBirthday: true,
              allowedCountries: true,
              allowedLanguages: true
            }
          })
        : null;

      // Ce que la personne peut faire, et non ce que le lien autorise
      // AUJOURD'HUI : l'hôte a pu le modifier depuis, sans que cela retire quoi
      // que ce soit à qui est déjà entré. `resolveParticipantRights` porte cette
      // règle pour tout le service.
      //
      // `canViewHistory` suit la valeur FIGÉE au join, et retombe sur le lien
      // quand rien n'est figé — même arbitrage exactement que `historyFloorFor`,
      // qui décide de la lecture. Les énoncer différemment ferait annoncer à la
      // fiche un droit que la lecture ne respecte pas.
      const entryCapabilities = isAnonymous
        ? resolveEntryRights(participant, null, shareLink?.allowViewHistory ?? true)
        : null;

      // Second cercle. `allowedIpRanges` n'est pas dans le `select` : ce qui
      // n'est pas chargé ne peut pas fuiter par un oubli de projection.
      const entryLink = isAnonymous && viewerHostsTheRoom && shareLink
        ? {
            name: shareLink.name ?? null,
            isActive: shareLink.isActive,
            expiresAt: shareLink.expiresAt ?? null,
            maxUses: shareLink.maxUses ?? null,
            currentUses: shareLink.currentUses,
            requireNickname: shareLink.requireNickname,
            requireEmail: shareLink.requireEmail,
            requireBirthday: shareLink.requireBirthday,
            allowedCountries: shareLink.allowedCountries ?? [],
            allowedLanguages: shareLink.allowedLanguages ?? []
          }
        : null;

      // La fiche servait `isOnline`/`lastActiveAt` BRUTS, sans aucune gate —
      // un co-membre qui n'est ni ami ni ADMIN+ apprenait ainsi la dernière
      // connexion de n'importe quel membre inscrit rien qu'en ouvrant sa
      // fiche. Régime STRICT : un participant SANS compte (anonyme) n'a pas
      // d'entrée possible dans la carte de présence — masqué par défaut,
      // sauf pour un viewer ADMIN+.
      const presenceViewer = viewerFromRequest(request);
      const participantPresence = participant.userId
        ? await getPresenceVisibilityService(prisma).resolveForTarget(presenceViewer, {
            id: participant.userId,
            deactivatedAt: participant.user?.deactivatedAt ?? null
          })
        : presenceFor(presenceViewer, new Map(), null);
      const gatedPresence = applyPresenceVisibilityAsOffline(
        { isOnline: participant.isOnline ?? null, lastActiveAt: participant.lastActiveAt ?? null },
        participantPresence
      );

      return sendSuccess(reply, {
        participantId: participant.id,
        conversationId,
        isAnonymous,
        userId: participant.userId ?? null,
        username: profile?.username ?? participant.user?.username ?? participant.displayName,
        displayName: participant.displayName,
        firstName: profile?.firstName ?? participant.user?.firstName ?? null,
        lastName: profile?.lastName ?? participant.user?.lastName ?? null,
        avatar: resolveParticipantAvatar(participant),
        language: participant.language ?? null,
        country: participant.anonymousSession?.session?.country ?? null,
        conversationRole: participant.role ?? null,
        joinedAt: participant.joinedAt ?? null,
        // Second cercle, comme `email` et `entryLink` ci-dessous. Ce champ n'est
        // pas un attribut de la personne : c'est un FAIT DE MODÉRATION — « l'hôte
        // a rouvert l'avant-jointure à celle-ci depuis telle date ». Le servir à
        // toute la salle publiait la décision d'un hôte à ceux qu'elle ne
        // concerne pas, et laissait chaque membre comparer les fiches pour savoir
        // qui a été favorisé. Masqué en `null` plutôt que retiré : la clé absente
        // se lirait « inconnu », et il n'existe volontairement aucun jumeau
        // `hasHistoryGrant` — l'EXISTENCE de l'octroi est justement le fait à taire.
        historyVisibleFrom: viewerHostsTheRoom ? (participant.historyVisibleFrom ?? null) : null,
        // Répond à « CE lecteur peut-il POSER l'octroi ? », pas à « quel est
        // l'octroi ? » ci-dessus. `PATCH …/rights` réserve `historyVisibleFrom`
        // à admin/creator (`HISTORY_GRANT_REQUIRES_ADMIN`) — un modérateur est
        // `viewerHostsTheRoom` et LIT le champ ci-dessus, mais ne peut pas
        // l'écrire. Sans ce signal, le client ne peut distinguer « pas hôte » de
        // « hôte, aucun octroi » : les deux rendent `historyVisibleFrom: null`.
        canGrantHistory: ['admin', 'creator'].includes(viewerRole),
        isOnline: gatedPresence.isOnline,
        lastActiveAt: gatedPresence.lastActiveAt ?? null,
        shareLinkName: shareLink?.name ?? null,
        hasEmail: !!profile?.email,
        hasBirthday: !!profile?.birthday,
        email: viewerHostsTheRoom ? (profile?.email ?? null) : null,
        birthday: viewerHostsTheRoom ? (profile?.birthday ?? null) : null,
        entryCapabilities,
        entryLink
      });
    } catch (error) {
      logger.error('Error fetching participant profile', error as Error);
      return sendInternalError(reply, 'Internal server error');
    }
  });

  /**
   * Les droits d'un visiteur sans compte, pilotés par l'hôte.
   *
   * Figer les conditions d'entrée au join a retiré à l'hôte un levier : décocher
   * `allowViewHistory` sur son lien ne referme plus rien à qui est déjà entré.
   * Cette route est son remplaçant, et elle est plus fine — elle vise UNE
   * personne, là où le lien visait tous ceux qui l'avaient emprunté.
   *
   * `AnonymousRightsOverride` existait dans le schéma et était lu par
   * `middleware/auth.ts` depuis toujours, sans qu'aucun code ne l'écrive nulle
   * part. Ceci est son premier écrivain.
   *
   * `historyVisibleFrom` est le second levier, et il vaut pour TOUT participant,
   * inscrit compris : un administrateur ouvre l'historique depuis une DATE —
   * jamais depuis un message, qui se supprime — et `null` retire l'octroi. La
   * lecture le respecte partout par `services/historyFloor`.
   */
  fastify.patch<{
    Params: { id: string; participantId: string };
    Body: Partial<Record<ParticipantRightName, boolean>> & { historyVisibleFrom?: string | null };
  }>('/conversations/:id/participants/:participantId/rights', {
    schema: {
      description: 'Grant or revoke a no-account visitor\'s rights in this conversation, and/or grant history by DATE to any participant (`historyVisibleFrom`: ISO 8601, or null to revoke). Admins/moderators only. The boolean override is a DELTA: a right the body does not name keeps following the value frozen at join time.',
      tags: ['conversations', 'participants'],
      summary: 'Update a participant\'s rights',
      params: {
        type: 'object',
        required: ['id', 'participantId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          participantId: { type: 'string', description: 'Participant ID (not a User ID)' }
        }
      },
      body: {
        type: 'object',
        minProperties: 1,
        additionalProperties: false,
        properties: {
          ...Object.fromEntries(
            PARTICIPANT_RIGHT_NAMES.map((name) => [name, { type: 'boolean' }])
          ),
          historyVisibleFrom: {
            type: ['string', 'null'],
            description: 'ISO 8601 instant from which this participant may read the history (any participant, account or not); null revokes the grant. Must not be in the future — a future floor hides every message, including the participant\'s own. Writable by conversation admins and creators only.'
          }
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
                participantId: { type: 'string' },
                conversationId: { type: 'string' },
                rights: {
                  type: 'object',
                  description: 'Resolved rights after the write — an state, not the delta',
                  properties: Object.fromEntries(
                    PARTICIPANT_RIGHT_NAMES.map((name) => [name, { type: 'boolean' }])
                  )
                },
                historyVisibleFrom: { type: 'string', format: 'date-time', nullable: true, description: 'The history grant by date now in force (null = none)' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id, participantId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext?.userId;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Access denied: you are not a member of this conversation', { code: 'CONVERSATION_ACCESS_DENIED' });
      }

      // Le corps est filtré sur la liste des droits CONNUS avant tout le reste :
      // ce qui n'y figure pas ne doit jamais atteindre `anonymousSession.rights`,
      // où Prisma l'écrirait sans broncher — un type composite Mongo n'a pas de
      // colonne à violer.
      const body = (request.body ?? {}) as Record<string, unknown>;
      const requested = PARTICIPANT_RIGHT_NAMES
        .filter((name) => typeof body[name] === 'boolean')
        .map((name) => [name, body[name] as boolean] as const);

      // L'octroi par date : `undefined` = non nommé, `null` = retiré, sinon
      // une date. Validé ici parce que le schéma Fastify ne sait dire qu'une
      // chaîne ou `null` — pas qu'elle est un instant.
      const historyGrant = HISTORY_VISIBLE_FROM_BODY.safeParse(body.historyVisibleFrom);
      if (!historyGrant.success) {
        return sendBadRequest(
          reply,
          historyGrant.error.issues[0]?.message ?? 'historyVisibleFrom must be an ISO 8601 date-time or null',
          { code: 'INVALID_HISTORY_VISIBLE_FROM' }
        );
      }
      const historyVisibleFrom: Date | null | undefined =
        historyGrant.data === undefined ? undefined : historyGrant.data === null ? null : new Date(historyGrant.data);

      if (requested.length === 0 && historyVisibleFrom === undefined) {
        return sendBadRequest(reply, 'No known right named in the request body');
      }

      const viewerRow = currentUserId
        ? await prisma.participant.findFirst({
            where: authRequest.authContext?.isAnonymous
              ? { id: currentUserId, conversationId, isActive: true }
              : { userId: currentUserId, conversationId, isActive: true },
            select: { role: true }
          })
        : null;

      const viewerRole = (viewerRow?.role ?? 'member').toLowerCase();
      if (!['admin', 'moderator', 'creator'].includes(viewerRole)) {
        return sendForbidden(reply, 'Only conversation admins and moderators may change a visitor\'s rights');
      }

      // L'octroi par DATE n'est pas un droit d'entrée de plus : il OUVRE ce qui
      // précède l'arrivée, et la règle produit le réserve à un ADMINISTRATEUR de
      // la conversation. Un modérateur est lui-même BORNÉ par le plancher — le
      // rang 1 de `historyFloorFor` exige `admin`, pas `moderator` — donc écrire
      // ce champ lui donnait le moyen de se l'ouvrir À LUI-MÊME, sur sa propre
      // ligne. La garde porte sur le CHAMP, pas sur la route : les droits
      // booléens que ce même endpoint lui confie ne franchissent aucun plancher
      // et restent à sa portée.
      if (historyVisibleFrom !== undefined && !['admin', 'creator'].includes(viewerRole)) {
        return sendForbidden(
          reply,
          'Only conversation admins may grant or revoke history access by date',
          { code: 'HISTORY_GRANT_REQUIRES_ADMIN' }
        );
      }

      const target = await prisma.participant.findFirst({
        where: { id: participantId, conversationId, isActive: true }
      });

      if (!target) {
        return sendNotFound(reply, 'Participant not found in this conversation');
      }

      // La surcharge BOOLÉENNE vit dans `anonymousSession`, qu'un participant
      // inscrit n'a pas. Refuser explicitement vaut mieux qu'écrire une session
      // anonyme sur quelqu'un qui a un compte. L'octroi par date, lui, est un
      // scalaire de la ligne participant et vaut pour tous.
      if (requested.length > 0 && target.type !== 'anonymous') {
        return sendBadRequest(reply, 'Only no-account participants carry an entry-rights override', { code: 'PARTICIPANT_HAS_ACCOUNT' });
      }

      // La surcharge est un DELTA. Un droit ramené à sa valeur du join voit son
      // entrée EFFACÉE plutôt que réécrite à l'identique : une surcharge qui
      // recopie le join cesse de le suivre, et l'hôte perd tout moyen de revenir
      // en arrière.
      const priorRights = { ...(target.anonymousSession?.rights ?? {}) } as Record<string, boolean>;
      const joinPermissions = target.permissions as unknown as Record<string, boolean | undefined>;

      for (const [name, value] of requested) {
        if (joinPermissions?.[name] === value) {
          delete priorRights[name];
        } else {
          priorRights[name] = value;
        }
      }

      const updated = await prisma.participant.update({
        where: { id: target.id },
        data: {
          ...(requested.length > 0
            ? { anonymousSession: { ...target.anonymousSession, rights: priorRights } }
            : {}),
          ...(historyVisibleFrom !== undefined ? { historyVisibleFrom } : {})
        }
      });

      const rights = resolveEntryRights(updated ?? target, priorRights);
      const grantedFrom: Date | null =
        historyVisibleFrom !== undefined ? historyVisibleFrom : (target.historyVisibleFrom ?? null);

      // Deux audiences, DEUX charges — décision porteur #3898 (option b),
      // même patron que `presence-audience.ts` : `historyVisibleFrom` est un
      // fait de MODÉRATION (« l'hôte a octroyé l'historique à X depuis le
      // 3 mars »), pas un fait de conversation ordinaire. La room de
      // conversation entière ne le voit plus ; seuls les AUTRES HÔTES
      // (admin/moderator/creator) et l'INTÉRESSÉ lui-même le reçoivent, sur
      // leur room personnelle.
      //
      // Contrat client : un hôte connecté ET dans la room de conversation
      // reçoit DEUX événements pour le même changement, et **leur ordre ne se
      // suppose pas** — la charge réduite part d'ailleurs en PREMIER ici, une
      // lecture Prisma la séparant des rooms personnelles. Ce qui tient le
      // contrat n'est donc pas un rang mais la forme : la charge réduite
      // n'AFFIRME rien sur l'octroi (clé ABSENTE, jamais `null`), donc un
      // client qui discrimine sur la PRÉSENCE de la clé converge vers le même
      // état quel que soit l'ordre d'arrivée. Les deux consommateurs le font
      // (`carriesHistoryGrant` côté iOS, `!== undefined` côté web) ; Android
      // n'a pas de consommateur. Un client qui recopierait la valeur
      // INCONDITIONNELLEMENT effacerait l'octroi — c'est la règle du § « Un
      // champ que le client lit AUTORITATIVEMENT n'est plus optionnel pour
      // l'émetteur » (CLAUDE.md), appliquée ici.
      const manager = fastify.socketIOHandler?.getManager();
      const io = manager?.getIO();

      // Le middleware d'auth met en cache la ligne participant : sans
      // invalidation, le prochain envoi de ce visiteur serait arbitré sur ses
      // anciens droits pendant toute la durée du cache.
      //
      // Posée AVANT la diffusion, jamais après : l'écriture est acquise, et
      // tout ce qui suit est accessoire. La laisser derrière l'éventail la
      // rendait otage d'une lecture Prisma et d'un `.emit()` — dont le dépôt
      // dit lui-même qu'il LÈVE quand l'adaptateur ou l'encodeur est en défaut
      // (`emitWithSeq`). Même ordre que `_emitPresenceSnapshot`, qui place le
      // durable HORS de son `try`.
      manager?.invalidateParticipantCache?.(target.id, conversationId);

      try {
        if (io) {
          const fullPayload = {
            conversationId,
            participantId: target.id,
            updatedBy: currentUserId ?? '',
            rights,
            historyVisibleFrom: grantedFrom ? grantedFrom.toISOString() : null
          };
          // La clé est ABSENTE, jamais `null` : `null` dirait « octroi
          // retiré », ce que la room de conversation n'a pas à savoir.
          const { historyVisibleFrom: _omitted, ...roomPayload } = fullPayload;

          io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, roomPayload);

          // La room personnelle porte le `User.id` d'un inscrit et le
          // `Participant.id` d'un visiteur sans compte — même clé que
          // `participantUserRoomTargets`. L'intéressé reçoit toujours la charge
          // complète : c'est SA date.
          io.to(ROOMS.user(target.userId ?? target.id)).emit(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, fullPayload);

          // Les AUTRES hôtes (admin/moderator/creator) de la conversation — pour
          // qu'ils voient le changement, sans l'exposer à la room entière. Un
          // hôte qui est AUSSI l'intéressé (rare : un admin octroie l'historique
          // à un autre admin) reçoit deux fois la même charge sur sa room —
          // idempotent, jamais faux.
          const hosts = await prisma.participant.findMany({
            where: { conversationId, isActive: true, role: { in: [...CONVERSATION_HOST_ROLE_MATCHES] } },
            select: { id: true, userId: true }
          });
          for (const room of participantUserRooms(hosts)) {
            io.to(room).emit(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, fullPayload);
          }
        }
      } catch (error) {
        // La diffusion est ACCESSOIRE : l'écriture est persistée et le cache
        // déjà invalidé. Rendre 500 ici annoncerait à l'hôte que son geste a
        // échoué alors qu'il a pris effet — et le ferait rejouer.
        logger.warn('participant rights broadcast failed', {
          conversationId,
          participantId: target.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      return sendSuccess(reply, {
        participantId: target.id,
        conversationId,
        rights,
        historyVisibleFrom: grantedFrom ? grantedFrom.toISOString() : null
      });
    } catch (error) {
      logger.error('Error updating participant rights', error as Error);
      return sendInternalError(reply, 'Internal server error');
    }
  });

  fastify.post<{
    Params: { id: string };
    Body: { userId: string };
  }>('/conversations/:id/participants', {
    schema: {
      description: 'Add a participant to a conversation - requires admin/moderator role',
      tags: ['conversations', 'participants'],
      summary: 'Add participant',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      body: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'User ID to add to conversation' }
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
                // `participant` était déclaré ici SANS producteur : le handler
                // ne renvoie que `message`. Retiré plutôt que fabriqué —
                // l'inventaire cesse de promettre un champ qui n'a jamais existé
                // (même traitement que `users/profile.ts|permissions`, cycle 91 bis §5).
                message: { type: 'string', example: 'Participant ajouté avec succès' }
              }
            }
          }
        },
        400: errorResponseSchema,
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
      const { userId } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext.userId;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const currentUserParticipant = await prisma.participant.findFirst({
        where: {
          conversationId: conversationId,
          userId: currentUserId,
          isActive: true
        }
      });

      if (!currentUserParticipant) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      if (!hasMinimumMemberRole(currentUserParticipant.role ?? 'member', 'moderator')) {
        return sendForbidden(reply, 'Only admins and moderators can add participants');
      }

      const userToAdd = await prisma.user.findFirst({
        where: { id: userId }
      });

      if (!userToAdd) {
        return sendNotFound(reply, 'User not found');
      }

      // Le `findFirst({ isActive: true })` qui précédait ne pouvait PAS voir la
      // ligne d'un banni (bannir écrit `isActive: false`) : le `create` lui
      // fabriquait une ligne neuve et active, ce qui défaisait le bannissement
      // sans passer par `POST …/unban` — laquelle exige le rang `admin` là où
      // cette route s'ouvre aussi aux `moderator`, et écrit une trace. Voir
      // `services/conversations/conversationEntryAdmission.ts`.
      // La SEULE des trois portes qui ne tenait pas déjà l'état de la
      // conversation : elle n'autorisait que sur le rang de l'appelant, et un
      // rang survit à la clôture (fermer n'écrit sur AUCUNE ligne
      // `Participant`). Un admin restait donc capable d'ajouter des gens à un
      // fil terminé. Deux colonnes, cf. `conversationWriteAdmission`.
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { isActive: true, closedAt: true },
      });

      const entry = await resolveConversationEntry({ prisma, conversationId, userId, conversation });

      if (entry.outcome === 'closed') {
        return sendError(reply, 410, 'Cette conversation est terminée');
      }

      if (entry.outcome === 'banned') {
        return sendForbidden(reply, 'Cet utilisateur est banni de la conversation — levez le bannissement d\'abord');
      }

      if (entry.outcome === 'already-member') {
        return sendBadRequest(reply, 'L\'utilisateur est déjà membre de cette conversation');
      }

      const addedMemberFields = {
        type: 'user',
        displayName: userToAdd.displayName ?? userToAdd.username ?? `${userToAdd.firstName ?? ''} ${userToAdd.lastName ?? ''}`.trim(),
        avatar: userToAdd.avatar,
        role: 'member',
        language: userToAdd.systemLanguage ?? 'en',
        permissions: {
          canSendMessages: true,
          canSendFiles: true,
          canSendImages: true,
          canSendAudios: true,
          canSendVideos: true,
          canSendLocations: false,
          canSendLinks: false,
          // Un membre ajouté après coup lit depuis son arrivée ; un
          // administrateur lui ouvre l'avant par date (`historyVisibleFrom`).
          canViewHistory: false
        }
      };

      // Partagé par l'écriture et l'emit, comme `leftAt` sur le chemin du
      // départ : les deux doivent s'accorder. Un rejoin conserve son `joinedAt`
      // d'origine en base — l'événement, lui, date l'ADHÉSION qu'il annonce,
      // c'est-à-dire maintenant.
      const joinedAt = new Date();

      let joinedParticipantId: string;
      if (entry.outcome === 'rejoin' && entry.participantId) {
        const rejoined = await prisma.participant.update({
          where: { id: entry.participantId },
          data: { ...addedMemberFields, ...REJOIN_PARTICIPANT_STATE }
        });
        joinedParticipantId = rejoined.id;
        invalidateParticipantLookup(entry.participantId, conversationId);
      } else {
        const created = await prisma.participant.create({
          data: {
            conversationId: conversationId,
            userId: userId,
            ...addedMemberFields,
            joinedAt
          }
        });
        joinedParticipantId = created.id;
      }

      // Annoncer l'arrivée — quatrième et dernière porte, même loi. Une entrée
      // qui ne se voit pas dans le fil est une entrée que les présents
      // découvrent au premier message de l'arrivant.
      await postJoinSystemMessage(
        {
          prisma,
          broadcast: (message, targetConversationId) =>
            fastify.socketIOHandler?.getManager()?.broadcastMessage(message as never, targetConversationId)
              ?? Promise.resolve()
        },
        {
          conversationId,
          participantId: joinedParticipantId,
          displayName: addedMemberFields.displayName,
          isAnonymous: false,
          viaShareLink: false
        }
      );

      // R6-1 — broadcast so other members' devices refresh the participant list
      // in real time (the POST previously created the row silently → stale member
      // lists until manual reload). Mirrors the role-update emit below.
      // conversation:joined feeds ParticipantsView (invalidate+reload) and
      // ConversationSyncEngine (participants cache invalidate) on iOS.
      const socketManager = fastify.socketIOHandler?.getManager();
      const io = socketManager?.getIO();
      if (io) {
        io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.CONVERSATION_JOINED, {
          conversationId,
          userId,
        });

        // `conversation:joined` ci-dessus ne peut PAS porter l'effectif : le
        // même nom, le même payload `{conversationId, userId}`, servent l'ack
        // self-only qu'un socket reçoit en REJOIGNANT LA ROOM
        // (`ConversationHandler`) — que produit chaque ouverture de fil, et qui
        // ne change aucune appartenance. Compter dessus gonflerait le compteur
        // à chaque ouverture ; c'est pourquoi aucun client n'incrémentait, et
        // pourquoi son effectif ne pouvait que DÉRIVER VERS LE BAS (départ −1,
        // bannissement −1, ajout rien).
        //
        // D'où l'événement dédié, symétrique de `conversation:participant-left`
        // jusque dans son payload, et adressé comme lui aux rooms PERSONNELLES :
        // le compteur se lit sur l'écran de liste, que ses lecteurs regardent
        // précisément quand ils ne sont pas dans la room de conversation.
        //
        // Le nouvel arrivant est ÉCARTÉ de l'éventail : il reçoit
        // `CONVERSATION_NEW` ci-dessous, dont l'effectif vient du serveur et le
        // compte DÉJÀ. L'incrémenter en plus le mettrait en trop. (Le client
        // écarte la même identité de son côté — l'auto-join de room ci-dessous
        // est asynchrone et pourrait le faire entrer dans la room de
        // conversation avant cet emit.)
        const audience = await prisma.participant.findMany({
          where: { conversationId, isActive: true, NOT: { userId } },
          // `role` et `user.role` en plus : les deux titres qui ouvrent
          // l'effectif ENTIER (`canViewExactMemberCount`), que le fanout doit
          // connaître PAR DESTINATAIRE — un broadcast ne portait qu'une
          // présentation, et c'était la plafonnée, pour tout le monde.
          select: { id: true, userId: true, role: true, user: { select: { role: true } } },
        });
        // Compte ABSOLU plutôt qu'un delta : un client qui incrémente ne se
        // rattrape jamais d'un événement manqué (hors ligne, trou de
        // reconnexion), et les deux clients PERSISTENT la dérive (cache disque
        // iOS, `staleTime: Infinity` web). Un total se rattrape au suivant.
        //
        // `+ 1` parce que l'éventail ÉCARTE l'arrivant (voir ci-dessus) : il est
        // actif depuis l'écriture juste au-dessus, donc il compte, mais il ne
        // figure pas dans `audience`. Une seconde requête ne rendrait rien de
        // plus.
        //
        // Deux chaînes disjointes : « 199+ » pour la room, l'effectif ENTIER
        // pour les lecteurs autorisés. Un broadcast unique ne portait que la
        // présentation plafonnée, et écrasait donc chez l'admin du groupe la
        // valeur exacte que le REST venait de lui servir.
        emitConversationMemberCountEvent({
          io,
          conversationId,
          participants: audience,
          event: SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED,
          payload: {
            conversationId,
            userId,
            displayName: addedMemberFields.displayName,
            joinedAt: joinedAt.toISOString(),
          },
          memberCount: audience.length + 1,
        });
      }
      // Auto-join the added user's currently-connected sockets to the conversation
      // room so they receive message:new events immediately without a reconnect.
      if (socketManager) {
        socketManager.joinUserToConversationRoom(userId, conversationId).catch(
          (err: unknown) => logger.error('Failed to auto-join added user to conversation room', err as Error)
        );
      }
      // Emit CONVERSATION_NEW to the added user's room so connected clients
      // (iOS: ConversationListViewModel.conversationNew handler) discover the
      // conversation immediately without waiting for a push notification.
      if (io) {
        try {
          const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { type: true, title: true, createdAt: true },
          });
          const allParticipantIds = await prisma.participant.findMany({
            where: { conversationId, isActive: true },
            select: { userId: true },
          }).then(rows => rows.map(r => r.userId).filter((id): id is string => !!id));
          if (conv) {
            io.to(ROOMS.user(userId)).emit(SERVER_EVENTS.CONVERSATION_NEW, {
              conversationId,
              conversationType: conv.type,
              title: conv.title ?? null,
              creatorId: currentUserId ?? userId,
              participantIds: allParticipantIds,
              createdAt: conv.createdAt instanceof Date ? conv.createdAt.toISOString() : String(conv.createdAt),
            });
          }
        } catch (err) {
          logger.warn('Failed to emit CONVERSATION_NEW to added user', { userId, conversationId, err });
        }
      }

      const notificationService = fastify.notificationService;
      if (notificationService) {
        notificationService.createAddedToConversationNotification({
          recipientUserId: userId,
          addedByUserId: currentUserId,
          conversationId,
        }).catch((err: unknown) => logger.error('Notification error added', err as Error));

        const existingMembers = await prisma.participant.findMany({
          where: { conversationId, isActive: true, type: 'user', userId: { notIn: [userId, currentUserId!] } },
          select: { userId: true },
        });
        // Une seule diffusion pour toute l'audience : le profil du nouveau
        // membre, la conversation et l'effectif sont les mêmes pour chacun, et
        // le mute se demande en une requête. La boucle d'appels unitaires qui
        // précédait les relisait par destinataire.
        const recipientUserIds = existingMembers
          .map((member) => member.userId)
          .filter((id): id is string => !!id);
        if (recipientUserIds.length > 0) {
          notificationService.createMemberJoinedNotificationsBatch(recipientUserIds, {
            newMemberUserId: userId,
            conversationId,
            joinMethod: 'invited' as const,
          }).catch((err: unknown) => logger.error('Notification error joined', err as Error));
        }
      }

      return sendSuccess(reply, { message: 'Participant ajouté avec succès' });

    } catch (error) {
      logger.error('Error adding participant', error as Error);
      return sendInternalError(reply, 'Erreur lors de l\'ajout du participant');
    }
  });

  // Route pour supprimer un participant d'une conversation
  fastify.delete<{
    Params: { id: string; userId: string };
  }>('/conversations/:id/participants/:userId', {
    schema: {
      description: 'Remove a participant from a conversation - requires admin/moderator role or self-removal',
      tags: ['conversations', 'participants'],
      summary: 'Remove participant',
      params: {
        type: 'object',
        required: ['id', 'userId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          userId: { type: 'string', description: 'User ID to remove from conversation' }
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
                message: { type: 'string', example: 'Participant supprimé avec succès' }
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
      const { id, userId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext.userId;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const currentUserParticipant = await prisma.participant.findFirst({
        where: {
          conversationId: conversationId,
          userId: currentUserId,
          isActive: true
        },
        include: {
          user: true
        }
      });

      if (!currentUserParticipant) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const isPlatformAdmin = isGlobalAdmin(currentUserParticipant.user?.role ?? '');
      const isConversationHost = hasMinimumMemberRole(currentUserParticipant.role ?? 'member', 'moderator');

      if (!isPlatformAdmin && !isConversationHost) {
        return sendForbidden(reply, 'Vous n\'avez pas les droits pour supprimer des participants');
      }

      if (userId === currentUserId) {
        return sendBadRequest(reply, 'Vous ne pouvez pas vous supprimer de la conversation');
      }

      // La cible se résout sous les DEUX colonnes : `:userId` porte un `User.id`
      // pour un membre inscrit, un `Participant.id` pour un visiteur venu par un
      // lien partagé — qui n'a aucune ligne `User`. Le `findFirst` sur la seule
      // colonne `userId` ne le trouvait jamais.
      const removedParticipant = await resolveTargetParticipant(prisma, conversationId, userId);

      if (!removedParticipant) {
        return sendNotFound(reply, 'Participant introuvable dans cette conversation');
      }

      // Se retirer soi-même passe par `POST …/leave`. La garde plus haut compare
      // le segment d'URL ; celle-ci compare l'identité RÉSOLUE, ce qui couvre
      // aussi l'admin qui se désignerait par son `Participant.id`.
      if (removedParticipant.userId === currentUserId || removedParticipant.id === currentUserId) {
        return sendBadRequest(reply, 'Vous ne pouvez pas vous supprimer de la conversation');
      }

      if (!removedParticipant.isActive) {
        return sendBadRequest(reply, 'Ce participant ne fait plus partie de la conversation');
      }

      const leftAt = new Date();

      // `update` sur la ligne RÉSOLUE, plus `updateMany`. La différence n'est
      // pas cosmétique : `updateMany` ne trouvant rien n'échoue pas, et c'est
      // exactement ce qui faisait répondre **200 sans avoir rien fait** dès que
      // la cible n'était pas adressable par `userId`. Une écriture qui ne trouve
      // pas sa ligne doit échouer.
      await prisma.participant.update({
        where: { id: removedParticipant.id },
        data: {
          isActive: false,
          leftAt
        }
      });
      invalidateParticipantLookup(removedParticipant.id, conversationId);

      // R6-2 — broadcast so other members' devices drop the removed user from
      // the list + decrement the member count in real time (the DELETE
      // previously mutated the DB silently). Mirrors leave.ts. Use
      // conversation:participant-left (room broadcast feeding ParticipantsView,
      // ConversationListViewModel count, ConversationSyncEngine invalidate) —
      // NOT conversation:left, which is a self-only ack.
      try {
        const socketManager = fastify.socketIOHandler?.getManager();
        const io = socketManager?.getIO();
        if (io) {
          // Même raison qu'au départ volontaire (`leave.ts`) : l'effectif se lit
          // sur l'écran de LISTE, dont les lecteurs ont quitté la room de
          // conversation. La room reste en tête de chaîne, donc le retiré —
          // encore dedans jusqu'à l'éviction ci-dessous — garde son signal.
          const remaining = await prisma.participant.findMany({
            where: { conversationId, isActive: true },
            // `role` et `user.role` en plus : les deux titres qui ouvrent
            // l'effectif ENTIER (`canViewExactMemberCount`), que le fanout doit
            // connaître PAR DESTINATAIRE.
            select: { id: true, userId: true, role: true, user: { select: { role: true } } }
          });
          // Le retiré ferme la chaîne. Le commentaire ci-dessus disait « la
          // room reste en tête, donc le retiré garde son signal » : vrai du
          // seul appareil qui a le FIL ouvert. Les autres sont sur l'écran de
          // liste, hors de cette room — l'argument même qui a fait ajouter les
          // rooms personnelles des RESTANTS, jamais appliqué à celui dont
          // l'appartenance s'arrête. Ils gardaient une ligne que
          // `GET /conversations` ne sert plus, persistée, jusqu'au prochain
          // delta (tombstone `leftAt`).
          const audience = [
            ...remaining,
            { id: removedParticipant.id, userId: removedParticipant.userId },
          ];
          // Compte ABSOLU — `remaining` est déjà chargé pour nommer les rooms,
          // et un delta ne rattrape jamais un événement manqué. Deux chaînes
          // disjointes, comme le fanout d'arrivée : « 199+ » pour la room,
          // l'effectif ENTIER pour les lecteurs autorisés.
          emitConversationMemberCountEvent({
            io,
            conversationId,
            participants: audience,
            event: SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT,
            payload: {
              conversationId,
              // `participantId` TOUJOURS, `userId` NUL pour un visiteur sans
              // compte : ce champ déclare un `User.id`, et y recopier un
              // `Participant.id` est précisément ce que le CLAUDE.md du gateway
              // interdit. Les clients retirent la ligne sur `participantId`.
              ...identifyTarget(removedParticipant),
              displayName: removedParticipant.displayName ?? '',
              leftAt: leftAt.toISOString()
            },
            memberCount: remaining.length
          });

          // La fin d'appartenance, en un seul geste : `endConversationMembership`
          // éteint le partage de position que le retiré tenait dans le fil AVANT
          // de sortir ses sockets de la room, parce que c'est par cette room que
          // son propre appareil apprend qu'il doit couper le GPS. Voir l'unité
          // pour l'ordre des trois et pourquoi il compte.
          // Room personnelle : `userId ?? id` — un participant sans ligne `User`
          // a bien une room, nommée d'après son `Participant.id` (cf. § Room
          // Organization). L'adresser par son seul `userId` sauterait une room
          // qui existe, et son propre appareil n'apprendrait jamais qu'il doit
          // couper le partage de position.
          await endConversationMembership({
            io,
            manager: socketManager,
            conversationId,
            userId: removedParticipant.userId ?? removedParticipant.id,
          });
        }
      } catch (socketError) {
        logger.error('Socket eviction error for removed participant', socketError as Error);
      }

      const notificationService = fastify.notificationService;
      if (notificationService) {
        // Une notification se dépose sur un COMPTE. Un visiteur sans compte n'en
        // a pas : lui en poster une contre son `Participant.id` fabriquerait une
        // ligne adressée à un `User` qui n'existe pas. Son appareil apprend le
        // retrait par l'événement temps réel ci-dessus, qui le nomme.
        if (removedParticipant.userId) {
          notificationService.createRemovedFromConversationNotification({
            recipientUserId: removedParticipant.userId,
            removedByUserId: currentUserId,
            conversationId,
          }).catch((err: unknown) => logger.error('Notification error removed', err as Error));
        }

        const adminParticipants = await prisma.participant.findMany({
          where: {
            conversationId,
            isActive: true,
            role: { in: memberRoleCasings(['creator', 'admin', 'moderator']) },
            userId: { not: currentUserId },
          },
          select: { userId: true },
        });
        for (const admin of adminParticipants) {
          if (admin.userId) {
            notificationService.createMemberRemovedNotification({
              recipientUserId: admin.userId,
              removedByUserId: currentUserId,
              conversationId,
            }).catch((err: unknown) => logger.error('Notification error member_removed', err as Error));
          }
        }
      }

      return sendSuccess(reply, { message: 'Participant supprimé avec succès' });

    } catch (error) {
      logger.error('Error removing participant', error as Error);
      return sendInternalError(reply, 'Erreur lors de la suppression du participant');
    }
  });

  // Route pour mettre à jour le rôle d'un participant
  fastify.patch<{
    Params: { id: string; userId: string };
    Body: { role: string };
  }>('/conversations/:id/participants/:userId/role', {
    schema: {
      description: 'Update participant role in a conversation - requires creator or admin role',
      tags: ['conversations', 'participants'],
      summary: 'Update participant role',
      params: {
        type: 'object',
        required: ['id', 'userId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          userId: { type: 'string', description: 'User ID to update role for' }
        }
      },
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['admin', 'moderator', 'member'], description: 'New role for participant' }
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
                message: { type: 'string', example: 'Rôle du participant modifié avec succès' },
                // Le handler sert aussi le couple qui NOMME la mutation ;
                // non déclarés, `userId` et `role` étaient retirés, et
                // l'appelant devait rouvrir `participant` pour savoir ce qui
                // venait de changer. L'événement Socket.IO jumeau
                // (`PARTICIPANT_ROLE_UPDATED`) porte les deux depuis toujours.
                userId: { type: 'string', description: 'The participant whose role changed' },
                role: { type: 'string', description: 'The role now in force' },
                participant: conversationParticipantSchema
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id, userId } = request.params;
      const { role } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext.userId;

      const normalizedRole = role.toLowerCase()
      if (!['admin', 'moderator', 'member'].includes(normalizedRole)) {
        return sendBadRequest(reply, 'Invalid role. Accepted roles are: admin, moderator, member');
      }

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const currentUserParticipant = await prisma.participant.findFirst({
        where: {
          conversationId: conversationId,
          userId: currentUserId,
          isActive: true
        },
        include: {
          user: true
        }
      });

      if (!currentUserParticipant) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const isPlatformAdmin = isGlobalAdmin(currentUserParticipant.user?.role ?? '');
      const isConversationAdmin = hasMinimumMemberRole(currentUserParticipant.role ?? 'member', 'admin');

      if (!isPlatformAdmin && !isConversationAdmin) {
        return sendForbidden(reply, 'Vous n\'avez pas les droits pour modifier les rôles des participants');
      }

      if (userId === currentUserId) {
        return sendBadRequest(reply, 'You cannot modify your own role');
      }

      const targetParticipant = await prisma.participant.findFirst({
        where: {
          conversationId: conversationId,
          userId: userId,
          isActive: true
        }
      });

      if (!targetParticipant) {
        return sendNotFound(reply, 'Participant not found or inactive');
      }

      // Protection, pas permission : sur une ligne `CREATOR` l'égalité
      // stricte ne tirait pas et le créateur devenait rétrogradable (#4008).
      if (isMemberCreator(targetParticipant.role ?? 'member')) {
        return sendForbidden(reply, 'Cannot modify the conversation creator\'s role');
      }

      const newRole = role.toLowerCase();
      await prisma.participant.update({
        where: {
          id: targetParticipant.id
        },
        data: {
          role: newRole
        }
      });

      const updatedRow = await prisma.participant.findUnique({
        where: { id: targetParticipant.id },
        include: participantListUserSelect
      });

      // Cette route servait `updatedRow` TEL QUEL sous la clé `participant`, que
      // `conversationParticipantSchema` déclare. La réponse REST est gatée par
      // le viewer DEMANDEUR (régime STRICT — self/ADMIN+/ami) : elle seule a
      // un destinataire nommé capable de porter une visibilité. La diffusion
      // Socket.IO plus bas n'en a pas — toute la salle la reçoit — donc son
      // `participant` ne transporte plus `isOnline`/`lastActiveAt` du tout,
      // gaté ou non ; le type partagé (`ParticipantRoleUpdatedEventData`) ne
      // les déclare déjà pas.
      const rolePresenceViewer = viewerFromRequest(request);
      const rolePresenceVis = updatedRow?.userId
        ? await getPresenceVisibilityService(prisma).resolveForTarget(rolePresenceViewer, {
            id: updatedRow.userId,
            deactivatedAt: updatedRow.user?.deactivatedAt ?? null
          })
        : presenceFor(rolePresenceViewer, new Map(), null);
      const updatedParticipant = updatedRow
        ? serializeConversationParticipant(updatedRow, { presence: rolePresenceVis })
        : null;
      const participantForBroadcast = updatedParticipant
        ? (() => {
            const { isOnline: _broadcastIsOnline, lastActiveAt: _broadcastLastActiveAt, ...rest } = updatedParticipant;
            return rest;
          })()
        : null;

      const manager = fastify.socketIOHandler?.getManager();
      if (manager) {
        // Thread-only À JUSTE TITRE, vérifié plutôt que déduit — noté ici pour
        // qu'un prochain balayage de `to(ROOMS.conversation(` ne le rouvre pas.
        // Aucune ligne de liste ne rend un rôle : les seuls consommateurs sont
        // les écrans de participants (web `use-participants`, iOS
        // `ParticipantsView` / `ConversationSocketHandler`), tous ouverts DANS
        // la conversation. Élargir l'audience coûterait une requête et
        // diffuserait la hiérarchie d'un groupe à des écrans qui ne l'affichent
        // pas. À revoir seulement si la ligne de liste se met à montrer un rang.
        manager.getIO().to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED, {
          conversationId,
          userId,
          newRole,
          updatedBy: currentUserId,
          participant: participantForBroadcast
        });
        // Invalidate the in-process participant-ID cache so the next message:send
        // from this user re-validates membership/role against the DB instead of
        // serving a stale 5-minute cached entry.
        manager.invalidateParticipantCache?.(userId, conversationId);
      }

      const notificationService = fastify.notificationService;
      if (notificationService) {
        notificationService.createMemberRoleChangedNotification({
          recipientUserId: userId,
          changedByUserId: currentUserId,
          conversationId,
          newRole: newRole.toUpperCase() as 'ADMIN' | 'MODERATOR' | 'MEMBER',
          previousRole: targetParticipant.role,
        }).catch((err: unknown) => logger.error('Notification error role_changed', err as Error));
      }

      return sendSuccess(reply, {
        message: 'Rôle du participant mis à jour avec succès',
        userId,
        role: newRole,
        participant: updatedParticipant
      });

    } catch (error) {
      logger.error('Error updating participant role', error as Error);
      return sendInternalError(reply, 'Error updating participant role');
    }
  });

}
