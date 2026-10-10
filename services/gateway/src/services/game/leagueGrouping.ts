/**
 * LA SÉPARATION DES COMPTES BLOQUÉS DANS LES GROUPES (#9384, conformité A-8) —
 * `partitionLeagueGroups` (loi partagée) répartit par activité et ne connaît pas
 * le blocage. Deux comptes qui se sont bloqués, dans un sens ou l'autre, ne
 * partagent JAMAIS un groupe : ce module reprend la répartition de la loi et
 * déplace ce qui doit l'être, sans rien réécrire de la répartition elle-même.
 *
 * Déterministe : même entrée, même sortie. Un compte en conflit est EXPULSÉ de
 * son groupe (le dernier venu dans l'ordre d'activité) et reçoit le premier
 * groupe voisin qui a de la place et ne contient personne qu'il a bloqué ou qui
 * l'a bloqué ; sans place, il ouvre un groupe d'attente — un groupe seul, qui ne
 * paie rien (voir `LeagueSettlement`).
 */

import { LEAGUE_GROUP_SIZE, type LeagueGroup } from '@meeshy/shared/utils/game/league';

/** La clé non orientée d'un blocage : `a|b` avec `a < b`. */
export const blockPairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Les paires bloquées (dans un sens ou l'autre), depuis les listes de blocage des comptes. */
export function blockPairs(accounts: readonly { readonly id: string; readonly blockedUserIds?: readonly string[] | null }[]): ReadonlySet<string> {
  return new Set(accounts.flatMap((account) => (account.blockedUserIds ?? []).map((other) => blockPairKey(account.id, other))));
}

type MutableGroup = { groupId: string; league: LeagueGroup['league']; weekKey: string; memberIds: string[] };

const conflicts = (memberId: string, others: readonly string[], blocked: ReadonlySet<string>): boolean =>
  others.some((other) => other !== memberId && blocked.has(blockPairKey(memberId, other)));

export function separateBlockedMembers(groups: readonly LeagueGroup[], blocked: ReadonlySet<string>): readonly LeagueGroup[] {
  if (blocked.size === 0) return groups;
  const working: MutableGroup[] = groups.map((g) => ({ groupId: g.groupId, league: g.league, weekKey: g.weekKey, memberIds: [...g.memberIds] }));
  const ejected: { readonly memberId: string; readonly from: number }[] = [];

  working.forEach((group, index) => {
    const kept: string[] = [];
    for (const memberId of group.memberIds) {
      if (conflicts(memberId, kept, blocked)) ejected.push({ memberId, from: index });
      else kept.push(memberId);
    }
    group.memberIds = kept;
  });

  const waiting: MutableGroup[] = [];
  for (const { memberId, from } of ejected) {
    const order = working.map((_, i) => i).sort((a, b) => Math.abs(a - from) - Math.abs(b - from) || a - b);
    const target = order.map((i) => working[i]!).find((g) => g.memberIds.length < LEAGUE_GROUP_SIZE && !conflicts(memberId, g.memberIds, blocked));
    if (target) {
      target.memberIds.push(memberId);
      continue;
    }
    const lonely = waiting.find((g) => !conflicts(memberId, g.memberIds, blocked));
    if (lonely) lonely.memberIds.push(memberId);
    else {
      const base = working[from]!;
      waiting.push({ groupId: `${base.weekKey}:${base.league}:w${waiting.length + 1}`, league: base.league, weekKey: base.weekKey, memberIds: [memberId] });
    }
  }
  return [...working, ...waiting].filter((g) => g.memberIds.length > 0);
}
