/**
 * « N en ligne » d'une communauté (#18014) — un AGRÉGAT sans identité, la
 * seule présence que la co-appartenance a le droit de révéler (directive
 * 2026-08-25, `resolvePresenceVisibility`).
 *
 * Un compte n'est anonyme que s'il couvre assez de monde : sous
 * {@link ONLINE_COUNT_ANONYMITY_FLOOR} autres membres actifs, « 1 en ligne »
 * désigne quelqu'un, et rien n'est servi (`null`). Au-dessus, ne compte qu'un
 * membre que le lecteur pourrait voir en ligne s'il était son ami : compte
 * vivant, aucun blocage dans un sens ou dans l'autre, `showOnlineStatus`
 * laissé ouvert. « En ligne » suit la règle 1/3/5 (`getUserPresenceStatus`).
 *
 * La lecture est bornée : la base ne rend que les membres actifs DANS LA
 * FENÊTRE, jamais toute la communauté, et au plus {@link ONLINE_COUNT_SCAN_CAP}.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  getUserPresenceStatus,
  PRESENCE_IDLE_WINDOW_MS,
} from '@meeshy/shared/utils/user-presence';
import { getBlockedUserIdsAmong } from '../utils/blocking';
import { isUsableAccount } from './relations/usableAccount';
import type { PrivacyPreferencesService } from './PrivacyPreferencesService';

export const ONLINE_COUNT_ANONYMITY_FLOOR = 10;
export const ONLINE_COUNT_SCAN_CAP = 1000;

export type OnlineCountParams = {
  readonly prisma: Pick<PrismaClient, 'communityMember' | 'user'>;
  readonly privacy: Pick<PrivacyPreferencesService, 'getPreferencesForUsers'>;
  readonly communityId: string;
  readonly viewerId: string;
  readonly now?: Date;
};

export async function countOnlineMembers(params: OnlineCountParams): Promise<number | null> {
  const { prisma, privacy, communityId, viewerId } = params;
  const now = params.now ?? new Date();
  const others = { communityId, isActive: true, userId: { not: viewerId } };

  const population = await prisma.communityMember.count({ where: others });
  if (population < ONLINE_COUNT_ANONYMITY_FLOOR) return null;

  const since = new Date(now.getTime() - PRESENCE_IDLE_WINDOW_MS);
  const rows = await prisma.communityMember.findMany({
    where: { ...others, user: { is: { OR: [{ isOnline: true }, { lastActiveAt: { gte: since } }] } } },
    select: {
      userId: true,
      user: { select: { isOnline: true, lastActiveAt: true, isActive: true, deactivatedAt: true, deletedAt: true } },
    },
    take: ONLINE_COUNT_SCAN_CAP,
  });

  const onlineIds = [
    ...new Set(
      rows
        .filter((row) => isUsableAccount(row.user) && getUserPresenceStatus(row.user, now.getTime()) === 'online')
        .map((row) => row.userId),
    ),
  ];
  if (onlineIds.length === 0) return 0;

  const [blocked, prefs] = await Promise.all([
    getBlockedUserIdsAmong(prisma, viewerId, onlineIds),
    privacy.getPreferencesForUsers(onlineIds.map((id) => ({ id, isAnonymous: false }))),
  ]);
  return onlineIds.filter((id) => !blocked.has(id) && (prefs.get(id)?.showOnlineStatus ?? true)).length;
}
