import { LEAGUE_MIN_LEVEL } from '@meeshy/shared/utils/game/league';
import { SEASON_WEEKS } from '@meeshy/shared/utils/game/season';
import { SHOWCASE_DEFAULT_VISIBILITY } from '@meeshy/shared/utils/game/trophies';
import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { shownLevelOf } from '@/lib/game/ladder';
import { translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import {
  boundedPercent,
  convertiblePointsLabel,
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
 * LES DEUX SOLDES DE POINTS ont deux noms stables : les points EN POCHE (`level.score`), qui font le
 * niveau, et les points À CONVERTIR (`meesh.debitablePoints`), seuls à payer une Meesh. La phrase les
 * dit tous les deux ; elle ne promet pas qu'ils soient proches.
 */

type Game = NonNullable<EngagementWithGame['game']>;

const count = (value: number): string => formatCount(value);

const sentences = (...parts: readonly string[]): string => parts.join(' ');

function level(view: EngagementWithGame): string | null {
  const game = view.game;
  if (game === undefined) {
    const { level: current, value, nextThreshold } = view.level;
    if (nextThreshold === null) return gameText('game.level.top');
    return gameText('game.state.level.simple', { level: count(current), left: pointsLabel(Math.max(0, nextThreshold - value)), next: count(current + 1) });
  }
  const served = shownLevelOf(game.level);
  const step = game.level.ladder?.step ?? null;
  if (game.level.ladder?.held === true && step !== null) return levelHeldLine(step);
  if (served.nextThreshold === null) return levelTopLine(served);
  return gameText('game.state.level.progress', {
    level: count(served.level),
    done: pointsLabel(Math.max(0, served.score - served.floorScore)),
    span: count(served.nextThreshold - served.floorScore),
    left: count(served.pointsToNext),
    next: count(served.level + 1),
  });
}

/**
 * Le solde à convertir : celui du porte-monnaie servi ; sans lui, une frappe impossible le DIT (le prix
 * moins le manque) ; possible, il reste inconnu — jamais déduit du score.
 */
export const convertiblePointsOf = (view: EngagementWithGame): number | null => {
  const served = view.meesh?.debitablePoints;
  if (served !== undefined) return served;
  const mint = view.game?.mint;
  return mint === undefined || mint.canMint ? null : Math.max(0, mint.price - mint.missingPoints);
};

function points(view: EngagementWithGame): string | null {
  const game = view.game;
  if (game === undefined) return null;
  const { mint } = game;
  const convertible = convertiblePointsOf(view);
  const held = pointsLabel(game.level.score);
  const number = count(mint.number);
  const price = pointsLabel(mint.price);
  if (convertible === null) return gameText('game.state.points.ready_plain', { held, number, price });
  if (mint.canMint) return gameText('game.state.points.ready', { held, convertible: convertiblePointsLabel(convertible), number, price });
  return gameText('game.state.points.missing', {
    held,
    convertible: convertiblePointsLabel(convertible),
    number,
    price,
    missing: convertiblePointsLabel(mint.missingPoints),
  });
}

function meesh(view: EngagementWithGame): string | null {
  const game = view.game;
  if (game === undefined) return null;
  const { mint, treasury } = game;
  const balance = view.meesh?.balance ?? treasury.held;
  const minted = count(view.meesh?.mintedLifetime ?? Math.max(0, mint.number - 1));
  const kept =
    balance === 0
      ? gameText('game.state.meesh.kept_none', { minted })
      : gameText('game.state.meesh.kept', { balance: translateGamePlural(currentInterfaceLanguage(), 'game.meeshes', balance), minted });
  const number = count(mint.number);
  const price = pointsLabel(mint.price);
  const next = mint.canMint
    ? gameText('game.state.meesh.next_ready', { number, price })
    : gameText('game.state.meesh.next_missing', { number, price, missing: convertiblePointsLabel(mint.missingPoints) });
  return sentences(kept, next);
}

function glory(view: EngagementWithGame): string | null {
  const served = view.game?.glory;
  if (served === undefined) return null;
  const rank = standingLabel(shownRank(served));
  const held = count(served.glory);
  if (served.next === null) return gameText('game.state.glory.top', { rank, glory: held });
  return gameText('game.state.glory.next', {
    rank,
    glory: held,
    missing: count(served.gloryMissing ?? Math.max(0, served.next.minGlory - served.glory)),
    next: rankLabel(served.next.rank, servedDivision(served.next)),
  });
}

function flame(view: EngagementWithGame): string | null {
  const served = view.game?.flame;
  if (served === undefined) {
    const { currentDays, longestDays } = view.streak;
    if (currentDays === 0) return gameText('game.state.flame.none');
    return gameText('game.state.flame.streak', { days: daysLabel(currentDays), record: daysLabel(longestDays) });
  }
  const days = daysLabel(served.days);
  switch (served.status) {
    case 'none':
      return gameText('game.state.flame.none');
    case 'out':
      return gameText('game.state.flame.out');
    case 'at-risk':
      return gameText('game.state.flame.at_risk', { days });
    case 'covered':
      return gameText('game.state.flame.covered', { days });
    case 'lit':
      return gameText('game.state.flame.lit', {
        days,
        bonus: count(boundedPercent(served.bonusPercent)),
        freezes: gameText('game.fmt.fraction', { done: count(served.freezes), total: count(served.maxFreezes) }),
      });
  }
}

function missions(view: EngagementWithGame): string | null {
  const game = view.game;
  if (game === undefined) return null;
  const { missions: served, chest } = game;
  if (!served.unlocked) return gameText('game.missions.locked', { level: count(shownLevelOf(game.level).level) });
  const total = served.items.length;
  const done = served.items.filter((item) => item.completedAt !== null).length;
  const progress = { done: count(done), total: count(total) };
  if (chest.status === 'claimed') return gameText('game.state.missions.claimed', progress);
  if (chest.status === 'ready') return gameText('game.state.missions.ready', progress);
  return gameText('game.state.missions.progress', { ...progress, left: count(Math.max(0, total - done)) });
}

type League = NonNullable<Game['league']>;
type LeaguePlace = NonNullable<League['current']>;

function leagueZone(current: LeaguePlace): string | null {
  if (current.zone === 'promotion') return gameText('game.state.league.zone.promotion');
  const missing = current.pointsToPromotion;
  if (missing === null || missing === 0) return null;
  return gameText(`game.state.league.zone.${current.zone}`, { missing: pointsLabel(missing) });
}

function league(view: EngagementWithGame): string | null {
  const game = view.game;
  const served = game?.league;
  if (game === undefined || served === undefined) return null;
  if (served.access === 'locked') {
    return gameText('game.league.locked', { level: count(LEAGUE_MIN_LEVEL), current: count(shownLevelOf(game.level).level) });
  }
  const current = served.current;
  if (served.access !== 'open' || current === null) return gameText('game.state.league.unplaced');
  const place = gameText('game.state.league.place', {
    league: leagueName(current.league),
    rank: count(current.rank),
    size: count(current.groupSize),
    points: pointsLabel(current.weekPoints),
  });
  const zone = leagueZone(current);
  return zone === null ? place : sentences(place, zone);
}

function season(view: EngagementWithGame): string | null {
  const game = view.game;
  if (game === undefined) return null;
  const served = game.season;
  if (served === undefined || served === null) return gameText('game.season.none');
  const where = { number: count(served.number), week: count(served.week), weeks: count(SEASON_WEEKS), total: count(served.stepsTotal) };
  if (served.steps >= served.stepsTotal) return gameText('game.state.season.done', where);
  return gameText('game.state.season.progress', {
    ...where,
    steps: count(served.steps),
    stars: translateGamePlural(currentInterfaceLanguage(), 'game.season.stars', served.starsToNext),
  });
}

function prestige(view: EngagementWithGame): string | null {
  const game = view.game;
  const served = game?.prestige;
  if (game === undefined || served === undefined) return null;
  if (served.canPrestige) return gameText('game.prestige.mee');
  if (served.stars >= served.max) return gameText('game.prestige.max');
  return gameText('game.prestige.locked', { level: count(shownLevelOf(game.level).level) });
}

function elans(view: EngagementWithGame): string | null {
  const elan = view.elan;
  if (elan === undefined) return null;
  const families = translateGamePlural(currentInterfaceLanguage(), 'game.concept.elans.families', elan.activeFamilyCount);
  return elan.isAccelerated ? gameText('game.state.elans.active', { factor: count(elan.factor), families }) : gameText('game.state.elans.idle', { families });
}

type CountedKey = 'game.state.count.badges' | 'game.state.count.defis' | 'game.state.count.succes';

function counted(key: CountedKey, done: number, total: number): string | null {
  if (total <= 0) return null;
  const progress = { done: count(done), total: count(total) };
  return done >= total ? gameText('game.state.count.complete', progress) : gameText(key, { ...progress, left: count(total - done) });
}

const badges = (view: EngagementWithGame): string | null => counted('game.state.count.badges', view.badgesEarned, view.badgesTotal);

function defis(view: EngagementWithGame): string | null {
  const sections = view.achievementSections ?? [];
  return counted(
    'game.state.count.defis',
    sections.reduce((sum, section) => sum + section.unlockedCount, 0),
    sections.reduce((sum, section) => sum + section.attainableCount, 0),
  );
}

const succes = (view: EngagementWithGame): string | null =>
  counted('game.state.count.succes', view.achievements.filter((achievement) => achievement.unlocked).length, view.achievements.length);

function showcase(view: EngagementWithGame): string | null {
  const game = view.game;
  const trophies = game?.trophies;
  if (game === undefined || trophies === undefined) return null;
  if (trophies.items.length === 0) return gameText('game.showcase.empty');
  return gameText('game.state.showcase.count', {
    trophies: translateGamePlural(currentInterfaceLanguage(), 'game.door.showcase.count', trophies.items.length),
    who: visibilityLabel(game.visibility?.showcase ?? SHOWCASE_DEFAULT_VISIBILITY),
  });
}

function atlas(view: EngagementWithGame): string | null {
  const served = view.game?.atlas;
  if (served === undefined) return null;
  if (served.stamped === 0 && served.pending.length === 0) return gameText('game.atlas.empty');
  return gameText('game.state.atlas.progress', { stamped: count(served.stamped), total: count(served.total), pending: count(served.pending.length) });
}

const STATES: Readonly<Record<ProgressionConcept, (view: EngagementWithGame) => string | null>> = {
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

export const conceptState = (concept: ProgressionConcept, view: EngagementWithGame): string | null => STATES[concept](view);
