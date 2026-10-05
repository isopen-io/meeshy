/**
 * MEE ET MEO, LES GUIDES DU JEU (#9373) — la loi qui choisit le moment.
 * `docs/product/jeu-meeshy-conception.html` partie III.
 *
 * Comme `mascotMoment` (`utils/mascot.ts`, inchangé), cette loi ne dit RIEN en
 * toutes lettres : elle rend une clé stable, un locuteur, une humeur, les
 * chiffres du moment, l'étape d'après, et si le moment se montre EN ENTIER (la
 * première fois) ou en version COURTE. Les clients habillent le personnage et
 * localisent, dans les sept langues, la même chose au même moment.
 *
 * Les clés « déjà vues » sont les clés des moments (`GuideMomentKey`) et, pour
 * l'intégration, `onboardingStepSeenKey(étape)` ; le serveur les garde
 * (`POST /me/game/guide/seen`) et les sert dans `game.guideSeen`.
 *
 * Une seule carte par ouverture d'écran (`chooseGuideMoment`). Jamais dans une
 * conversation : seulement sur Progression, après une célébration et pendant
 * l'intégration — c'est une règle d'AFFICHAGE, que la loi ne peut pas tenir.
 */

import type { GloryDivision, GloryRankOrMythic } from './glory.js';
import type { LevelTierKey } from './levels.js';
import type { TreasuryTierKey } from './treasury.js';

export type GuideSpeaker = 'mee' | 'meo' | 'duo';

/** `cheer` à `counting` reprennent `MascotMood` ; `calm`, `sad` et `proud` sont propres aux guides. */
export type GuideMood = 'cheer' | 'minting' | 'ready' | 'guide' | 'streak' | 'counting' | 'calm' | 'sad' | 'proud';

/** Le bouton qui mène à l'étape d'après — le client en fait un lien profond. */
export const GUIDE_ACTIONS = [
  'start-game',
  'earn-first-points',
  'see-level',
  'see-missions',
  'see-flame',
  'see-meeshes',
  'see-rank',
  'take-start-photo',
  'see-progress',
  'see-next-tier',
  'open-first-mission',
  'mint-or-climb',
  'regain-levels',
  'relight-badge',
  'see-mint-preview',
  'take-photo',
  'keep-or-spend',
  'do-easy-mission-or-freeze',
  'relight-flame',
  'do-easiest-mission',
  'prestige-or-stay',
] as const;

export type GuideAction = (typeof GUIDE_ACTIONS)[number];

export const ONBOARDING_STEP_KEYS = ['welcome', 'first-points', 'levels', 'missions', 'flame', 'mint', 'rank'] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export type OnboardingStep = {
  readonly key: OnboardingStepKey;
  /** 1 à 7. */
  readonly index: number;
  readonly speaker: GuideSpeaker;
  readonly mood: GuideMood;
  readonly action: GuideAction;
};

const step = (
  key: OnboardingStepKey,
  speaker: GuideSpeaker,
  mood: GuideMood,
  action: GuideAction,
): OnboardingStep => ({ key, index: ONBOARDING_STEP_KEYS.indexOf(key) + 1, speaker, mood, action });

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  step('welcome', 'mee', 'guide', 'earn-first-points'),
  step('first-points', 'mee', 'cheer', 'see-level'),
  step('levels', 'meo', 'guide', 'see-missions'),
  step('missions', 'mee', 'ready', 'see-flame'),
  step('flame', 'meo', 'calm', 'see-meeshes'),
  step('mint', 'duo', 'minting', 'see-rank'),
  step('rank', 'meo', 'guide', 'take-start-photo'),
];

export const onboardingStepSeenKey = (key: OnboardingStepKey): string => `onboarding.${key}`;

/** La première étape non vue, `null` quand l'intégration est terminée. */
export const nextOnboardingStep = (seen: Iterable<string>): OnboardingStep | null => {
  const done = new Set(seen);
  return ONBOARDING_STEPS.find((s) => !done.has(onboardingStepSeenKey(s.key))) ?? null;
};

export type GuideEvent =
  | { readonly kind: 'first-level'; readonly level: number; readonly pointsToNext: number }
  | { readonly kind: 'new-tier'; readonly tier: LevelTierKey; readonly nextTierLevel: number | null }
  | { readonly kind: 'missions-unlocked' }
  | { readonly kind: 'first-mint-possible'; readonly price: number; readonly levelsLost: number; readonly gloryGain: number }
  | { readonly kind: 'first-mint'; readonly levelBefore: number; readonly levelAfter: number; readonly tailwindUntilLevel: number }
  | { readonly kind: 'badge-extinguished'; readonly missingActions: number }
  | { readonly kind: 'price-rises'; readonly nextPrice: number }
  | {
      readonly kind: 'new-rank';
      readonly rank: GloryRankOrMythic;
      readonly division: GloryDivision | null;
      readonly glory: number;
      readonly gloryMissing: number | null;
    }
  | { readonly kind: 'treasury-tier'; readonly tier: TreasuryTierKey; readonly nextTierMissing: number | null }
  | { readonly kind: 'flame-at-risk'; readonly days: number }
  | { readonly kind: 'flame-out'; readonly lostDays: number; readonly relightPrice: number; readonly canRelight: boolean }
  | { readonly kind: 'return-after-absence'; readonly daysAway: number }
  | { readonly kind: 'level-100'; readonly canPrestige: boolean };

export type GuideMomentKey = GuideEvent['kind'];

export const GUIDE_MOMENT_KEYS: readonly GuideMomentKey[] = [
  'first-level',
  'new-tier',
  'missions-unlocked',
  'first-mint-possible',
  'first-mint',
  'badge-extinguished',
  'price-rises',
  'new-rank',
  'treasury-tier',
  'flame-at-risk',
  'flame-out',
  'return-after-absence',
  'level-100',
];

type DataOf<K extends GuideMomentKey> = Omit<Extract<GuideEvent, { kind: K }>, 'kind'>;

export type GuideMoment = {
  [K in GuideMomentKey]: {
    readonly key: K;
    readonly speaker: GuideSpeaker;
    readonly mood: GuideMood;
    readonly data: DataOf<K>;
    readonly action: GuideAction;
    /** `full` la première fois, `short` quand la clé est déjà vue — « ? » rouvre toujours la version complète. */
    readonly presentation: 'full' | 'short';
  };
}[GuideMomentKey];

type Persona = { readonly speaker: GuideSpeaker; readonly mood: GuideMood; readonly action: GuideAction };

const PERSONA: Readonly<Record<GuideMomentKey, Persona>> = {
  'first-level': { speaker: 'mee', mood: 'cheer', action: 'see-progress' },
  'new-tier': { speaker: 'duo', mood: 'cheer', action: 'see-next-tier' },
  'missions-unlocked': { speaker: 'mee', mood: 'guide', action: 'open-first-mission' },
  'first-mint-possible': { speaker: 'meo', mood: 'ready', action: 'mint-or-climb' },
  'first-mint': { speaker: 'duo', mood: 'minting', action: 'regain-levels' },
  'badge-extinguished': { speaker: 'meo', mood: 'calm', action: 'relight-badge' },
  'price-rises': { speaker: 'meo', mood: 'calm', action: 'see-mint-preview' },
  'new-rank': { speaker: 'duo', mood: 'proud', action: 'take-photo' },
  'treasury-tier': { speaker: 'mee', mood: 'cheer', action: 'keep-or-spend' },
  'flame-at-risk': { speaker: 'meo', mood: 'calm', action: 'do-easy-mission-or-freeze' },
  'flame-out': { speaker: 'meo', mood: 'sad', action: 'relight-flame' },
  'return-after-absence': { speaker: 'mee', mood: 'guide', action: 'do-easiest-mission' },
  'level-100': { speaker: 'duo', mood: 'proud', action: 'prestige-or-stay' },
};

/** Du plus important au moins important : ce qui change le rang ou éteint la Flamme passe avant. */
export const GUIDE_MOMENT_PRIORITY: readonly GuideMomentKey[] = [
  'new-rank',
  'level-100',
  'first-mint',
  'flame-out',
  'flame-at-risk',
  'new-tier',
  'treasury-tier',
  'badge-extinguished',
  'price-rises',
  'first-mint-possible',
  'missions-unlocked',
  'first-level',
  'return-after-absence',
];

export function guideMoment(event: GuideEvent, seen: Iterable<string>): GuideMoment {
  const { kind, ...data } = event;
  const persona = PERSONA[kind];
  const presentation = new Set(seen).has(kind) ? 'short' : 'full';
  return { key: kind, ...persona, data, presentation } as GuideMoment;
}

/**
 * UNE carte par ouverture d'écran : parmi les événements du moment, le plus
 * important, un moment encore inédit passant devant un moment déjà vu de
 * priorité voisine (un moment vu n'est montré qu'en l'absence d'inédit).
 */
export function chooseGuideMoment(events: readonly GuideEvent[], seen: Iterable<string>): GuideMoment | null {
  const seenSet = new Set(seen);
  const rank = (e: GuideEvent): number => GUIDE_MOMENT_PRIORITY.indexOf(e.kind);
  const byPriority = [...events].sort((a, b) => rank(a) - rank(b));
  const chosen = byPriority.find((e) => !seenSet.has(e.kind)) ?? byPriority[0];
  return chosen === undefined ? null : guideMoment(chosen, seenSet);
}
