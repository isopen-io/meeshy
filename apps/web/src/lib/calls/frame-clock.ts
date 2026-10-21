/**
 * **LA PENDULE DES COMPOSITEURS D'APPEL** (#11313) — un enregistrement ou un
 * montage se peint au rythme des IMAGES, pas d'un `setInterval` aveugle, et
 * JAMAIS plus vite que la cadence demandée :
 *
 * - une vidéo en lecture qui expose `requestVideoFrameCallback` réveille la
 *   pendule à chaque image présentée ;
 * - à défaut (pas de rVFC, vidéo en pause, pas de vidéo), c'est
 *   `requestAnimationFrame` — Safari < 15.4 et Firefox < 132 n'ont pas rVFC ;
 * - la cadence est un PLAFOND : un écran à 120 Hz ou une caméra à 60 i/s ne
 *   font pas peindre 120 fois un aperçu réglé à 5 i/s. C'est la règle de
 *   l'iOS (`CallLiveFrameSurface.swift`, `preferredFramesPerSecond = 30`) :
 *   calé sur l'affichage, borné par la cible ;
 * - une vidéo pilote qui CALE (caméra coupée du pair, piste muette, pause
 *   après l'armement, vidéo hors document que le navigateur bride) ne gèle
 *   pas la composition : un chien de garde à deux périodes reprend la main ;
 * - onglet masqué : rAF et rVFC se suspendent, la minuterie à la cadence
 *   demandée prend le relais (le navigateur peut la brider à 1 Hz, comme il
 *   bridait le `setInterval` d'avant) ; un changement de visibilité réarme.
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
  readonly now: () => number;
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

type DrivingVideo = FrameVideo & { readonly requestVideoFrameCallback: (callback: () => void) => number };

/** Une image d'écran à 240 Hz : l'avance tolérée sur la période cible. */
const FRAME_SLACK_MS = 1000 / 240;

/** Périodes cibles sans image de la vidéo pilote avant que le chien de garde peigne. */
const STALL_PERIODS = 2;

export const browserFrameClockEnv = (): FrameClockEnv => ({
  hidden: () => document.hidden,
  now: () => performance.now(),
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

const drivesFrames = (video: FrameVideo | null): video is DrivingVideo =>
  video !== null && video.paused !== true && video.requestVideoFrameCallback !== undefined;

export function startFrameClock({ fps, tick, driver = () => null, env = browserFrameClockEnv() }: FrameClockInput): FrameClock {
  const period = 1000 / fps;
  const session = { running: true, last: Number.NEGATIVE_INFINITY, cancelPending: (): void => undefined };

  const armNext = (): (() => void) => {
    if (env.hidden()) return env.timer(step, period);
    const video = driver();
    if (!drivesFrames(video)) return env.frame(step);
    const handle = video.requestVideoFrameCallback(step);
    const cancelWatchdog = env.timer(step, period * STALL_PERIODS);
    return () => {
      video.cancelVideoFrameCallback?.(handle);
      cancelWatchdog();
    };
  };

  const rearm = (): void => {
    session.cancelPending();
    session.cancelPending = session.running ? armNext() : (): void => undefined;
  };

  const due = (): boolean => {
    const now = env.now();
    const elapsed = now - session.last;
    if (elapsed + FRAME_SLACK_MS < period) return false;
    session.last = elapsed >= period * 2 ? now : session.last + period;
    return true;
  };

  function step(): void {
    if (!session.running) return;
    if (due()) tick();
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
