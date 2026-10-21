import { LEAGUE_MIN_LEVEL } from '@meeshy/shared/utils/game/league';
import { sparksReading } from '@/lib/game/ladder';
import { MISSIONS_MIN_LEVEL } from '@meeshy/shared/utils/game/missions';
import { SHOWCASE_DEFAULT_VISIBILITY } from '@meeshy/shared/utils/game/trophies';
import { progressionConcepts, type ProgressionConcept } from '@meeshy/shared/utils/progression-layout';
import type { EngagementAxisFamily } from '@meeshy/shared/types/engagement';
import type { TreasuryTierKey } from '@meeshy/shared/utils/game/treasury';

import type { EngagementWithGame } from '@/lib/api/engagement';
import type { GameDetailFact, GameDetailFamily } from '@/lib/game/detail-families';
import { shownLevelOf } from '@/lib/game/ladder';
import { personalMissionClock } from '@/lib/game/personal-mission-clock';
import { SUBPAGE_CONCEPT, subpageOf } from '@/lib/game/progression-nav';
import { translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import {
  daysLabel,
  editionName,
  familyName,
  flameFormName,
  formatCount,
  gameText,
  bannerTopLine,
  levelTierName,
  meeshCount,
  pointsLabel,
  rankLabel,
  standingLabel,
  treasuryName,
  servedDivision,
  shownRank,
  sparksCumulLine,
} from '@/lib/view/game-copy';
import { leagueName, remainingLabel, timerLabel, visibilityLabel, zoneLabel } from '@/lib/view/game-copy-v2';
import { conceptStateOf, type ConceptState, type FactId } from '@/lib/view/progression-state';

/**
 * CE QUE CHAQUE CONCEPT DE « PROGRESSION » DIT (#9563) — écrit UNE fois, lu par
 * deux écrans : la carte de la première page (tête, données importantes, à quoi
 * ça sert, comment ça marche) et la fiche du concept (toutes ses données). Deux
 * écrans qui recomposeraient chacun « 2 / 3 » finiraient par ne plus dire le
 * même nombre.
 *
 * UN FAIT NE PARAÎT QU'UNE FOIS PAR ÉCRAN (#11178, épopée § 3.3 ; avant lui, amendement n° 4 de #9563) : chaque
 * donnée porte l'IDENTITÉ du fait qu'elle dit (`FactId`), et le dédoublonnage compare des identités, jamais des
 * chaînes — un même fait habillé en pastille, en phrase ou sous un autre nom reste le même fait :
 *
 *   1. UNE DONNÉE APPARTIENT À UN SEUL CONCEPT : ta lumière aux Étincelles, le prix et le manque de la prochaine
 *      Meesh à l'Héritage (la fiche des Étincelles y mène), tout multiplicateur aux Élans, les étoiles à la
 *      Renaissance. Devant un ancien serveur sans Étincelles, le score reste au Niveau.
 *   2. LA CARTE DIT UN NOM EN PETIT, UNE VALEUR EN GRAND, UNE LIGNE EN PETIT, et la ligne ne redit jamais la valeur.
 *   3. LA FICHE NE REDIT RIEN : « Où j'en suis » ne garde que les faits que la tête (ou la pièce de jeu qui la
 *      remplace) ne montre pas, et sa phrase disparaît dès qu'elle en enchâsse un (`ficheView`).
 *
 * ET CE QUI DEMANDE UNE ACTION PREND LA LIGNE (`urgent`) : coffre prêt, mission personnelle qui expire, Flamme en
 * danger, frappe possible, Renaissance possible.
 *
 * Rien n'est calculé ici : le bloc `game` et la progression d'avant sont lus
 * tels que servis, puis habillés par le catalogue du jeu (sept langues). Devant
 * un ancien serveur (aucun bloc `game`), les concepts que la progression d'avant
 * sert gardent leur vue ; les autres ne sont pas dans la liste
 * (`progressionConcepts`, `packages/shared`).
 *
 * UNE SEULE SOURCE DE TEXTE par concept : `why` et `how` sont la phrase de la
 * carte ET le « C'est quoi ? » de la fiche — jamais deux formulations.
 *
 * QUATRE QUESTIONS PAR CONCEPT (#10540) : ce que c'est (`what`), à quoi ça sert
 * (`why`), comment ça marche et se gagne (`how`, `tips`), comment s'en servir
 * (`use`). Tout « il manque » nomme sa cible : le niveau, la Meesh, le rang, la zone.
 */

/**
 * CE QU'UNE DONNÉE OUVRE QUAND ON LA TOUCHE (#9563, amendement n° 2). Une donnée
 * qui EST un élément du jeu (les gels, la forme de la Flamme, le rang…) ouvre les
 * précisions de CET élément ; les autres ont leur phrase (`game.detail.fact.*`) ;
 * quelques-unes reprennent une phrase déjà au catalogue (`note`), jamais
 * reformulée. `lib/view/game-detail.ts` en fait les précisions de la modale.
 */
export type DetailElementFamily = Extract<GameDetailFamily, 'ring' | 'coin' | 'treasury' | 'rank' | 'flame' | 'freeze' | 'chest' | 'gem' | 'star' | 'seal'>;

export type DetailRef =
  | { readonly kind: 'fact'; readonly fact: GameDetailFact }
  | { readonly kind: 'element'; readonly family: DetailElementFamily }
  | { readonly kind: 'elan'; readonly family: EngagementAxisFamily }
  | { readonly kind: 'note'; readonly text: string };

export type { FactId } from '@/lib/view/progression-state';

/** Une donnée de la fiche, libellé → valeur, et l'IDENTITÉ du fait qu'elle dit (#11178). */
export type ConceptFact = { readonly label: string; readonly value: string; readonly ref: DetailRef; readonly id: FactId };

/** Une ligne courte et ce qu'elle ouvre ; `facts` : les identités qu'elle porte (une, ou deux pour « Coffret · le Coffre s'ouvre à 100 »). */
export type ConceptChipView = { readonly text: string; readonly ref: DetailRef; readonly facts: readonly FactId[] };

/** Ce que l'emblème lui-même dit (l'anneau porte le niveau) : son identité et ce qu'un lecteur d'écran en entend. */
export type ConceptEmblemFact = { readonly id: FactId; readonly label: string };

/** Les sous-pages d'un concept (« Aller plus loin ») : le sous-menu du sous-menu. */
export type ConceptRoute =
  | 'progressionLigue'
  | 'progressionSaison'
  | 'progressionPrestige'
  | 'progressionBadges'
  | 'progressionDefis'
  | 'progressionSucces'
  | 'progressionVitrine'
  | 'progressionAtlas'
  | 'progressionRegles';

export type ConceptMore = { readonly to: ConceptRoute; readonly label: string };

/**
 * UNE CARTE, TROIS ÉTAGES (#11178, épopée § 5) : le nom en petit, la valeur en grand, une seule ligne en petit. La
 * valeur et la ligne disent deux faits différents (`valueId`, `line.facts`) ; ce qui demande un geste PREND la ligne.
 */
export type ConceptView = {
  readonly key: ProgressionConcept;
  readonly name: string;
  /** La valeur de la tête : une seule ligne, jamais coupée. */
  readonly value: string;
  readonly valueId: FactId;
  /** Le fait que l'emblème montre lui-même, quand il en montre un. */
  readonly emblem: ConceptEmblemFact | null;
  /** La ligne en petit : la pastille d'action quand le concept attend un geste, sinon la donnée qui suit la valeur. */
  readonly line: ConceptChipView | null;
  /** La ligne demande une action (coffre prêt, Flamme en danger, frappe possible…). */
  readonly urgent: boolean;
  /** La fraction vers l'étape suivante, quand il y en a une : la jauge du héros de la fiche. */
  readonly gauge: number | null;
  /** Ce que la valeur ouvre quand on touche l'emblème du héros de la fiche. */
  readonly primary: DetailRef;
  readonly what: string;
  readonly why: string;
  readonly how: string;
  readonly use: string;
  readonly tips: readonly string[];
  /** Les données du concept qui ne redisent pas la valeur. */
  readonly facts: readonly ConceptFact[];
  /** « Aller plus loin » : la seule sous-page du concept, quand il en a une (carte de navigation). */
  readonly more: readonly ConceptMore[];
};

type Body = Pick<ConceptView, 'value' | 'valueId' | 'line' | 'gauge' | 'facts' | 'primary'> & {
  /** La pastille d'action, quand le concept attend un geste : elle prend la ligne. */
  readonly urgent?: ConceptChipView | null;
  readonly emblem?: ConceptEmblemFact | null;
};

const fraction = (done: number, total: number): string =>
  gameText('game.fmt.fraction', { done: formatCount(done), total: formatCount(total) });

const ratio = (done: number, total: number): number | null => (total <= 0 ? null : Math.min(1, Math.max(0, done / total)));

const levelValue = (level: number): string => gameText('game.banner.level', { level: formatCount(level) });

const toLevel = (points: number, target: number): string => gameText('game.concept.chip.to_level', { level: formatCount(target), points: pointsLabel(points) });

const toMeesh = (missing: number, number: number): string => gameText('game.concept.chip.to_meesh', { number: formatCount(number), missing: formatCount(missing) });

const missingForLevel = (target: number): string => gameText('game.fact.missing_for.level', { level: formatCount(target) });

const missingForMeesh = (number: number): string => gameText('game.fact.missing_for.meesh', { number: formatCount(number) });

const factor = (value: number): string => `×${formatCount(value)}`;

const present = <T,>(items: readonly (T | null)[]): readonly T[] => items.filter((item): item is T => item !== null);

const about = (name: GameDetailFact): DetailRef => ({ kind: 'fact', fact: name });
const element = (family: DetailElementFamily): DetailRef => ({ kind: 'element', family });
const note = (text: string): DetailRef => ({ kind: 'note', text });

const fact = (id: FactId, label: string, value: string, ref: DetailRef): ConceptFact => ({ id, label, value, ref });
const chip = (text: string, ref: DetailRef, ...facts: readonly FactId[]): ConceptChipView => ({ text, ref, facts });

const EMPTY: Body = { value: '', valueId: 'none', line: null, gauge: null, facts: [], primary: about('score') };

/** « le Coffre s'ouvre à 100 » : le contenant suivant de l'Héritage, avec son article (une clé par contenant). */
export const treasuryOpensLine = (next: { readonly key: TreasuryTierKey; readonly minHeld: number }): string =>
  gameText(`game.fiche.heritage.opens.${next.key}`, { count: formatCount(next.minHeld) });

function level(view: EngagementWithGame): Body {
  const game = view.game;
  if (game === undefined) {
    const { level: current, value, nextThreshold, progress } = view.level;
    const missing = nextThreshold === null ? null : nextThreshold - value;
    return {
      value: levelValue(current),
      valueId: 'level',
      line: missing === null ? chip(pointsLabel(value), about('score'), 'score') : chip(toLevel(missing, current + 1), about('level_next'), 'level_next'),
      gauge: missing === null ? null : progress,
      primary: about('score'),
      facts: present([
        fact('score', gameText('game.concept.points.name'), pointsLabel(value), about('score')),
        missing === null ? null : fact('level_next', missingForLevel(current + 1), pointsLabel(missing), about('level_next')),
      ]),
    };
  }
  const served = shownLevelOf(game.level);
  const atTop = served.nextThreshold === null;
  const record = served.record > served.level ? levelValue(served.record) : null;
  return {
    /* L'anneau porte le niveau : la valeur nomme l'état de la lumière (épopée § 4, synthèse « 34 · Éclat »). */
    value: levelTierName(served.tier),
    valueId: 'tier',
    emblem: { id: 'level', label: levelValue(served.level) },
    line: atTop ? chip(bannerTopLine(served), element('ring'), 'level_top') : chip(toLevel(served.pointsToNext, served.level + 1), about('level_next'), 'level_next'),
    gauge: atTop ? null : served.progress,
    primary: element('ring'),
    facts: present([
      fact('tier', gameText('game.fact.tier'), levelTierName(served.tier), about('tier')),
      atTop ? null : fact('level_next', missingForLevel(served.level + 1), pointsLabel(served.pointsToNext), about('level_next')),
      record === null ? null : fact('level_record', gameText('game.fact.record'), record, about('level_record')),
    ]),
  };
}

/**
 * LES ÉTINCELLES (#11178) : TA LUMIÈRE, ce que tu possèdes — jamais le cycle, jamais le total à vie, jamais le prix
 * d'une Meesh (il est à l'Héritage, où la fiche mène). En petit : l'Ombre d'abord, qui ferme la frappe, sinon le
 * « depuis toujours ».
 */
function points(view: EngagementWithGame): Body {
  const game = view.game;
  if (game === undefined) return { ...EMPTY, value: pointsLabel(view.level.value), valueId: 'sparks_pocket' };
  const sparks = sparksReading(game.level);
  const cumul = sparksCumulLine(sparks);
  return {
    value: pointsLabel(sparks.pocket),
    valueId: 'sparks_pocket',
    line:
      sparks.debt > 0
        ? chip(gameText('game.sparks.debt', { debt: formatCount(sparks.debt) }), about('score'), 'sparks_debt')
        : cumul === null
          ? null
          : chip(cumul, about('score'), 'sparks_lifetime'),
    gauge: null,
    primary: about('score'),
    facts: [],
  };
}

function meesh(view: EngagementWithGame): Body {
  const game = view.game;
  const wallet = view.meesh;
  const minted = wallet === undefined ? null : fact('minted', gameText('game.fact.minted'), formatCount(wallet.mintedLifetime), about('minted'));
  if (game === undefined) {
    if (wallet === undefined) return { ...EMPTY, value: meeshCount(0), valueId: 'meesh_held', primary: about('minted') };
    return {
      value: meeshCount(wallet.balance),
      valueId: 'meesh_held',
      urgent: wallet.canMint ? chip(gameText('game.concept.chip.can_mint'), about('can_mint'), 'can_mint') : null,
      line: wallet.canMint
        ? chip(gameText('game.concept.chip.next_price', { price: pointsLabel(wallet.mintCost) }), about('mint_price'), 'mint_price')
        : chip(toMeesh(wallet.missingPoints, wallet.mintedLifetime + 1), about('mint_missing'), 'mint_missing', 'mint_next'),
      gauge: wallet.progress,
      primary: about('minted'),
      facts: present([
        fact('meesh_held', gameText('game.fact.balance'), meeshCount(wallet.balance), about('minted')),
        fact('mint_price', gameText('game.mint.row.price'), pointsLabel(wallet.mintCost), about('mint_price')),
        wallet.canMint ? null : fact('mint_missing', missingForMeesh(wallet.mintedLifetime + 1), pointsLabel(wallet.missingPoints), about('mint_missing')),
        minted,
      ]),
    };
  }
  const { treasury, mint } = game;
  const balance = wallet?.balance ?? treasury.held;
  const opens = treasury.next === null ? null : treasuryOpensLine(treasury.next);
  const container =
    treasury.tier === null
      ? opens === null
        ? null
        : chip(opens, element('treasury'), 'treasury_next')
      : opens === null
        ? chip(treasuryName(treasury.tier), element('treasury'), 'treasury_tier')
        : chip(`${treasuryName(treasury.tier)} · ${opens}`, element('treasury'), 'treasury_tier', 'treasury_next');
  return {
    value: meeshCount(balance),
    valueId: 'meesh_held',
    urgent: mint.canMint ? chip(gameText('game.concept.chip.can_mint'), about('can_mint'), 'can_mint') : null,
    line: container,
    gauge: null,
    primary: element('coin'),
    facts: present([
      fact('meesh_held', gameText('game.fact.balance'), meeshCount(balance), element('coin')),
      treasury.tier === null ? null : fact('treasury_tier', gameText('game.gauge.treasury'), treasuryName(treasury.tier), element('treasury')),
      opens === null ? null : fact('treasury_next', gameText('game.fact.next_tier'), opens, element('treasury')),
      fact(
        'mint_next',
        gameText('game.fact.next_meesh'),
        `${gameText('game.mint.number_label', { number: formatCount(mint.number) })} · ${editionName(mint.edition)}`,
        about('mint_next'),
      ),
      fact('mint_price', gameText('game.mint.row.price'), pointsLabel(mint.price), about('mint_price')),
      mint.canMint ? fact('mint_glory', gameText('game.mint.row.glory'), gameText('game.fmt.signed', { value: formatCount(mint.gloryGained) }), about('mint_glory')) : null,
      mint.canMint ? null : fact('mint_missing', missingForMeesh(mint.number), pointsLabel(mint.missingPoints), about('mint_missing')),
      minted,
    ]),
  };
}

function glory(view: EngagementWithGame): Body {
  const served = view.game?.glory;
  if (served === undefined) return EMPTY;
  const next = served.next === null ? null : rankLabel(served.next.rank, servedDivision(served.next));
  const rank = standingLabel(shownRank(served));
  return {
    value: rank,
    valueId: 'rank',
    line: chip(gameText('game.rank.glory', { glory: formatCount(served.glory) }), about('glory'), 'glory'),
    gauge: next === null ? null : served.progress,
    primary: element('rank'),
    facts: present([
      fact('glory', gameText('game.mint.row.glory'), formatCount(served.glory), about('glory')),
      fact('rank', gameText('game.gauge.rank'), rank, element('rank')),
      next === null ? fact('rank_next', gameText('game.fact.next_rank'), gameText('game.rank.top'), element('rank')) : fact('rank_next', gameText('game.fact.next_rank'), next, element('rank')),
      served.gloryMissing === null || next === null
        ? null
        : fact('glory_missing', gameText('game.fact.missing_for.rank', { rank: next }), gameText('game.rank.glory', { glory: formatCount(served.gloryMissing) }), about('glory_missing')),
    ]),
  };
}

type FlameStatus = NonNullable<EngagementWithGame['game']>['flame']['status'];

export const flameStateLabel = (status: FlameStatus): string => {
  switch (status) {
    case 'none':
      return gameText('game.flame.status.none');
    case 'lit':
      return gameText('game.fact.lit');
    case 'at-risk':
      return gameText('game.flame.status.at_risk');
    case 'covered':
      return gameText('game.flame.status.covered');
    case 'out':
      return gameText('game.flame.status.out');
  }
};

const streakValue = (days: number): string => (days === 0 ? gameText('game.flame.no_streak') : daysLabel(days));

function flame(view: EngagementWithGame): Body {
  const served = view.game?.flame;
  const record = chip(gameText('game.concept.chip.record', { value: daysLabel(view.streak.longestDays) }), about('streak_record'), 'streak_record');
  const recordFact = fact('streak_record', gameText('game.fact.record'), daysLabel(view.streak.longestDays), about('streak_record'));
  if (served === undefined) {
    const days = view.streak.currentDays;
    return {
      value: streakValue(days),
      valueId: 'streak',
      line: record,
      gauge: null,
      primary: about('streak'),
      facts: [fact('streak', gameText('game.fact.streak'), streakValue(days), about('streak')), recordFact],
    };
  }
  const freezes = fraction(served.freezes, served.maxFreezes);
  const form =
    served.form === null
      ? null
      : gameText('game.flame.form_line', { form: flameFormName(served.form), bonus: formatCount(Math.min(100, Math.max(0, served.bonusPercent))) });
  return {
    value: streakValue(served.days),
    valueId: 'streak',
    urgent: served.status === 'at-risk' ? chip(flameStateLabel('at-risk'), about('flame_state'), 'flame_state') : null,
    line: form === null ? chip(gameText('game.concept.chip.freezes', { count: freezes }), element('freeze'), 'freezes') : chip(form, element('flame'), 'flame_form'),
    gauge: null,
    primary: element('flame'),
    facts: present([
      fact('streak', gameText('game.fact.streak'), streakValue(served.days), about('streak')),
      form === null ? null : fact('flame_form', gameText('game.fact.form'), form, element('flame')),
      fact('freezes', gameText('game.fact.freezes'), freezes, element('freeze')),
      view.streak.longestDays > 0 ? recordFact : null,
      fact('flame_state', gameText('game.fact.state'), flameStateLabel(served.status), about('flame_state')),
    ]),
  };
}

/** La mission personnelle en cours, ni faite ni manquée : « Se termine dans … ». */
function expiring(personal: NonNullable<EngagementWithGame['game']>['missions']['personal'], now: Date): ConceptChipView | null {
  if (personal === undefined || personal === null) return null;
  const clock = personalMissionClock({ startsAt: personal.startsAt, endsAt: personal.endsAt, completedAt: personal.completedAt, now });
  if (clock.phase !== 'active' || clock.remainingMs === null) return null;
  return chip(gameText('game.mission.personal.active', { remaining: timerLabel(clock.remainingMs) }), about('missions_done'), 'mission_expiring');
}

/** Une porte encore fermée se dit par son seuil, en valeur : « Dès le niveau 5 ». */
const lockedDoor = (minLevel: number): string => gameText('game.door.league.locked', { level: formatCount(minLevel) });

function missions(view: EngagementWithGame, now: Date): Body {
  const game = view.game;
  if (game === undefined) return EMPTY;
  const { missions: served, chest } = game;
  const chestState = gameText(`game.concept.chip.chest.${chest.status}`);
  const chestFact = fact('chest', gameText('game.chest.title'), chestState, element('chest'));
  if (!served.unlocked) {
    return { value: lockedDoor(MISSIONS_MIN_LEVEL), valueId: 'missions_unlock_level', line: null, gauge: null, primary: element('chest'), facts: [chestFact] };
  }
  const done = served.items.filter((item) => item.completedAt !== null).length;
  const total = served.items.length;
  const chestChip = chip(chestState, element('chest'), 'chest');
  return {
    value: fraction(done, total),
    valueId: 'missions_done',
    urgent: chest.status === 'ready' ? chestChip : expiring(served.personal, now),
    line: served.prismDay ? chip(gameText('game.mission.prism'), note(gameText('game.missions.prism_day')), 'prism_day') : chestChip,
    gauge: ratio(done, total),
    primary: element('chest'),
    facts: [fact('missions_done', gameText('game.fact.done'), fraction(done, total), about('missions_done')), chestFact],
  };
}

function league(view: EngagementWithGame, now: Date): Body {
  const game = view.game;
  const served = game?.league;
  if (game === undefined || served === undefined) return EMPTY;
  const friends = gameText('game.league.rank_line', { rank: formatCount(served.friends.rank), size: formatCount(served.friends.size) });
  const friendsFact = fact('league_friends', gameText('game.league.friends.title'), friends, about('league_friends'));
  if (served.access === 'locked') {
    return { value: lockedDoor(LEAGUE_MIN_LEVEL), valueId: 'league_unlock_level', line: null, gauge: null, primary: element('gem'), facts: [friendsFact] };
  }
  const current = served.current;
  if (served.access !== 'open' || current === null) {
    return {
      value: gameText('game.concept.league.unplaced'),
      valueId: 'league',
      line: chip(gameText('game.league.friends.title'), about('league_friends'), 'league_friends_door'),
      gauge: null,
      primary: element('gem'),
      facts: [friendsFact],
    };
  }
  const place = gameText('game.league.rank_line', { rank: formatCount(current.rank), size: formatCount(current.groupSize) });
  const remaining = remainingLabel(served.closes, now);
  return {
    value: leagueName(current.league),
    valueId: 'league',
    line: chip(place, about('league_place'), 'league_place'),
    gauge: null,
    primary: element('gem'),
    facts: present([
      fact('league', gameText('game.league.title'), leagueName(current.league), element('gem')),
      fact('league_place', gameText('game.fact.group'), place, about('league_place')),
      fact('week_points', gameText('game.fact.week_points'), pointsLabel(current.weekPoints), about('week_points')),
      fact('league_zone', gameText('game.fact.state'), zoneLabel(current.zone), about('league_zone')),
      current.pointsToPromotion === null || current.pointsToPromotion === 0
        ? null
        : fact('league_missing', gameText('game.fact.missing_for.promotion'), pointsLabel(current.pointsToPromotion), about('league_missing')),
      fact('league_closes', gameText('game.fact.closes'), remaining, about('league_closes')),
      friendsFact,
    ]),
  };
}

function season(view: EngagementWithGame): Body {
  const served = view.game?.season;
  if (served === undefined || served === null) {
    const none = note(gameText('game.season.none'));
    return { value: gameText('game.concept.season.none'), valueId: 'season', line: chip(gameText('game.season.path'), none, 'season_path'), gauge: null, facts: [], primary: none };
  }
  const steps = fraction(served.steps, served.stepsTotal);
  const week = formatCount(served.week);
  return {
    value: steps,
    valueId: 'season_steps',
    line: chip(gameText('game.concept.chip.week', { week }), about('season_week'), 'season_week'),
    gauge: ratio(served.steps, served.stepsTotal),
    primary: element('seal'),
    facts: [
      fact('season', gameText('game.concept.season.name'), formatCount(served.number), about('season')),
      fact('season_week', gameText('game.fact.week'), week, about('season_week')),
      fact('season_steps', gameText('game.fact.steps'), steps, about('season_steps')),
      fact('season_stars', gameText('game.fact.stars'), translateGamePlural(currentInterfaceLanguage(), 'game.season.stars', served.stars), about('season_stars')),
    ],
  };
}

function prestige(view: EngagementWithGame): Body {
  const served = view.game?.prestige;
  if (served === undefined) return EMPTY;
  const stars = fraction(served.stars, served.max);
  const door = served.stars >= served.max ? gameText('game.banner.top') : gameText('game.door.prestige.locked');
  return {
    value: stars,
    valueId: 'prestige_stars',
    urgent: served.canPrestige ? chip(gameText('game.door.prestige.ready'), element('star'), 'prestige_door') : null,
    line: chip(door, element('star'), 'prestige_door'),
    gauge: ratio(served.stars, served.max),
    primary: element('star'),
    facts: [
      fact('prestige_stars', gameText('game.fact.stars'), stars, element('star')),
      fact('prestige_glory', gameText('game.mint.row.glory'), gameText('game.fmt.signed', { value: formatCount(served.gloryOnPass) }), about('prestige_glory')),
    ],
  };
}

function elans(view: EngagementWithGame): Body {
  const elan = view.elan;
  const families = elan?.activeFamilies ?? [];
  const count = elan?.activeFamilyCount ?? 0;
  const active = translateGamePlural(currentInterfaceLanguage(), 'game.concept.elans.families', count);
  const accelerated = elan?.isAccelerated === true;
  const names = families.map((family) => familyName(family));
  const tailwind = view.game?.boosts.tailwind ?? 1;
  return {
    value: accelerated ? factor(elan.factor) : active,
    valueId: accelerated ? 'factor' : 'elan_families',
    line: accelerated
      ? chip(names.length === 0 ? active : names.join(' · '), about('elan_families'), 'elan_families')
      : chip(gameText('game.concept.chip.no_elan'), about('factor'), 'factor'),
    gauge: null,
    primary: about('factor'),
    facts: present([
      fact('factor', gameText('game.fact.factor'), factor(accelerated ? elan.factor : 1), about('factor')),
      fact('elan_families', gameText('game.fact.families'), names.length === 0 ? formatCount(count) : names.join(' · '), about('elan_families')),
      tailwind > 1 ? fact('tailwind', gameText('game.mint.row.tailwind'), factor(tailwind), about('tailwind')) : null,
    ]),
  };
}

type Counted = 'badges' | 'defis' | 'succes';

const counted = (concept: Counted, done: number, total: number): Body => {
  const ref = about(`${concept}_earned`);
  return {
    value: fraction(done, total),
    valueId: `${concept}_earned`,
    line: chip(gameText('game.concept.chip.left', { count: formatCount(Math.max(0, total - done)) }), ref, `${concept}_left`),
    gauge: ratio(done, total),
    primary: ref,
    facts: [fact(`${concept}_earned`, gameText('game.fact.earned'), fraction(done, total), ref)],
  };
};

const badges = (view: EngagementWithGame): Body => counted('badges', view.badgesEarned, view.badgesTotal);

function defis(view: EngagementWithGame): Body {
  const sections = view.achievementSections ?? [];
  return counted(
    'defis',
    sections.reduce((sum, section) => sum + section.unlockedCount, 0),
    sections.reduce((sum, section) => sum + section.attainableCount, 0),
  );
}

const succes = (view: EngagementWithGame): Body => counted('succes', view.achievements.filter((achievement) => achievement.unlocked).length, view.achievements.length);

function showcase(view: EngagementWithGame): Body {
  const game = view.game;
  const trophies = game?.trophies;
  if (game === undefined || trophies === undefined) return EMPTY;
  const count = trophies.items.length;
  const who = visibilityLabel(game.visibility?.showcase ?? SHOWCASE_DEFAULT_VISIBILITY);
  return {
    value: count === 0 ? gameText('game.door.showcase.empty') : translateGamePlural(currentInterfaceLanguage(), 'game.door.showcase.count', count),
    valueId: 'trophies',
    line: chip(gameText('game.concept.chip.seen_by', { who }), about('showcase_visibility'), 'showcase_visibility'),
    gauge: null,
    primary: about('trophies'),
    facts: [fact('showcase_visibility', gameText('game.fact.visibility'), who, about('showcase_visibility'))],
  };
}

function atlas(view: EngagementWithGame): Body {
  const served = view.game?.atlas;
  if (served === undefined) return EMPTY;
  const stamps = fraction(served.stamped, served.total);
  return {
    value: stamps,
    valueId: 'atlas_stamps',
    line: chip(gameText('game.concept.chip.left', { count: formatCount(Math.max(0, served.total - served.stamped)) }), about('atlas_stamps'), 'atlas_left'),
    gauge: ratio(served.stamped, served.total),
    primary: about('atlas_stamps'),
    facts: [
      fact('atlas_stamps', gameText('game.fact.stamps'), stamps, about('atlas_stamps')),
      fact('atlas_pending', gameText('game.fact.pending'), formatCount(served.pending.length), about('atlas_pending')),
    ],
  };
}

const BODIES: Readonly<Record<ProgressionConcept, (view: EngagementWithGame, now: Date) => Body>> = {
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

/** « Aller plus loin » : la sous-page du concept, et elle seule (carte de navigation, `progression-nav.ts`). */
function moreOf(concept: ProgressionConcept): readonly ConceptMore[] {
  const page = subpageOf(concept);
  return page === undefined ? [] : [{ to: page, label: gameText(`game.concept.${SUBPAGE_CONCEPT[page]}.more`) }];
}

export function conceptView(concept: ProgressionConcept, view: EngagementWithGame, now: Date = new Date()): ConceptView {
  const body = BODIES[concept](view, now);
  const urgent = body.urgent ?? null;
  const line = urgent ?? body.line;
  return {
    key: concept,
    name: gameText(`game.concept.${concept}.name`),
    value: body.value,
    valueId: body.valueId,
    emblem: body.emblem ?? null,
    line: line === null || line.facts.includes(body.valueId) ? null : line,
    urgent: urgent !== null,
    gauge: body.gauge,
    primary: body.primary,
    what: gameText(`game.concept.${concept}.what`),
    why: gameText(`game.concept.${concept}.why`),
    how: gameText(`game.concept.${concept}.how`),
    use: gameText(`game.concept.${concept}.use`),
    tips: [gameText(`game.concept.${concept}.tip.1`), gameText(`game.concept.${concept}.tip.2`)],
    facts: body.facts.filter((one) => one.id !== body.valueId),
    more: moreOf(concept),
  };
}

/** La clé d'une donnée : ce qui la désigne, quel que soit son libellé. */
export const refKeyOf = (ref: DetailRef): string => {
  switch (ref.kind) {
    case 'fact':
      return ref.fact;
    case 'element':
      return `element:${ref.family}`;
    case 'elan':
      return `elan:${ref.family}`;
    case 'note':
      return 'note';
  }
};

/**
 * LES PIÈCES DE JEU QUI SONT LE HÉROS DE LEUR FICHE — et les faits qu'elles montrent déjà, que « Où j'en suis » ne
 * redira pas. `'all'` : la pièce montre tout ce que le concept sert. Les fiches de l'Héritage et des Étincelles ont
 * leur propre tête (#11178) : la première montre tout, la seconde ta lumière, l'Ombre et le « depuis toujours ».
 */
type Piece = { readonly shows: ReadonlySet<FactId> | 'all' };

function pieceOf(concept: ProgressionConcept, view: EngagementWithGame): Piece | null {
  const game = view.game;
  switch (concept) {
    case 'level':
      return { shows: 'all' };
    case 'points':
      return game === undefined ? null : { shows: new Set(['sparks_pocket', 'sparks_lifetime', 'sparks_debt']) };
    case 'meesh':
      return game === undefined && view.meesh === undefined ? null : { shows: 'all' };
    case 'league':
      return game?.league?.access === 'open' && game.league.current !== null ? { shows: new Set(['league', 'league_place', 'week_points', 'league_closes']) } : null;
    case 'elans':
      return { shows: new Set(['factor', 'elan_families']) };
    default:
      return null;
  }
}

export type FicheView = {
  /** `piece` : la pièce de jeu du concept tient lieu de héros ; `generic` : emblème, valeur, ligne, jauge. */
  readonly hero: 'generic' | 'piece';
  /** « Où j'en suis » : les faits que l'écran ne dit pas déjà. */
  readonly facts: readonly ConceptFact[];
  /** La phrase d'état, quand elle ne redit aucun fait déjà à l'écran. Sans elle ni donnée, la section n'est pas rendue. */
  readonly state: ConceptState | null;
};

const shownByGenericHero = (shown: ConceptView): ReadonlySet<FactId> => new Set([shown.valueId, ...(shown.emblem === null ? [] : [shown.emblem.id]), ...(shown.line?.facts ?? [])]);

/**
 * « OÙ J'EN SUIS » NE REDIT RIEN (#11178, épopée § 3.3) : un fait ne paraît qu'une fois par écran. On compare les
 * IDENTITÉS, jamais les chaînes : la phrase d'état disparaît dès qu'elle enchâsse un fait que la tête montre déjà ;
 * quand elle reste, les lignes ne redisent pas ce qu'elle dit.
 */
export function ficheView(concept: ProgressionConcept, view: EngagementWithGame, now: Date = new Date()): FicheView {
  const shows = pieceOf(concept, view)?.shows ?? null;
  if (shows === 'all') return { hero: 'piece', facts: [], state: null };
  const onScreen = shows ?? shownByGenericHero(conceptView(concept, view, now));
  const said = conceptStateOf(concept, view);
  const state = said === null || said.facts.some((id) => onScreen.has(id)) ? null : said;
  const told = new Set([...onScreen, ...(state?.facts ?? [])]);
  return {
    hero: shows === null ? 'generic' : 'piece',
    facts: BODIES[concept](view, now).facts.filter((one) => !told.has(one.id)),
    state,
  };
}

/**
 * « Jeu masqué » (#9481, #9563) : sur cet appareil, la carte masquée REMPLACE la
 * liste — aucune carte de concept, aucune fiche, aucun bloc au tableau de bord.
 * Elle porte seule de quoi réafficher le jeu et ouvrir ses réglages. Les trois
 * écrans lisent la MÊME règle, et l'app iOS s'y aligne.
 *
 * `shownProgress` retire le bloc `game` de ce que les écrans lisent : rien du jeu
 * ne peut se peindre par un chemin oublié.
 */
export function shownProgress(view: EngagementWithGame, hidden: boolean): EngagementWithGame {
  if (!hidden || view.game === undefined) return view;
  const { game: _game, mintBadgeLoss: _loss, mintBadgeRegain: _regain, ...before } = view;
  return before;
}

export function shownConcepts(view: EngagementWithGame, hidden: boolean): readonly ProgressionConcept[] {
  return hidden && view.game !== undefined ? [] : progressionConcepts(view);
}

const CONCEPT_KEYS: ReadonlySet<string> = new Set<string>(Object.keys(BODIES));

export const isProgressionConcept = (value: string): value is ProgressionConcept => CONCEPT_KEYS.has(value);
