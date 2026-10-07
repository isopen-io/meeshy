import { LEAGUE_MIN_LEVEL } from '@meeshy/shared/utils/game/league';
import { MISSIONS_MIN_LEVEL } from '@meeshy/shared/utils/game/missions';
import { SHOWCASE_DEFAULT_VISIBILITY } from '@meeshy/shared/utils/game/trophies';
import { progressionConcepts, type ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import type { EngagementWithGame } from '@/lib/api/engagement';
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

export type ConceptFact = { readonly label: string; readonly value: string };

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
  readonly chips: readonly string[];
  /** La fraction vers l'étape suivante, quand il y en a une. */
  readonly gauge: number | null;
  readonly why: string;
  readonly how: string;
  readonly tips: readonly string[];
  /** Toutes les données du concept : la fiche et le tableau de bord. */
  readonly facts: readonly ConceptFact[];
  readonly more: readonly ConceptMore[];
};

type Body = Pick<ConceptView, 'value' | 'chips' | 'gauge' | 'facts'>;

const MAX_CHIPS = 3;

const fraction = (done: number, total: number): string =>
  gameText('game.fmt.fraction', { done: formatCount(done), total: formatCount(total) });

const ratio = (done: number, total: number): number | null => (total <= 0 ? null : Math.min(1, Math.max(0, done / total)));

const levelValue = (level: number): string => gameText('game.banner.level', { level: formatCount(level) });

const stillMissing = (points: number): string => gameText('game.banner.missing', { points: pointsLabel(points) });

const factor = (value: number): string => `×${formatCount(value)}`;

const present = <T,>(items: readonly (T | null)[]): readonly T[] => items.filter((item): item is T => item !== null);

const fact = (label: string, value: string): ConceptFact => ({ label, value });

function level(view: EngagementWithGame): Body {
  const game = view.game;
  if (game === undefined) {
    const { level: current, value, nextThreshold, progress } = view.level;
    const missing = nextThreshold === null ? null : nextThreshold - value;
    return {
      value: levelValue(current),
      chips: present([pointsLabel(value), missing === null ? null : stillMissing(missing)]),
      gauge: missing === null ? null : progress,
      facts: present([
        fact(gameText('game.concept.points.name'), pointsLabel(value)),
        missing === null ? null : fact(gameText('game.fact.to_next'), pointsLabel(missing)),
      ]),
    };
  }
  const { level: served, boosts } = game;
  const atTop = served.nextThreshold === null;
  const record = served.record > served.level ? levelValue(served.record) : null;
  return {
    value: levelValue(served.level),
    chips: present([
      levelTierName(served.tier),
      atTop ? gameText('game.banner.top') : stillMissing(served.pointsToNext),
      record === null ? null : gameText('game.concept.chip.record', { value: record }),
    ]),
    gauge: atTop ? null : served.progress,
    facts: present([
      fact(gameText('game.fact.tier'), levelTierName(served.tier)),
      fact(gameText('game.concept.points.name'), pointsLabel(served.score)),
      atTop ? null : fact(gameText('game.fact.to_next'), pointsLabel(served.pointsToNext)),
      record === null ? null : fact(gameText('game.fact.record'), record),
      boosts.tailwind > 1 ? fact(gameText('game.mint.row.tailwind'), factor(boosts.tailwind)) : null,
      served.prestige > 0 ? fact(gameText('game.concept.prestige.name'), formatCount(served.prestige)) : null,
    ]),
  };
}

function points(view: EngagementWithGame): Body {
  const game = view.game;
  if (game === undefined) return { value: pointsLabel(view.level.value), chips: [], gauge: null, facts: [] };
  const { level: served, mint, boosts } = game;
  const elan = view.elan;
  const multiplier = elan?.isAccelerated === true ? elan.factor : boosts.tailwind > 1 ? boosts.tailwind : null;
  return {
    value: pointsLabel(served.score),
    chips: present([
      mint.canMint ? gameText('game.concept.chip.can_mint') : stillMissing(mint.missingPoints),
      multiplier === null ? null : gameText('game.concept.chip.factor', { factor: formatCount(multiplier) }),
    ]),
    gauge: mint.canMint ? 1 : ratio(mint.price - mint.missingPoints, mint.price),
    facts: present([
      fact(gameText('game.fact.balance'), pointsLabel(served.score)),
      fact(gameText('game.fact.next_meesh'), pointsLabel(mint.price)),
      mint.canMint ? null : fact(gameText('game.fact.missing'), pointsLabel(mint.missingPoints)),
      multiplier === null ? null : fact(gameText('game.fact.factor'), factor(multiplier)),
    ]),
  };
}

function meesh(view: EngagementWithGame): Body {
  const game = view.game;
  const wallet = view.meesh;
  const minted = wallet === undefined ? null : fact(gameText('game.fact.minted'), formatCount(wallet.mintedLifetime));
  if (game === undefined) {
    if (wallet === undefined) return { value: meeshCount(0), chips: [], gauge: null, facts: [] };
    const state = wallet.canMint ? gameText('game.concept.chip.can_mint') : stillMissing(wallet.missingPoints);
    return {
      value: meeshCount(wallet.balance),
      chips: [gameText('game.concept.chip.next_price', { price: pointsLabel(wallet.mintCost) }), state],
      gauge: wallet.progress,
      facts: present([
        fact(gameText('game.fact.balance'), meeshCount(wallet.balance)),
        fact(gameText('game.mint.row.price'), pointsLabel(wallet.mintCost)),
        wallet.canMint ? null : fact(gameText('game.fact.missing'), pointsLabel(wallet.missingPoints)),
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
      gameText('game.concept.chip.next_price', { price: pointsLabel(mint.price) }),
      mint.canMint ? gameText('game.concept.chip.can_mint') : stillMissing(mint.missingPoints),
      treasury.tier === null ? null : treasuryName(treasury.tier),
    ]),
    gauge: null,
    facts: present([
      fact(gameText('game.fact.balance'), meeshCount(balance)),
      treasury.tier === null ? null : fact(gameText('game.gauge.treasury'), treasuryName(treasury.tier)),
      nextTier === null ? null : fact(gameText('game.fact.next_tier'), nextTier),
      fact(
        gameText('game.fact.next_meesh'),
        `${gameText('game.mint.number_label', { number: formatCount(mint.number) })} · ${editionName(mint.edition)}`,
      ),
      fact(gameText('game.mint.row.price'), pointsLabel(mint.price)),
      mint.canMint ? null : fact(gameText('game.fact.missing'), pointsLabel(mint.missingPoints)),
      fact(gameText('game.mint.row.glory'), gameText('game.fmt.signed', { value: formatCount(mint.gloryGained) })),
      minted,
    ]),
  };
}

function glory(view: EngagementWithGame): Body {
  const served = view.game?.glory;
  if (served === undefined) return { value: '', chips: [], gauge: null, facts: [] };
  const next = served.next === null ? null : rankLabel(served.next.rank, served.next.division);
  const rank = rankLabel(served.rank, served.division);
  return {
    value: rank,
    chips: [
      gameText('game.rank.glory', { glory: formatCount(served.glory) }),
      next === null ? gameText('game.rank.top') : gameText('game.concept.chip.next', { name: next }),
    ],
    gauge: next === null ? null : served.progress,
    facts: present([
      fact(gameText('game.mint.row.glory'), formatCount(served.glory)),
      fact(gameText('game.gauge.rank'), rank),
      next === null ? null : fact(gameText('game.fact.next_rank'), next),
      served.gloryMissing === null ? null : fact(gameText('game.fact.missing'), formatCount(served.gloryMissing)),
    ]),
  };
}

type FlameStatus = NonNullable<EngagementWithGame['game']>['flame']['status'];

const flameState = (status: FlameStatus): string => {
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
  const record = gameText('game.concept.chip.record', { value: daysLabel(view.streak.longestDays) });
  const recordFact = fact(gameText('game.fact.record'), daysLabel(view.streak.longestDays));
  if (served === undefined) {
    const days = view.streak.currentDays;
    return { value: streakValue(days), chips: [record], gauge: null, facts: [fact(gameText('game.fact.streak'), streakValue(days)), recordFact] };
  }
  const freezes = fraction(served.freezes, served.maxFreezes);
  return {
    value: streakValue(served.days),
    chips: present([
      served.form === null ? null : flameFormName(served.form),
      gameText('game.concept.chip.freezes', { count: freezes }),
      view.streak.longestDays > 0 ? record : null,
    ]),
    gauge: null,
    facts: present([
      fact(gameText('game.fact.streak'), streakValue(served.days)),
      served.form === null
        ? null
        : fact(
            gameText('game.fact.form'),
            gameText('game.flame.form_line', { form: flameFormName(served.form), bonus: formatCount(Math.min(100, Math.max(0, served.bonusPercent))) }),
          ),
      fact(gameText('game.fact.freezes'), freezes),
      view.streak.longestDays > 0 ? recordFact : null,
      fact(gameText('game.fact.state'), flameState(served.status)),
    ]),
  };
}

function missions(view: EngagementWithGame): Body {
  const game = view.game;
  if (game === undefined) return { value: '', chips: [], gauge: null, facts: [] };
  const { missions: served, chest } = game;
  const chestState = gameText(`game.concept.chip.chest.${chest.status}`);
  const chestFact = fact(gameText('game.chest.title'), chestState);
  if (!served.unlocked) {
    return {
      value: levelValue(MISSIONS_MIN_LEVEL),
      chips: [gameText('game.door.league.locked', { level: formatCount(MISSIONS_MIN_LEVEL) })],
      gauge: null,
      facts: [chestFact],
    };
  }
  const done = served.items.filter((item) => item.completedAt !== null).length;
  const total = served.items.length;
  return {
    value: fraction(done, total),
    chips: present([chestState, served.prismDay ? gameText('game.mission.prism') : null]),
    gauge: ratio(done, total),
    facts: [fact(gameText('game.fact.done'), fraction(done, total)), chestFact],
  };
}

function league(view: EngagementWithGame, now: Date): Body {
  const served = view.game?.league;
  if (served === undefined) return { value: '', chips: [], gauge: null, facts: [] };
  const friends = gameText('game.league.rank_line', { rank: formatCount(served.friends.rank), size: formatCount(served.friends.size) });
  const friendsFact = fact(gameText('game.league.friends.title'), friends);
  if (served.access === 'locked') {
    return {
      value: levelValue(LEAGUE_MIN_LEVEL),
      chips: [gameText('game.door.league.locked', { level: formatCount(LEAGUE_MIN_LEVEL) })],
      gauge: null,
      facts: [friendsFact],
    };
  }
  const current = served.current;
  if (served.access !== 'open' || current === null) {
    return { value: gameText('game.concept.league.unplaced'), chips: [gameText('game.league.friends.title')], gauge: null, facts: [friendsFact] };
  }
  const place = gameText('game.league.rank_line', { rank: formatCount(current.rank), size: formatCount(current.groupSize) });
  const remaining = remainingLabel(served.closes, now);
  return {
    value: gameText('game.concept.league.value', { league: leagueName(current.league), rank: formatCount(current.rank) }),
    chips: [place, pointsLabel(current.weekPoints), gameText('game.league.closes', { remaining })],
    gauge: null,
    facts: present([
      fact(gameText('game.league.title'), leagueName(current.league)),
      fact(gameText('game.fact.group'), place),
      fact(gameText('game.fact.week_points'), pointsLabel(current.weekPoints)),
      fact(gameText('game.fact.state'), zoneLabel(current.zone)),
      current.pointsToPromotion === null || current.pointsToPromotion === 0
        ? null
        : fact(gameText('game.fact.missing'), pointsLabel(current.pointsToPromotion)),
      fact(gameText('game.fact.closes'), remaining),
      friendsFact,
    ]),
  };
}

function season(view: EngagementWithGame): Body {
  const served = view.game?.season;
  if (served === undefined || served === null) {
    return { value: gameText('game.concept.season.none'), chips: [gameText('game.season.path')], gauge: null, facts: [] };
  }
  const steps = fraction(served.steps, served.stepsTotal);
  const stars = translateGamePlural(currentInterfaceLanguage(), 'game.season.stars', served.stars);
  const week = formatCount(served.week);
  return {
    value: steps,
    chips: [gameText('game.concept.chip.week', { week }), stars],
    gauge: ratio(served.steps, served.stepsTotal),
    facts: [
      fact(gameText('game.concept.season.name'), formatCount(served.number)),
      fact(gameText('game.fact.week'), week),
      fact(gameText('game.fact.steps'), steps),
      fact(gameText('game.fact.stars'), formatCount(served.stars)),
    ],
  };
}

function prestige(view: EngagementWithGame): Body {
  const served = view.game?.prestige;
  if (served === undefined) return { value: '', chips: [], gauge: null, facts: [] };
  const stars = fraction(served.stars, served.max);
  const door = served.canPrestige
    ? gameText('game.door.prestige.ready')
    : served.stars >= served.max
      ? gameText('game.banner.top')
      : gameText('game.door.prestige.locked');
  return {
    value: translateGamePlural(currentInterfaceLanguage(), 'game.season.stars', served.stars),
    chips: [stars, door],
    gauge: ratio(served.stars, served.max),
    facts: [
      fact(gameText('game.fact.stars'), stars),
      fact(gameText('game.mint.row.glory'), gameText('game.fmt.signed', { value: formatCount(served.gloryOnPass) })),
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
  return {
    value: accelerated ? factor(elan.factor) : active,
    chips: accelerated
      ? [gameText('game.concept.chip.factor', { factor: formatCount(elan.factor) }), ...(names.length === 0 ? [active] : names)]
      : names.length === 0
        ? [gameText('game.concept.chip.no_elan')]
        : names,
    gauge: null,
    facts: present([
      fact(gameText('game.fact.factor'), factor(accelerated ? elan.factor : 1)),
      fact(gameText('game.fact.families'), names.length === 0 ? formatCount(count) : names.join(' · ')),
    ]),
  };
}

const counted = (done: number, total: number): Body => ({
  value: fraction(done, total),
  chips: [gameText('game.concept.chip.left', { count: formatCount(Math.max(0, total - done)) })],
  gauge: ratio(done, total),
  facts: [fact(gameText('game.fact.earned'), fraction(done, total))],
});

const badges = (view: EngagementWithGame): Body => counted(view.badgesEarned, view.badgesTotal);

function defis(view: EngagementWithGame): Body {
  const sections = view.achievementSections ?? [];
  return counted(
    sections.reduce((sum, section) => sum + section.unlockedCount, 0),
    sections.reduce((sum, section) => sum + section.attainableCount, 0),
  );
}

const succes = (view: EngagementWithGame): Body =>
  counted(view.achievements.filter((achievement) => achievement.unlocked).length, view.achievements.length);

function showcase(view: EngagementWithGame): Body {
  const game = view.game;
  const trophies = game?.trophies;
  if (game === undefined || trophies === undefined) return { value: '', chips: [], gauge: null, facts: [] };
  const count = trophies.items.length;
  const who = visibilityLabel(game.visibility?.showcase ?? SHOWCASE_DEFAULT_VISIBILITY);
  return {
    value: count === 0 ? gameText('game.door.showcase.empty') : translateGamePlural(currentInterfaceLanguage(), 'game.door.showcase.count', count),
    chips: [gameText('game.concept.chip.seen_by', { who })],
    gauge: null,
    facts: [fact(gameText('game.fact.trophies'), formatCount(count)), fact(gameText('game.fact.visibility'), who)],
  };
}

function atlas(view: EngagementWithGame): Body {
  const served = view.game?.atlas;
  if (served === undefined) return { value: '', chips: [], gauge: null, facts: [] };
  const stamps = fraction(served.stamped, served.total);
  return {
    value: stamps,
    chips: [gameText('game.concept.chip.left', { count: formatCount(Math.max(0, served.total - served.stamped)) })],
    gauge: ratio(served.stamped, served.total),
    facts: [fact(gameText('game.fact.stamps'), stamps), fact(gameText('game.fact.pending'), formatCount(served.pending.length))],
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
