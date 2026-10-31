/**
 * LIRE un lien (#13933) : ce que `GET /relations` et `GET /relations/:userId` servent,
 * et ce que `POST /relations/:userId/level` rend après avoir baissé.
 *
 * Servi : l'identifiant de l'AUTRE, le niveau effectif, ce que JE lui accorde, la date
 * d'entrée (jamais celle d'une baisse), la progression et l'éligibilité. Jamais servi :
 * un nom, une présence, un cool-down — l'état d'un refus ne fuit pas (RG-07), et
 * « il vous reste 29 jours » dirait à l'émetteur qu'on l'a refusé. Le cool-down se dit
 * UNE fois, au moment de redemander (`RELATION_COOLDOWN`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  relationEntryDate,
  relationLevelIfAtLeast,
  relationPairKey,
  type RelationLevel,
  type RelationTransition,
} from '@meeshy/shared/types/relation';
import { amisAcceptes, niveauEffectif } from '../friendship';
import { getBlockRelatedUserIds } from '../../utils/blocking';
import { effectiveLevelOfRow, grantedByUser, type UserRelationRow } from './userRelationWriter';
import { loadProgressByPartner, type RelationProgress, type RelationProgressTarget } from './relationProgress';

export type RelationLinkView = {
  readonly userId: string;
  readonly effectiveLevel: RelationLevel;
  readonly grantedByMe: RelationLevel;
  readonly since: string | null;
  readonly progress: { readonly activeWeeks: number; readonly needed: number | null; readonly missing: readonly string[] };
  readonly eligibleFor: 'CLOSE' | 'BLOOD' | null;
};

export type RelationLinksDb = Pick<PrismaClient, 'friendRequest' | 'userRelation' | 'pairInteractionDay' | 'user'>;

/** Plafond d'une liste de cercles : bien au-delà du réel, il borne la lecture sans paginer. */
export const MAX_RELATION_LINKS = 500;

type LinkRow = UserRelationRow;

const LINK_SELECT = {
  id: true, userLowId: true, userHighId: true, grantedByLow: true, grantedByHigh: true, levelSince: true, transitions: true,
} as const;

const asTransitions = (row: LinkRow): RelationTransition[] =>
  (row.transitions ?? []).flatMap((t) =>
    t.at instanceof Date && typeof t.actorId === 'string'
      ? [{ actorId: t.actorId, from: t.from as RelationLevel, to: t.to as RelationLevel, at: t.at }]
      : [],
  );

const sinceOf = (row: LinkRow | null, level: RelationLevel): string | null =>
  row ? (relationEntryDate(asTransitions(row), level)?.toISOString() ?? null) : null;

function viewOf(params: {
  readonly otherId: string;
  readonly level: RelationLevel;
  readonly granted: RelationLevel;
  readonly row: LinkRow | null;
  readonly progress: RelationProgress | undefined;
}): RelationLinkView {
  const { progress } = params;
  const belongs = relationLevelIfAtLeast(params.level, 'ACQUAINTANCE') !== null;
  return {
    userId: params.otherId,
    effectiveLevel: params.level,
    grantedByMe: params.granted,
    since: sinceOf(params.row, params.level),
    progress: {
      activeWeeks: progress?.series.activeWeeks ?? 0,
      needed: progress?.series.needed ?? null,
      missing: belongs ? [] : (progress?.acquaintance.missing ?? []),
    },
    eligibleFor: progress?.series.eligibleFor ?? null,
  };
}

export async function loadRelationLink(
  prisma: RelationLinksDb,
  params: { viewerId: string; otherId: string; now: Date },
): Promise<RelationLinkView> {
  const { viewerId, otherId, now } = params;
  const [level, row] = await Promise.all([
    niveauEffectif(prisma, viewerId, otherId),
    prisma.userRelation.findUnique({ where: { userLowId_userHighId: relationPairKey(viewerId, otherId) }, select: LINK_SELECT }),
  ]);
  const link: LinkRow | null = row;
  const progress = (
    await loadProgressByPartner(prisma, { userId: viewerId, targets: [{ otherId, level, levelSince: link?.levelSince ?? null }], now })
  ).get(otherId);

  return viewOf({ otherId, level, granted: link ? grantedByUser(link, viewerId) : 'PUBLIC', row: link, progress });
}

const otherOf = (row: UserRelationRow, viewerId: string): string => (row.userLowId === viewerId ? row.userHighId : row.userLowId);

/** Mes cercles : les liens d'au moins Connaissance, sans les personnes bloquées. */
export async function listRelationLinks(
  prisma: RelationLinksDb,
  params: { viewerId: string; now: Date },
): Promise<RelationLinkView[]> {
  const { viewerId, now } = params;
  const [rows, blocked, legacyFriends] = await Promise.all([
    prisma.userRelation.findMany({
      where: { OR: [{ userLowId: viewerId }, { userHighId: viewerId }] },
      select: LINK_SELECT,
      take: MAX_RELATION_LINKS,
    }) as PromiseLike<LinkRow[]>,
    getBlockRelatedUserIds(prisma, viewerId),
    amisAcceptes(prisma, viewerId, { limit: MAX_RELATION_LINKS }),
  ]);

  const known = new Map(rows.map((row) => [otherOf(row, viewerId), row] as const));
  const belonging = rows
    .map((row) => ({ otherId: otherOf(row, viewerId), row, level: effectiveLevelOfRow(row) }))
    .filter(({ level }) => relationLevelIfAtLeast(level, 'ACQUAINTANCE') !== null);
  // Les amis d'avant les cercles, que le rattrapage n'a pas encore écrits en lien : ils
  // se lisent Ami (l'ancienne loi), et aucun n'est perdu entre le déploiement et lui.
  const awaiting = legacyFriends
    .filter((id) => !known.has(id))
    .map((otherId) => ({ otherId, row: null as LinkRow | null, level: 'FRIEND' as RelationLevel }));

  const entries = [...belonging, ...awaiting].filter(({ otherId }) => !blocked.has(otherId));
  const targets: RelationProgressTarget[] = entries.map(({ otherId, row, level }) => ({
    otherId, level, levelSince: row?.levelSince ?? null,
  }));
  const progress = await loadProgressByPartner(prisma, { userId: viewerId, targets, now });

  return entries.map(({ otherId, row, level }) =>
    viewOf({ otherId, level, granted: row ? grantedByUser(row, viewerId) : 'FRIEND', row, progress: progress.get(otherId) }),
  );
}
