import { LEAGUE_MIN_LEVEL } from '@meeshy/shared/utils/game/league';
import { MISSIONS_MIN_LEVEL } from '@meeshy/shared/utils/game/missions';
import { SHOWCASE_DEFAULT_VISIBILITY } from '@meeshy/shared/utils/game/trophies';
import { progressionConcepts, type ProgressionConcept } from '@meeshy/shared/utils/progression-layout';
import type { EngagementAxisFamily } from '@meeshy/shared/types/engagement';

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
} from '@/lib/view/game-copy';
import { leagueName, remainingLabel, timerLabel, visibilityLabel, zoneLabel } from '@/lib/view/game-copy-v2';

/**
 * CE QUE CHAQUE CONCEPT DE « PROGRESSION » DIT (#9563) — écrit UNE fois, lu par
 * deux écrans : la carte de la première page (tête, données importantes, à quoi
 * ça sert, comment ça marche) et la fiche du concept (toutes ses données). Deux
 * écrans qui recomposeraient chacun « 2 / 3 » finiraient par ne plus dire le
 * même nombre.
 *
 * LES TROIS RÈGLES DE DÉDOUBLONNAGE (amendement n° 4), posées ICI et nulle part
 * ailleurs — l'app iOS les reproduit dans `ProgressionConceptModel` :
 *
 *   1. UNE DONNÉE APPARTIENT À UN SEUL CONCEPT : le score à Points, tout
 *      multiplicateur (élan, vent arrière) à Élans, les étoiles à Prestige, le
 *      prix de la Meesh à Meeshes, ce qui manque pour frapper à Points. Devant un
 *      ancien serveur sans Points, le score reste au Niveau et le manque aux
 *      Meeshes : une donnée garde toujours UN hôte.
 *   2. UNE PASTILLE OU UNE LIGNE NE REDIT JAMAIS LA VALEUR DE TÊTE
 *      (`conceptView` les retire).
 *   3. DANS LA FICHE, UNE PIÈCE DE JEU REMPLACE LE HÉROS, et « Où j'en suis » ne
 *      liste ni la valeur montrée ni ce que la pièce montre (`ficheView`).
 *
 * ET CE QUI DEMANDE UNE ACTION PASSE EN PREMIER (`urgent`) : coffre prêt,
 * mission personnelle qui expire, Flamme en danger, frappe possible, Prestige
 * possible — une pastille au plus, en tête de la carte.
 *
 * Rien n'est calculé ici : le bloc `game` et la progression d'avant sont lus
 * tels que servis, puis habillés par le catalogue du jeu (sept langues). Devant
 * un ancien serveur (aucun bloc `game`), les concepts que la progression d'avant
 * sert gardent leur vue ; les autres ne sont pas dans la liste
 * (`progressionConcepts`, `packages/shared`).
 *
 * UNE SEULE SOURCE DE TEXTE par concept : `why` et `how` sont la phrase de la
 * carte ET le « C'est quoi ? » de la fiche — jamais deux formulations.
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

export type ConceptFact = { readonly label: string; readonly value: string; readonly ref: DetailRef };

/** Une donnée importante de la carte, courte, et ce qu'elle ouvre. */
export type ConceptChipView = { readonly text: string; readonly ref: DetailRef };

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

export type ConceptView = {
  readonly key: ProgressionConcept;
  readonly name: string;
  /** La valeur de la tête de carte : une seule ligne, jamais coupée. */
  readonly value: string;
  /** Les données importantes de la carte : une à trois, courtes ; la pastille d'action d'abord. */
  readonly chips: readonly ConceptChipView[];
  /** La première pastille demande une action (coffre prêt, Flamme en danger, frappe possible…). */
  readonly urgent: boolean;
  /** La fraction vers l'étape suivante, quand il y en a une. */
  readonly gauge: number | null;
  /** Ce que la valeur ouvre quand on touche l'emblème du héros de la fiche. */
  readonly primary: DetailRef;
  readonly why: string;
  readonly how: string;
  readonly tips: readonly string[];
  /** Les données du concept qui ne redisent pas la valeur (règle 2). */
  readonly facts: readonly ConceptFact[];
  /** « Aller plus loin » : la seule sous-page du concept, quand il en a une (carte de navigation). */
  readonly more: readonly ConceptMore[];
};

type Body = Pick<ConceptView, 'value' | 'chips' | 'gauge' | 'facts' | 'primary'> & {
  /** La pastille d'action, quand le concept attend un geste. */
  readonly urgent?: ConceptChipView | null;
};

const MAX_CHIPS = 3;

const fraction = (done: number, total: number): string =>
  gameText('game.fmt.fraction', { done: formatCount(done), total: formatCount(total) });

const ratio = (done: number, total: number): number | null => (total <= 0 ? null : Math.min(1, Math.max(0, done / total)));

const levelValue = (level: number): string => gameText('game.banner.level', { level: formatCount(level) });

const stillMissing = (points: number): string => gameText('game.banner.missing', { points: pointsLabel(points) });

const factor = (value: number): string => `×${formatCount(value)}`;

const present = <T,>(items: readonly (T | null)[]): readonly T[] => items.filter((item): item is T => item !== null);

const about = (name: GameDetailFact): DetailRef => ({ kind: 'fact', fact: name });
const element = (family: DetailElementFamily): DetailRef => ({ kind: 'element', family });
const note = (text: string): DetailRef => ({ kind: 'note', text });

const fact = (label: string, value: string, ref: DetailRef): ConceptFact => ({ label, value, ref });
const chip = (text: string, ref: DetailRef): ConceptChipView => ({ text, ref });

const EMPTY: Body = { value: '', chips: [], gauge: null, facts: [], primary: about('score') };

function level(view: EngagementWithGame): Body {
  const game = view.game;
  if (game === undefined) {
    const { level: current, value, nextThreshold, progress } = view.level;
    const missing = nextThreshold === null ? null : nextThreshold - value;
    return {
      value: levelValue(current),
      chips: present([chip(pointsLabel(value), about('score')), missing === null ? null : chip(stillMissing(missing), about('level_next'))]),
      gauge: missing === null ? null : progress,
      primary: about('score'),
      facts: present([
        fact(gameText('game.concept.points.name'), pointsLabel(value), about('score')),
        missing === null ? null : fact(gameText('game.fact.to_next'), pointsLabel(missing), about('level_next')),
      ]),
    };
  }
  const served = shownLevelOf(game.level);
  const atTop = served.nextThreshold === null;
  const record = served.record > served.level ? levelValue(served.record) : null;
  return {
    value: levelValue(served.level),
    chips: present([
      chip(levelTierName(served.tier), about('tier')),
      atTop ? chip(bannerTopLine(served), element('ring')) : chip(stillMissing(served.pointsToNext), about('level_next')),
      record === null ? null : chip(gameText('game.concept.chip.record', { value: record }), about('level_record')),
    ]),
    gauge: atTop ? null : served.progress,
    primary: element('ring'),
    facts: present([
      fact(gameText('game.fact.tier'), levelTierName(served.tier), about('tier')),
      atTop ? null : fact(gameText('game.fact.to_next'), pointsLabel(served.pointsToNext), about('level_next')),
      record === null ? null : fact(gameText('game.fact.record'), record, about('level_record')),
    ]),
  };
}

function points(view: EngagementWithGame): Body {
  const game = view.game;
  if (game === undefined) return { ...EMPTY, value: pointsLabel(view.level.value) };
  const { level: served, mint } = game;
  return {
    value: pointsLabel(served.score),
    chips: [mint.canMint ? chip(gameText('game.concept.chip.mint_covered'), about('score')) : chip(stillMissing(mint.missingPoints), about('mint_missing'))],
    gauge: mint.canMint ? 1 : ratio(mint.price - mint.missingPoints, mint.price),
    primary: about('score'),
    facts: present([
      fact(gameText('game.fact.balance'), pointsLabel(served.score), about('score')),
      mint.canMint ? null : fact(gameText('game.fact.missing'), pointsLabel(mint.missingPoints), about('mint_missing')),
    ]),
  };
}

function meesh(view: EngagementWithGame): Body {
  const game = view.game;
  const wallet = view.meesh;
  const minted = wallet === undefined ? null : fact(gameText('game.fact.minted'), formatCount(wallet.mintedLifetime), about('minted'));
  if (game === undefined) {
    if (wallet === undefined) return { ...EMPTY, value: meeshCount(0), primary: about('minted') };
    return {
      value: meeshCount(wallet.balance),
      urgent: wallet.canMint ? chip(gameText('game.concept.chip.can_mint'), about('can_mint')) : null,
      chips: present([
        chip(gameText('game.concept.chip.next_price', { price: pointsLabel(wallet.mintCost) }), about('mint_price')),
        wallet.canMint ? null : chip(stillMissing(wallet.missingPoints), about('mint_missing')),
      ]),
      gauge: wallet.progress,
      primary: about('minted'),
      facts: present([
        fact(gameText('game.fact.balance'), meeshCount(wallet.balance), about('minted')),
        fact(gameText('game.mint.row.price'), pointsLabel(wallet.mintCost), about('mint_price')),
        wallet.canMint ? null : fact(gameText('game.fact.missing'), pointsLabel(wallet.missingPoints), about('mint_missing')),
        minted,
      ]),
    };
  }
  const { treasury, mint } = game;
  const balance = wallet?.balance ?? treasury.held;
  const nextTier =
    treasury.next === null
      ? null
      : gameText('game.treasury.next', { missing: meeshCount(treasury.next.missing), tier: treasuryName(treasury.next.key) });
  return {
    value: meeshCount(balance),
    urgent: mint.canMint ? chip(gameText('game.concept.chip.can_mint'), about('can_mint')) : null,
    chips: present([
      chip(gameText('game.concept.chip.next_price', { price: pointsLabel(mint.price) }), about('mint_price')),
      treasury.tier === null ? null : chip(treasuryName(treasury.tier), element('treasury')),
    ]),
    gauge: null,
    primary: element('coin'),
    facts: present([
      fact(gameText('game.fact.balance'), meeshCount(balance), element('coin')),
      treasury.tier === null ? null : fact(gameText('game.gauge.treasury'), treasuryName(treasury.tier), element('treasury')),
      nextTier === null ? null : fact(gameText('game.fact.next_tier'), nextTier, element('treasury')),
      fact(
        gameText('game.fact.next_meesh'),
        `${gameText('game.mint.number_label', { number: formatCount(mint.number) })} · ${editionName(mint.edition)}`,
        about('mint_next'),
      ),
      fact(gameText('game.mint.row.price'), pointsLabel(mint.price), about('mint_price')),
      fact(gameText('game.mint.row.glory'), gameText('game.fmt.signed', { value: formatCount(mint.gloryGained) }), about('mint_glory')),
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
    chips: [
      chip(gameText('game.rank.glory', { glory: formatCount(served.glory) }), about('glory')),
      chip(next === null ? gameText('game.rank.top') : gameText('game.concept.chip.next', { name: next }), element('rank')),
    ],
    gauge: next === null ? null : served.progress,
    primary: element('rank'),
    facts: present([
      fact(gameText('game.mint.row.glory'), formatCount(served.glory), about('glory')),
      fact(gameText('game.gauge.rank'), rank, element('rank')),
      next === null ? null : fact(gameText('game.fact.next_rank'), next, element('rank')),
      served.gloryMissing === null ? null : fact(gameText('game.fact.missing'), formatCount(served.gloryMissing), about('glory_missing')),
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
  const record = chip(gameText('game.concept.chip.record', { value: daysLabel(view.streak.longestDays) }), about('streak_record'));
  const recordFact = fact(gameText('game.fact.record'), daysLabel(view.streak.longestDays), about('streak_record'));
  if (served === undefined) {
    const days = view.streak.currentDays;
    return {
      value: streakValue(days),
      chips: [record],
      gauge: null,
      primary: about('streak'),
      facts: [fact(gameText('game.fact.streak'), streakValue(days), about('streak')), recordFact],
    };
  }
  const freezes = fraction(served.freezes, served.maxFreezes);
  return {
    value: streakValue(served.days),
    urgent: served.status === 'at-risk' ? chip(flameStateLabel('at-risk'), about('flame_state')) : null,
    chips: present([
      served.form === null ? null : chip(flameFormName(served.form), element('flame')),
      chip(gameText('game.concept.chip.freezes', { count: freezes }), element('freeze')),
      view.streak.longestDays > 0 ? record : null,
    ]),
    gauge: null,
    primary: element('flame'),
    facts: present([
      fact(gameText('game.fact.streak'), streakValue(served.days), about('streak')),
      served.form === null
        ? null
        : fact(
            gameText('game.fact.form'),
            gameText('game.flame.form_line', { form: flameFormName(served.form), bonus: formatCount(Math.min(100, Math.max(0, served.bonusPercent))) }),
            element('flame'),
          ),
      fact(gameText('game.fact.freezes'), freezes, element('freeze')),
      view.streak.longestDays > 0 ? recordFact : null,
      fact(gameText('game.fact.state'), flameStateLabel(served.status), about('flame_state')),
    ]),
  };
}

/** La mission personnelle en cours, ni faite ni manquée : « Se termine dans … ». */
function expiring(personal: NonNullable<EngagementWithGame['game']>['missions']['personal'], now: Date): ConceptChipView | null {
  if (personal === undefined || personal === null) return null;
  const clock = personalMissionClock({ startsAt: personal.startsAt, endsAt: personal.endsAt, completedAt: personal.completedAt, now });
  if (clock.phase !== 'active' || clock.remainingMs === null) return null;
  return chip(gameText('game.mission.personal.active', { remaining: timerLabel(clock.remainingMs) }), about('missions_done'));
}

function missions(view: EngagementWithGame, now: Date): Body {
  const game = view.game;
  if (game === undefined) return EMPTY;
  const { missions: served, chest } = game;
  const chestState = gameText(`game.concept.chip.chest.${chest.status}`);
  const chestFact = fact(gameText('game.chest.title'), chestState, element('chest'));
  if (!served.unlocked) {
    const locked = gameText('game.missions.locked', { level: formatCount(shownLevelOf(game.level).level) });
    return {
      value: levelValue(MISSIONS_MIN_LEVEL),
      chips: [chip(gameText('game.door.league.locked', { level: formatCount(MISSIONS_MIN_LEVEL) }), note(locked))],
      gauge: null,
      primary: element('chest'),
      facts: [chestFact],
    };
  }
  const done = served.items.filter((item) => item.completedAt !== null).length;
  const total = served.items.length;
  const chestReady = chest.status === 'ready';
  return {
    value: fraction(done, total),
    urgent: chestReady ? chip(chestState, element('chest')) : expiring(served.personal, now),
    chips: present([
      chestReady ? null : chip(chestState, element('chest')),
      served.prismDay ? chip(gameText('game.mission.prism'), note(gameText('game.missions.prism_day'))) : null,
    ]),
    gauge: ratio(done, total),
    primary: element('chest'),
    facts: [fact(gameText('game.fact.done'), fraction(done, total), about('missions_done')), chestFact],
  };
}

function league(view: EngagementWithGame, now: Date): Body {
  const game = view.game;
  const served = game?.league;
  if (game === undefined || served === undefined) return EMPTY;
  const friends = gameText('game.league.rank_line', { rank: formatCount(served.friends.rank), size: formatCount(served.friends.size) });
  const friendsFact = fact(gameText('game.league.friends.title'), friends, about('league_friends'));
  if (served.access === 'locked') {
    const locked = gameText('game.league.locked', { level: formatCount(LEAGUE_MIN_LEVEL), current: formatCount(shownLevelOf(game.level).level) });
    return {
      value: levelValue(LEAGUE_MIN_LEVEL),
      chips: [chip(gameText('game.door.league.locked', { level: formatCount(LEAGUE_MIN_LEVEL) }), note(locked))],
      gauge: null,
      primary: element('gem'),
      facts: [friendsFact],
    };
  }
  const current = served.current;
  if (served.access !== 'open' || current === null) {
    return {
      value: gameText('game.concept.league.unplaced'),
      chips: [chip(gameText('game.league.friends.title'), about('league_friends'))],
      gauge: null,
      primary: element('gem'),
      facts: [friendsFact],
    };
  }
  const place = gameText('game.league.rank_line', { rank: formatCount(current.rank), size: formatCount(current.groupSize) });
  const remaining = remainingLabel(served.closes, now);
  return {
    value: leagueName(current.league),
    chips: [
      chip(place, about('league_place')),
      chip(pointsLabel(current.weekPoints), about('week_points')),
      chip(gameText('game.league.closes', { remaining }), about('league_closes')),
    ],
    gauge: null,
    primary: element('gem'),
    facts: present([
      fact(gameText('game.league.title'), leagueName(current.league), element('gem')),
      fact(gameText('game.fact.group'), place, about('league_place')),
      fact(gameText('game.fact.week_points'), pointsLabel(current.weekPoints), about('week_points')),
      fact(gameText('game.fact.state'), zoneLabel(current.zone), about('league_zone')),
      current.pointsToPromotion === null || current.pointsToPromotion === 0
        ? null
        : fact(gameText('game.fact.missing'), pointsLabel(current.pointsToPromotion), about('league_missing')),
      fact(gameText('game.fact.closes'), remaining, about('league_closes')),
      friendsFact,
    ]),
  };
}

function season(view: EngagementWithGame): Body {
  const served = view.game?.season;
  if (served === undefined || served === null) {
    const none = note(gameText('game.season.none'));
    return { value: gameText('game.concept.season.none'), chips: [chip(gameText('game.season.path'), none)], gauge: null, facts: [], primary: none };
  }
  const steps = fraction(served.steps, served.stepsTotal);
  const stars = translateGamePlural(currentInterfaceLanguage(), 'game.season.stars', served.stars);
  const week = formatCount(served.week);
  return {
    value: steps,
    chips: [chip(gameText('game.concept.chip.week', { week }), about('season_week')), chip(stars, about('season_stars'))],
    gauge: ratio(served.steps, served.stepsTotal),
    primary: element('seal'),
    facts: [
      fact(gameText('game.concept.season.name'), formatCount(served.number), about('season')),
      fact(gameText('game.fact.week'), week, about('season_week')),
      fact(gameText('game.fact.steps'), steps, about('season_steps')),
      fact(gameText('game.fact.stars'), formatCount(served.stars), about('season_stars')),
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
    urgent: served.canPrestige ? chip(gameText('game.door.prestige.ready'), element('star')) : null,
    chips: served.canPrestige ? [] : [chip(door, element('star'))],
    gauge: ratio(served.stars, served.max),
    primary: element('star'),
    facts: [
      fact(gameText('game.fact.stars'), stars, element('star')),
      fact(gameText('game.mint.row.glory'), gameText('game.fmt.signed', { value: formatCount(served.gloryOnPass) }), about('prestige_glory')),
    ],
  };
}

function elans(view: EngagementWithGame): Body {
  const elan = view.elan;
  const families = elan?.activeFamilies ?? [];
  const count = elan?.activeFamilyCount ?? 0;
  const active = translateGamePlural(currentInterfaceLanguage(), 'game.concept.elans.families', count);
  const accelerated = elan?.isAccelerated === true;
  const names = families.map((family) => chip(familyName(family), { kind: 'elan', family }));
  const tailwind = view.game?.boosts.tailwind ?? 1;
  return {
    value: accelerated ? factor(elan.factor) : active,
    chips: accelerated
      ? names.length === 0
        ? [chip(active, about('elan_families'))]
        : names
      : names.length === 0
        ? [chip(gameText('game.concept.chip.no_elan'), about('elan_families'))]
        : names,
    gauge: null,
    primary: about('factor'),
    facts: present([
      fact(gameText('game.fact.factor'), factor(accelerated ? elan.factor : 1), about('factor')),
      fact(gameText('game.fact.families'), names.length === 0 ? formatCount(count) : names.map((name) => name.text).join(' · '), about('elan_families')),
      tailwind > 1 ? fact(gameText('game.mint.row.tailwind'), factor(tailwind), about('tailwind')) : null,
    ]),
  };
}

const counted = (done: number, total: number, ref: DetailRef): Body => ({
  value: fraction(done, total),
  chips: [chip(gameText('game.concept.chip.left', { count: formatCount(Math.max(0, total - done)) }), ref)],
  gauge: ratio(done, total),
  primary: ref,
  facts: [fact(gameText('game.fact.earned'), fraction(done, total), ref)],
});

const badges = (view: EngagementWithGame): Body => counted(view.badgesEarned, view.badgesTotal, about('badges_earned'));

function defis(view: EngagementWithGame): Body {
  const sections = view.achievementSections ?? [];
  return counted(
    sections.reduce((sum, section) => sum + section.unlockedCount, 0),
    sections.reduce((sum, section) => sum + section.attainableCount, 0),
    about('defis_earned'),
  );
}

const succes = (view: EngagementWithGame): Body =>
  counted(view.achievements.filter((achievement) => achievement.unlocked).length, view.achievements.length, about('succes_earned'));

function showcase(view: EngagementWithGame): Body {
  const game = view.game;
  const trophies = game?.trophies;
  if (game === undefined || trophies === undefined) return EMPTY;
  const count = trophies.items.length;
  const who = visibilityLabel(game.visibility?.showcase ?? SHOWCASE_DEFAULT_VISIBILITY);
  return {
    value: count === 0 ? gameText('game.door.showcase.empty') : translateGamePlural(currentInterfaceLanguage(), 'game.door.showcase.count', count),
    chips: [chip(gameText('game.concept.chip.seen_by', { who }), about('showcase_visibility'))],
    gauge: null,
    primary: about('trophies'),
    facts: [fact(gameText('game.fact.visibility'), who, about('showcase_visibility'))],
  };
}

function atlas(view: EngagementWithGame): Body {
  const served = view.game?.atlas;
  if (served === undefined) return EMPTY;
  const stamps = fraction(served.stamped, served.total);
  return {
    value: stamps,
    chips: [chip(gameText('game.concept.chip.left', { count: formatCount(Math.max(0, served.total - served.stamped)) }), about('atlas_stamps'))],
    gauge: ratio(served.stamped, served.total),
    primary: about('atlas_stamps'),
    facts: [
      fact(gameText('game.fact.stamps'), stamps, about('atlas_stamps')),
      fact(gameText('game.fact.pending'), formatCount(served.pending.length), about('atlas_pending')),
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
  const chips = [...(urgent === null ? [] : [urgent]), ...body.chips.filter((one) => one.text !== urgent?.text)];
  return {
    key: concept,
    name: gameText(`game.concept.${concept}.name`),
    value: body.value,
    chips: chips.filter((one) => one.text !== body.value).slice(0, MAX_CHIPS),
    urgent: urgent !== null,
    gauge: body.gauge,
    primary: body.primary,
    why: gameText(`game.concept.${concept}.why`),
    how: gameText(`game.concept.${concept}.how`),
    tips: [gameText(`game.concept.${concept}.tip.1`), gameText(`game.concept.${concept}.tip.2`)],
    facts: body.facts.filter((one) => one.value !== body.value),
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
 * LES PIÈCES DE JEU QUI SONT LE HÉROS DE LEUR FICHE (règle 3) — et les données
 * qu'elles montrent déjà, que « Où j'en suis » ne relistera pas. `'all'` : la
 * pièce montre tout ce que le concept sert.
 */
type Piece = { readonly shows: ReadonlySet<string> | 'all' };

function pieceOf(concept: ProgressionConcept, view: EngagementWithGame): Piece | null {
  const game = view.game;
  switch (concept) {
    case 'level':
      return { shows: 'all' };
    case 'meesh':
      if (game !== undefined) return { shows: new Set(['mint_next', 'mint_price', 'mint_glory', 'mint_missing']) };
      return view.meesh === undefined ? null : { shows: 'all' };
    case 'league':
      return game?.league?.access === 'open' && game.league.current !== null
        ? { shows: new Set(['element:gem', 'league_place', 'week_points', 'league_closes']) }
        : null;
    case 'elans':
      return { shows: new Set(['factor', 'elan_families']) };
    default:
      return null;
  }
}

export type FicheView = {
  /** `piece` : la pièce de jeu du concept tient lieu de héros ; `generic` : emblème, valeur, jauge. */
  readonly hero: 'generic' | 'piece';
  /** « Où j'en suis » : ce que le héros ne montre pas déjà. Vide : la section n'est pas rendue. */
  readonly facts: readonly ConceptFact[];
};

export function ficheView(concept: ProgressionConcept, view: EngagementWithGame, now: Date = new Date()): FicheView {
  const piece = pieceOf(concept, view);
  if (piece === null) return { hero: 'generic', facts: conceptView(concept, view, now).facts };
  const { shows } = piece;
  if (shows === 'all') return { hero: 'piece', facts: [] };
  return { hero: 'piece', facts: BODIES[concept](view, now).facts.filter((one) => !shows.has(refKeyOf(one.ref))) };
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
