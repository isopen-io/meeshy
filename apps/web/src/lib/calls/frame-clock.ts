/**
 * **LA PENDULE DES COMPOSITEURS D'APPEL** (#11313) — un enregistrement ou un
 * montage se peint au rythme des IMAGES, pas d'un `setInterval` aveugle :
 *
 * - une vidéo en lecture qui expose `requestVideoFrameCallback` pilote le
 *   tick à chaque image présentée ;
 * - à défaut (pas de rVFC, vidéo en pause, pas de vidéo), c'est
 *   `requestAnimationFrame` ;
 * - onglet masqué : rAF et rVFC se suspendent, donc la minuterie à la
 *   cadence demandée prend le relais — l'enregistrement ne gèle pas ;
 * - un changement de visibilité réarme la pendule ; la mode est réévaluée
 *   à chaque tick.
 *
 * Tout ce qui touche au navigateur passe par `FrameClockEnv`, que les
 * témoins remplacent.
 */

export type FrameVideo = {
  readonly paused?: boolean;
  readonly requestVideoFrameCallback?: (callback: () => void) => number;
  readonly cancelVideoFrameCallback?: (handle: number) => void;
};

export type FrameClockEnv = {
  readonly hidden: () => boolean;
  readonly onVisibility: (listener: () => void) => () => void;
  /** Une image d'écran ; rend l'annulation. */
  readonly frame: (run: () => void) => () => void;
  /** Une minuterie ; rend l'annulation. */
  readonly timer: (run: () => void, ms: number) => () => void;
};

export type FrameClock = { readonly stop: () => void };

type FrameClockInput = {
  readonly fps: number;
  readonly tick: () => void;
  readonly driver?: () => FrameVideo | null;
  readonly env?: FrameClockEnv;
};

export const browserFrameClockEnv = (): FrameClockEnv => ({
  hidden: () => document.hidden,
  onVisibility: (listener) => {
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
  frame: (run) => {
    const id = requestAnimationFrame(run);
    return () => cancelAnimationFrame(id);
  },
  timer: (run, ms) => {
    const id = setTimeout(run, ms);
    return () => clearTimeout(id);
  },
});

export function startFrameClock({ fps, tick, driver = () => null, env = browserFrameClockEnv() }: FrameClockInput): FrameClock {
  const session = { running: true, cancelPending: (): void => undefined };

  const armNext = (): (() => void) => {
    if (env.hidden()) return env.timer(step, 1000 / fps);
    const video = driver();
    if (video !== null && video.paused !== true && video.requestVideoFrameCallback !== undefined) {
      const handle = video.requestVideoFrameCallback(step);
      return () => video.cancelVideoFrameCallback?.(handle);
    }
    return env.frame(step);
  };

  const rearm = (): void => {
    session.cancelPending();
    session.cancelPending = session.running ? armNext() : (): void => undefined;
  };

  function step(): void {
    if (!session.running) return;
    tick();
    rearm();
  }

  const detach = env.onVisibility(() => {
    if (session.running) rearm();
  });
  rearm();

  return {
    stop: () => {
      session.running = false;
      session.cancelPending();
      detach();
    },
  };
}
