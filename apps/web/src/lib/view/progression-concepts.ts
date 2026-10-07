import { LEAGUE_MIN_LEVEL } from '@meeshy/shared/utils/game/league';
import { MISSIONS_MIN_LEVEL } from '@meeshy/shared/utils/game/missions';
import { SHOWCASE_DEFAULT_VISIBILITY } from '@meeshy/shared/utils/game/trophies';
import { progressionConcepts, type ProgressionConcept } from '@meeshy/shared/utils/progression-layout';
import type { EngagementAxisFamily } from '@meeshy/shared/types/engagement';

import type { EngagementWithGame } from '@/lib/api/engagement';
import type { GameDetailFact, GameDetailFamily } from '@/lib/game/detail-families';
import { translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import {
  daysLabel,
  editionName,
  familyName,
  flameFormName,
  formatCount,
  gameText,
  levelTierName,
  meeshCount,
  pointsLabel,
  rankLabel,
  treasuryName,
} from '@/lib/view/game-copy';
import { leagueName, remainingLabel, visibilityLabel, zoneLabel } from '@/lib/view/game-copy-v2';

/**
 * CE QUE CHAQUE CONCEPT DE « PROGRESSION » DIT (#9563) — écrit UNE fois, lu par
 * trois écrans : la carte de la première page (tête, données importantes, à quoi
 * ça sert, comment ça marche), la fiche du concept (toutes ses données) et son
 * bloc au tableau de bord. Trois écrans qui recomposeraient chacun « 2 / 3 »
 * finiraient par ne plus dire le même nombre.
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
  /** Les données importantes de la carte : une à trois, courtes. */
  readonly chips: readonly ConceptChipView[];
  /** La fraction vers l'étape suivante, quand il y en a une. */
  readonly gauge: number | null;
  /** Ce que la valeur ouvre quand on touche l'emblème du héros de la fiche. */
  readonly primary: DetailRef;
  readonly why: string;
  readonly how: string;
  readonly tips: readonly string[];
  /** Toutes les données du concept : la fiche et le tableau de bord. */
  readonly facts: readonly ConceptFact[];
  readonly more: readonly ConceptMore[];
};

type Body = Pick<ConceptView, 'value' | 'chips' | 'gauge' | 'facts' | 'primary'>;

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
  const { level: served, boosts } = game;
  const atTop = served.nextThreshold === null;
  const record = served.record > served.level ? levelValue(served.record) : null;
  return {
    value: levelValue(served.level),
    chips: present([
      chip(levelTierName(served.tier), about('tier')),
      atTop ? chip(gameText('game.banner.top'), element('ring')) : chip(stillMissing(served.pointsToNext), about('level_next')),
      record === null ? null : chip(gameText('game.concept.chip.record', { value: record }), about('level_record')),
    ]),
    gauge: atTop ? null : served.progress,
    primary: element('ring'),
    facts: present([
      fact(gameText('game.fact.tier'), levelTierName(served.tier), about('tier')),
      fact(gameText('game.concept.points.name'), pointsLabel(served.score), about('score')),
      atTop ? null : fact(gameText('game.fact.to_next'), pointsLabel(served.pointsToNext), about('level_next')),
      record === null ? null : fact(gameText('game.fact.record'), record, about('level_record')),
      boosts.tailwind > 1 ? fact(gameText('game.mint.row.tailwind'), factor(boosts.tailwind), about('tailwind')) : null,
      served.prestige > 0 ? fact(gameText('game.concept.prestige.name'), formatCount(served.prestige), element('star')) : null,
    ]),
  };
}

function points(view: EngagementWithGame): Body {
  const game = view.game;
  if (game === undefined) return { ...EMPTY, value: pointsLabel(view.level.value) };
  const { level: served, mint, boosts } = game;
  const elan = view.elan;
  const multiplier = elan?.isAccelerated === true ? elan.factor : boosts.tailwind > 1 ? boosts.tailwind : null;
  return {
    value: pointsLabel(served.score),
    chips: present([
      mint.canMint ? chip(gameText('game.concept.chip.can_mint'), about('can_mint')) : chip(stillMissing(mint.missingPoints), about('mint_missing')),
      multiplier === null ? null : chip(gameText('game.concept.chip.factor', { factor: formatCount(multiplier) }), about('factor')),
    ]),
    gauge: mint.canMint ? 1 : ratio(mint.price - mint.missingPoints, mint.price),
    primary: about('score'),
    facts: present([
      fact(gameText('game.fact.balance'), pointsLabel(served.score), about('score')),
      fact(gameText('game.fact.next_meesh'), pointsLabel(mint.price), about('mint_price')),
      mint.canMint ? null : fact(gameText('game.fact.missing'), pointsLabel(mint.missingPoints), about('mint_missing')),
      multiplier === null ? null : fact(gameText('game.fact.factor'), factor(multiplier), about('factor')),
    ]),
  };
}

function meesh(view: EngagementWithGame): Body {
  const game = view.game;
  const wallet = view.meesh;
  const minted = wallet === undefined ? null : fact(gameText('game.fact.minted'), formatCount(wallet.mintedLifetime), about('minted'));
  if (game === undefined) {
    if (wallet === undefined) return { ...EMPTY, value: meeshCount(0), primary: about('minted') };
    const state = wallet.canMint
      ? chip(gameText('game.concept.chip.can_mint'), about('can_mint'))
      : chip(stillMissing(wallet.missingPoints), about('mint_missing'));
    return {
      value: meeshCount(wallet.balance),
      chips: [chip(gameText('game.concept.chip.next_price', { price: pointsLabel(wallet.mintCost) }), about('mint_price')), state],
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
    chips: present([
      chip(gameText('game.concept.chip.next_price', { price: pointsLabel(mint.price) }), about('mint_price')),
      mint.canMint ? chip(gameText('game.concept.chip.can_mint'), about('can_mint')) : chip(stillMissing(mint.missingPoints), about('mint_missing')),
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
      mint.canMint ? null : fact(gameText('game.fact.missing'), pointsLabel(mint.missingPoints), about('mint_missing')),
      fact(gameText('game.mint.row.glory'), gameText('game.fmt.signed', { value: formatCount(mint.gloryGained) }), about('mint_glory')),
      minted,
    ]),
  };
}

function glory(view: EngagementWithGame): Body {
  const served = view.game?.glory;
  if (served === undefined) return EMPTY;
  const next = served.next === null ? null : rankLabel(served.next.rank, served.next.division);
  const rank = rankLabel(served.rank, served.division);
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

function missions(view: EngagementWithGame): Body {
  const game = view.game;
  if (game === undefined) return EMPTY;
  const { missions: served, chest } = game;
  const chestState = gameText(`game.concept.chip.chest.${chest.status}`);
  const chestFact = fact(gameText('game.chest.title'), chestState, element('chest'));
  if (!served.unlocked) {
    const locked = gameText('game.missions.locked', { level: formatCount(game.level.level) });
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
  return {
    value: fraction(done, total),
    chips: present([
      chip(chestState, element('chest')),
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
    const locked = gameText('game.league.locked', { level: formatCount(LEAGUE_MIN_LEVEL), current: formatCount(game.level.level) });
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
    value: gameText('game.concept.league.value', { league: leagueName(current.league), rank: formatCount(current.rank) }),
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
  const door = served.canPrestige
    ? gameText('game.door.prestige.ready')
    : served.stars >= served.max
      ? gameText('game.banner.top')
      : gameText('game.door.prestige.locked');
  return {
    value: translateGamePlural(currentInterfaceLanguage(), 'game.season.stars', served.stars),
    chips: [chip(stars, element('star')), chip(door, element('star'))],
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
  return {
    value: accelerated ? factor(elan.factor) : active,
    chips: accelerated
      ? [
          chip(gameText('game.concept.chip.factor', { factor: formatCount(elan.factor) }), about('factor')),
          ...(names.length === 0 ? [chip(active, about('elan_families'))] : names),
        ]
      : names.length === 0
        ? [chip(gameText('game.concept.chip.no_elan'), about('elan_families'))]
        : names,
    gauge: null,
    primary: about('factor'),
    facts: [
      fact(gameText('game.fact.factor'), factor(accelerated ? elan.factor : 1), about('factor')),
      fact(gameText('game.fact.families'), names.length === 0 ? formatCount(count) : names.map((name) => name.text).join(' · '), about('elan_families')),
    ],
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
    facts: [
      fact(gameText('game.fact.trophies'), formatCount(count), about('trophies')),
      fact(gameText('game.fact.visibility'), who, about('showcase_visibility')),
    ],
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

/** La sous-page de chaque concept qui en a une ; les concepts du jeu de base mènent au carnet des règles. */
const PAGES: Readonly<Partial<Record<ProgressionConcept, ConceptRoute>>> = {
  league: 'progressionLigue',
  season: 'progressionSaison',
  prestige: 'progressionPrestige',
  badges: 'progressionBadges',
  defis: 'progressionDefis',
  succes: 'progressionSucces',
  showcase: 'progressionVitrine',
  atlas: 'progressionAtlas',
};

type PagedConcept = 'league' | 'season' | 'prestige' | 'badges' | 'defis' | 'succes' | 'showcase' | 'atlas';

const isPaged = (concept: ProgressionConcept): concept is PagedConcept => Object.hasOwn(PAGES, concept);

function moreOf(concept: ProgressionConcept, playing: boolean): readonly ConceptMore[] {
  const page = PAGES[concept];
  const own = page === undefined || !isPaged(concept) ? [] : [{ to: page, label: gameText(`game.concept.${concept}.more`) }];
  return playing ? [...own, { to: 'progressionRegles', label: gameText('game.door.rules') }] : own;
}

export function conceptView(concept: ProgressionConcept, view: EngagementWithGame, now: Date = new Date()): ConceptView {
  const body = BODIES[concept](view, now);
  return {
    key: concept,
    name: gameText(`game.concept.${concept}.name`),
    value: body.value,
    chips: body.chips.slice(0, MAX_CHIPS),
    gauge: body.gauge,
    primary: body.primary,
    why: gameText(`game.concept.${concept}.why`),
    how: gameText(`game.concept.${concept}.how`),
    tips: [gameText(`game.concept.${concept}.tip.1`), gameText(`game.concept.${concept}.tip.2`)],
    facts: body.facts,
    more: moreOf(concept, view.game !== undefined),
  };
}

/**
 * « Jeu masqué » (#9481) : sur cet appareil, la progression se lit comme devant
 * un serveur qui ne sert pas le jeu, et le niveau, les Meeshes et la Flamme — que
 * le jeu redéfinit — se taisent aussi. Les fiches et le tableau de bord lisent la
 * MÊME vue que la première page.
 */
const HIDDEN_WITH_GAME: readonly ProgressionConcept[] = ['level', 'meesh', 'flame'];

export function shownProgress(view: EngagementWithGame, hidden: boolean): EngagementWithGame {
  if (!hidden || view.game === undefined) return view;
  const { game: _game, mintBadgeLoss: _loss, mintBadgeRegain: _regain, ...before } = view;
  return before;
}

export function shownConcepts(view: EngagementWithGame, hidden: boolean): readonly ProgressionConcept[] {
  const concepts = progressionConcepts(shownProgress(view, hidden));
  return hidden && view.game !== undefined ? concepts.filter((concept) => !HIDDEN_WITH_GAME.includes(concept)) : concepts;
}

const CONCEPT_KEYS: ReadonlySet<string> = new Set<string>(Object.keys(BODIES));

export const isProgressionConcept = (value: string): value is ProgressionConcept => CONCEPT_KEYS.has(value);
