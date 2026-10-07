/**
 * LE JEU, MIS EN VECTEURS — LA VAGUE 2 (#9384 à #9392).
 *
 * Même contrat que `game-vectors-law.ts` : `game.vectors.json` est PRODUIT par ces
 * lois (`buildGameVectorsV2`, appelées par `buildGameVectors`) et REJOUÉ par
 * `game.vectors.test.ts`, puis par iOS (`GameLawVectorTests`) : chaque cas porte
 * `input.law`, le nom de la loi, et `expected` est la sortie de la loi TS. Sur
 * divergence, c'est le TS qui a raison.
 *
 * Les cas de la vague 2 sont AJOUTÉS APRÈS ceux de la vague 1 : le fichier ne
 * réécrit aucun cas existant, un rejeu iOS de la vague 1 reste identique.
 */

import { fnv1a } from '../../utils/game/day-prng.js';
import {
  ATLAS_TOTAL,
  atlasLanguage,
  atlasSummary,
  foldAtlas,
  type AtlasEvent,
  type AtlasState,
} from '../../utils/game/atlas.js';
import { badgeImprint, badgeMaterial, badgeMaterialReached, servedBadgeThresholds } from '../../utils/game/badge-tiers.js';
import {
  canInviteToDuo,
  drawDuoMission,
  duoProgress,
  duoReward,
  duoTransition,
  type DuoAction,
  type DuoStatus,
} from '../../utils/game/duo.js';
import { chooseGuideMomentAny, guideMomentV2, type GuideEventV2 } from '../../utils/game/guide-v2.js';
import type { GuideEvent } from '../../utils/game/guide.js';
import {
  canSeeLeagueMember,
  checkLeaguePseudonym,
  leaguePseudonymFromDraw,
  leagueSnapshotDay,
  friendsLeagueRanking,
  isLeagueWeekClosed,
  isValidLeaguePseudonym,
  leagueAccess,
  leaguePointsToPromotion,
  leagueWeekClose,
  leagueWeekKey,
  leagueWeekOfMoment,
  leagueWeekPoints,
  partitionLeagueGroups,
  settleLeagueGroup,
  weekdayIndex,
  type LeagueEntrant,
  type LeagueGain,
  type LeagueKey,
  type LeagueMemberPoints,
} from '../../utils/game/league.js';
import type { MissionSignal } from '../../utils/game/missions.js';
import { photoMomentId, photoMomentOfGuideEvent } from '../../utils/game/photo-moments.js';
import { prestigeTransition } from '../../utils/game/prestige.js';
import {
  achievementGloryAtEarning,
  measureRarity,
  rarityFromShare,
  rarityShareDisplayable,
  RARITY_BORDERS,
} from '../../utils/game/rarity.js';
import { assignMythicSeats, mythicCrossedAt, type GloryGain, type MythicArrival } from '../../utils/game/mythe.js';
import { mythicSignature } from '../../utils/game/mythic-signature.js';
import {
  canBuySeal,
  claimSeasonStep,
  seasonAt,
  seasonCalendar,
  seasonOfMoment,
  seasonProgress,
  seasonSettlement,
  seasonStarsForMission,
  seasonStepReward,
  seasonWeek,
  seasonSealReward,
  type SeasonStarSource,
} from '../../utils/game/season.js';
import {
  canViewShowcase,
  capShowcaseVisibility,
  flameTrophiesEarned,
  visitorAwardedMonth,
  visitorShowcase,
  visitorTrophyKey,
  orderShowcase,
  parseTrophyKey,
  trophyKey,
  type ShowcaseViewer,
  type ShowcaseVisibility,
  type TrophyRecord,
  type TrophySpec,
} from '../../utils/game/trophies.js';

export type GameVectorInputV2 =
  | { readonly law: 'league-week'; readonly dayKey: string; readonly minuteOfDay: number }
  | { readonly law: 'league-week-points'; readonly weekKey: string; readonly gains: readonly LeagueGain[] }
  | { readonly law: 'league-access'; readonly levelRecord: number; readonly adultVerified: boolean; readonly consented: boolean }
  | { readonly law: 'league-pseudonym'; readonly value: string }
  | { readonly law: 'league-pseudonym-draw'; readonly draw: number }
  | { readonly law: 'league-pseudonym-check'; readonly value: string; readonly forbidden: readonly string[] }
  | { readonly law: 'league-snapshot'; readonly dayKey: string; readonly minuteOfDay: number }
  | { readonly law: 'league-groups'; readonly weekKey: string; readonly league: LeagueKey; readonly entrants: readonly LeagueEntrant[] }
  | { readonly law: 'league-settle'; readonly groupId: string; readonly league: LeagueKey; readonly members: readonly LeagueMemberPoints[]; readonly userId: string }
  | {
      readonly law: 'league-friends';
      readonly weekKey: string;
      readonly viewerId: string;
      readonly friendIds: readonly string[];
      readonly weekPoints: Readonly<Record<string, number>>;
    }
  | { readonly law: 'league-visibility'; readonly board: 'public' | 'friends'; readonly viewerIsMember: boolean }
  | {
      readonly law: 'duo-draw';
      readonly userA: string;
      readonly userB: string;
      readonly weekKey: string;
      readonly levelA: number;
      readonly levelB: number;
      readonly unavailableSignals: readonly MissionSignal[];
    }
  | { readonly law: 'duo-progress'; readonly partTarget: number; readonly mine: number; readonly partner: number }
  | { readonly law: 'duo-reward'; readonly level: number; readonly flameDays: number; readonly mineDone: boolean; readonly partnerDone: boolean }
  | {
      readonly law: 'duo-invite';
      readonly inviterLevelRecord: number;
      readonly inviteeLevelRecord: number;
      readonly areFriends: boolean;
      readonly inviterHasDuo: boolean;
      readonly inviteeHasDuo: boolean;
      readonly self: boolean;
    }
  | { readonly law: 'duo-transition'; readonly status: DuoStatus; readonly action: DuoAction; readonly actor: 'inviter' | 'invitee' }
  | { readonly law: 'season-calendar'; readonly season: number }
  | { readonly law: 'season-at'; readonly dayKey: string; readonly minuteOfDay: number }
  | { readonly law: 'season-progress'; readonly stars: number }
  | { readonly law: 'season-reward'; readonly season: number; readonly step: number }
  | { readonly law: 'season-claim'; readonly season: number; readonly step: number; readonly stepsReached: number; readonly claimed: readonly number[]; readonly sealOwned: boolean }
  | { readonly law: 'season-settlement'; readonly season: number; readonly stepsReached: number }
  | { readonly law: 'season-stars'; readonly source: SeasonStarSource }
  | { readonly law: 'season-seal'; readonly balance: number; readonly owned: boolean }
  | { readonly law: 'trophy-key'; readonly spec: TrophySpec }
  | { readonly law: 'trophy-parse'; readonly key: string }
  | { readonly law: 'trophy-flame'; readonly previousLongest: number; readonly longest: number }
  | { readonly law: 'showcase-order'; readonly owned: readonly TrophyRecord[]; readonly order: readonly string[] }
  | { readonly law: 'showcase-view'; readonly visibility: ShowcaseVisibility; readonly viewer: ShowcaseViewer }
  | { readonly law: 'showcase-cap'; readonly visibility: ShowcaseVisibility; readonly hideProfileFromSearch: boolean; readonly gameHidden: boolean }
  | { readonly law: 'trophy-month'; readonly awardedAt: string }
  | { readonly law: 'atlas'; readonly events: readonly (AtlasEvent & { readonly dayKey: string })[] }
  | { readonly law: 'atlas-language'; readonly code: string | null }
  | { readonly law: 'prestige'; readonly score: number; readonly prestige: number }
  | { readonly law: 'rarity'; readonly holders: number; readonly population: number }
  | { readonly law: 'rarity-display'; readonly holders: number; readonly population: number }
  | { readonly law: 'mythic-seats'; readonly taken: number; readonly seated: readonly string[]; readonly arrivals: readonly MythicArrival[] }
  | { readonly law: 'mythic-crossing'; readonly gains: readonly GloryGain[] }
  | { readonly law: 'mythic-signature'; readonly number: number }
  | { readonly law: 'badge-tier'; readonly count: number; readonly threshold: number }
  | { readonly law: 'badge-served'; readonly knowsExtendedTiers: boolean }
  | { readonly law: 'guide-v2'; readonly event: GuideEventV2; readonly seen: readonly string[] }
  | { readonly law: 'guide-choose'; readonly events: readonly (GuideEvent | GuideEventV2)[]; readonly seen: readonly string[] }
  | { readonly law: 'photo-moment'; readonly event: GuideEventV2 }
  | { readonly law: 'trophy-visitor-key'; readonly key: string; readonly awardedMonth: string }
  | { readonly law: 'showcase-visitor'; readonly owned: readonly TrophyRecord[]; readonly order: readonly string[] };

export const GAME_VECTOR_LAWS_V2 = [
  'league-week',
  'league-week-points',
  'league-access',
  'league-pseudonym',
  'league-pseudonym-draw',
  'league-pseudonym-check',
  'league-snapshot',
  'league-groups',
  'league-settle',
  'league-friends',
  'league-visibility',
  'duo-draw',
  'duo-progress',
  'duo-reward',
  'duo-invite',
  'duo-transition',
  'season-calendar',
  'season-at',
  'season-progress',
  'season-reward',
  'season-claim',
  'season-settlement',
  'season-stars',
  'season-seal',
  'trophy-key',
  'trophy-parse',
  'trophy-flame',
  'showcase-order',
  'showcase-view',
  'showcase-cap',
  'trophy-month',
  'atlas',
  'atlas-language',
  'prestige',
  'rarity',
  'rarity-display',
  'mythic-seats',
  'mythic-crossing',
  'mythic-signature',
  'badge-tier',
  'badge-served',
  'guide-v2',
  'guide-choose',
  'photo-moment',
  'trophy-visitor-key',
  'showcase-visitor',
] as const;

const lawSet: ReadonlySet<string> = new Set(GAME_VECTOR_LAWS_V2);
export const isGameVectorInputV2 = (input: { readonly law: string }): input is GameVectorInputV2 => lawSet.has(input.law);

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

const atlasView = (state: AtlasState) => {
  const summary = atlasSummary(state);
  return {
    stamped: summary.stamped,
    total: summary.total,
    remaining: summary.remaining,
    stamps: summary.stamps,
    pending: summary.pending,
    entries: Object.entries(state)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([language, entry]) => ({ language, ...entry })),
  };
};

export function evaluateGameVectorV2(input: GameVectorInputV2): unknown {
  switch (input.law) {
    case 'league-week':
      return {
        weekday: weekdayIndex(input.dayKey),
        weekKey: leagueWeekKey(input.dayKey),
        weekOfMoment: leagueWeekOfMoment(input),
        close: leagueWeekClose(leagueWeekKey(input.dayKey)),
        closed: isLeagueWeekClosed({ weekKey: leagueWeekKey(input.dayKey), dayKey: input.dayKey, minuteOfDay: input.minuteOfDay }),
      };
    case 'league-week-points':
      return { points: leagueWeekPoints(input) };
    case 'league-access':
      return leagueAccess(input);
    case 'league-pseudonym':
      return { valid: isValidLeaguePseudonym(input.value) };
    case 'league-pseudonym-draw':
      return { pseudonym: leaguePseudonymFromDraw(input.draw) };
    case 'league-pseudonym-check':
      return checkLeaguePseudonym(input);
    case 'league-snapshot':
      return { snapshotDay: leagueSnapshotDay(input) };
    case 'league-groups':
      return {
        groups: partitionLeagueGroups(input).map((g) => ({
          groupId: g.groupId,
          size: g.memberIds.length,
          first: g.memberIds[0] ?? null,
          last: g.memberIds.at(-1) ?? null,
          /** FNV-1a de `memberIds.join(',')` : la partition ENTIÈRE, sans la recopier. */
          digest: fnv1a(g.memberIds.join(',')),
        })),
      };
    case 'league-settle': {
      const settled = settleLeagueGroup(input);
      return {
        order: settled.map((s) => s.userId),
        me: settled.find((s) => s.userId === input.userId) ?? null,
        promoted: settled.filter((s) => s.outcome.promoted).map((s) => s.userId),
        relegated: settled.filter((s) => s.outcome.relegated).map((s) => s.userId),
        cups: settled.filter((s) => s.cup !== null).map((s) => [s.userId, s.cup]),
        gloryTotal: settled.reduce((total, s) => total + s.outcome.glory, 0),
        pointsToPromotion: leaguePointsToPromotion({ league: input.league, standings: settled, userId: input.userId }),
      };
    }
    case 'league-friends':
      return { entries: friendsLeagueRanking(input) };
    case 'league-visibility':
      return canSeeLeagueMember(input);
    case 'duo-draw':
      return { mission: drawDuoMission(input) };
    case 'duo-progress':
      return duoProgress(input);
    case 'duo-reward':
      return duoReward(input);
    case 'duo-invite':
      return canInviteToDuo(input);
    case 'duo-transition':
      return { next: duoTransition(input) };
    case 'season-calendar':
      return { calendar: seasonCalendar(input.season) };
    case 'season-at':
      return {
        season: seasonAt(input.dayKey),
        week: seasonWeek(input.dayKey),
        seasonOfMoment: seasonOfMoment(input),
      };
    case 'season-progress': {
      const p = seasonProgress(input);
      return { stars: p.stars, steps: p.steps, starsToNext: p.starsToNext, progress: round6(p.progress), completed: p.completed };
    }
    case 'season-reward':
      return { reward: seasonStepReward(input.step), seal: seasonSealReward(input.season, input.step) };
    case 'season-claim':
      return claimSeasonStep(input);
    case 'season-settlement':
      return seasonSettlement(input);
    case 'season-stars':
      return { stars: seasonStarsForMission(input.source) };
    case 'season-seal':
      return canBuySeal(input);
    case 'trophy-key':
      return { key: trophyKey(input.spec) };
    case 'trophy-parse':
      return { spec: parseTrophyKey(input.key) };
    case 'trophy-flame':
      return { days: flameTrophiesEarned(input) };
    case 'showcase-order':
      return { order: orderShowcase(input) };
    case 'showcase-view':
      return { visible: canViewShowcase(input) };
    case 'showcase-cap':
      return { visibility: capShowcaseVisibility(input) };
    case 'trophy-month':
      return { month: visitorAwardedMonth(input.awardedAt) };
    case 'atlas':
      return atlasView(foldAtlas({ state: {}, events: input.events }));
    case 'atlas-language':
      return { language: atlasLanguage(input.code), total: ATLAS_TOTAL };
    case 'prestige':
      return prestigeTransition(input);
    case 'rarity': {
      const measured = measureRarity(input);
      return {
        rarity: rarityFromShare(input),
        measured,
        border: measured === null ? null : RARITY_BORDERS[measured],
        glory: achievementGloryAtEarning(measured),
      };
    }
    case 'rarity-display':
      return { displayable: rarityShareDisplayable(input) };
    case 'mythic-seats':
      return { grants: assignMythicSeats(input) };
    case 'mythic-crossing':
      return { crossedAt: mythicCrossedAt(input.gains) };
    case 'mythic-signature':
      return { signature: mythicSignature(input.number) };
    case 'badge-tier':
      return {
        materialOfThreshold: badgeMaterial(input.threshold),
        materialReached: badgeMaterialReached(input.count),
        imprint: badgeImprint(input),
      };
    case 'badge-served':
      return { thresholds: servedBadgeThresholds(input) };
    case 'guide-v2':
      return guideMomentV2(input.event, input.seen);
    case 'guide-choose': {
      const chosen = chooseGuideMomentAny(input.events, input.seen);
      return { key: chosen === null ? null : chosen.key, presentation: chosen === null ? null : chosen.presentation };
    }
    case 'photo-moment': {
      const emblem = photoMomentOfGuideEvent(input.event);
      return { emblem, id: emblem === null ? null : photoMomentId(emblem) };
    }
    case 'trophy-visitor-key':
      return { key: visitorTrophyKey(input) };
    case 'showcase-visitor':
      return visitorShowcase(input);
  }
}

const vector = (_label: string, input: GameVectorInputV2) => ({ _label, input, expected: evaluateGameVectorV2(input) });

const ranked = (n: number, from = 1000, step = 10): LeagueMemberPoints[] =>
  Array.from({ length: n }, (_, i) => ({ userId: `u${String(i + 1).padStart(2, '0')}`, weekPoints: from - i * step }));

const entrants = (n: number): LeagueEntrant[] => Array.from({ length: n }, (_, i) => ({ userId: `e${String(i).padStart(3, '0')}`, activity: 900 - i * 7 }));

export function buildGameVectorsV2() {
  const weeks = [
    ['2026-10-05', 0],
    ['2026-10-11', 1199],
    ['2026-10-11', 1200],
    ['2026-10-12', 0],
    ['2026-10-14', 725],
    ['2026-12-06', 1199],
    ['2026-12-06', 1200],
    ['2027-01-01', 600],
    ['2028-02-29', 1300],
    ['1970-01-01', 0],
  ].map(([dayKey, minuteOfDay]) =>
    vector(`semaine de ligue du ${dayKey} à ${minuteOfDay} min`, { law: 'league-week', dayKey: dayKey as string, minuteOfDay: minuteOfDay as number }),
  );

  const weekPoints = [
    { weekKey: '2026-10-05', gains: [{ points: 100, dayKey: '2026-10-05', minuteOfDay: 600 }, { points: 250, dayKey: '2026-10-09', minuteOfDay: 600 }, { points: 40, dayKey: '2026-10-12', minuteOfDay: 600 }, { points: 30, dayKey: '2026-10-11', minuteOfDay: 1250 }] },
    { weekKey: '2026-10-05', gains: [{ points: 300, dayKey: '2026-10-06', minuteOfDay: 600 }, { points: -1221, dayKey: '2026-10-07', minuteOfDay: 600 }] },
    { weekKey: '2026-10-12', gains: [{ points: 30, dayKey: '2026-10-11', minuteOfDay: 1250 }, { points: 60, dayKey: '2026-10-11', minuteOfDay: 1199 }] },
    { weekKey: '2026-10-05', gains: [] },
  ].map((c, i) => vector(`points de semaine, cas ${i + 1}`, { law: 'league-week-points', ...c }));

  const accesses = [
    [9, true, true],
    [10, true, true],
    [10, true, false],
    [40, false, true],
    [5, false, false],
  ].map(([levelRecord, adultVerified, consented]) =>
    vector(`accès à la ligue, niveau ${levelRecord}, majeur ${adultVerified}, consenti ${consented}`, {
      law: 'league-access',
      levelRecord: levelRecord as number,
      adultVerified: adultVerified as boolean,
      consented: consented as boolean,
    }),
  );

  const pseudonyms = ['Zephyr', 'Amélie_7', 'ya.ya', 'عمر99', 'abc', 'ab', '', 'a'.repeat(20), 'a'.repeat(21), 'jean@mail.fr', 'jean dupont', '0612345678', 'www.meeshy.me', '-abc', 'a/b', 'mon.site.fr', 'x_y-z.9'].map((value) =>
    vector(`pseudonyme « ${value} »`, { law: 'league-pseudonym', value }),
  );

  const pseudonymDraws = [0, 1, 35, 36, 1_679_615, 1_679_616, 123_456_789, 4_294_967_295, 2 ** 40, -5, Number.NaN].map((draw) =>
    vector(`pseudonyme tiré au sort ${draw}`, { law: 'league-pseudonym-draw', draw }),
  );

  const pseudonymChecks = [
    ['Zephyr', ['amelie.durand', 'Amélie', 'Durand']],
    ['jean@mail.fr', []],
    ['Meeshy', []],
    ['MEE', []],
    ['Adm.in', []],
    ['Meeshy-Team', []],
    ['xxMeeshyxx', []],
    ['meeting', []],
    ['Admiral', []],
    ['Mod-erator', []],
    ['amelie.durand', ['amelie.durand']],
    ['DURAND-7', ['Durand']],
    ['Zéphyr', ['zephyr']],
    ['Zephyr', ['Li', 'Zé']],
  ].map(([value, forbidden]) =>
    vector(`filtre du pseudonyme « ${value} »`, { law: 'league-pseudonym-check', value: value as string, forbidden: forbidden as string[] }),
  );

  const snapshots = [
    ['2026-10-14', 239],
    ['2026-10-14', 240],
    ['2026-10-14', 1439],
    ['2026-10-12', 10],
    ['2027-01-01', 0],
  ].map(([dayKey, minuteOfDay]) => vector(`instantané de ligue du ${dayKey} à ${minuteOfDay} min`, { law: 'league-snapshot', dayKey: dayKey as string, minuteOfDay: minuteOfDay as number }));

  const groups = [
    [1, 'quartz'],
    [30, 'quartz'],
    [31, 'jade'],
    [60, 'ambre'],
    [61, 'prisme'],
    [187, 'saphir'],
  ].map(([n, league]) =>
    vector(`répartition de ${n} inscrits en ${league}`, { law: 'league-groups', weekKey: '2026-10-05', league: league as LeagueKey, entrants: entrants(n as number) }),
  ).concat([
    vector('répartition : ex æquo départagés par le hachage de la semaine', {
      law: 'league-groups',
      weekKey: '2026-10-12',
      league: 'jade',
      entrants: [{ userId: 'a', activity: 5 }, { userId: 'b', activity: 5 }, { userId: 'c', activity: 5 }, { userId: 'd', activity: 9 }],
    }),
  ]);

  const settles = [
    { league: 'jade' as const, members: ranked(30), userId: 'u01', label: 'groupe de 30 en Jade, premier' },
    { league: 'jade' as const, members: ranked(30), userId: 'u12', label: 'groupe de 30 en Jade, douzième' },
    { league: 'jade' as const, members: ranked(30), userId: 'u30', label: 'groupe de 30 en Jade, dernier' },
    { league: 'prisme' as const, members: ranked(30), userId: 'u02', label: 'groupe du Prisme, deuxième' },
    { league: 'quartz' as const, members: ranked(30), userId: 'u30', label: 'groupe du Quartz, dernier' },
    { league: 'ambre' as const, members: [{ userId: 'a', weekPoints: 50 }, ...ranked(11, 0, 0).slice(1)], userId: 'a', label: 'petit groupe, seul actif' },
    { league: 'ambre' as const, members: ranked(3, 80, 40), userId: 'u03', label: 'groupe de trois' },
    { league: 'rubis' as const, members: [{ userId: 'solo', weekPoints: 10 }], userId: 'solo', label: 'groupe d\'un seul' },
  ].map((c) => vector(`règlement : ${c.label}`, { law: 'league-settle', groupId: '2026-10-05:' + c.league + ':1', league: c.league, members: c.members, userId: c.userId }));

  const friends = [
    { viewerId: 'me', friendIds: ['f1', 'f2'], weekPoints: { me: 120, f1: 300, f2: 50, stranger: 9999 } },
    { viewerId: 'me', friendIds: ['f1', 'f1', 'me'], weekPoints: { me: 5 } },
    { viewerId: 'me', friendIds: [], weekPoints: {} },
    { viewerId: 'me', friendIds: ['a', 'b', 'c'], weekPoints: { a: 10, b: 10, c: 10, me: 10 } },
  ].map((c, i) => vector(`ligue Amis, cas ${i + 1}`, { law: 'league-friends', weekKey: '2026-10-05', ...c }));

  const visibilities = [
    ['public', true],
    ['public', false],
    ['friends', true],
    ['friends', false],
  ].map(([board, viewerIsMember]) =>
    vector(`visibilité de la ligue ${board}, membre ${viewerIsMember}`, { law: 'league-visibility', board: board as 'public' | 'friends', viewerIsMember: viewerIsMember as boolean }),
  );

  const duoDraws = [
    { userA: 'alice', userB: 'bob', weekKey: '2026-10-05', levelA: 30, levelB: 30, unavailableSignals: [] },
    { userA: 'bob', userB: 'alice', weekKey: '2026-10-05', levelA: 30, levelB: 30, unavailableSignals: [] },
    { userA: 'alice', userB: 'bob', weekKey: '2026-10-12', levelA: 10, levelB: 90, unavailableSignals: [] },
    { userA: 'alice', userB: 'bob', weekKey: '2026-10-19', levelA: 90, levelB: 90, unavailableSignals: [] },
    { userA: '6502f1a2b3c4d5e6f7a8b9c0', userB: '6502f1a2b3c4d5e6f7a8b9c1', weekKey: '2026-10-26', levelA: 20, levelB: 55, unavailableSignals: ['foreign-language-message', 'axis:tool.reaction'] as MissionSignal[] },
  ].map((c, i) => vector(`mission en duo, cas ${i + 1}`, { law: 'duo-draw', ...c }));

  const duoProgresses = [
    [20, 25, 8],
    [5, 5, 6],
    [10, 100, 0],
    [4, 0, 0],
  ].map(([partTarget, mine, partner]) => vector(`progression du duo ${mine}/${partner} sur ${partTarget}`, { law: 'duo-progress', partTarget: partTarget!, mine: mine!, partner: partner! }));

  const duoRewards = [
    [30, 10, false, true],
    [30, 10, true, false],
    [30, 10, true, true],
    [30, 0, true, false],
    [100, 25, true, true],
  ].map(([level, flameDays, mineDone, partnerDone]) =>
    vector(`récompense du duo niveau ${level}, Flamme ${flameDays}, moi ${mineDone}, lui ${partnerDone}`, {
      law: 'duo-reward',
      level: level as number,
      flameDays: flameDays as number,
      mineDone: mineDone as boolean,
      partnerDone: partnerDone as boolean,
    }),
  );

  const invites = [
    { inviterLevelRecord: 25, inviteeLevelRecord: 20, areFriends: true, inviterHasDuo: false, inviteeHasDuo: false, self: false },
    { inviterLevelRecord: 19, inviteeLevelRecord: 20, areFriends: true, inviterHasDuo: false, inviteeHasDuo: false, self: false },
    { inviterLevelRecord: 25, inviteeLevelRecord: 19, areFriends: true, inviterHasDuo: false, inviteeHasDuo: false, self: false },
    { inviterLevelRecord: 25, inviteeLevelRecord: 20, areFriends: false, inviterHasDuo: false, inviteeHasDuo: false, self: false },
    { inviterLevelRecord: 25, inviteeLevelRecord: 20, areFriends: true, inviterHasDuo: true, inviteeHasDuo: false, self: false },
    { inviterLevelRecord: 25, inviteeLevelRecord: 20, areFriends: true, inviterHasDuo: false, inviteeHasDuo: true, self: false },
    { inviterLevelRecord: 25, inviteeLevelRecord: 25, areFriends: true, inviterHasDuo: false, inviteeHasDuo: false, self: true },
  ].map((c, i) => vector(`invitation au duo, cas ${i + 1}`, { law: 'duo-invite', ...c }));

  const transitions = (['invited', 'active', 'completed', 'abandoned', 'expired'] as const).flatMap((status) =>
    (['accept', 'abandon', 'expire', 'complete'] as const).flatMap((action) =>
      (['inviter', 'invitee'] as const).map((actor) => vector(`duo ${status} + ${action} par ${actor}`, { law: 'duo-transition', status, action, actor })),
    ),
  );

  const calendars = [0, 1, 2, 3, 9, 25].map((season) => vector(`calendrier de la saison ${season}`, { law: 'season-calendar', season }));

  const seasonAts = [
    ['2026-10-11', 0],
    ['2026-10-12', 0],
    ['2026-12-06', 1199],
    ['2026-12-06', 1200],
    ['2026-12-07', 0],
    ['2027-02-01', 0],
    ['2030-06-15', 800],
  ].map(([dayKey, minuteOfDay]) => vector(`saison du ${dayKey} à ${minuteOfDay} min`, { law: 'season-at', dayKey: dayKey as string, minuteOfDay: minuteOfDay as number }));

  const progresses = [0, 3, 4, 7, 99, 100, 159, 160, 9999].map((stars) => vector(`parcours de saison à ${stars} étoiles`, { law: 'season-progress', stars }));

  const rewards = [0, 1, 4, 5, 8, 10, 20, 35, 39, 40, 41].map((step) => vector(`récompense de l'étape ${step}`, { law: 'season-reward', season: 1, step }))
    .concat([vector('récompense du Sceau, saison 2, étape 40', { law: 'season-reward', season: 2, step: 40 })]);

  const claims = [
    { season: 1, step: 4, stepsReached: 6, claimed: [], sealOwned: false },
    { season: 1, step: 4, stepsReached: 6, claimed: [], sealOwned: true },
    { season: 1, step: 7, stepsReached: 6, claimed: [], sealOwned: false },
    { season: 1, step: 3, stepsReached: 6, claimed: [3], sealOwned: false },
    { season: 1, step: 0, stepsReached: 6, claimed: [], sealOwned: false },
    { season: 1, step: 41, stepsReached: 40, claimed: [], sealOwned: false },
    { season: 2, step: 40, stepsReached: 40, claimed: [39], sealOwned: true },
  ].map((c, i) => vector(`réclamation d'étape, cas ${i + 1}`, { law: 'season-claim', ...c }));

  const settlements = [40, 39, 0, 80].map((stepsReached) => vector(`règlement de saison à ${stepsReached} étapes`, { law: 'season-settlement', season: 1, stepsReached }));

  const stars = (['easy', 'medium', 'hard', 'gold', 'duo'] as const).map((source) => vector(`étoiles d'une mission ${source}`, { law: 'season-stars', source }));

  const seals = [
    [10, false],
    [9, false],
    [99, true],
  ].map(([balance, owned]) => vector(`Sceau avec ${balance} Meeshes, possédé ${owned}`, { law: 'season-seal', balance: balance as number, owned: owned as boolean }));

  const trophySpecs: readonly TrophySpec[] = [
    { kind: 'league-cup', weekKey: '2026-10-05', league: 'jade', cup: 'gold' },
    { kind: 'league-cup', weekKey: '2026-10-12', league: 'prisme', cup: 'bronze' },
    { kind: 'season-cup', season: 1 },
    { kind: 'prestige', number: 3 },
    { kind: 'flame', days: 365 },
  ];
  const trophyKeys = trophySpecs.map((spec) => vector(`clé du trophée ${spec.kind}`, { law: 'trophy-key', spec }));

  const trophyParses = [
    'trophy.league-cup.2026-10-05.jade.gold',
    'trophy.season-cup.12',
    'trophy.prestige.5',
    'trophy.prestige.6',
    'trophy.prestige.0',
    'trophy.flame.100',
    'trophy.flame.50',
    'trophy.league-cup.2026-10-05.jade',
    'trophy.league-cup.not-a-day.jade.gold',
    'trophy.unknown.1',
    '',
  ].map((key) => vector(`lecture de la clé « ${key} »`, { law: 'trophy-parse', key }));

  const trophyFlames = [
    [99, 100],
    [0, 400],
    [100, 200],
    [364, 365],
  ].map(([previousLongest, longest]) => vector(`trophées de Flamme ${previousLongest} → ${longest}`, { law: 'trophy-flame', previousLongest: previousLongest!, longest: longest! }));

  const owned: readonly TrophyRecord[] = [
    { key: 'trophy.league-cup.2026-10-05.jade.bronze', awardedAt: '2026-10-12T00:00:00.000Z' },
    { key: 'trophy.prestige.1', awardedAt: '2026-11-01T00:00:00.000Z' },
    { key: 'trophy.league-cup.2026-10-12.jade.gold', awardedAt: '2026-10-19T00:00:00.000Z' },
    { key: 'trophy.season-cup.1', awardedAt: '2026-12-07T00:00:00.000Z' },
    { key: 'trophy.flame.100', awardedAt: '2026-11-20T00:00:00.000Z' },
    { key: 'trophy.future.9', awardedAt: '2027-01-01T00:00:00.000Z' },
  ];
  const showcases = [
    [],
    ['trophy.flame.100', 'trophy.league-cup.2026-10-05.jade.bronze'],
    ['trophy.prestige.4', 'trophy.season-cup.1', 'trophy.season-cup.1'],
  ].map((order, i) => vector(`ordre de la vitrine, cas ${i + 1}`, { law: 'showcase-order', owned, order }));

  const views = (['everyone', 'friends', 'me', 'public'] as const).flatMap((visibility) =>
    (['self', 'friend', 'other', 'admin'] as const).map((viewer) => vector(`vitrine ${visibility} vue par ${viewer}`, { law: 'showcase-view', visibility: visibility as ShowcaseVisibility, viewer })),
  );

  const caps = (['everyone', 'friends', 'me', 'public'] as const).flatMap((visibility) =>
    [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ].map(([hideProfileFromSearch, gameHidden]) =>
      vector(`plafond de la vitrine ${visibility}, caché ${hideProfileFromSearch}, jeu masqué ${gameHidden}`, {
        law: 'showcase-cap',
        visibility: visibility as ShowcaseVisibility,
        hideProfileFromSearch: hideProfileFromSearch as boolean,
        gameHidden: gameHidden as boolean,
      }),
    ),
  );

  const months = ['2026-11-01T08:42:17.000Z', '2026-12-31T23:59:59.999Z', 'hier', ''].map((awardedAt) => vector(`mois d'un trophée « ${awardedAt} »`, { law: 'trophy-month', awardedAt }));

  const atlases = [
    [{ kind: 'sent', language: 'ja', dayKey: '2026-10-12' }, { kind: 'received', language: 'ja', dayKey: '2026-10-13' }],
    [{ kind: 'received', language: 'sw', dayKey: '2026-10-12' }, { kind: 'sent', language: 'sw', dayKey: '2026-10-12' }, { kind: 'received', language: 'sw', dayKey: '2026-11-01' }],
    [{ kind: 'sent', language: 'en-US', dayKey: '2026-10-12' }, { kind: 'received', language: 'en-GB', dayKey: '2026-10-14' }, { kind: 'sent', language: 'klingon', dayKey: '2026-10-14' }],
    [{ kind: 'sent', language: 'es', dayKey: '2026-10-12' }],
    [],
  ].map((events, i) => vector(`Atlas, cas ${i + 1}`, { law: 'atlas', events: events as readonly (AtlasEvent & { dayKey: string })[] }));

  const atlasCodes = ['FR', 'en-US', 'pt_BR', 'bas', 'xx', 'fil', '', null, 'unknown', 'zh-Hant-HK'].map((code) =>
    vector(`langue de l'Atlas « ${code} »`, { law: 'atlas-language', code }),
  );

  const prestiges = [
    [100_000, 0],
    [99_999, 0],
    [0, 0],
    [105_000, 4],
    [100_000, 5],
    [10, 7],
  ].map(([score, prestige]) => vector(`Prestige, score ${score}, étoiles ${prestige}`, { law: 'prestige', score: score!, prestige: prestige! }));

  const rarities = [
    [90_000, 100_000],
    [40_001, 100_000],
    [40_000, 100_000],
    [10_000, 100_000],
    [9_999, 100_000],
    [2_000, 100_000],
    [1_999, 100_000],
    [200, 100_000],
    [199, 100_000],
    [0, 100_000],
    [5, 1000],
    [1, 999],
    [3, 1500],
  ].map(([holders, population]) => vector(`rareté de ${holders} détenteurs sur ${population}`, { law: 'rarity', holders: holders!, population: population! }));

  const rarityDisplays = [
    [19, 50_000],
    [20, 50_000],
    [20, 999],
    [500, 1000],
  ].map(([holders, population]) => vector(`affichage de la rareté, ${holders} détenteurs sur ${population}`, { law: 'rarity-display', holders: holders!, population: population! }));

  const arrivalAt = (userId: string, day: number, glory = 1_000_000): MythicArrival => ({ userId, glory, crossedAt: `2027-01-${String(day).padStart(2, '0')}T00:00:00.000Z` });
  const mythics = [
    vector('places du Mythe : aucune arrivée', { law: 'mythic-seats', taken: 0, seated: [], arrivals: [] }),
    vector('places du Mythe : ordre d’arrivée, puis identifiant, 999 999 refusé', {
      law: 'mythic-seats',
      taken: 3,
      seated: ['z'],
      arrivals: [arrivalAt('b', 2), arrivalAt('a', 2), arrivalAt('c', 1), arrivalAt('z', 1), arrivalAt('low', 1, 999_999)],
    }),
    vector('places du Mythe : la 100e se prend, la 101e jamais', { law: 'mythic-seats', taken: 99, seated: [], arrivals: [arrivalAt('u1', 1), arrivalAt('u2', 2)] }),
    vector('places du Mythe : toutes prises', { law: 'mythic-seats', taken: 100, seated: [], arrivals: [arrivalAt('u1', 1)] }),
    vector('arrivée au Mythe : premier gain qui atteint le seuil', {
      law: 'mythic-crossing',
      gains: [
        { delta: 500_000, createdAt: '2027-01-02T00:00:00.000Z' },
        { delta: 600_000, createdAt: '2027-03-01T00:00:00.000Z' },
        { delta: 500_000, createdAt: '2026-12-01T00:00:00.000Z' },
      ],
    }),
    vector('arrivée au Mythe : seuil jamais atteint', { law: 'mythic-crossing', gains: [{ delta: 999_999, createdAt: '2027-01-01T00:00:00.000Z' }] }),
    ...[1, 2, 10, 11, 42, 50, 91, 100, 0, 101].map((number) => vector(`Signature unique du Mythe n° ${number}`, { law: 'mythic-signature', number })),
  ];

  const badgeTiers = [
    [0, 1],
    [1, 1],
    [463, 500],
    [500, 500],
    [999, 1000],
    [1000, 1000],
    [4990, 5000],
    [5000, 5000],
    [7, 7],
  ].map(([count, threshold]) => vector(`badge ${count}/${threshold}`, { law: 'badge-tier', count: count!, threshold: threshold! }));

  const served = [false, true].map((knowsExtendedTiers) => vector(`paliers servis, client ${knowsExtendedTiers ? 'à jour' : 'ancien'}`, { law: 'badge-served', knowsExtendedTiers }));

  const eventsV2: readonly GuideEventV2[] = [
    { kind: 'league-first', league: 'quartz', pointsToPromotion: 120 },
    { kind: 'league-promoted', from: 'quartz', to: 'ambre', rank: 3, weekKey: '2026-10-12' },
    { kind: 'league-relegated', from: 'ambre', to: 'quartz', pointsToPromotion: 80, weekKey: '2026-10-19' },
    { kind: 'season-start', season: 1, themeKey: 'language:fr', steps: 40 },
    { kind: 'season-end', season: 1, stepsReached: 40, completed: true, gloryGained: 500 },
    { kind: 'season-end', season: 1, stepsReached: 12, completed: false, gloryGained: 0 },
    { kind: 'trophy', trophyKey: 'trophy.prestige.1' },
    { kind: 'prestige', prestige: 1, gloryGained: 1000 },
    { kind: 'atlas-stamp', language: 'ja', stamped: 4, total: 89 },
  ];
  const guides = eventsV2.flatMap((event) => [
    vector(`guide « ${event.kind} » la première fois`, { law: 'guide-v2', event, seen: [] }),
    vector(`guide « ${event.kind} » déjà vu`, { law: 'guide-v2', event, seen: [event.kind] }),
  ]);

  const chooses = [
    { events: [eventsV2[8]!, eventsV2[7]!, { kind: 'first-level', level: 2, pointsToNext: 50 } as GuideEvent], seen: [] },
    { events: [eventsV2[1]!, eventsV2[8]!], seen: ['league-promoted'] },
    { events: [eventsV2[0]!], seen: ['league-first'] },
    { events: [{ kind: 'new-rank', rank: 'voix', division: 2, glory: 2200, gloryMissing: 634 } as GuideEvent, eventsV2[7]!], seen: [] },
    { events: [{ kind: 'flame-at-risk', days: 12 } as GuideEvent, { kind: 'level-100', canPrestige: true } as GuideEvent], seen: [] },
    { events: [], seen: [] },
  ].map((c, i) => vector(`choix d'une carte, cas ${i + 1}`, { law: 'guide-choose', ...c }));

  const photos = eventsV2.map((event) => vector(`moment photo de « ${event.kind} »`, { law: 'photo-moment', event }));

  const visitorKeys = [
    ['trophy.league-cup.2026-10-12.jade.gold', '2026-10'],
    ['trophy.league-cup.2026-09-28.quartz.bronze', '2026-10'],
    ['trophy.league-cup.2026-10.jade.gold', '2026-11'],
    ['trophy.season-cup.3', '2026-10'],
    ['trophy.prestige.2', '2026-10'],
    ['trophy.flame.365', '2026-10'],
    ['trophy.cometa.2026-10-12', '2026-10'],
    ['trophy.league-cup.2026-10-12.jade.gold', 'octobre'],
  ].map(([key, awardedMonth]) => vector(`clé visiteur de « ${key} » au mois ${awardedMonth}`, { law: 'trophy-visitor-key', key: key!, awardedMonth: awardedMonth! }));

  const monthParses = ['trophy.league-cup.2026-10.jade.gold', 'trophy.league-cup.2026-13.jade.gold', 'trophy.league-cup.2026-1.jade.gold'].map((key) =>
    vector(`lecture de la clé « ${key} »`, { law: 'trophy-parse', key }),
  );

  const visitorOwned: readonly TrophyRecord[] = [
    { key: 'trophy.league-cup.2026-10-05.jade.gold', awardedAt: '2026-10-12T00:05:00.000Z' },
    { key: 'trophy.league-cup.2026-10-19.jade.gold', awardedAt: '2026-10-26T00:05:00.000Z' },
    { key: 'trophy.league-cup.2026-10-12.jade.silver', awardedAt: '2026-10-19T00:05:00.000Z' },
    { key: 'trophy.league-cup.2026-09-28.ambre.bronze', awardedAt: '2026-10-05T00:05:00.000Z' },
    { key: 'trophy.flame.100', awardedAt: '2026-09-12T08:00:00.000Z' },
    { key: 'trophy.cometa.2026-10-12', awardedAt: '2026-10-12T08:00:00.000Z' },
  ];
  const visitorShowcases = [[], ['trophy.league-cup.2026-10-12.jade.silver', 'trophy.flame.100'], ['trophy.league-cup.2026-10-19.jade.gold', 'trophy.prestige.4']].map((order, i) =>
    vector(`vitrine d'un visiteur, cas ${i + 1}`, { law: 'showcase-visitor', owned: visitorOwned, order }),
  );

  return [
    ...weeks,
    ...weekPoints,
    ...accesses,
    ...pseudonyms,
    ...pseudonymDraws,
    ...pseudonymChecks,
    ...snapshots,
    ...groups,
    ...settles,
    ...friends,
    ...visibilities,
    ...duoDraws,
    ...duoProgresses,
    ...duoRewards,
    ...invites,
    ...transitions,
    ...calendars,
    ...seasonAts,
    ...progresses,
    ...rewards,
    ...claims,
    ...settlements,
    ...stars,
    ...seals,
    ...trophyKeys,
    ...trophyParses,
    ...trophyFlames,
    ...showcases,
    ...views,
    ...caps,
    ...months,
    ...atlases,
    ...atlasCodes,
    ...prestiges,
    ...rarities,
    ...rarityDisplays,
    ...mythics,
    ...badgeTiers,
    ...served,
    ...guides,
    ...chooses,
    ...photos,
    ...visitorKeys,
    ...monthParses,
    ...visitorShowcases,
  ];
}
