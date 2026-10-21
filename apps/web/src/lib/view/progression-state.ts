import { LEAGUE_MIN_LEVEL } from '@meeshy/shared/utils/game/league';
import { sparksReading } from '@/lib/game/ladder';
import { SEASON_WEEKS } from '@meeshy/shared/utils/game/season';
import { SHOWCASE_DEFAULT_VISIBILITY } from '@meeshy/shared/utils/game/trophies';
import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { shownLevelOf } from '@/lib/game/ladder';
import { translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import {
  boundedPercent,
  daysLabel,
  formatCount,
  gameText,
  levelTopLine,
  pointsLabel,
  rankLabel,
  servedDivision,
  shownRank,
  standingLabel,
} from '@/lib/view/game-copy';
import { leagueName, visibilityLabel } from '@/lib/view/game-copy-v2';
import { levelHeldLine } from '@/lib/view/level-step-copy';

/**
 * LA PHRASE D'ÉTAT D'UN CONCEPT (#10540) — retour du porteur : « j'ai 77 099 points, il te manque
 * 1 839 points, points à convertir 5 823, niveau 27 ». Trois chiffres justes qui mesurent trois choses,
 * et l'écran ne disait pas lesquelles. Chaque valeur en cours est suivie d'UNE phrase qui dit l'étape où
 * l'on est et ce que le chiffre vise : le niveau suivant, la prochaine Meesh, le rang, la zone de montée.
 *
 * Pure : le bloc `game` et la progression d'avant sont lus tels que servis (le plancher du niveau, son
 * seuil, le prix, le manque viennent de la loi partagée, rejouée par le serveur), puis habillés par le
 * catalogue. Ce que le serveur ne sert pas n'a pas de phrase (`null`) : rien n'est inventé.
 *
 * CHAQUE PHRASE DIT LES FAITS QU'ELLE PORTE (#11178, épopée § 3.3) : `facts` nomme l'identité de chaque
 * chiffre qu'elle enchâsse. Une fiche dont la tête dit déjà l'un d'eux ne la rend pas : un fait ne paraît
 * qu'une fois par écran (`ficheView`, `progression-concepts.ts`).
 */

type Game = NonNullable<EngagementWithGame['game']>;

/** L'identité d'un fait rendu : la même, quel que soit son libellé (`progression-concepts.ts`). */
export type FactId = string;

export type ConceptState = { readonly text: string; readonly facts: readonly FactId[] };

const count = (value: number): string => formatCount(value);

const said = (text: string, ...facts: readonly FactId[]): ConceptState => ({ text, facts });

const sentences = (...parts: readonly ConceptState[]): ConceptState => ({
  text: parts.map((part) => part.text).join(' '),
  facts: [...new Set(parts.flatMap((part) => part.facts))],
});

function level(view: EngagementWithGame): ConceptState | null {
  const game = view.game;
  if (game === undefined) {
    const { level: current, value, nextThreshold } = view.level;
    if (nextThreshold === null) return said(gameText('game.level.top'), 'level_top');
    return said(gameText('game.state.level.simple', { level: count(current), left: pointsLabel(Math.max(0, nextThreshold - value)), next: count(current + 1) }), 'level', 'level_next');
  }
  const served = shownLevelOf(game.level);
  const step = game.level.ladder?.step ?? null;
  if (game.level.ladder?.held === true && step !== null) return said(levelHeldLine(step), 'level_step');
  if (served.nextThreshold === null) return said(levelTopLine(served), 'level', 'level_top');
  return said(gameText('game.state.level.progress', {
    level: count(served.level),
    done: pointsLabel(Math.max(0, served.score - served.floorScore)),
    span: count(served.nextThreshold - served.floorScore),
    left: count(served.pointsToNext),
    next: count(served.level + 1),
  }), 'level', 'level_progress', 'level_next');
}

function points(view: EngagementWithGame): ConceptState | null {
  const game = view.game;
  if (game === undefined) return null;
  const { mint } = game;
  // UNE seule poche, tout est dépensable (porteur, 2026-10-16) : plus de solde « à convertir ».
  const held = pointsLabel(sparksReading(game.level).pocket);
  const number = count(mint.number);
  const price = pointsLabel(mint.price);
  if (mint.canMint) return said(gameText('game.state.points.ready', { held, number, price }), 'sparks_pocket', 'mint_next', 'mint_price');
  return said(gameText('game.state.points.missing', { held, number, price, missing: pointsLabel(mint.missingPoints) }), 'sparks_pocket', 'mint_next', 'mint_price', 'mint_missing');
}

function meesh(view: EngagementWithGame): ConceptState | null {
  const game = view.game;
  if (game === undefined) return null;
  const { mint, treasury } = game;
  const balance = view.meesh?.balance ?? treasury.held;
  const minted = count(view.meesh?.mintedLifetime ?? Math.max(0, mint.number - 1));
  const kept =
    balance === 0
      ? said(gameText('game.state.meesh.kept_none', { minted }), 'meesh_held', 'minted')
      : said(gameText('game.state.meesh.kept', { balance: translateGamePlural(currentInterfaceLanguage(), 'game.meeshes', balance), minted }), 'meesh_held', 'minted');
  const number = count(mint.number);
  const price = pointsLabel(mint.price);
  const next = mint.canMint
    ? said(gameText('game.state.meesh.next_ready', { number, price }), 'mint_next', 'mint_price')
    : said(gameText('game.state.meesh.next_missing', { number, price, missing: pointsLabel(mint.missingPoints) }), 'mint_next', 'mint_price', 'mint_missing');
  return sentences(kept, next);
}

function glory(view: EngagementWithGame): ConceptState | null {
  const served = view.game?.glory;
  if (served === undefined) return null;
  const rank = standingLabel(shownRank(served));
  const held = count(served.glory);
  if (served.next === null) return said(gameText('game.state.glory.top', { rank, glory: held }), 'rank', 'glory');
  return said(gameText('game.state.glory.next', {
    rank,
    glory: held,
    missing: count(served.gloryMissing ?? Math.max(0, served.next.minGlory - served.glory)),
    next: rankLabel(served.next.rank, servedDivision(served.next)),
  }), 'rank', 'glory', 'glory_missing', 'rank_next');
}

function flame(view: EngagementWithGame): ConceptState | null {
  const served = view.game?.flame;
  if (served === undefined) {
    const { currentDays, longestDays } = view.streak;
    if (currentDays === 0) return said(gameText('game.state.flame.none'));
    return said(gameText('game.state.flame.streak', { days: daysLabel(currentDays), record: daysLabel(longestDays) }), 'streak', 'streak_record');
  }
  const days = daysLabel(served.days);
  switch (served.status) {
    case 'none':
      return said(gameText('game.state.flame.none'));
    case 'out':
      return said(gameText('game.state.flame.out'), 'flame_state');
    case 'at-risk':
      return said(gameText('game.state.flame.at_risk', { days }), 'streak', 'flame_state');
    case 'covered':
      return said(gameText('game.state.flame.covered', { days }), 'streak', 'flame_state');
    case 'lit':
      return said(
        gameText('game.state.flame.lit', {
          days,
          bonus: count(boundedPercent(served.bonusPercent)),
          freezes: gameText('game.fmt.fraction', { done: count(served.freezes), total: count(served.maxFreezes) }),
        }),
        'streak',
        'flame_form',
        'freezes',
      );
  }
}

function missions(view: EngagementWithGame): ConceptState | null {
  const game = view.game;
  if (game === undefined) return null;
  const { missions: served, chest } = game;
  if (!served.unlocked) return said(gameText('game.missions.locked', { level: count(shownLevelOf(game.level).level) }), 'missions_unlock_level', 'level');
  const total = served.items.length;
  const done = served.items.filter((item) => item.completedAt !== null).length;
  const progress = { done: count(done), total: count(total) };
  if (chest.status === 'claimed') return said(gameText('game.state.missions.claimed', progress), 'missions_done', 'chest');
  if (chest.status === 'ready') return said(gameText('game.state.missions.ready', progress), 'missions_done', 'chest');
  return said(gameText('game.state.missions.progress', { ...progress, left: count(Math.max(0, total - done)) }), 'missions_done');
}

type League = NonNullable<Game['league']>;
type LeaguePlace = NonNullable<League['current']>;

function leagueZone(current: LeaguePlace): ConceptState | null {
  if (current.zone === 'promotion') return said(gameText('game.state.league.zone.promotion'), 'league_zone');
  const missing = current.pointsToPromotion;
  if (missing === null || missing === 0) return null;
  return said(gameText(`game.state.league.zone.${current.zone}`, { missing: pointsLabel(missing) }), 'league_zone', 'league_missing');
}

function league(view: EngagementWithGame): ConceptState | null {
  const game = view.game;
  const served = game?.league;
  if (game === undefined || served === undefined) return null;
  if (served.access === 'locked') {
    return said(gameText('game.league.locked', { level: count(LEAGUE_MIN_LEVEL), current: count(shownLevelOf(game.level).level) }), 'league_unlock_level', 'level');
  }
  const current = served.current;
  if (served.access !== 'open' || current === null) return said(gameText('game.state.league.unplaced'), 'league');
  const place = said(gameText('game.state.league.place', {
    league: leagueName(current.league),
    rank: count(current.rank),
    size: count(current.groupSize),
    points: pointsLabel(current.weekPoints),
  }), 'league', 'league_place', 'week_points');
  const zone = leagueZone(current);
  return zone === null ? place : sentences(place, zone);
}

function season(view: EngagementWithGame): ConceptState | null {
  const game = view.game;
  if (game === undefined) return null;
  const served = game.season;
  if (served === undefined || served === null) return said(gameText('game.season.none'), 'season');
  const where = { number: count(served.number), week: count(served.week), weeks: count(SEASON_WEEKS), total: count(served.stepsTotal) };
  if (served.steps >= served.stepsTotal) return said(gameText('game.state.season.done', where), 'season', 'season_week', 'season_steps');
  return said(gameText('game.state.season.progress', {
    ...where,
    steps: count(served.steps),
    stars: translateGamePlural(currentInterfaceLanguage(), 'game.season.stars', served.starsToNext),
  }), 'season', 'season_week', 'season_steps', 'season_next');
}

function prestige(view: EngagementWithGame): ConceptState | null {
  const game = view.game;
  const served = game?.prestige;
  if (game === undefined || served === undefined) return null;
  if (served.canPrestige) return said(gameText('game.prestige.mee'), 'prestige_door', 'level');
  if (served.stars >= served.max) return said(gameText('game.prestige.max'), 'prestige_door');
  return said(gameText('game.prestige.locked', { level: count(shownLevelOf(game.level).level) }), 'prestige_door', 'level');
}

function elans(view: EngagementWithGame): ConceptState | null {
  const elan = view.elan;
  if (elan === undefined) return null;
  const families = translateGamePlural(currentInterfaceLanguage(), 'game.concept.elans.families', elan.activeFamilyCount);
  return elan.isAccelerated
    ? said(gameText('game.state.elans.active', { factor: count(elan.factor), families }), 'factor', 'elan_families')
    : said(gameText('game.state.elans.idle', { families }), 'elan_families');
}

type CountedConcept = 'badges' | 'defis' | 'succes';

function counted(concept: CountedConcept, done: number, total: number): ConceptState | null {
  if (total <= 0) return null;
  const progress = { done: count(done), total: count(total) };
  return done >= total
    ? said(gameText('game.state.count.complete', progress), `${concept}_earned`)
    : said(gameText(`game.state.count.${concept}`, { ...progress, left: count(total - done) }), `${concept}_earned`, `${concept}_left`);
}

const badges = (view: EngagementWithGame): ConceptState | null => counted('badges', view.badgesEarned, view.badgesTotal);

function defis(view: EngagementWithGame): ConceptState | null {
  const sections = view.achievementSections ?? [];
  return counted(
    'defis',
    sections.reduce((sum, section) => sum + section.unlockedCount, 0),
    sections.reduce((sum, section) => sum + section.attainableCount, 0),
  );
}

const succes = (view: EngagementWithGame): ConceptState | null =>
  counted('succes', view.achievements.filter((achievement) => achievement.unlocked).length, view.achievements.length);

function showcase(view: EngagementWithGame): ConceptState | null {
  const game = view.game;
  const trophies = game?.trophies;
  if (game === undefined || trophies === undefined) return null;
  if (trophies.items.length === 0) return said(gameText('game.showcase.empty'), 'trophies');
  return said(
    gameText('game.state.showcase.count', {
      trophies: translateGamePlural(currentInterfaceLanguage(), 'game.door.showcase.count', trophies.items.length),
      who: visibilityLabel(game.visibility?.showcase ?? SHOWCASE_DEFAULT_VISIBILITY),
    }),
    'trophies',
    'showcase_visibility',
  );
}

function atlas(view: EngagementWithGame): ConceptState | null {
  const served = view.game?.atlas;
  if (served === undefined) return null;
  if (served.stamped === 0 && served.pending.length === 0) return said(gameText('game.atlas.empty'), 'atlas_stamps');
  return said(gameText('game.state.atlas.progress', { stamped: count(served.stamped), total: count(served.total), pending: count(served.pending.length) }), 'atlas_stamps', 'atlas_pending');
}

const STATES: Readonly<Record<ProgressionConcept, (view: EngagementWithGame) => ConceptState | null>> = {
  level,
  points,
  meesh,
  glory,
  flame,
  missions,
  league,
  season,
  prestige,
  elans,
  badges,
  defis,
  succes,
  showcase,
  atlas,
};

/** La phrase d'état et les faits qu'elle porte. */
export const conceptStateOf = (concept: ProgressionConcept, view: EngagementWithGame): ConceptState | null => STATES[concept](view);

/** La phrase d'état seule. */
export const conceptState = (concept: ProgressionConcept, view: EngagementWithGame): string | null => conceptStateOf(concept, view)?.text ?? null;
