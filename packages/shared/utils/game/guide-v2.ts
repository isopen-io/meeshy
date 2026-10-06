/**
 * LES MOMENTS DE GUIDE DE LA VAGUE 2 (#9384 à #9389) — ligue, saison, trophée,
 * Prestige, Atlas. `docs/product/jeu-meeshy-conception.html` partie III.2.
 *
 * Ce fichier PROLONGE `guide.ts` sans le toucher : `GuideEvent`, `GUIDE_ACTIONS`
 * et `GUIDE_MOMENT_KEYS` gardent leurs treize moments et leurs vingt et une
 * actions. Un client qui consomme encore la forme actuelle — tables exhaustives
 * `Record<GuideAction, …>`, échantillons par clé — ne bouge pas ; il adopte les
 * nouveaux moments quand il a leur habillage. Le choix d'UNE carte par
 * ouverture d'écran se fait sur l'ensemble : `chooseGuideMomentAny`.
 *
 * Comme `guide.ts`, la loi ne dit rien en toutes lettres : une clé stable, un
 * locuteur, une humeur, les chiffres du moment, l'étape d'après, et si le moment
 * se montre en entier (la première fois) ou en version courte. La clé du moment
 * est la clé « déjà vu » que le serveur garde (`game.guideSeen`).
 */

import { chooseGuideMoment, guideMoment } from './guide.js';
import type { GuideEvent, GuideMoment, GuideMomentKey, GuideMood, GuideSpeaker } from './guide.js';
import type { LeagueKey } from './league.js';
import type { SeasonThemeKey } from './season.js';

/** Les boutons qui mènent à l'étape d'après, en plus de ceux de `GUIDE_ACTIONS`. */
export const GUIDE_ACTIONS_V2 = ['see-league', 'see-season', 'see-trophies', 'see-atlas'] as const;
export type GuideActionV2 = (typeof GUIDE_ACTIONS_V2)[number];

export type GuideEventV2 =
  | { readonly kind: 'league-first'; readonly league: LeagueKey; readonly pointsToPromotion: number | null }
  | { readonly kind: 'league-promoted'; readonly from: LeagueKey; readonly to: LeagueKey; readonly rank: number; readonly weekKey: string }
  | { readonly kind: 'league-relegated'; readonly from: LeagueKey; readonly to: LeagueKey; readonly pointsToPromotion: number | null; readonly weekKey: string }
  | { readonly kind: 'season-start'; readonly season: number; readonly themeKey: SeasonThemeKey; readonly steps: number }
  | { readonly kind: 'season-end'; readonly season: number; readonly stepsReached: number; readonly completed: boolean; readonly gloryGained: number }
  | { readonly kind: 'trophy'; readonly trophyKey: string }
  | { readonly kind: 'prestige'; readonly prestige: number; readonly gloryGained: number }
  | { readonly kind: 'atlas-stamp'; readonly language: string; readonly stamped: number; readonly total: number };

export type GuideMomentKeyV2 = GuideEventV2['kind'];

export const GUIDE_MOMENT_KEYS_V2: readonly GuideMomentKeyV2[] = [
  'league-first',
  'league-promoted',
  'league-relegated',
  'season-start',
  'season-end',
  'trophy',
  'prestige',
  'atlas-stamp',
];

type DataOf<K extends GuideMomentKeyV2> = Omit<Extract<GuideEventV2, { kind: K }>, 'kind'>;

export type GuideMomentV2 = {
  [K in GuideMomentKeyV2]: {
    readonly key: K;
    readonly speaker: GuideSpeaker;
    readonly mood: GuideMood;
    readonly data: DataOf<K>;
    readonly action: GuideActionV2 | 'see-level';
    readonly presentation: 'full' | 'short';
  };
}[GuideMomentKeyV2];

type Persona = { readonly speaker: GuideSpeaker; readonly mood: GuideMood; readonly action: GuideMomentV2['action'] };

function personaOf(event: GuideEventV2): Persona {
  switch (event.kind) {
    case 'league-first':
      return { speaker: 'mee', mood: 'guide', action: 'see-league' };
    case 'league-promoted':
      return { speaker: 'mee', mood: 'cheer', action: 'see-league' };
    case 'league-relegated':
      return { speaker: 'meo', mood: 'calm', action: 'see-league' };
    case 'season-start':
      return { speaker: 'duo', mood: 'cheer', action: 'see-season' };
    case 'season-end':
      return { speaker: 'duo', mood: event.completed ? 'proud' : 'calm', action: 'see-season' };
    case 'trophy':
      return { speaker: 'duo', mood: 'proud', action: 'see-trophies' };
    case 'prestige':
      return { speaker: 'duo', mood: 'proud', action: 'see-level' };
    case 'atlas-stamp':
      return { speaker: 'mee', mood: 'cheer', action: 'see-atlas' };
  }
}

export function guideMomentV2(event: GuideEventV2, seen: Iterable<string>): GuideMomentV2 {
  const { kind, ...data } = event;
  const presentation = new Set(seen).has(kind) ? 'short' : 'full';
  return { key: kind, ...personaOf(event), data, presentation } as GuideMomentV2;
}

/**
 * Du plus important au moins important, sur les vingt et un moments : ce qui
 * change le rang, ce qui se reçoit pour toujours (Prestige, trophée) puis ce qui
 * éteint ou protège passent avant. L'ordre relatif des treize moments actuels
 * est celui de `GUIDE_MOMENT_PRIORITY`, inchangé.
 */
export const GUIDE_MOMENT_PRIORITY_ALL: readonly (GuideMomentKey | GuideMomentKeyV2)[] = [
  'new-rank',
  'prestige',
  'trophy',
  'level-100',
  'first-mint',
  'season-end',
  'flame-out',
  'flame-at-risk',
  'league-promoted',
  'league-relegated',
  'new-tier',
  'season-start',
  'treasury-tier',
  'badge-extinguished',
  'price-rises',
  'atlas-stamp',
  'league-first',
  'first-mint-possible',
  'missions-unlocked',
  'first-level',
  'return-after-absence',
];

const isEventV2 = (event: GuideEvent | GuideEventV2): event is GuideEventV2 =>
  (GUIDE_MOMENT_KEYS_V2 as readonly string[]).includes(event.kind);

/**
 * UNE carte par ouverture d'écran, parmi les événements anciens ET nouveaux :
 * le plus important, un moment encore inédit passant devant un moment déjà vu.
 * Sans événement nouveau, c'est exactement `chooseGuideMoment`.
 */
export function chooseGuideMomentAny(
  events: readonly (GuideEvent | GuideEventV2)[],
  seen: Iterable<string>,
): GuideMoment | GuideMomentV2 | null {
  const seenSet = new Set(seen);
  const legacy = events.filter((e): e is GuideEvent => !isEventV2(e));
  if (legacy.length === events.length) return chooseGuideMoment(legacy, seenSet);
  const rank = (e: GuideEvent | GuideEventV2): number => GUIDE_MOMENT_PRIORITY_ALL.indexOf(e.kind);
  const byPriority = [...events].sort((a, b) => rank(a) - rank(b));
  const chosen = byPriority.find((e) => !seenSet.has(e.kind)) ?? byPriority[0];
  if (chosen === undefined) return null;
  return isEventV2(chosen) ? guideMomentV2(chosen, seenSet) : guideMoment(chosen, seenSet);
}
