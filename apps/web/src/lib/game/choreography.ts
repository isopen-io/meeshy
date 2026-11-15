import type { HapticName } from './haptics';

/**
 * LES CHORÉGRAPHIES DU JEU (#9381) — conception, partie V, en plans DÉCLARATIFS.
 *
 * Un plan est une donnée : des gestes (une cible, des images clés, un délai, une
 * durée), des REPÈRES (`beats` : « tchak », « reflet », « ouvre ») que l'hôte
 * écoute pour lancer un effet WebGL ou changer un état, et des tapes haptiques.
 * `play.ts` rejoue un plan avec les Web Animations ; rien ici ne touche le DOM,
 * si bien que la forme de chaque geste se teste sans navigateur.
 *
 * RÈGLE DU COMPOSITEUR : les images clés n'écrivent que `transform` et
 * `opacity` (jamais une propriété de mise en page). Les cibles sont des
 * attributs `data-game-*` posés par les composants de `components/game/` ; une
 * cible qui n'existe pas dans l'hôte est un geste qui ne joue pas, jamais une
 * erreur.
 *
 * DEUX RÈGLES DE REMPLISSAGE, parce que l'élément animé a un état FINAL dans le
 * DOM que l'hôte a déjà posé :
 *   · `both`     — le geste démarre CACHÉ : la première image s'applique dès le
 *                  début, pendant le délai (une pièce qui n'est pas encore
 *                  frappée ne se montre pas) ;
 *   · `forwards` — le geste n'a pas de première image à imposer : avant son
 *                  départ, l'élément montre son état courant ; après sa fin, il
 *                  garde sa dernière image jusqu'à ce que le plan s'achève.
 * Quand le plan s'achève, toutes les animations sont annulées : l'élément
 * retrouve l'état du DOM, que la dernière image de chaque chaîne reproduit.
 */

export type ChoreographyKind = 'mint' | 'rank' | 'levelGain' | 'levelLoss' | 'badgeLight' | 'badgeExtinguish' | 'chest' | 'prestige';

export const CHOREOGRAPHY_DURATION_MS = {
  mint: 1200,
  rank: 1600,
  levelGain: 600,
  levelLoss: 800,
  badgeLight: 700,
  badgeExtinguish: 700,
  chest: 1400,
  prestige: 2000,
} as const satisfies Readonly<Record<ChoreographyKind, number>>;

export type ChoreographyFill = 'both' | 'forwards';

export type ChoreographyStep = {
  /** Un sélecteur CSS cherché dans la racine, ou `&` pour la racine elle-même. */
  readonly target: string;
  readonly keyframes: readonly Keyframe[];
  readonly delayMs: number;
  readonly durationMs: number;
  readonly easing: string;
  readonly fill: ChoreographyFill;
  /** Décalage entre deux éléments qui répondent au même sélecteur (les tenants, les récompenses). */
  readonly staggerMs?: number;
  /** Le nombre d'éléments attendus pour `staggerMs` (la borne de durée en dépend). */
  readonly count?: number;
  /** La cible n'existe pas au départ du plan : on la cherche au moment du geste (l'empreinte du badge éteint). */
  readonly late?: true;
};

export type ChoreographyBeat = { readonly name: 'strike' | 'shine' | 'ignite' | 'swap' | 'open'; readonly atMs: number };
export type HapticBeat = { readonly atMs: number; readonly haptic: HapticName };

export type ChoreographyPlan = {
  readonly kind: ChoreographyKind;
  readonly durationMs: number;
  readonly steps: readonly ChoreographyStep[];
  readonly beats: readonly ChoreographyBeat[];
  readonly haptics: readonly HapticBeat[];
};

export type ChoreographyOptions = {
  /** Le coffre : combien de récompenses montent (0 à 3 — points, fragment, gel). */
  readonly rewards?: number;
};

export const endOfStep = (step: ChoreographyStep): number => step.delayMs + (step.staggerMs ?? 0) * ((step.count ?? 1) - 1) + step.durationMs;

const OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const CALM = 'cubic-bezier(0.45, 0, 0.25, 1)';

const gesture = (
  target: string,
  frames: readonly Keyframe[],
  timing: { readonly delayMs?: number; readonly durationMs: number; readonly easing?: string; readonly fill?: ChoreographyFill },
  more: { readonly staggerMs?: number; readonly count?: number; readonly late?: true } = {},
): ChoreographyStep => ({
  target,
  keyframes: frames,
  delayMs: timing.delayMs ?? 0,
  durationMs: timing.durationMs,
  easing: timing.easing ?? OUT,
  fill: timing.fill ?? 'both',
  ...more,
});

const mint = (): ChoreographyPlan => {
  const strike = 640;
  return {
    kind: 'mint',
    durationMs: CHOREOGRAPHY_DURATION_MS.mint,
    steps: [
      gesture('[data-game-actor="mee"]', [{ transform: 'translateY(-18px) rotate(-6deg)', opacity: 0 }, { transform: 'translateY(0) rotate(0deg)', opacity: 1 }], { durationMs: 300 }),
      gesture('[data-game-face-wrap="obverse"]', [{ transform: 'scale(0.82)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { delayMs: 120, durationMs: 330 }),
      gesture(
        '[data-game-actor="meo"]',
        [
          { transform: 'rotate(0deg) translateY(0)', offset: 0 },
          { transform: 'rotate(-32deg) translateY(-6px)', offset: 0.35 },
          { transform: 'rotate(14deg) translateY(4px)', offset: 0.55 },
          { transform: 'rotate(0deg) translateY(0)', offset: 1 },
        ],
        { delayMs: 380, durationMs: 480, fill: 'forwards' },
      ),
      gesture('[data-game-coin-flip]', [{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }], { delayMs: strike, durationMs: 160, fill: 'forwards' }),
      gesture('[data-game-shockwave]', [{ transform: 'scale(0.2)', opacity: 0.7 }, { transform: 'scale(1.4)', opacity: 0 }], { delayMs: strike, durationMs: 520 }),
      gesture('[data-game-face-wrap="obverse"]', [{ transform: 'scaleX(1)', opacity: 1 }, { transform: 'scaleX(0)', opacity: 0 }], { delayMs: 760, durationMs: 160, easing: CALM, fill: 'forwards' }),
      gesture('[data-game-face-wrap="reverse"]', [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], { delayMs: 920, durationMs: 200, easing: CALM }),
      gesture('[data-game-coin-flip]', [{ transform: 'translateY(-4px)' }, { transform: 'translateY(0)' }], { delayMs: 1000, durationMs: 200, easing: SPRING, fill: 'forwards' }),
    ],
    beats: [{ name: 'strike', atMs: strike }],
    haptics: [
      { atMs: strike, haptic: 'shock' },
      { atMs: 1120, haptic: 'tapLight' },
    ],
  };
};

const DASH_FIRST_MS = 700;
const DASH_STEP_MS = 180;

const rank = (): ChoreographyPlan => {
  const dashes = [0, 1, 2].map((i) =>
    gesture(`[data-game-dash="${i}"]`, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], { delayMs: DASH_FIRST_MS + i * DASH_STEP_MS, durationMs: 240 }),
  );
  return {
    kind: 'rank',
    durationMs: CHOREOGRAPHY_DURATION_MS.rank,
    steps: [
      gesture('[data-game-shield]', [{ transform: 'translateY(28px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { durationMs: 600 }),
      ...dashes,
      gesture('[data-game-pose]', [{ transform: 'translateY(-18px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { delayMs: 1120, durationMs: 360, easing: SPRING }, { staggerMs: 120, count: 2 }),
      gesture('[data-game-ribbon]', [{ transform: 'translateY(6px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { delayMs: 1200, durationMs: 340 }),
    ],
    beats: [{ name: 'shine', atMs: 1120 }],
    haptics: dashes.map((d) => ({ atMs: d.delayMs, haptic: 'tap' as const })),
  };
};

const levelGain = (): ChoreographyPlan => ({
  kind: 'levelGain',
  durationMs: CHOREOGRAPHY_DURATION_MS.levelGain,
  steps: [
    gesture('[data-game-ring-sweep]', [{ transform: 'rotate(-70deg)', opacity: 0.35 }, { transform: 'rotate(0deg)', opacity: 1 }], { durationMs: 600 }),
    gesture('[data-game-level-text]', [{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { delayMs: 120, durationMs: 420, easing: SPRING }),
  ],
  beats: [],
  haptics: [{ atMs: 0, haptic: 'tapLight' }],
});

const levelLoss = (): ChoreographyPlan => ({
  kind: 'levelLoss',
  durationMs: CHOREOGRAPHY_DURATION_MS.levelLoss,
  steps: [
    gesture('[data-game-ring-sweep]', [{ transform: 'rotate(48deg)' }, { transform: 'rotate(0deg)' }], { durationMs: 800, easing: CALM }),
    gesture('[data-game-level-text]', [{ transform: 'translateY(-8px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { delayMs: 100, durationMs: 500, easing: CALM }),
    gesture('[data-game-record]', [{ transform: 'scale(1.3)', opacity: 1 }, { transform: 'scale(1)', opacity: 1 }], { delayMs: 450, durationMs: 350, fill: 'forwards' }),
  ],
  beats: [],
  haptics: [],
});

const badgeLight = (): ChoreographyPlan => ({
  kind: 'badgeLight',
  durationMs: CHOREOGRAPHY_DURATION_MS.badgeLight,
  steps: [gesture('[data-game-badge-body]', [{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { durationMs: 700 })],
  beats: [{ name: 'ignite', atMs: 350 }],
  haptics: [{ atMs: 350, haptic: 'tapLight' }],
});

const badgeExtinguish = (): ChoreographyPlan => ({
  kind: 'badgeExtinguish',
  durationMs: CHOREOGRAPHY_DURATION_MS.badgeExtinguish,
  steps: [
    gesture('[data-game-badge-body]', [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.92)', opacity: 0 }], { durationMs: 450, easing: CALM, fill: 'forwards' }),
    gesture('[data-game-imprint]', [{ opacity: 0 }, { opacity: 1 }], { delayMs: 450, durationMs: 250, easing: CALM }, { late: true }),
  ],
  beats: [{ name: 'swap', atMs: 450 }],
  haptics: [],
});

const MAX_REWARDS = 3;
const REWARD_FIRST_MS = 600;
const REWARD_STEP_MS = 200;

const chest = (rewards: number): ChoreographyPlan => {
  const count = Math.min(MAX_REWARDS, Math.max(0, Math.floor(Number.isFinite(rewards) ? rewards : 0)));
  const risers = count === 0 ? [] : [gesture('[data-game-reward]', [{ transform: 'translateY(18px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { delayMs: REWARD_FIRST_MS, durationMs: 350, easing: SPRING }, { staggerMs: REWARD_STEP_MS, count })];
  return {
    kind: 'chest',
    durationMs: CHOREOGRAPHY_DURATION_MS.chest,
    steps: [
      gesture('[data-game-lid-closed]', [{ transform: 'rotate(0deg) translateY(0)', opacity: 1 }, { transform: 'rotate(-14deg) translateY(-8px)', opacity: 0 }], { durationMs: 350 }),
      gesture('[data-game-lid-open]', [{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { delayMs: 150, durationMs: 400 }),
      gesture('[data-game-spark-group]', [{ transform: 'scale(0.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { delayMs: 350, durationMs: 350, easing: SPRING }),
      ...risers,
    ],
    beats: [{ name: 'open', atMs: 150 }],
    haptics: Array.from({ length: count }, (_, i) => ({ atMs: REWARD_FIRST_MS + i * REWARD_STEP_MS, haptic: 'tap' as const })),
  };
};

/**
 * LE PASSAGE EN PRESTIGE (#9389, conception II.9) — l'anneau se vide (le niveau
 * repart à 1), le trophée numéroté tombe et se pose, Mee et Meo couronnés
 * descendent à ses côtés, puis les étoiles de l'anneau s'allument une à une.
 * Le repère `shine` part quand le trophée se pose : l'hôte y joue l'irisation.
 */
const PRESTIGE_TROPHY_MS = 500;
const PRESTIGE_STAR_FIRST_MS = 1000;
const PRESTIGE_STAR_STEP_MS = 140;
const PRESTIGE_STARS = 5;

const prestige = (): ChoreographyPlan => ({
  kind: 'prestige',
  durationMs: CHOREOGRAPHY_DURATION_MS.prestige,
  steps: [
    gesture('[data-game-ring-sweep]', [{ transform: 'rotate(70deg)', opacity: 0.4 }, { transform: 'rotate(0deg)', opacity: 1 }], { durationMs: 700, easing: CALM }),
    gesture('[data-game-level-text]', [{ transform: 'translateY(-10px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { delayMs: 300, durationMs: 420, easing: CALM }),
    gesture('[data-game-prestige-trophy]', [{ transform: 'translateY(-36px) scale(0.8)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { delayMs: PRESTIGE_TROPHY_MS, durationMs: 600, easing: SPRING }),
    gesture('[data-game-pose]', [{ transform: 'translateY(-18px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { delayMs: 900, durationMs: 360, easing: SPRING }, { staggerMs: 140, count: 2 }),
    gesture('[data-game-prestige-star]', [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { delayMs: PRESTIGE_STAR_FIRST_MS, durationMs: 320, easing: SPRING }, { staggerMs: PRESTIGE_STAR_STEP_MS, count: PRESTIGE_STARS }),
  ],
  beats: [{ name: 'shine', atMs: PRESTIGE_TROPHY_MS + 400 }],
  haptics: [
    { atMs: PRESTIGE_TROPHY_MS, haptic: 'shock' },
    { atMs: PRESTIGE_STAR_FIRST_MS, haptic: 'tapLight' },
  ],
});

export const choreographyPlan = (kind: ChoreographyKind, options: ChoreographyOptions = {}): ChoreographyPlan => {
  switch (kind) {
    case 'mint':
      return mint();
    case 'rank':
      return rank();
    case 'levelGain':
      return levelGain();
    case 'levelLoss':
      return levelLoss();
    case 'badgeLight':
      return badgeLight();
    case 'badgeExtinguish':
      return badgeExtinguish();
    case 'chest':
      return chest(options.rewards ?? 0);
    case 'prestige':
      return prestige();
  }
};

const REDUCED_FADE_MS = 200;

/**
 * `prefers-reduced-motion` : le moment se réduit à UN fondu de la racine. Pas de
 * repères (les effets WebGL ne jouent pas), et une seule tape — pas la rafale.
 */
export const reducedPlan = (plan: ChoreographyPlan): ChoreographyPlan => ({
  kind: plan.kind,
  durationMs: REDUCED_FADE_MS,
  steps: [gesture('&', [{ opacity: 0 }, { opacity: 1 }], { durationMs: REDUCED_FADE_MS, easing: 'linear' })],
  beats: [],
  haptics: plan.haptics[0] === undefined ? [] : [{ atMs: 0, haptic: plan.haptics[0].haptic }],
});
