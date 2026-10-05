/**
 * Les ligues hebdomadaires (#9384) et la ligue Amis (#9385) : la semaine, sa
 * fermeture, les groupes de 30, les zones, les coupes, les points GAGNÉS.
 * `docs/product/jeu-meeshy-conception.html` § II.7.
 */

import { describe, it, expect } from 'vitest';
import {
  LEAGUE_KEYS,
  canSeeLeagueMember,
  defaultLeaguePseudonym,
  friendsLeagueRanking,
  isLeagueWeekClosed,
  isValidLeaguePseudonym,
  leagueAccess,
  leagueDisplayName,
  leagueIndex,
  leaguePointsToPromotion,
  leagueStandings,
  leagueWeekClose,
  leagueWeekKey,
  leagueWeekOfMoment,
  leagueWeekPoints,
  nextLeague,
  partitionLeagueGroups,
  previousLeague,
  settleLeagueGroup,
  weekdayIndex,
} from '../../utils/game/league.js';
import { GLORY_POINTS } from '../../utils/game/glory.js';

const members = (points: readonly number[]) => points.map((weekPoints, i) => ({ userId: `u${i + 1}`, weekPoints }));

describe('les huit ligues', () => {
  it('suivent la conception, du Quartz au Prisme', () => {
    expect([...LEAGUE_KEYS]).toEqual(['quartz', 'ambre', 'jade', 'saphir', 'rubis', 'amethyste', 'diamant', 'prisme']);
  });

  it('montent et descendent, avec des bornes aux extrémités', () => {
    expect(nextLeague('quartz')).toBe('ambre');
    expect(nextLeague('diamant')).toBe('prisme');
    expect(nextLeague('prisme')).toBeNull();
    expect(previousLeague('ambre')).toBe('quartz');
    expect(previousLeague('quartz')).toBeNull();
    expect(leagueIndex('jade')).toBe(2);
  });
});

describe('la semaine', () => {
  it('lit le jour de la semaine, le lundi valant 0', () => {
    expect(weekdayIndex('2026-10-05')).toBe(0);
    expect(weekdayIndex('2026-10-11')).toBe(6);
    expect(weekdayIndex('1970-01-01')).toBe(3);
    expect(weekdayIndex('1969-12-29')).toBe(0);
  });

  it('s\'identifie par son lundi local', () => {
    expect(leagueWeekKey('2026-10-05')).toBe('2026-10-05');
    expect(leagueWeekKey('2026-10-08')).toBe('2026-10-05');
    expect(leagueWeekKey('2026-10-11')).toBe('2026-10-05');
    expect(leagueWeekKey('2026-10-12')).toBe('2026-10-12');
    expect(leagueWeekKey('2027-01-01')).toBe('2026-12-28');
  });

  it('ferme le dimanche à 20 h, heure locale', () => {
    expect(leagueWeekClose('2026-10-05')).toEqual({ dayKey: '2026-10-11', minuteOfDay: 1200 });
    expect(isLeagueWeekClosed({ weekKey: '2026-10-05', dayKey: '2026-10-11', minuteOfDay: 1199 })).toBe(false);
    expect(isLeagueWeekClosed({ weekKey: '2026-10-05', dayKey: '2026-10-11', minuteOfDay: 1200 })).toBe(true);
    expect(isLeagueWeekClosed({ weekKey: '2026-10-05', dayKey: '2026-10-12', minuteOfDay: 0 })).toBe(true);
    expect(isLeagueWeekClosed({ weekKey: '2026-10-05', dayKey: '2026-10-07', minuteOfDay: 1300 })).toBe(false);
  });

  it('range un point gagné après la fermeture dans la semaine SUIVANTE', () => {
    expect(leagueWeekOfMoment({ dayKey: '2026-10-11', minuteOfDay: 1199 })).toBe('2026-10-05');
    expect(leagueWeekOfMoment({ dayKey: '2026-10-11', minuteOfDay: 1200 })).toBe('2026-10-12');
    expect(leagueWeekOfMoment({ dayKey: '2026-10-12', minuteOfDay: 5 })).toBe('2026-10-12');
  });
});

describe('les points de la semaine', () => {
  const gain = (points: number, dayKey: string, minuteOfDay = 600) => ({ points, dayKey, minuteOfDay });

  it('comptent les points GAGNÉS dans la semaine, jamais le score en poche', () => {
    expect(
      leagueWeekPoints({
        weekKey: '2026-10-05',
        gains: [gain(100, '2026-10-05'), gain(250, '2026-10-09'), gain(40, '2026-10-12'), gain(30, '2026-10-11', 1250)],
      }),
    ).toBe(350);
  });

  it('ne retirent jamais rien : une frappe débite le score, pas la semaine', () => {
    expect(leagueWeekPoints({ weekKey: '2026-10-05', gains: [gain(300, '2026-10-06'), gain(-1221, '2026-10-07')] })).toBe(300);
  });

  it('vaut zéro sans gain, et ignore un nombre illisible', () => {
    expect(leagueWeekPoints({ weekKey: '2026-10-05', gains: [] })).toBe(0);
    expect(leagueWeekPoints({ weekKey: '2026-10-05', gains: [gain(Number.NaN, '2026-10-06')] })).toBe(0);
  });
});

describe('l\'accès à la ligue publique', () => {
  it('se ferme sous le niveau 10 (niveau record)', () => {
    expect(leagueAccess({ levelRecord: 9, adultVerified: true, consented: true })).toEqual({ status: 'locked' });
  });

  it('se ferme à qui n\'est pas majeur VÉRIFIÉ — fail-closed, en attendant la revue de conformité', () => {
    expect(leagueAccess({ levelRecord: 40, adultVerified: false, consented: true })).toEqual({ status: 'minor' });
  });

  it('demande le consentement avant d\'ouvrir', () => {
    expect(leagueAccess({ levelRecord: 10, adultVerified: true, consented: false })).toEqual({ status: 'consent-required' });
    expect(leagueAccess({ levelRecord: 10, adultVerified: true, consented: true })).toEqual({ status: 'open' });
  });
});

describe('le pseudonyme', () => {
  it('se rend sans rien révéler de la personne et reste stable', () => {
    const a = defaultLeaguePseudonym('6502f1a2b3c4d5e6f7a8b9c0');
    expect(a).toMatch(/^Colibri-[0-9a-z]{4}$/);
    expect(defaultLeaguePseudonym('6502f1a2b3c4d5e6f7a8b9c0')).toBe(a);
    expect(defaultLeaguePseudonym('autre')).not.toBe(a);
    expect(isValidLeaguePseudonym(a)).toBe(true);
  });

  it('accepte des lettres de toute langue, des chiffres, le point, le tiret et le tiret bas', () => {
    for (const ok of ['Amélie_7', 'wéi-ming', 'ya.ya', 'عمر99', 'abc']) expect(isValidLeaguePseudonym(ok)).toBe(true);
  });

  it('refuse ce qui ressemble à un contact, une adresse ou un nombre', () => {
    for (const bad of ['', 'ab', 'a'.repeat(21), 'jean@mail.fr', 'jean dupont', '0612345678', 'www.meeshy.me', '-abc', 'a/b', '<b>x</b>']) {
      expect(isValidLeaguePseudonym(bad)).toBe(false);
    }
  });

  it('s\'affiche : le pseudonyme choisi, sinon celui par défaut — jamais le nom', () => {
    expect(leagueDisplayName({ userId: 'u1', pseudonym: 'Zephyr' })).toBe('Zephyr');
    expect(leagueDisplayName({ userId: 'u1', pseudonym: null })).toBe(defaultLeaguePseudonym('u1'));
  });
});

describe('la répartition en groupes de 30', () => {
  const entrants = (n: number) => Array.from({ length: n }, (_, i) => ({ userId: `u${String(i).padStart(3, '0')}`, activity: 1000 - i }));

  it('ne fait aucun groupe sans inscrit', () => {
    expect(partitionLeagueGroups({ weekKey: '2026-10-05', league: 'quartz', entrants: [] })).toEqual([]);
  });

  it('tient dans un groupe jusqu\'à 30', () => {
    const groups = partitionLeagueGroups({ weekKey: '2026-10-05', league: 'quartz', entrants: entrants(30) });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.memberIds).toHaveLength(30);
    expect(groups[0]?.groupId).toBe('2026-10-05:quartz:1');
  });

  it('équilibre les groupes au lieu de laisser un reliquat : 31 font 16 et 15, jamais 30 et 1', () => {
    const sizes = partitionLeagueGroups({ weekKey: '2026-10-05', league: 'jade', entrants: entrants(31) }).map((g) => g.memberIds.length);
    expect(sizes).toEqual([16, 15]);
  });

  it('ne dépasse jamais 30 et place chacun une fois', () => {
    const all = entrants(187);
    const groups = partitionLeagueGroups({ weekKey: '2026-10-05', league: 'ambre', entrants: all });
    expect(groups.every((g) => g.memberIds.length <= 30)).toBe(true);
    expect(groups.flatMap((g) => g.memberIds).sort()).toEqual(all.map((e) => e.userId).sort());
  });

  it('réunit des activités comparables : un groupe est une tranche continue du classement d\'activité', () => {
    const groups = partitionLeagueGroups({ weekKey: '2026-10-05', league: 'ambre', entrants: entrants(60) });
    expect(groups[0]?.memberIds[0]).toBe('u000');
    expect(groups[0]?.memberIds.at(-1)).toBe('u029');
    expect(groups[1]?.memberIds[0]).toBe('u030');
  });

  it('est déterministe, et indifférent à l\'ordre d\'arrivée', () => {
    const a = entrants(45);
    const reversed = [...a].reverse();
    expect(partitionLeagueGroups({ weekKey: '2026-10-05', league: 'jade', entrants: a })).toEqual(
      partitionLeagueGroups({ weekKey: '2026-10-05', league: 'jade', entrants: reversed }),
    );
  });

  it('départage deux activités égales par un hachage de la semaine, jamais par une heure', () => {
    const tied = [{ userId: 'a', activity: 5 }, { userId: 'b', activity: 5 }, { userId: 'c', activity: 5 }];
    const one = partitionLeagueGroups({ weekKey: '2026-10-05', league: 'jade', entrants: tied })[0]?.memberIds;
    const two = partitionLeagueGroups({ weekKey: '2026-10-12', league: 'jade', entrants: tied })[0]?.memberIds;
    expect([...(one ?? [])].sort()).toEqual(['a', 'b', 'c']);
    expect(one).toEqual(partitionLeagueGroups({ weekKey: '2026-10-05', league: 'jade', entrants: tied })[0]?.memberIds);
    expect(two).toBeDefined();
  });
});

describe('le classement d\'un groupe', () => {
  const group = (points: readonly number[], league: (typeof LEAGUE_KEYS)[number] = 'jade') =>
    leagueStandings({ groupId: '2026-10-05:jade:1', league, members: members(points) });

  it('classe par points de la semaine, le plus haut en premier', () => {
    const s = group([10, 300, 40]);
    expect(s.map((e) => e.userId)).toEqual(['u2', 'u3', 'u1']);
    expect(s.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('fait monter les 7 premiers et descendre les 5 derniers d\'un groupe de 30', () => {
    const s = group(Array.from({ length: 30 }, (_, i) => 1000 - i * 10));
    expect(s.filter((e) => e.zone === 'promotion')).toHaveLength(7);
    expect(s.filter((e) => e.zone === 'relegation')).toHaveLength(5);
    expect(s.slice(0, 7).every((e) => e.zone === 'promotion')).toBe(true);
    expect(s.slice(-5).every((e) => e.zone === 'relegation')).toBe(true);
    expect(s[10]?.zone).toBe('safe');
  });

  it('remet une coupe d\'or, d\'argent et de bronze aux trois premiers', () => {
    const s = group(Array.from({ length: 30 }, (_, i) => 1000 - i * 10));
    expect(s.slice(0, 4).map((e) => e.cup)).toEqual(['gold', 'silver', 'bronze', null]);
  });

  it('ne promeut ni ne couronne qui n\'a gagné aucun point', () => {
    const s = group([50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(s[0]?.zone).toBe('promotion');
    expect(s[1]?.zone).not.toBe('promotion');
    expect(s[1]?.cup).toBeNull();
  });

  it('n\'a pas de montée au sommet ni de descente au pied', () => {
    const top = group(Array.from({ length: 30 }, (_, i) => 1000 - i), 'prisme');
    expect(top.some((e) => e.zone === 'promotion')).toBe(false);
    expect(top.filter((e) => e.zone === 'relegation')).toHaveLength(5);
    const bottom = group(Array.from({ length: 30 }, (_, i) => 1000 - i), 'quartz');
    expect(bottom.filter((e) => e.zone === 'promotion')).toHaveLength(7);
    expect(bottom.some((e) => e.zone === 'relegation')).toBe(false);
  });

  it('ne fait jamais monter et descendre la même personne dans un petit groupe', () => {
    for (let n = 1; n <= 14; n += 1) {
      const s = group(Array.from({ length: n }, (_, i) => 100 - i));
      const promoted = s.filter((e) => e.zone === 'promotion').length;
      const relegated = s.filter((e) => e.zone === 'relegation').length;
      expect(promoted + relegated).toBeLessThanOrEqual(n);
      expect(promoted).toBeLessThanOrEqual(Math.floor(n / 2));
      expect(relegated).toBeLessThanOrEqual(Math.floor(n / 2));
    }
  });

  it('départage deux égalités de la même façon à chaque lecture', () => {
    const a = group([5, 5, 5, 5]).map((e) => e.userId);
    expect(group([5, 5, 5, 5]).map((e) => e.userId)).toEqual(a);
  });

  it('dit combien de points manquent pour la zone de montée', () => {
    const s = group(Array.from({ length: 30 }, (_, i) => 1000 - i * 10));
    expect(leaguePointsToPromotion({ league: 'jade', standings: s, userId: 'u1' })).toBe(0);
    const eighth = s[7]!;
    const seventh = s[6]!;
    expect(leaguePointsToPromotion({ league: 'jade', standings: s, userId: eighth.userId })).toBe(seventh.weekPoints + 1 - eighth.weekPoints);
    expect(leaguePointsToPromotion({ league: 'prisme', standings: s, userId: eighth.userId })).toBeNull();
    expect(leaguePointsToPromotion({ league: 'jade', standings: s, userId: 'inconnu' })).toBeNull();
  });
});

describe('le règlement de fin de semaine', () => {
  const settled = settleLeagueGroup({
    groupId: '2026-10-05:jade:1',
    league: 'jade',
    members: members(Array.from({ length: 30 }, (_, i) => 1000 - i * 10)),
  });

  it('envoie les promus vers la ligue suivante avec +30 de Gloire, +100 de plus pour une coupe', () => {
    const first = settled[0]!;
    expect(first.outcome).toEqual({ nextLeague: 'saphir', promoted: true, relegated: false, glory: GLORY_POINTS.leagueUp + GLORY_POINTS.leagueCup });
    const fifth = settled[4]!;
    expect(fifth.outcome).toEqual({ nextLeague: 'saphir', promoted: true, relegated: false, glory: GLORY_POINTS.leagueUp });
  });

  it('garde les autres où ils sont, sans Gloire', () => {
    expect(settled[12]?.outcome).toEqual({ nextLeague: 'jade', promoted: false, relegated: false, glory: 0 });
  });

  it('fait redescendre les 5 derniers, sans Gloire retirée', () => {
    expect(settled[29]?.outcome).toEqual({ nextLeague: 'ambre', promoted: false, relegated: true, glory: 0 });
  });
});

describe('la ligue Amis', () => {
  it('classe le joueur et ses amis acceptés, et personne d\'autre', () => {
    const entries = friendsLeagueRanking({
      weekKey: '2026-10-05',
      viewerId: 'me',
      friendIds: ['f1', 'f2'],
      weekPoints: { me: 120, f1: 300, f2: 50, stranger: 9999 },
    });
    expect(entries.map((e) => e.userId)).toEqual(['f1', 'me', 'f2']);
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(entries.find((e) => e.userId === 'me')?.isMe).toBe(true);
    expect(entries.some((e) => e.userId === 'stranger')).toBe(false);
  });

  it('compte zéro pour un ami sans point, et n\'inscrit personne deux fois', () => {
    const entries = friendsLeagueRanking({ weekKey: '2026-10-05', viewerId: 'me', friendIds: ['f1', 'f1', 'me'], weekPoints: { me: 5 } });
    expect(entries.map((e) => [e.userId, e.weekPoints])).toEqual([['me', 5], ['f1', 0]]);
  });

  it('classe seul le joueur sans ami', () => {
    expect(friendsLeagueRanking({ weekKey: '2026-10-05', viewerId: 'me', friendIds: [], weekPoints: {} })).toEqual([
      { userId: 'me', weekPoints: 0, rank: 1, isMe: true },
    ]);
  });
});

describe('qui voit qui', () => {
  it('ne montre dans la ligue publique que le pseudonyme et le total de la semaine', () => {
    expect(canSeeLeagueMember({ board: 'public', viewerIsMember: true })).toEqual({ pseudonym: true, realIdentity: false, presence: false });
  });

  it('ne sert aucune présence ni aucun nom : seul le total hebdomadaire sort', () => {
    expect(canSeeLeagueMember({ board: 'public', viewerIsMember: false })).toEqual({ pseudonym: false, realIdentity: false, presence: false });
  });

  it('montre l\'identité aux amis, sans plus de présence que la loi de présence ne le permet', () => {
    expect(canSeeLeagueMember({ board: 'friends', viewerIsMember: true })).toEqual({ pseudonym: false, realIdentity: true, presence: false });
  });
});
