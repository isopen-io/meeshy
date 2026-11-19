/**
 * « En commun » côté passerelle (#19200, chantier #18857) : ce que le lecteur
 * partage avec la personne dont il ouvre la fiche — communautés, amis.
 *
 * L'orchestrateur LIT la paire (accords des deux côtés, blocage, communauté,
 * âge, rôle, état du compte) et rend le verdict de la loi par partie
 * (`resolveInCommonParts`, shared). Il n'écrit AUCUNE comparaison de niveaux :
 * l'appartenance d'un ami se lit par `amisAcceptes` / `amisAcceptesParmi`, le
 * cercle du lecteur par `accordsDonnesParmi`, tous au site de la loi
 * (`friendship.ts`).
 *
 * Les listes ne s'appellent qu'APRÈS le verdict de leur partie (la route les
 * garde) : aucune n'est lue, donc aucune ne se compte, sous le cercle.
 * Une lecture qui échoue LÈVE : l'appelant ferme.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { RelationLevel } from '@meeshy/shared/types/relation';
import { resolveInCommonParts, type InCommonParts } from '@meeshy/shared/utils/profile-in-common';
import { getBlockedUserIdsAmong } from '../../utils/blocking';
import { accordsDonnesParmi, accordsEntre, amisAcceptes, amisAcceptesParmi, plusProchesDabord } from '../friendship';
import { loadPrivacyPreferencesCached } from '../preferences/privacy-cache';
import { coMembersAmong, peopleOf, type PairAccessDb } from './pairAccess';
import { ACCOUNT_STATE_SELECT, isUsableAccount } from './usableAccount';

export type InCommonDb = PrismaClient;

/** Plafonds de PROTECTION, jamais une pagination produit : au-delà, la liste se tronque. */
export const IN_COMMON_SCAN_LIMIT = 1000;

const CLOSED_INPUT = {
  grantedByViewer: 'PUBLIC',
  grantedByTarget: 'PUBLIC',
  sharesCommunity: false,
  viewerMinor: 'unknown',
  targetMinor: 'unknown',
} as const;

/**
 * Le verdict par partie sur la paire RÉELLE. Une cible absente, supprimée,
 * inactive ou désactivée rend la réponse d'un inconnu (loi 9).
 */
export async function readInCommonParts(
  prisma: PairAccessDb,
  params: { readonly viewerId: string; readonly targetId: string; readonly now?: Date },
): Promise<InCommonParts> {
  const { viewerId, targetId } = params;
  if (!viewerId || !targetId || viewerId === targetId) return resolveInCommonParts({ viewerId, targetId, ...CLOSED_INPUT });

  const [accords, blocked, people, coMembers] = await Promise.all([
    accordsEntre(prisma, viewerId, targetId),
    getBlockedUserIdsAmong(prisma, viewerId, [targetId]),
    peopleOf(prisma, [viewerId, targetId], params.now ?? new Date()),
    coMembersAmong(prisma, viewerId, [targetId]),
  ]);
  const viewer = people.get(viewerId);
  const target = people.get(targetId);
  return resolveInCommonParts({
    viewerId,
    targetId,
    grantedByViewer: accords.byViewer,
    grantedByTarget: accords.byTarget,
    sharesCommunity: coMembers.has(targetId),
    blockedEitherWay: blocked.has(targetId),
    targetDeactivated: !target?.usable,
    viewerMinor: viewer?.age ?? 'unknown',
    targetMinor: target?.age ?? 'unknown',
    viewerRole: viewer?.role ?? null,
    targetRole: target?.role ?? null,
  });
}

export type CommonCommunity = {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly avatar: string | null;
  readonly isPrivate: boolean;
};

export type InCommonList<T> = { readonly total: number; readonly items: readonly T[] };

/**
 * Les communautés ACTIVES dont le lecteur ET la cible sont membres actifs. Le
 * lecteur en est membre : aucune ne lui est cachée. `deletedAt` se filtre en
 * mémoire — sur Mongo, un champ absent ne matche pas `null`.
 */
export async function commonCommunities(
  prisma: InCommonDb,
  params: { readonly viewerId: string; readonly targetId: string; readonly limit: number },
): Promise<InCommonList<CommonCommunity>> {
  const own = await prisma.communityMember.findMany({
    where: { userId: params.viewerId, isActive: true },
    select: { communityId: true },
    take: IN_COMMON_SCAN_LIMIT,
  });
  if (own.length === 0) return { total: 0, items: [] };
  const shared = await prisma.communityMember.findMany({
    where: { userId: params.targetId, isActive: true, communityId: { in: own.map((m) => m.communityId) } },
    select: { communityId: true },
    take: IN_COMMON_SCAN_LIMIT,
  });
  if (shared.length === 0) return { total: 0, items: [] };
  const rows = await prisma.community.findMany({
    where: { id: { in: [...new Set(shared.map((m) => m.communityId))] }, isActive: true },
    select: { id: true, identifier: true, name: true, avatar: true, isPrivate: true, deletedAt: true },
    orderBy: { name: 'asc' },
    take: IN_COMMON_SCAN_LIMIT,
  });
  const living = rows.filter((row) => !row.deletedAt);
  return {
    total: living.length,
    items: living.slice(0, params.limit).map((row) => ({
      id: row.id,
      identifier: row.identifier,
      name: row.name,
      avatar: row.avatar ?? null,
      isPrivate: row.isPrivate,
    })),
  };
}

export type CommonFriend = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
  /** Le cercle que le LECTEUR accorde à cet ami — jamais celui que la cible lui accorde. */
  readonly circle: RelationLevel;
};

/**
 * Les amis (lien d'au moins Ami) du lecteur ET de la cible. N'en sortent pas :
 * un compte bloqué dans un sens ou l'autre avec le lecteur OU avec la cible, un
 * compte inutilisable (supprimé, inactif, désactivé), un compte caché de la
 * recherche. Rangés du cercle le plus proche que le lecteur leur accorde.
 */
export async function commonFriends(
  prisma: InCommonDb,
  params: { readonly viewerId: string; readonly targetId: string; readonly limit: number },
): Promise<InCommonList<CommonFriend>> {
  const { viewerId, targetId } = params;
  const ofTarget = (await amisAcceptes(prisma, targetId, { limit: IN_COMMON_SCAN_LIMIT })).filter((id) => id !== viewerId);
  if (ofTarget.length === 0) return { total: 0, items: [] };
  const mutual = [...(await amisAcceptesParmi(prisma, viewerId, ofTarget))].filter((id) => id !== targetId);
  if (mutual.length === 0) return { total: 0, items: [] };

  const [blockedWithViewer, blockedWithTarget, accounts, privacy, grants] = await Promise.all([
    getBlockedUserIdsAmong(prisma, viewerId, mutual),
    getBlockedUserIdsAmong(prisma, targetId, mutual),
    prisma.user.findMany({
      where: { id: { in: mutual } },
      select: { id: true, username: true, displayName: true, avatar: true, ...ACCOUNT_STATE_SELECT },
    }),
    loadPrivacyPreferencesCached(prisma, mutual),
    accordsDonnesParmi(prisma, viewerId, mutual),
  ]);

  const byId = new Map(accounts.filter(isUsableAccount).map((row) => [row.id, row] as const));
  const kept = mutual.filter(
    (id) =>
      byId.has(id) &&
      !blockedWithViewer.has(id) &&
      !blockedWithTarget.has(id) &&
      privacy.get(id)?.hideProfileFromSearch !== true,
  );
  const ordered = plusProchesDabord(kept, grants);
  return {
    total: ordered.length,
    items: ordered.slice(0, params.limit).map((id) => {
      const row = byId.get(id)!;
      return {
        id,
        username: row.username,
        displayName: row.displayName ?? null,
        avatar: row.avatar ?? null,
        circle: grants.get(id) ?? 'PUBLIC',
      };
    }),
  };
}
