import { CHOREOGRAPHY_DURATION_MS } from './choreography';
import { prefersReducedMotion } from './haptics';

/**
 * LA PORTE DE LA FRAPPE (#9537, directive porteur 2026-10-06) — « Mee et Meo
 * frappent une Meesh ; le compteur ne s'incrémente qu'APRÈS la fin de
 * l'animation ». Le geste reste OPTIMISTE (la requête part tout de suite, le
 * retour est instantané) mais SÉQUENCÉ : ce que la frappe change à l'écran
 * (le solde de Meeshes, le niveau, le rang) attend que la scène ait fini de
 * jouer.
 *
 * La porte ne connaît que le temps : la scène joue la chorégraphie « mint »
 * (`CHOREOGRAPHY_DURATION_MS.mint`), la porte s'ouvre à son terme. Elle ne
 * retient RIEN quand aucune scène n'est à l'écran (`registerStrikeStage`) ni
 * quand l'utilisateur limite les animations : un geste qu'on ne voit pas
 * n'attend pas. Le refus de la passerelle l'ouvre aussitôt (`cancel`) — rien ne
 * reste suspendu.
 */
export const STRIKE_SETTLE_MS = CHOREOGRAPHY_DURATION_MS.mint + 60;

let stages = 0;

/** Une scène de frappe est montée : tant qu'elle l'est, la frappe attend la fin de son geste. */
export function registerStrikeStage(): () => void {
  stages += 1;
  let left = false;
  return () => {
    if (left) return;
    left = true;
    stages -= 1;
  };
}

export type StrikeGate = {
  readonly staged: () => boolean;
  /** Une frappe commence : la porte se ferme jusqu'à la fin du geste (ou reste ouverte sans scène). */
  readonly begin: () => void;
  /** Résolue quand le geste est fini ; déjà résolue quand rien ne retient. */
  readonly opened: () => Promise<void>;
  /** Ouvre tout de suite (échec de la frappe, démontage). */
  readonly cancel: () => void;
};

type GateOptions = {
  readonly staged?: () => boolean;
  readonly reducedMotion?: () => boolean;
  readonly schedule?: (run: () => void, ms: number) => () => void;
  readonly ms?: number;
};

const defaultSchedule = (run: () => void, ms: number): (() => void) => {
  const id = setTimeout(run, ms);
  return () => clearTimeout(id);
};

export function createStrikeGate(options: GateOptions = {}): StrikeGate {
  const staged = options.staged ?? (() => stages > 0);
  const reduced = options.reducedMotion ?? prefersReducedMotion;
  const schedule = options.schedule ?? defaultSchedule;
  const ms = options.ms ?? STRIKE_SETTLE_MS;
  let current: Promise<void> = Promise.resolve();
  let release: () => void = () => undefined;
  let stop: () => void = () => undefined;

  const open = (): void => {
    stop();
    stop = () => undefined;
    release();
    release = () => undefined;
  };

  return {
    staged,
    begin: () => {
      open();
      if (!staged() || reduced()) {
        current = Promise.resolve();
        return;
      }
      current = new Promise<void>((resolve) => {
        release = resolve;
      });
      stop = schedule(open, ms);
    },
    opened: () => current,
    cancel: open,
  };
}

/** LA porte de l'application : une frappe à la fois. */
export const strikeGate: StrikeGate = createStrikeGate();
