import { prefersReducedMotion } from '../haptics';

import type { EffectEnv } from './effect-runner';
import { createGameGl, type GlCanvas } from './engine';
import { tiltFromOrientation } from './timeline';

/**
 * LE NAVIGATEUR VU PAR LES EFFETS (#9381) — l'adaptateur entre `EffectEnv` (ce
 * que le chef d'orchestre demande) et `window`. Chaque dépendance du navigateur
 * est OPTIONNELLE : une fenêtre sans `IntersectionObserver` suppose l'hôte
 * visible, une fenêtre sans capteur d'orientation laisse le moteur dériver
 * seul, une fenêtre sans WebGL2 laisse le repli CSS jouer. Aucun de ces
 * manques n'est une erreur.
 *
 * Le canvas est dimensionné à la taille de l'hôte, en pixels d'appareil
 * plafonnés à ×2 : un reflet n'a pas besoin de la netteté d'un texte.
 */

type OrientationLike = { readonly beta: number | null; readonly gamma: number | null };

export type BrowserWin = {
  requestAnimationFrame(callback: (timestamp: number) => void): number;
  cancelAnimationFrame(id: number): void;
  addEventListener(type: 'deviceorientation', listener: (event: OrientationLike) => void): void;
  removeEventListener(type: 'deviceorientation', listener: (event: OrientationLike) => void): void;
  matchMedia?: (query: string) => { readonly matches: boolean };
  readonly devicePixelRatio?: number;
  readonly DeviceOrientationEvent?: unknown;
  readonly IntersectionObserver?: new (callback: (entries: readonly { readonly isIntersecting: boolean }[]) => void) => { observe(target: unknown): void; disconnect(): void };
};

const MAX_PIXEL_RATIO = 2;

export const createBrowserEnv = ({ win, host, canvas }: { readonly win: BrowserWin; readonly host: { readonly clientWidth: number; readonly clientHeight: number }; readonly canvas: GlCanvas }): EffectEnv => ({
  reducedMotion: prefersReducedMotion(win.matchMedia === undefined ? {} : { matchMedia: win.matchMedia }),
  createGl: () => {
    const gl = createGameGl(canvas);
    const ratio = Math.min(MAX_PIXEL_RATIO, win.devicePixelRatio ?? 1);
    gl?.resize(host.clientWidth * ratio, host.clientHeight * ratio);
    return gl;
  },
  raf: (callback) => win.requestAnimationFrame(callback),
  cancelRaf: (id) => win.cancelAnimationFrame(id),
  observeVisibility: (onChange) => {
    const Observer = win.IntersectionObserver;
    if (Observer === undefined) return () => undefined;
    const observer = new Observer((entries) => {
      const latest = entries.at(-1);
      if (latest !== undefined) onChange(latest.isIntersecting);
    });
    observer.observe(host);
    return () => observer.disconnect();
  },
  observeOrientation: (onTilt) => {
    if (win.DeviceOrientationEvent === undefined) return null;
    const listener = (event: OrientationLike): void => onTilt(tiltFromOrientation(event));
    win.addEventListener('deviceorientation', listener);
    return () => win.removeEventListener('deviceorientation', listener);
  },
});

/**
 * iOS 13+ ne livre `deviceorientation` qu'après une permission, demandée DEPUIS
 * UN GESTE (un toucher). À appeler par l'hôte sur la première interaction avec
 * une pièce de prisme ; sans effet ailleurs. Rend `true` si l'inclinaison est
 * (ou était déjà) accordée.
 */
export const requestTiltPermission = async (win: { readonly DeviceOrientationEvent?: unknown } = globalThis): Promise<boolean> => {
  const api = win.DeviceOrientationEvent;
  if (typeof api !== 'function' || !('requestPermission' in api) || typeof api.requestPermission !== 'function') return true;
  try {
    return (await api.requestPermission()) === 'granted';
  } catch {
    return false;
  }
};
