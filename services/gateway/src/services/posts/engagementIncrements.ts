import type { PostCounter, PostCounterIncrements } from './postCounters';

/** Une vidéo plus courte que ce seuil est jugée sur la POSITION atteinte
 *  (90 %), pas sur une durée absolue : sur un format de huit secondes,
 *  `QUALIFY_MS` seul qualifierait une session qui n'a rien vu de la fin. */
const SHORT_VIDEO_MS = 8300;

/** Le plancher de temps passé qui qualifie une vue, quand la position ne
 *  tranche pas (média sans durée connue, ou durée longue). */
const QUALIFY_MS = 2500;

/** La session dont on calcule les incréments. Le type est celui du site
 *  d'appel (`PostService.recordEngagementBatch`), repris verbatim : les
 *  échantillons arrivent en `unknown[]` parce qu'ils viennent de la charge
 *  utile du client et ne sont pas gouvernés par un schéma de réponse. */
export type EngagementSession = {
  surface: string;
  contentType: string;
  dwellMs: number;
  watchMs?: number;
  mediaDurationMs?: number;
  completed: boolean;
  watchSamples: unknown[];
};

/**
 * Calcule les incréments de compteurs dénormalisés pour une NOUVELLE session
 * (spec §19.3). Renvoie les incréments à confier à `incrementPostCounters`
 * (`./postCounters`) — vide si la session ne déclenche aucun compteur.
 *
 * ## Pourquoi un MODULE et plus une méthode privée
 *
 * Elle n'a jamais touché `this` : elle prend une session et rend un objet de
 * mise à jour. Une fonction qui ne lit rien de son instance n'est pas une
 * méthode — c'est une fonction libre logée dans une classe, et elle pesait
 * sur un fichier hors budget (`gateway-file-size-budget`, règle 3) sans que
 * sa place là y soit pour rien. Même geste, même raison qu'`applyMediaText`
 * (12ef075956) : le corps est déplacé caractère pour caractère, le site
 * d'appel garde sa forme, et les témoins de bout en bout de
 * `posts-engagement.test.ts` continuent de l'exercer par
 * `recordEngagementBatch`.
 *
 * Les deux seuils étaient des constantes LOCALES au corps, recalculées à
 * chaque appel et invisibles depuis l'extérieur : ils remontent au module,
 * documentés, là où un témoin peut les nommer.
 */
export function engagementAggregateIncrements(s: EngagementSession): PostCounterIncrements {
  const increments: Partial<Record<PostCounter, { increment: number }>> = {};

  // "Ouverture" d'un post = consommation plein-cadre. Sur le feed de reels,
  // l'ouverture (vue totale) est comptée par l'engagement (défilement plein
  // écran). La page Detail, elle, compte sa vue IMMÉDIATEMENT à l'ouverture
  // (route /impression?source=detail) → on ne la recompte PAS ici, sinon une
  // ouverture de Detail vaudrait +2. Les surfaces éphémères (story/status) ont
  // leurs propres métriques et ne comptent pas ici.
  if (s.surface === 'reels') {
    increments.postOpenCount = { increment: 1 };
  }

  if (s.completed) {
    increments.playCount = { increment: 1 };
  }

  const maxPositionMs = Array.isArray(s.watchSamples)
    ? s.watchSamples.reduce<number>((max, sample) => {
        const pos = (sample as { positionMs?: unknown })?.positionMs;
        return typeof pos === 'number' && pos > max ? pos : max;
      }, 0)
    : 0;

  const duration = s.mediaDurationMs ?? 0;
  const positionThresh = duration < SHORT_VIDEO_MS ? 0.90 : 0.30;
  const positionQualifies = duration > 0 && (maxPositionMs / duration) >= positionThresh;
  const watchQualifies = (s.watchMs ?? 0) >= QUALIFY_MS;
  const dwellQualifies = s.watchMs === undefined && s.dwellMs >= QUALIFY_MS;

  if (positionQualifies || watchQualifies || dwellQualifies) {
    increments.qualifiedViewCount = { increment: 1 };
  }

  return increments;
}

/** La part d'une session que la fusion compare — ce que la ligne stockée en garde. */
export type MergeableEngagement = {
  readonly dwellMs: number;
  readonly watchMs?: number;
  readonly mediaDurationMs?: number;
  readonly completed: boolean;
  readonly actions: unknown[];
  readonly watchSamples: unknown[];
};

const longest = (stored: unknown[], incoming: unknown[]): unknown[] =>
  incoming.length >= stored.length ? incoming : stored;

const maxOptional = (a: number | undefined, b: number | undefined): number | undefined =>
  a === undefined ? b : b === undefined ? a : Math.max(a, b);

/**
 * La MÊME session reçue deux fois (#10764) — le premier contact puis la mesure,
 * ou un rejeu dans le désordre. La fusion ne recule jamais : durées au maximum,
 * complétion acquise, la plus longue trace d'actions et d'échantillons. Un
 * premier contact rejoué après la mesure ne rétrograde donc pas la ligne.
 */
export function mergeEngagementSessions<T extends MergeableEngagement>(stored: MergeableEngagement, incoming: T): T {
  return {
    ...incoming,
    dwellMs: Math.max(stored.dwellMs, incoming.dwellMs),
    watchMs: maxOptional(stored.watchMs, incoming.watchMs),
    mediaDurationMs: incoming.mediaDurationMs ?? stored.mediaDurationMs,
    completed: stored.completed || incoming.completed,
    actions: longest(stored.actions, incoming.actions),
    watchSamples: longest(stored.watchSamples, incoming.watchSamples),
  };
}

/**
 * Les trois compteurs qu'une session peut créditer, en DRAPEAUX, rangés sur
 * chaque ligne (#10771, #10785) : la fusion premier contact → mesure ne
 * recrédite jamais ce qu'une réception précédente a déjà crédité.
 */
export type EngagementCredits = {
  readonly creditedOpen: boolean;
  readonly creditedPlay: boolean;
  readonly creditedQualified: boolean;
};

export const creditsOfIncrements = (increments: PostCounterIncrements): EngagementCredits => ({
  creditedOpen: 'postOpenCount' in increments,
  creditedPlay: 'playCount' in increments,
  creditedQualified: 'qualifiedViewCount' in increments,
});

export const incrementsOfCredits = (credits: Partial<Record<keyof EngagementCredits, boolean | null>>): PostCounterIncrements => ({
  ...(credits.creditedOpen ? { postOpenCount: { increment: 1 } } : {}),
  ...(credits.creditedPlay ? { playCount: { increment: 1 } } : {}),
  ...(credits.creditedQualified ? { qualifiedViewCount: { increment: 1 } } : {}),
});

/** Ce que `now` crédite et que `already` n'avait pas — chaque compteur à UN par session. */
export const incrementsNotYetCredited = (already: PostCounterIncrements, now: PostCounterIncrements): PostCounterIncrements =>
  Object.fromEntries(Object.entries(now).filter(([counter]) => !(counter in already)));
