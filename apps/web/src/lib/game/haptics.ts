import { playPattern, type VibrateHost } from '@/lib/view/haptics';

/**
 * L'HAPTIQUE DU JEU ET LA RÉDUCTION DES ANIMATIONS (#9381).
 *
 * Le jeu garde ses MOTIFS (une chorégraphie qui lui est propre) ; il ne garde
 * plus son moteur : `vibrate` passe par le site unique de l'haptique du web
 * (`lib/view/haptics.ts`, #11207), qui sait l'absence du moteur de vibration,
 * le moteur qui lève, et le plugin natif de la coque.
 */

/** Durées en millisecondes (vibration, pause, vibration…). Courtes : un geste, pas une alarme. */
export const HAPTIC_PATTERNS = {
  tap: [14],
  tapLight: [8],
  /** « tchak » : un choc net puis un léger rebond. */
  shock: [22, 36, 10],
} as const satisfies Readonly<Record<string, readonly number[]>>;

export type HapticName = keyof typeof HAPTIC_PATTERNS;

export const vibrate = (name: HapticName, host?: VibrateHost): boolean => playPattern(HAPTIC_PATTERNS[name], host);

type MediaHost = { readonly matchMedia?: (query: string) => { readonly matches: boolean } };

/** `prefers-reduced-motion: reduce` — lu à chaque appel : l'utilisateur peut changer le réglage pendant la session. */
export const prefersReducedMotion = (host: MediaHost = globalThis): boolean => {
  if (typeof host.matchMedia !== 'function') return false;
  return host.matchMedia('(prefers-reduced-motion: reduce)').matches;
};
