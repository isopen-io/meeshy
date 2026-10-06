import type { GameBlock } from '@meeshy/shared/types/game';
import { GLORY_POINTS } from '@meeshy/shared/utils/game/glory';
import type { GuideEventV2 } from '@meeshy/shared/utils/game/guide-v2';
import { leagueIndex, type LeagueKey } from '@meeshy/shared/utils/game/league';
import type { SeasonThemeKey } from '@meeshy/shared/utils/game/season';

import type { EngagementWithGame } from '@/lib/api/engagement';

/**
 * LES ÉVÉNEMENTS DU GUIDE, VAGUE 2 (#9481) — la loi partagée
 * (`chooseGuideMomentAny`) choisit LE moment ; ce fichier relève ses huit
 * événements dans l'état du jeu, comme `events.ts` le fait pour la vague 1 :
 *
 *  - `standingGuideEventsV2` lit l'ÉTAT à l'ouverture. Seules deux découvertes
 *    s'y lisent — la première ligue, le début d'une saison — et chacune ne se
 *    dit qu'UNE fois (tant que sa clé n'est pas vue) ;
 *  - `eventsBetween` compare deux INSTANTANÉS : ce qui vient d'ARRIVER (une
 *    montée, une descente, un trophée, un tampon, un Prestige) se dit chaque
 *    fois, version complète la première fois, courte ensuite — la loi en décide.
 *
 * L'INSTANTANÉ (`GuideSnapshot`) est la plus petite chose qui permet de comparer :
 * la ligue tenue et sa semaine, la saison, les clés de trophées, les langues
 * tamponnées, le Prestige. Il se garde sur l'appareil entre deux ouvertures
 * (`memory.ts`) : une montée de ligue arrive le dimanche soir, et c'est à
 * l'ouverture SUIVANTE qu'on la raconte.
 *
 * Rien n'est inventé. Une extension absente d'UNE des deux lectures (un ancien
 * serveur, ou un bloc qui vient d'apparaître) ne produit aucune transition : on
 * ne célèbre pas ce qu'on n'a pas vu changer. Le thème d'une saison est une clé
 * OUVERTE du serveur : elle passe telle quelle (la copie sait taire un thème
 * qu'elle ne sait pas nommer).
 */

const SEASON_STEPS = 40;

export type GuideSnapshot = {
  readonly prestige: number;
  /** `undefined` : l'extension n'était pas servie. `null` pour `current` : consentie ou non, pas placée. */
  readonly league?: { readonly weekKey: string; readonly current: { readonly league: LeagueKey; readonly rank: number; readonly pointsToPromotion: number | null } | null };
  /** `undefined` : pas servie ; `null` : aucune saison ouverte. */
  readonly season?: { readonly number: number; readonly themeKey: string; readonly steps: number; readonly completed: boolean } | null;
  readonly trophies?: readonly string[];
  readonly atlas?: { readonly total: number; readonly languages: readonly string[] };
};

export function snapshotOf(game: GameBlock): GuideSnapshot {
  const league = game.league;
  const season = game.season;
  return {
    prestige: game.level.prestige,
    ...(league === undefined
      ? {}
      : {
          league: {
            weekKey: league.weekKey,
            current: league.current === null ? null : { league: league.current.league, rank: league.current.rank, pointsToPromotion: league.current.pointsToPromotion },
          },
        }),
    ...(season === undefined
      ? {}
      : { season: season === null ? null : { number: season.number, themeKey: season.themeKey, steps: season.steps, completed: season.completed } }),
    ...(game.trophies === undefined ? {} : { trophies: game.trophies.items.map((item) => item.key) }),
    ...(game.atlas === undefined ? {} : { atlas: { total: game.atlas.total, languages: game.atlas.stamps.map((stamp) => stamp.language) } }),
  };
}

const seasonStart = (season: NonNullable<GuideSnapshot['season']>): GuideEventV2 => ({
  kind: 'season-start',
  season: season.number,
  themeKey: season.themeKey as SeasonThemeKey,
  steps: SEASON_STEPS,
});

const unseen = (seen: ReadonlySet<string>, event: GuideEventV2 | null): event is GuideEventV2 => event !== null && !seen.has(event.kind);

export function standingGuideEventsV2(game: GameBlock, seen: ReadonlySet<string>): GuideEventV2[] {
  const league = game.league;
  const first: GuideEventV2 | null =
    league !== undefined && league.access === 'open' && league.current !== null
      ? { kind: 'league-first', league: league.current.league, pointsToPromotion: league.current.pointsToPromotion }
      : null;
  const season = snapshotOf(game).season;
  return [first, season === null || season === undefined ? null : seasonStart(season)].filter((event): event is GuideEventV2 => unseen(seen, event));
}

/** Ce qui est arrivé entre deux instantanés. Une extension absente d'un des deux côtés ne produit rien. */
export function eventsBetween(before: GuideSnapshot, after: GuideSnapshot): GuideEventV2[] {
  const events: GuideEventV2[] = [];

  if (before.league !== undefined && after.league !== undefined) {
    const from = before.league.current;
    const to = after.league.current;
    if (from === null && to !== null) {
      events.push({ kind: 'league-first', league: to.league, pointsToPromotion: to.pointsToPromotion });
    } else if (from !== null && to !== null && after.league.weekKey !== before.league.weekKey) {
      if (leagueIndex(to.league) > leagueIndex(from.league)) {
        events.push({ kind: 'league-promoted', from: from.league, to: to.league, rank: from.rank, weekKey: before.league.weekKey });
      } else if (leagueIndex(to.league) < leagueIndex(from.league)) {
        events.push({ kind: 'league-relegated', from: from.league, to: to.league, pointsToPromotion: to.pointsToPromotion, weekKey: before.league.weekKey });
      }
    }
  }

  if (before.season !== undefined && after.season !== undefined) {
    const finished = before.season;
    if (finished !== null && (after.season === null || after.season.number !== finished.number)) {
      events.push({
        kind: 'season-end',
        season: finished.number,
        stepsReached: finished.steps,
        completed: finished.completed,
        gloryGained: finished.completed ? GLORY_POINTS.season : 0,
      });
    }
    if (after.season !== null && (before.season === null || before.season.number !== after.season.number)) events.push(seasonStart(after.season));
  }

  if (before.trophies !== undefined && after.trophies !== undefined) {
    const known = new Set(before.trophies);
    for (const key of after.trophies) if (!known.has(key)) events.push({ kind: 'trophy', trophyKey: key });
  }

  if (after.prestige > before.prestige) events.push({ kind: 'prestige', prestige: after.prestige, gloryGained: GLORY_POINTS.prestige });

  if (before.atlas !== undefined && after.atlas !== undefined) {
    const known = new Set(before.atlas.languages);
    for (const language of after.atlas.languages) {
      if (!known.has(language)) events.push({ kind: 'atlas-stamp', language, stamped: after.atlas.languages.length, total: after.atlas.total });
    }
  }

  return events;
}

export function transitionGuideEventsV2(previous: EngagementWithGame, next: EngagementWithGame): GuideEventV2[] {
  const before = previous.game;
  const after = next.game;
  return before === undefined || after === undefined ? [] : eventsBetween(snapshotOf(before), snapshotOf(after));
}
