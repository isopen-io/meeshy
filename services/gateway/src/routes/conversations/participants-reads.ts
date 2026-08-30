import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { resolveParticipantAvatar, serializeConversationParticipant } from '@meeshy/shared/utils/participant-helpers';
import { participantListUserSelect } from './utils/participant-projection';
import {
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
import {
  disclosableEntryRights,
  resolveEntryRights,
} from '../../services/participantRights';
import { sendSuccess, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { presenceFor, viewerFromRequest } from '../users/presence-gate';
import { MemberRole } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole } from '../../utils/conversation-authority';
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import { validatePagination } from '../../utils/pagination';
import {
  onlineOnlyScope,
  onlineOnlyWhere,
  servedOnline,
  loadMostActiveParticipants
} from './participants-presence';
const logger = enhancedLogger.child({ module: 'ConversationParticipantReadRoutes' });

/**
 * Routes de LECTURE des participants — `GET .../participants` (listing,
 * filtres, pagination par curseur) et `GET .../participants/:participantId/profile`
 * (fiche d'un participant). Voir `participants.ts`, qui reste le point
 * d'entrée de `registerParticipantsRoutes` et appelle
 * `registerParticipantReadRoutes` en premier, dans l'ordre original des
 * routes. Extrait le 2026-08-30 (#4284) pour ramener `participants.ts` sous
 * le budget de taille — pur déplacement, aucun comportement changé.
 *
 * Les aides de présence (`onlineOnlyScope`, `loadMostActiveParticipants`, …)
 * vivent dans `participants-presence.ts` : la directive de visibilité de la
 * présence (2026-08-25) les gouverne, et leurs doc-comments sont conservés
 * là-bas verbatim.
 */
export function registerParticipantReadRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any
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
                  description: 'What this visitor may actually do (rights ?? permissions). Visible to every member; null when the participant has an account. `canViewHistory` is the exception: it is a MODERATION fact and the key is ABSENT for a plain member (#4056) — never false, which would itself disclose it.',
                  properties: {
                    canSendMessages: { type: 'boolean' },
                    canSendFiles: { type: 'boolean' },
                    canSendImages: { type: 'boolean' },
                    canSendVideos: { type: 'boolean' },
                    canSendAudios: { type: 'boolean' },
                    canSendLocations: { type: 'boolean' },
                    canSendLinks: { type: 'boolean' },
                    canViewHistory: { type: 'boolean', description: 'Conversation admins, moderators and creators only. The key is ABSENT for anyone else — the same moderation fact that `participant:rights-updated` stopped broadcasting to the room (#4009).' }
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

      // « toute la visibilité de la conversation » (#3941) : un administrateur
      // de la plateforme voit la fiche comme un hôte la voit.
      const viewerActor = {
        conversationRole: viewerRow?.role,
        platformRole: viewerContext?.registeredUser?.role,
      };
      const viewerHostsTheRoom = actorHasMinimumRole(viewerActor, MemberRole.MODERATOR);

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
      //
      // **`canViewHistory` en SORT quand le lecteur n'héberge pas la
      // conversation** (#4056). Le porteur a tranché que c'est un fait de
      // MODÉRATION ; #4009 l'a retiré de l'événement diffusé à la room, mais
      // cette route continuait de le servir à tout membre — et tant qu'un
      // chemin sert le fait, le retrait de l'autre ne protège rien.
      //
      // La loi est la MÊME que celle du push (`disclosableEntryRights`) : deux
      // omissions écrites à la main auraient divergé au premier droit ajouté, et
      // la divergence se serait faite du côté BAVARD — celui qui ne rougit
      // jamais.
      const entryCapabilities = isAnonymous
        ? disclosableEntryRights(
            resolveEntryRights(participant, null, shareLink?.allowViewHistory ?? true),
            viewerHostsTheRoom,
          )
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
        canGrantHistory: actorHasMinimumRole(viewerActor, MemberRole.ADMIN),
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
}
