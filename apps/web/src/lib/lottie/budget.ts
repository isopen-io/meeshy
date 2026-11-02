import { currentDeviceTier, type DeviceTier } from '../device/capability-tier';

/**
 * **LE PLAFOND DES FILMS VIVANTS** (#10815) — une liste longue (conversations,
 * fil, participants) porte un contour animé par rangée ; sans borne, chaque
 * rangée passée à l'écran laisserait un film monté derrière elle. Le budget
 * accorde au plus `max` places :
 *
 * - une couche qui ENTRE à l'écran demande une place ; libre, elle l'obtient ;
 * - une couche qui SORT de l'écran garde sa place (elle reprendra sans
 *   rechargement) tant que personne n'en a besoin ;
 * - sous pression, la place la plus anciennement endormie est reprise : son
 *   film est détruit (`evict`), le dessin statique reste ;
 * - si toutes les places sont à l'écran, la nouvelle venue attend son tour, et
 *   le perd si elle ressort avant.
 */
export type LottieSlotCallbacks = { readonly grant: () => void; readonly evict: () => void };

export type LottieSlot = { readonly setVisible: (visible: boolean) => void; readonly release: () => void };

export type LottieBudget = { readonly claim: (callbacks: LottieSlotCallbacks) => LottieSlot; readonly holders: () => number };

type Entry = { readonly callbacks: LottieSlotCallbacks; visible: boolean; held: boolean; closed: boolean; asleepSince: number };

export function createLottieBudget(max: number): LottieBudget {
  const holders = new Set<Entry>();
  let waiting: readonly Entry[] = [];
  let clock = 0;

  const grant = (entry: Entry): void => {
    entry.held = true;
    holders.add(entry);
    entry.callbacks.grant();
  };

  const oldestAsleep = (): Entry | null =>
    [...holders].filter((entry) => !entry.visible).reduce<Entry | null>((oldest, entry) => (oldest === null || entry.asleepSince < oldest.asleepSince ? entry : oldest), null);

  const pump = (): void => {
    while (waiting.length > 0) {
      const [next, ...rest] = waiting;
      if (next === undefined) return;
      if (holders.size >= max) {
        const victim = oldestAsleep();
        if (victim === null) return;
        holders.delete(victim);
        victim.held = false;
        victim.callbacks.evict();
      }
      waiting = rest;
      grant(next);
    }
  };

  const claim = (callbacks: LottieSlotCallbacks): LottieSlot => {
    const entry: Entry = { callbacks, visible: false, held: false, closed: false, asleepSince: 0 };
    return {
      setVisible: (visible) => {
        if (entry.closed || entry.visible === visible) return;
        entry.visible = visible;
        if (visible) {
          if (!entry.held) waiting = [...waiting, entry];
        } else {
          waiting = waiting.filter((other) => other !== entry);
          clock += 1;
          entry.asleepSince = clock;
        }
        pump();
      },
      release: () => {
        if (entry.closed) return;
        entry.closed = true;
        waiting = waiting.filter((other) => other !== entry);
        holders.delete(entry);
        entry.held = false;
        pump();
      },
    };
  };

  return { claim, holders: () => holders.size };
}

/** Le plafond historique : huit films vivants, toutes surfaces confondues. */
export const MAX_LIVE_LOTTIE_LAYERS = 8;

const MID_TIER_LIVE_LAYERS = 5;
const LOW_TIER_LIVE_LAYERS = 3;

/**
 * Le plafond propre à l'appareil (W10) : il ne fait que BAISSER (bas et moyen) ;
 * haut, pro et appareil non classé gardent le maximum historique. Chaque film
 * vivant tient un arbre SVG animé : trois sur un appareil bas, cinq sur un moyen.
 * Argumenté, non mesuré : le coût se relève au profil sur un appareil de chaque tier.
 */
export const liveLottieLayersFor = (tier: DeviceTier): number =>
  tier === 'low' ? LOW_TIER_LIVE_LAYERS : tier === 'mid' ? MID_TIER_LIVE_LAYERS : MAX_LIVE_LOTTIE_LAYERS;

/** Le budget de la session, dimensionné par le tier de l'appareil à la première lecture. */
export const sharedLottieBudget: LottieBudget = createLottieBudget(liveLottieLayersFor(currentDeviceTier()));
