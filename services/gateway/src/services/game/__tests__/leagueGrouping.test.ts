/**
 * LES COMPTES BLOQUÉS NE PARTAGENT JAMAIS UN GROUPE (#9384, conformité A-8).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { LEAGUE_GROUP_SIZE, partitionLeagueGroups } from '@meeshy/shared/utils/game/league';
import { blockPairKey, blockPairs, separateBlockedMembers } from '../leagueGrouping';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${String(i).padStart(3, '0')}`);
const groupsOf = (n: number) =>
  partitionLeagueGroups({ weekKey: '2026-10-12', league: 'jade', entrants: ids(n).map((userId, i) => ({ userId, activity: 1000 - i })) });

const violates = (groups: readonly { memberIds: readonly string[] }[], blocked: ReadonlySet<string>) =>
  groups.some((g) => g.memberIds.some((a) => g.memberIds.some((b) => a !== b && blocked.has(blockPairKey(a, b)))));

describe('blockPairs', () => {
  it('une paire est non orientée : A a bloqué B ou B a bloqué A, c’est la même paire', () => {
    const pairs = blockPairs([{ id: 'b', blockedUserIds: ['a'] }, { id: 'a', blockedUserIds: ['b'] }, { id: 'c', blockedUserIds: null }]);
    expect([...pairs]).toEqual(['a|b']);
  });
});

describe('separateBlockedMembers', () => {
  it('sans blocage, rend la répartition de la loi telle quelle', () => {
    const groups = groupsOf(40);
    expect(separateBlockedMembers(groups, new Set())).toBe(groups);
  });

  it('deux comptes bloqués du même groupe sont séparés, personne n’est perdu', () => {
    const groups = groupsOf(40);
    const [a, b] = groups[0]!.memberIds as [string, string];
    const blocked = new Set([blockPairKey(a, b)]);

    const result = separateBlockedMembers(groups, blocked);

    expect(violates(result, blocked)).toBe(false);
    expect(result.flatMap((g) => g.memberIds).sort()).toEqual(ids(40));
  });

  it('un groupe plein ne dépasse jamais 30 : un compte en conflit sans place ouvre un groupe d’attente', () => {
    const groups = groupsOf(30);
    const [a, b] = groups[0]!.memberIds as [string, string];
    const blocked = new Set([blockPairKey(a, b)]);

    const result = separateBlockedMembers(groups, blocked);

    expect(result.every((g) => g.memberIds.length <= LEAGUE_GROUP_SIZE)).toBe(true);
    expect(violates(result, blocked)).toBe(false);
    expect(result).toHaveLength(2);
    expect(result[1]!.groupId).toBe('2026-10-12:jade:w1');
  });

  it('une chaîne de blocages tient aussi, et le résultat est déterministe', () => {
    const groups = groupsOf(60);
    const members = groups[0]!.memberIds;
    const blocked = new Set([blockPairKey(members[0]!, members[1]!), blockPairKey(members[1]!, members[2]!), blockPairKey(members[0]!, members[2]!)]);

    const first = separateBlockedMembers(groups, blocked);
    const second = separateBlockedMembers(groups, blocked);

    expect(violates(first, blocked)).toBe(false);
    expect(first).toEqual(second);
    expect(first.flatMap((g) => g.memberIds).sort()).toEqual(ids(60));
  });
});
