import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ACTIVE_MEMBER_LISTING_LIMIT } from '@meeshy/shared/utils/member-visibility';
import { getPresenceVisibilityService, type PresenceViewer } from '../../services/PresenceVisibilityService';
import { isGlobalAdmin } from '@meeshy/shared/types/role-types';
import { participantListUserSelect } from './utils/participant-projection';
import { sliceByIdCursor } from '../../utils/pagination';

/**
 * Aides de PRÉSENCE de `GET /conversations/:id/participants` (voir
 * `participants.ts`, qui reste le point d'entrée de
 * `registerParticipantsRoutes`) : la portée `?onlineOnly=` et le listing
 * restreint aux participants les plus actifs (top-99). Extrait le 2026-08-30
 * (#4284) pour ramener `participants.ts` sous le budget de taille — pur
 * déplacement, aucun comportement changé.
 *
 * Ces deux fonctions portent la directive de visibilité de la présence
 * (2026-08-25) : `isOnline` / `lastActiveAt` ne sont servis qu'aux amis
 * acceptés, à soi-même et à ADMIN/BIGBOSS. Les doc-comments ci-dessous sont
 * conservés VERBATIM — ils valent plus que le code qu'ils décrivent.
 */

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
export type OnlineOnlyScope = 'everyone' | ReadonlySet<string>;

export async function onlineOnlyScope(prisma: PrismaClient, viewer: PresenceViewer): Promise<OnlineOnlyScope> {
  if (viewer && isGlobalAdmin(viewer.role)) return 'everyone';
  if (!viewer) return new Set();
  const friends = await getPresenceVisibilityService(prisma).acceptedFriendIds(viewer.userId);
  return new Set([...friends, viewer.userId]);
}

const withinOnlineOnlyScope = (scope: OnlineOnlyScope, userId: string | null | undefined): boolean =>
  scope === 'everyone' || (!!userId && scope.has(userId));

export const onlineOnlyWhere = (scope: OnlineOnlyScope) => ({
  isOnline: true,
  ...(scope === 'everyone' ? {} : { userId: { in: [...scope] } })
});

/**
 * Une page filtrée « en ligne » ne contient que ce qu'elle SERT en ligne.
 */
export const servedOnline = (participant: { readonly isOnline: boolean }): boolean => participant.isOnline === true;


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
export async function loadMostActiveParticipants(options: {
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
