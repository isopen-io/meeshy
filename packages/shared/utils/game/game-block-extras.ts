/**
 * L'ASSEMBLEUR DES SEPT EXTENSIONS DU BLOC `game` (#9384 à #9392) — la partie
 * DÉRIVÉE de la vague 2, écrite une fois, comme `buildGameBlock` l'a fait pour
 * la vague 1.
 *
 * La passerelle sait ce qu'elle PERSISTE (consentement, pseudonyme, groupe de la
 * semaine et points des membres, duo, étoiles et étapes réclamées, trophées et
 * leur ordre, état de l'Atlas, réglages de visibilité) ; ligue, accès, semaine,
 * saison, étape, zone, points manquants, prochaine récompense se DÉDUISENT par
 * les lois de ce dossier. Elle passe ses faits ici plutôt que de recomposer :
 * c'est la recomposition par site qui fait diverger les clients.
 *
 * Pur : le jour local et la minute locale sont des PARAMÈTRES.
 */

import { atlasSummary, type AtlasState } from './atlas.js';
import { canPrestige, GAME_PRESTIGE_MAX, levelForUnlocks } from './levels.js';
import { DUO_MIN_LEVEL, duoProgress, duoReward, type DuoMission, type DuoStatus } from './duo.js';
import { GLORY_POINTS } from './glory.js';
import {
  LEAGUE_MIN_LEVEL,
  friendsLeagueRanking,
  leagueAccess,
  leaguePointsToPromotion,
  leagueStandings,
  leagueWeekClose,
  leagueWeekOfMoment,
  type LeagueKey,
  type LeagueMemberPoints,
} from './league.js';
import { SEASON_SEAL_PRICE, SEASON_STEP_POINTS, SEASON_STEPS, seasonProgress, seasonStepReward } from './season.js';
import {
  DEFAULT_SEASON_SCHEDULE,
  scheduledSeasonCalendar,
  scheduledSeasonOfMoment,
  scheduledSeasonWeek,
  scheduledUpcomingSeason,
  seasonDefinitionOf,
  type SeasonSchedule,
} from './season-schedule.js';
import { orderShowcase, type ShowcaseVisibility, type TrophyRecord } from './trophies.js';
import type {
  GameAchievementRarities,
  GameAtlasBlock,
  GameDuoBlock,
  GameLeagueBlock,
  GamePrestigeBlock,
  GameSeasonBlock,
  GameTrophiesBlock,
  GameUpcomingSeasonBlock,
  GameVisibility,
} from '../../types/game-v2.js';
import type { GamePhotoBlock } from '../../types/game-photo.js';

export type GameBlockExtrasFacts = {
  readonly userId: string;
  /** Le jour LOCAL (`AAAA-MM-JJ`) et la minute locale — la semaine de ligue et la saison s'en déduisent. */
  readonly today: string;
  readonly minuteOfDay: number;
  /** Le score en poche, le niveau record et les étoiles de Prestige. */
  /** Avec les étincelles, la POCHE — la base du niveau (#10892, `levelSparksOf`). */
  readonly score: number;
  readonly levelRecord: number | null;
  /** Le niveau max à vie (#10846), qui survit au prestige : il ouvre les ligues et le duo. Absent : le record du cycle. */
  readonly levelMaxLifetime?: number | null;
  readonly prestige: number;
  readonly flameDays: number;
  readonly balance: number;
  /** Majorité VÉRIFIÉE (`isAdult`) : sans elle, la ligue publique reste fermée. */
  readonly adultVerified: boolean;
  readonly league: {
    readonly consented: boolean;
    readonly pseudonym: string | null;
    /** Le groupe de la semaine, `null` tant que le joueur n'y est pas placé. */
    readonly group: {
      readonly league: LeagueKey;
      readonly groupId: string;
      readonly members: readonly LeagueMemberPoints[];
    } | null;
    readonly friendIds: readonly string[];
    /** Les points de la semaine du joueur ET de ses amis acceptés. */
    readonly friendsWeekPoints: Readonly<Record<string, number>>;
  };
  readonly duo: {
    readonly duoId: string;
    readonly status: DuoStatus;
    readonly role: 'inviter' | 'invitee';
    readonly partner: { readonly userId: string; readonly displayName: string };
    readonly mission: DuoMission | null;
    readonly mine: number;
    readonly partnerProgress: number;
  } | null;
  readonly season: {
    readonly stars: number;
    readonly claimedSteps: readonly number[];
    readonly sealOwned: boolean;
  };
  /** Le calendrier des saisons SERVI (#10016) ; absent, la constante de `season.ts`. */
  readonly schedule?: SeasonSchedule;
  readonly trophies: readonly TrophyRecord[];
  readonly showcaseOrder: readonly string[];
  readonly atlas: AtlasState;
  readonly visibility: {
    readonly showcase: ShowcaseVisibility;
    readonly rank: ShowcaseVisibility;
    readonly treasury: ShowcaseVisibility;
    readonly atlas: ShowcaseVisibility;
  };
};

export type GameBlockExtras = {
  readonly league: GameLeagueBlock;
  readonly duo: GameDuoBlock;
  readonly season: GameSeasonBlock | null;
  /** La saison à venir, servie tant qu'aucune n'est ouverte (#10014) ; `null` dès qu'une saison court. */
  readonly seasonUpcoming: GameUpcomingSeasonBlock | null;
  readonly trophies: GameTrophiesBlock;
  readonly atlas: GameAtlasBlock;
  readonly prestige: GamePrestigeBlock;
  readonly visibility: GameVisibility;
  /**
   * La rareté mesurée des succès AFFICHABLES (#9489) : un instantané GLOBAL, pas un fait du compte —
   * la passerelle le pose à côté, `buildGameBlockExtras` ne le calcule pas. Absent quand aucun succès
   * n'atteint le seuil d'affichage.
   */
  readonly achievementRarities?: GameAchievementRarities;
  /** Les réglages et le registre des moments photo (#10162) : des faits du compte que la passerelle pose à côté. */
  readonly photo?: GamePhotoBlock;
};

/** Les étapes faites ne se défont pas : le plus haut des deux records les prouve (#9706, #10846). */
const stepProof = (facts: Pick<GameBlockExtrasFacts, 'levelRecord' | 'levelMaxLifetime'>): number | null =>
  Math.max(facts.levelRecord ?? 0, facts.levelMaxLifetime ?? 0) || null;

/** Le niveau qui OUVRE les accès : le plus haut du niveau lu, du record du cycle et du max à vie. */
const recordOf = (facts: GameBlockExtrasFacts): number =>
  Math.max(facts.levelRecord ?? 1, facts.levelMaxLifetime ?? 1, levelForUnlocks({ score: facts.score, levelRecord: stepProof(facts) }));

function leagueBlock(facts: GameBlockExtrasFacts, record: number): GameLeagueBlock {
  const moment = { dayKey: facts.today, minuteOfDay: facts.minuteOfDay };
  const weekKey = leagueWeekOfMoment(moment);
  const access = leagueAccess({ levelRecord: record, adultVerified: facts.adultVerified, consented: facts.league.consented });

  const group = access.status === 'open' ? facts.league.group : null;
  const standings = group === null ? [] : leagueStandings(group);
  const mine = standings.find((s) => s.userId === facts.userId);

  const ranking = friendsLeagueRanking({
    weekKey,
    viewerId: facts.userId,
    friendIds: facts.league.friendIds,
    weekPoints: facts.league.friendsWeekPoints,
  });
  const me = ranking.find((e) => e.isMe);

  return {
    unlocked: record >= LEAGUE_MIN_LEVEL,
    access: access.status,
    pseudonym: access.status === 'open' ? facts.league.pseudonym : null,
    weekKey,
    closes: leagueWeekClose(weekKey),
    current:
      group === null || mine === undefined
        ? null
        : {
            league: group.league,
            groupId: group.groupId,
            groupSize: standings.length,
            rank: mine.rank,
            weekPoints: mine.weekPoints,
            zone: mine.zone,
            cup: mine.cup,
            pointsToPromotion: leaguePointsToPromotion({ league: group.league, standings, userId: facts.userId }),
          },
    friends: { rank: me?.rank ?? 1, size: ranking.length, weekPoints: me?.weekPoints ?? 0 },
  };
}

function duoBlock(facts: GameBlockExtrasFacts, record: number): GameDuoBlock {
  const weekKey = leagueWeekOfMoment({ dayKey: facts.today, minuteOfDay: facts.minuteOfDay });
  const duo = facts.duo;
  const unlocked = record >= DUO_MIN_LEVEL;
  if (duo === null) {
    return { unlocked, status: 'none', duoId: null, weekKey, role: null, partner: null, mission: null, progress: null, reward: null };
  }
  const mission = duo.mission;
  const progress =
    mission === null ? null : duoProgress({ partTarget: mission.partTarget, mine: duo.mine, partner: duo.partnerProgress });
  return {
    unlocked,
    status: duo.status,
    duoId: duo.duoId,
    weekKey,
    role: duo.role,
    partner: duo.partner,
    mission:
      mission === null
        ? null
        : {
            templateKey: mission.templateKey,
            signal: mission.signal,
            prism: mission.prism,
            partTarget: mission.partTarget,
            commonTarget: mission.commonTarget,
          },
    progress,
    reward:
      progress === null
        ? null
        : duoReward({ level: levelForUnlocks({ score: facts.score, levelRecord: stepProof(facts) }), flameDays: facts.flameDays, mineDone: progress.mineDone, partnerDone: progress.partnerDone }),
  };
}

function seasonBlock(facts: GameBlockExtrasFacts): GameSeasonBlock | null {
  const schedule = facts.schedule ?? DEFAULT_SEASON_SCHEDULE;
  const number = scheduledSeasonOfMoment(schedule, { dayKey: facts.today, minuteOfDay: facts.minuteOfDay });
  if (number === null) return null;
  const calendar = scheduledSeasonCalendar(schedule, number);
  const week = scheduledSeasonWeek(schedule, leagueWeekOfMoment({ dayKey: facts.today, minuteOfDay: facts.minuteOfDay }));
  if (calendar === null || week === null) return null;

  const progress = seasonProgress({ stars: facts.season.stars });
  const claimed = [...new Set(facts.season.claimedSteps)].filter((s) => s >= 1 && s <= SEASON_STEPS).sort((a, b) => a - b);
  const nextStep = Array.from({ length: progress.steps }, (_, i) => i + 1).find((step) => !claimed.includes(step));
  const stepPoints = seasonDefinitionOf(schedule, number)?.stepPoints;
  const nextReward = nextStep === undefined ? null : seasonStepReward(nextStep, stepPoints);

  return {
    number,
    themeKey: calendar.themeKey,
    startDay: calendar.startDay,
    endDay: calendar.endDay,
    week,
    stars: progress.stars,
    steps: progress.steps,
    stepsTotal: SEASON_STEPS,
    starsToNext: progress.starsToNext,
    progress: progress.progress,
    completed: progress.completed,
    claimedSteps: claimed,
    nextReward: nextStep === undefined || nextReward === null ? null : { step: nextStep, reward: nextReward },
    sealOwned: facts.season.sealOwned,
    sealPrice: SEASON_SEAL_PRICE,
    stepPoints: stepPoints ?? SEASON_STEP_POINTS,
  };
}

/**
 * Avant l'ouverture de la saison 1 (lundi 2026-12-21, #10014), `season` est `null` :
 * ce bloc dit laquelle vient, quand, et sur quel thème — une donnée de calendrier,
 * la même pour tous, qui ne lit aucun fait du joueur ni d'autrui.
 */
function upcomingSeasonBlock(facts: GameBlockExtrasFacts): GameUpcomingSeasonBlock | null {
  const upcoming = scheduledUpcomingSeason(facts.schedule ?? DEFAULT_SEASON_SCHEDULE, { dayKey: facts.today, minuteOfDay: facts.minuteOfDay });
  return upcoming === null
    ? null
    : { number: upcoming.number, themeKey: upcoming.themeKey, startDay: upcoming.startDay, endDay: upcoming.endDay };
}

export function buildGameBlockExtras(facts: GameBlockExtrasFacts): GameBlockExtras {
  const record = recordOf(facts);
  const summary = atlasSummary(facts.atlas);
  return {
    league: leagueBlock(facts, record),
    duo: duoBlock(facts, record),
    season: seasonBlock(facts),
    seasonUpcoming: upcomingSeasonBlock(facts),
    trophies: {
      items: facts.trophies.map((t) => ({ key: t.key, awardedAt: t.awardedAt })),
      order: [...orderShowcase({ owned: facts.trophies, order: facts.showcaseOrder })],
    },
    atlas: { stamped: summary.stamped, total: summary.total, stamps: [...summary.stamps], pending: [...summary.pending] },
    prestige: {
      stars: Math.min(GAME_PRESTIGE_MAX, Math.max(0, Math.trunc(facts.prestige))),
      max: GAME_PRESTIGE_MAX,
      canPrestige: canPrestige({ level: levelForUnlocks({ score: facts.score, levelRecord: stepProof(facts) }), prestige: facts.prestige }),
      gloryOnPass: GLORY_POINTS.prestige,
    },
    visibility: { ...facts.visibility },
  };
}
