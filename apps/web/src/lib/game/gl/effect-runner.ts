import type { GameGl } from './engine';
import type { GameEffect } from './shaders';
import { SHEEN_PASSES, driftTilt, sheenState, shockwaveState, type Tilt } from './timeline';

/**
 * LE CHEF D'ORCHESTRE D'UN EFFET (#9381) — choisit le moteur, mène la boucle,
 * l'arrête quand il faut.
 *
 *   · `none`   — l'utilisateur limite les animations : rien ne tourne, aucun
 *                contexte n'est même créé (la chorégraphie, elle, rend un fondu) ;
 *   · `css`    — WebGL2 manque (ou n'a pas compilé) : le repli CSS joue le
 *                reflet et l'onde (`styles/game.css`) ;
 *   · `webgl2` — le moteur peint dans un canvas.
 *
 * RÈGLES D'ENERGIE, mesurées par des témoins :
 *   · hors écran, plus aucune image n'est demandée, et le temps passé caché ne
 *     consomme aucun passage ;
 *   · le reflet s'arrête après 3 passages, l'onde après sa durée, la dérive
 *     d'irisation après 3 périodes — chacun efface ou se pose, puis se tait ;
 *   · avec un capteur d'orientation, l'irisation n'a AUCUNE boucle : une image
 *     par inclinaison reçue (regroupées sur la prochaine image) ;
 *   · un trou entre deux images (onglet endormi) n'avance le temps que de 100 ms.
 *
 * Toutes les dépendances du navigateur entrent par `EffectEnv` : le rythme se
 * teste avec une file d'images faite à la main.
 */

export type EffectBackend = 'webgl2' | 'css' | 'none';

export type EffectSpec = {
  readonly effect: GameEffect;
  /** Masque circulaire (la Meesh) ; sinon plan entier. */
  readonly circle?: boolean;
  /** Passages du reflet (défaut : 3). */
  readonly passes?: number;
};

export type EffectEnv = {
  readonly reducedMotion: boolean;
  readonly createGl: () => GameGl | null;
  readonly raf: (callback: (timestamp: number) => void) => number;
  readonly cancelRaf: (id: number) => void;
  /** S'abonne à la visibilité de l'hôte (IntersectionObserver) ; rend la fonction de désabonnement. */
  readonly observeVisibility: (onChange: (visible: boolean) => void) => () => void;
  /** S'abonne à l'inclinaison de l'appareil ; `null` quand il n'y a pas de capteur. */
  readonly observeOrientation: (onTilt: (tilt: Tilt) => void) => (() => void) | null;
};

export type EffectController = {
  readonly backend: EffectBackend;
  /** Relance l'effet depuis le début (une nouvelle frappe, un badge rallumé). */
  replay(): void;
  dispose(): void;
};

const MAX_FRAME_GAP_MS = 100;
const REST: Tilt = [0, 0];

const inert = (backend: EffectBackend): EffectController => ({ backend, replay: () => undefined, dispose: () => undefined });

export const startEffect = (spec: EffectSpec, env: EffectEnv): EffectController => {
  if (env.reducedMotion) return inert('none');
  const gl = env.createGl();
  if (gl === null) return inert('css');

  const circle = spec.circle === true;
  let disposed = false;
  let visible = true;
  let rafId: number | null = null;
  let elapsed = 0;
  let last: number | null = null;
  let finished = false;
  let tilt: Tilt = REST;
  let pendingTilt = false;

  const paint = (progress: number, at: Tilt): void => gl.render(spec.effect, { progress, tilt: at, circle });

  const requestFrame = (run: (timestamp: number) => void): void => {
    if (disposed || !visible || rafId !== null) return;
    rafId = env.raf(run);
  };

  const onTimedFrame = (timestamp: number): void => {
    rafId = null;
    if (disposed) return;
    elapsed += last === null ? 0 : Math.min(MAX_FRAME_GAP_MS, Math.max(0, timestamp - last));
    last = timestamp;
    if (spec.effect === 'iridescence') {
      const drift = driftTilt(elapsed);
      paint(0, drift.tilt);
      if (drift.done) finished = true;
      else requestFrame(onTimedFrame);
      return;
    }
    const state = spec.effect === 'sheen' ? sheenState(elapsed, spec.passes ?? SHEEN_PASSES) : shockwaveState(elapsed);
    if (state.done) {
      finished = true;
      gl.clear();
      return;
    }
    paint(state.progress, REST);
    requestFrame(onTimedFrame);
  };

  const onSensorFrame = (): void => {
    rafId = null;
    if (disposed) return;
    pendingTilt = false;
    paint(0, tilt);
  };

  const unobserveOrientation = spec.effect === 'iridescence' ? env.observeOrientation((next) => {
    if (disposed) return;
    tilt = next;
    pendingTilt = true;
    requestFrame(onSensorFrame);
  }) : null;
  const sensed = unobserveOrientation !== null;

  const unobserveVisibility = env.observeVisibility((next) => {
    if (disposed || next === visible) return;
    visible = next;
    if (!visible) {
      if (rafId !== null) env.cancelRaf(rafId);
      rafId = null;
      last = null;
      return;
    }
    if (sensed) {
      if (pendingTilt) requestFrame(onSensorFrame);
      return;
    }
    if (!finished) requestFrame(onTimedFrame);
  });

  if (sensed) paint(0, REST);
  else requestFrame(onTimedFrame);

  return {
    backend: 'webgl2',
    replay: () => {
      if (disposed || sensed) return;
      elapsed = 0;
      last = null;
      finished = false;
      requestFrame(onTimedFrame);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (rafId !== null) env.cancelRaf(rafId);
      rafId = null;
      unobserveVisibility();
      unobserveOrientation?.();
      gl.dispose();
    },
  };
};
