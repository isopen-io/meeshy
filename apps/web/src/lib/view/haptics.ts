/**
 * L'HAPTIQUE DU WEB — UN SITE, UN VOCABULAIRE (#11207).
 *
 * Sept écritures de `navigator.vibrate` vivaient dans sept fichiers (les
 * quatre balayages, le studio de capture, le jeu), chacune avec sa garde et
 * sa durée. Les appelants disent désormais CE QU'ILS ACCOMPAGNENT — un
 * `impact` léger quand un seuil est franchi, `medium` quand un geste aboutit,
 * `success` quand une action est confirmée — et ce module choisit le motif.
 * Ce sont les trois retours qu'iOS nomme (`UIImpactFeedbackGenerator`
 * `.light`/`.medium`, `UINotificationFeedbackGenerator.success`).
 *
 * `navigator.vibrate` n'existe ni sur WebKit iOS ni sur la plupart des
 * bureaux : son absence n'est jamais une erreur, et un moteur qui lève (page
 * en arrière-plan, geste utilisateur manquant) ne casse jamais le geste — on
 * rend `false`.
 *
 * LE POINT D'INJECTION. Dans la coque Capacitor, un plugin natif sait jouer un
 * vrai retour haptique là où le navigateur ne sait que vibrer :
 * `installHapticsDriver` lui passe la main sans qu'aucun appelant ne change.
 * La sonnerie d'appel (`lib/calls/call-tones.ts`) reste à part : elle n'est
 * pas un retour de geste, c'est une alerte qui dure.
 */

/** Durées en millisecondes. Courtes : un geste, pas une alarme. */
export const HAPTIC_CUES = {
  light: [10],
  medium: [20],
  success: [14, 48, 22],
} as const satisfies Readonly<Record<string, readonly number[]>>;

export type HapticCue = keyof typeof HAPTIC_CUES;
export type ImpactStrength = Extract<HapticCue, 'light' | 'medium'>;

/** Ce qui JOUE un retour : la vibration du navigateur par défaut, un plugin natif demain. */
export type HapticsDriver = {
  readonly cue: (name: HapticCue) => boolean;
  readonly pattern: (ms: readonly number[]) => boolean;
};

export type VibrateHost = { readonly vibrate?: (pattern: number | number[]) => boolean };

const vibrateWith = (host: VibrateHost | undefined, ms: readonly number[]): boolean => {
  if (host === undefined || typeof host.vibrate !== 'function') return false;
  try {
    return host.vibrate([...ms]) !== false;
  } catch {
    return false;
  }
};

export const vibrationDriver = (host: VibrateHost | undefined): HapticsDriver => ({
  cue: (name) => vibrateWith(host, HAPTIC_CUES[name]),
  pattern: (ms) => vibrateWith(host, ms),
});

const browserHost = (): VibrateHost | undefined => (typeof navigator === 'undefined' ? undefined : navigator);

/**
 * Le moteur installé — l'UNIQUE état de ce module, et c'est un registre, pas
 * une donnée : il change au démarrage de la coque, jamais pendant un geste.
 */
const registry: { driver: HapticsDriver | null } = { driver: null };

export function installHapticsDriver(driver: HapticsDriver | null): void {
  registry.driver = driver;
}

/** Un hôte EXPLICITE (témoin, appelant qui sait) passe avant tout moteur installé. */
const driverFor = (host: VibrateHost | undefined): HapticsDriver =>
  host !== undefined ? vibrationDriver(host) : (registry.driver ?? vibrationDriver(browserHost()));

export const impact = (strength: ImpactStrength, host?: VibrateHost): boolean => driverFor(host).cue(strength);

export const success = (host?: VibrateHost): boolean => driverFor(host).cue('success');

/** Un motif libre — réservé aux chorégraphies qui ont le leur (le jeu). */
export const playPattern = (ms: readonly number[], host?: VibrateHost): boolean => driverFor(host).pattern(ms);
