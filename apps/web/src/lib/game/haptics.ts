/**
 * L'HAPTIQUE DU JEU ET LA RÉDUCTION DES ANIMATIONS (#9381).
 *
 * `navigator.vibrate` n'existe ni sur Safari ni sur la plupart des bureaux : le
 * jeu vibre quand il peut, et son absence n'est jamais une erreur. Un moteur
 * qui lève (page en arrière-plan, geste utilisateur manquant) ne casse pas la
 * chorégraphie : on rend `false`.
 */

/** Durées en millisecondes (vibration, pause, vibration…). Courtes : un geste, pas une alarme. */
export const HAPTIC_PATTERNS = {
  tap: [14],
  tapLight: [8],
  /** « tchak » : un choc net puis un léger rebond. */
  shock: [22, 36, 10],
} as const satisfies Readonly<Record<string, readonly number[]>>;

export type HapticName = keyof typeof HAPTIC_PATTERNS;

type VibrateHost = { readonly vibrate?: (pattern: number | number[]) => boolean };

export const vibrate = (name: HapticName, host: VibrateHost | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean => {
  if (host === undefined || typeof host.vibrate !== 'function') return false;
  try {
    return host.vibrate([...HAPTIC_PATTERNS[name]]) !== false;
  } catch {
    return false;
  }
};

type MediaHost = { readonly matchMedia?: (query: string) => { readonly matches: boolean } };

/** `prefers-reduced-motion: reduce` — lu à chaque appel : l'utilisateur peut changer le réglage pendant la session. */
export const prefersReducedMotion = (host: MediaHost = globalThis): boolean => {
  if (typeof host.matchMedia !== 'function') return false;
  return host.matchMedia('(prefers-reduced-motion: reduce)').matches;
};
