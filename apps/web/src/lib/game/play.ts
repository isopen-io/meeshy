import { choreographyPlan, reducedPlan, type ChoreographyBeat, type ChoreographyKind, type ChoreographyOptions, type ChoreographyStep } from './choreography';
import { prefersReducedMotion, vibrate as vibrateNative, type HapticName } from './haptics';

/**
 * LE LECTEUR DE CHORÉGRAPHIES (#9381) — rejoue un plan de `choreography.ts`
 * avec les Web Animations. Il n'anime que ce que le plan nomme (`transform` et
 * `opacity`), pose `will-change` PENDANT le geste seulement, annule tout à la
 * fin (l'élément retrouve l'état que l'hôte a déjà posé dans le DOM) et ne
 * lève jamais : une cible absente, ou sans `animate` (happy-dom, vieux
 * navigateur), est un geste qui ne joue pas.
 *
 * Les DÉPENDANCES SONT INJECTABLES (`schedule`, `vibrate`, `reducedMotion`) :
 * le minutage se teste avec une horloge à la main, sans attendre ni jouer.
 */

export type PlayableAnimation = { readonly finished: Promise<unknown>; cancel(): void };

export type PlayableTarget = {
  animate?(keyframes: Keyframe[], options: KeyframeAnimationOptions): PlayableAnimation;
  readonly style?: { willChange: string };
};

export type PlayableRoot = PlayableTarget & { querySelectorAll(selector: string): ArrayLike<PlayableTarget> };

export type PlayOptions = ChoreographyOptions & {
  /** Défaut : la requête média de l'appareil. */
  readonly reducedMotion?: boolean;
  /** `false` coupe les vibrations (les repères restent). Défaut : vrai. */
  readonly haptics?: boolean;
  readonly vibrate?: (haptic: HapticName) => void;
  /** Appelé AU moment de chaque repère du plan (« strike », « shine », « open »…), avant les gestes tardifs du même instant. */
  readonly onBeat?: (beat: ChoreographyBeat) => void;
  /** Défaut : `setTimeout`. Rend une fonction qui annule. */
  readonly schedule?: (run: () => void, delayMs: number) => () => void;
};

export type PlayHandle = { readonly finished: Promise<void>; cancel(): void };

/** Après le dernier geste, le temps de laisser la dernière image se peindre avant d'annuler. */
const SETTLE_MARGIN_MS = 40;

const defaultSchedule = (run: () => void, delayMs: number): (() => void) => {
  const id = setTimeout(run, delayMs);
  return () => clearTimeout(id);
};

const WILL_CHANGE = 'transform, opacity';

export const playChoreography = (root: PlayableRoot, kind: ChoreographyKind, options: PlayOptions = {}): PlayHandle => {
  const reduced = options.reducedMotion ?? prefersReducedMotion();
  const schedule = options.schedule ?? defaultSchedule;
  const buzz = options.vibrate ?? ((haptic: HapticName) => void vibrateNative(haptic));
  const base = choreographyPlan(kind, options.rewards === undefined ? {} : { rewards: options.rewards });
  const plan = reduced ? reducedPlan(base) : base;

  const animations: PlayableAnimation[] = [];
  const touched = new Set<PlayableTarget>();
  const cancels: (() => void)[] = [];
  let settled = false;
  let resolveFinished: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => void (resolveFinished = resolve));

  const run = (step: ChoreographyStep, targets: ArrayLike<PlayableTarget>, extraDelayMs: number): void => {
    Array.from(targets).forEach((el, index) => {
      if (typeof el.animate !== 'function') return;
      if (el.style !== undefined) el.style.willChange = WILL_CHANGE;
      touched.add(el);
      const animation = el.animate([...step.keyframes], {
        duration: step.durationMs,
        delay: extraDelayMs + index * (step.staggerMs ?? 0),
        easing: step.easing,
        fill: step.fill,
      });
      /* Annuler une animation REJETTE sa promesse `finished` (AbortError) : sans
         gestionnaire, c'est un rejet non géré à chaque fin de plan. On ne s'en
         sert pas — le plan a sa propre horloge — donc on l'absorbe. */
      Promise.resolve(animation.finished).catch(() => undefined);
      animations.push(animation);
    });
  };

  const settle = (): void => {
    if (settled) return;
    settled = true;
    for (const cancel of cancels) cancel();
    for (const animation of animations) animation.cancel();
    for (const el of touched) if (el.style !== undefined) el.style.willChange = '';
    resolveFinished();
  };

  const targetsOf = (step: ChoreographyStep): ArrayLike<PlayableTarget> => (step.target === '&' ? [root] : root.querySelectorAll(step.target));

  for (const beat of plan.beats) {
    cancels.push(
      schedule(() => {
        if (!settled) options.onBeat?.(beat);
      }, beat.atMs),
    );
  }
  if (options.haptics !== false) {
    for (const { atMs, haptic } of plan.haptics) {
      if (atMs <= 0) buzz(haptic);
      else cancels.push(schedule(() => buzz(haptic), atMs));
    }
  }
  for (const step of plan.steps) {
    if (step.late === true) {
      cancels.push(
        schedule(() => {
          if (!settled) run(step, targetsOf(step), 0);
        }, step.delayMs),
      );
    } else {
      run(step, targetsOf(step), step.delayMs);
    }
  }
  cancels.push(schedule(settle, plan.durationMs + SETTLE_MARGIN_MS));

  return { finished, cancel: settle };
};
