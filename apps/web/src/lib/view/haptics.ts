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
 * LA COQUE ANDROID (#11229). `@capacitor/haptics` 8.0.2 (plugin `Haptics`)
 * joue le retour NOMMÉ par le vibreur du système, en forme d'onde et
 * d'amplitude, là où le navigateur ne sait qu'une durée à pleine force.
 * Contrat LU dans `HapticsPlugin.java` : `impact({ style })` (`LIGHT`,
 * `MEDIUM` — `HapticsImpactType.java`) et `notification({ type })` (`SUCCESS`
 * — `HapticsNotificationType.java`). Le plugin est lu comme la coque le
 * DÉCLARE (`PluginHeaders`, motif `native-shell.ts`), jamais par
 * `@capacitor/core` : hors coque, rien n'est chargé, le premier rendu web ne
 * paie rien. Une coque qui ne déclare pas le plugin (construite avant lui, ou
 * la coque iOS, non resynchronisée) ou pas la méthode garde la vibration du
 * navigateur. Un motif libre reste au navigateur : le plugin ne sait jouer
 * qu'une durée.
 *
 * LE POINT D'INJECTION. `installHapticsDriver` passe la main à un autre
 * moteur sans qu'aucun appelant ne change ; un hôte EXPLICITE passe avant
 * tout. La sonnerie d'appel (`lib/calls/call-tones.ts`) reste à part : elle
 * n'est pas un retour de geste, c'est une alerte qui dure.
 */

import { appelNatifMethode, coqueCourante, type CoqueNative } from '@/lib/native-shell';

/** Durées en millisecondes. Courtes : un geste, pas une alarme. */
export const HAPTIC_CUES = {
  light: [10],
  medium: [20],
  success: [14, 48, 22],
} as const satisfies Readonly<Record<string, readonly number[]>>;

export type HapticCue = keyof typeof HAPTIC_CUES;
export type ImpactStrength = Extract<HapticCue, 'light' | 'medium'>;

/** Ce qui JOUE un retour : le plugin natif dans la coque, la vibration du navigateur ailleurs. */
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

const HAPTICS_PLUGIN = 'Haptics';

type NativeCue = { readonly method: 'impact' | 'notification'; readonly options: object };

const NATIVE_CUES: Readonly<Record<HapticCue, NativeCue>> = {
  light: { method: 'impact', options: { style: 'LIGHT' } },
  medium: { method: 'impact', options: { style: 'MEDIUM' } },
  success: { method: 'notification', options: { type: 'SUCCESS' } },
};

const ignoreRejection = (): undefined => undefined;

const dispatchNative = (call: (options: object) => Promise<unknown>, options: object): boolean => {
  try {
    void call(options).catch(ignoreRejection);
    return true;
  } catch {
    return false;
  }
};

/** Le plugin `Haptics` de la coque pour les retours nommés, la vibration de `fallback` pour le reste. */
export const shellHapticsDriver = (coque: CoqueNative | undefined, fallback: VibrateHost | undefined): HapticsDriver => {
  const vibration = vibrationDriver(fallback);
  return {
    cue: (name) => {
      const { method, options } = NATIVE_CUES[name];
      const call = appelNatifMethode(coque, HAPTICS_PLUGIN, method);
      return call === null ? vibration.cue(name) : dispatchNative(call, options);
    },
    pattern: vibration.pattern,
  };
};

const browserHost = (): VibrateHost | undefined => (typeof navigator === 'undefined' ? undefined : navigator);

/**
 * Le moteur installé — l'UNIQUE état de ce module, et c'est un registre, pas
 * une donnée : il change au démarrage de la coque, jamais pendant un geste.
 */
const registry: { driver: HapticsDriver | null } = { driver: null };

export function installHapticsDriver(driver: HapticsDriver | null): void {
  registry.driver = driver;
}

/** Un hôte EXPLICITE (témoin, appelant qui sait) passe avant tout moteur installé, qui passe avant la coque courante. */
const driverFor = (host: VibrateHost | undefined): HapticsDriver =>
  host !== undefined ? vibrationDriver(host) : (registry.driver ?? shellHapticsDriver(coqueCourante(), browserHost()));

export const impact = (strength: ImpactStrength, host?: VibrateHost): boolean => driverFor(host).cue(strength);

export const success = (host?: VibrateHost): boolean => driverFor(host).cue('success');

/** Un motif libre — réservé aux chorégraphies qui ont le leur (le jeu). */
export const playPattern = (ms: readonly number[], host?: VibrateHost): boolean => driverFor(host).pattern(ms);
