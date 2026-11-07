/**
 * LIRE un lien (#13933) : ce que `GET /relations` et `GET /relations/:userId` servent,
 * et ce que `POST /relations/:userId/level` rend après avoir baissé.
 *
 * Servi : l'identifiant de l'AUTRE, le niveau effectif, ce que JE lui accorde, la date
 * d'entrée (jamais celle d'une baisse), la progression et l'éligibilité. Jamais servi
 * dans la LISTE : un nom, une présence, un cool-down.
 *
 * La lecture d'UN lien (`GET /relations/:userId`, #14910) sert en plus `canRaise` :
 * le profil doit savoir s'il propose « Promouvoir ». Ni une baisse ni un refus n'y
 * fuient : le cool-down n'est jamais servi (`raiseBlockedUntil` vaut `null`), et une
 * demande refusée se lit « en attente » pour son émetteur (`raiseOutlookOf`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  relationEntryDate,
  relationLevelIfAtLeast,
  relationPairKey,
  type RelationLevel,
  type RelationLinkView,
  type RelationTransition,
} from '@meeshy/shared/types/relation';
import { amisAcceptes, niveauEffectif, niveauEffectifUniforme } from '../friendship';
import { getBlockRelatedUserIds, isBlockedBetween } from '../../utils/blocking';
import { effectiveLevelOfRow, grantedByUser, type UserRelationRow } from './userRelationWriter';
import { loadProgressByPartner, loadRelationProgress, type RelationProgress, type RelationProgressTarget } from './relationProgress';
import { hasStandingRequest, raiseOutlookOf } from './relationRequestGate';
import type { RelationLinkDetail } from '@meeshy/shared/types/relation-level-response';
import { resolveRelationAccess } from '@meeshy/shared/utils/relation-access';
import { declaredAgeClass } from '@meeshy/shared/utils/age';

export type { RelationLinkView };

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

/** Ce qu'un lien sous blocage laisse lire : rien (la loi d'accès rend PUBLIC, raison `blocked`). */
const blockedView = (otherId: string): RelationLinkView => ({
  userId: otherId,
  effectiveLevel: 'PUBLIC',
  grantedByMe: 'PUBLIC',
  since: null,
  progress: { activeWeeks: 0, needed: null, missing: [] },
  eligibleFor: null,
});

export async function loadRelationLink(
  prisma: RelationLinksDb,
  params: { viewerId: string; otherId: string; now: Date },
): Promise<RelationLinkView> {
  const { viewerId, otherId, now } = params;
  if (await isBlockedBetween(prisma, viewerId, otherId)) return blockedView(otherId);
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

/**
 * UN lien, tel que le profil le gère (#14910) : la vue de `GET /relations`, `canRaise`
 * et `raiseBlockedUntil`.
 *
 * Toutes les lectures partent, SANS condition l'une de l'autre : blocage, niveau
 * (`niveauEffectifUniforme`), ligne, demande en suspens, puis la série. Sous
 * Connaissance — bloqué, inconnu, aucun lien, lien quitté —, la réponse est la vue
 * vide : ni le contenu ni le nombre de requêtes ne disent un blocage ou un cool-down.
 *
 * `accessLevel` (#16623) est le verdict de la LOI sur les outils de cercle de la paire,
 * à côté du LIEN (`effectiveLevel`) : il ne s'en écarte qu'entre deux comptes de
 * l'équipe, si bien qu'il n'apprend aucun rôle à un utilisateur ordinaire.
 */
export async function loadRelationLinkDetail(
  prisma: RelationLinksDb,
  params: { viewerId: string; otherId: string; now: Date },
): Promise<RelationLinkDetail> {
  const { viewerId, otherId, now } = params;
  const [blocked, level, row, standingRequest, people] = await Promise.all([
    isBlockedBetween(prisma, viewerId, otherId),
    niveauEffectifUniforme(prisma, viewerId, otherId),
    prisma.userRelation.findUnique({ where: { userLowId_userHighId: relationPairKey(viewerId, otherId) }, select: LINK_SELECT }),
    hasStandingRequest(prisma, { requesterId: viewerId, otherId }),
    prisma.user.findMany({ where: { id: { in: [viewerId, otherId] } }, select: { id: true, role: true, birthDate: true } }),
  ]);
  const link: LinkRow | null = row;
  const progress = await loadRelationProgress(prisma, {
    userA: viewerId, userB: otherId, level, levelSince: link?.levelSince ?? null, now,
  });

  const person = (id: string) => people.find((candidate) => candidate.id.toLowerCase() === id.toLowerCase());
  const accessLevel = resolveRelationAccess({
    viewerId,
    targetId: otherId,
    grantedByViewer: level,
    grantedByTarget: level,
    sharesCommunity: false,
    blockedEitherWay: blocked,
    viewerMinor: declaredAgeClass(person(viewerId)?.birthDate ?? null, now),
    targetMinor: declaredAgeClass(person(otherId)?.birthDate ?? null, now),
    viewerRole: person(viewerId)?.role,
    targetRole: person(otherId)?.role,
    feature: 'bring',
    consent: 'granted',
  }).effectiveLevel;

  if (blocked || relationLevelIfAtLeast(level, 'ACQUAINTANCE') === null) {
    return { ...blockedView(otherId), effectiveLevel: blocked ? 'PUBLIC' : level, canRaise: false, raiseBlockedUntil: null, accessLevel };
  }
  const view = viewOf({ otherId, level, granted: link ? grantedByUser(link, viewerId) : 'FRIEND', row: link, progress });
  return {
    ...view,
    ...raiseOutlookOf({ currentLevel: level, eligibleFor: view.eligibleFor, standingRequest, now }),
    accessLevel,
  };
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
