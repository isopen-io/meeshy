import type { MeeshEdition } from '@meeshy/shared/utils/game/mint';
import { mintCeremonyPlan } from '@meeshy/shared/utils/game/mint-ceremony';

import { prefersReducedMotion } from './haptics';

/**
 * LA PORTE DE LA FRAPPE (#9537, directive porteur 2026-10-06) — « Mee et Meo
 * frappent une Meesh ; le compteur ne s'incrémente qu'APRÈS la fin de
 * l'animation ». Le geste reste OPTIMISTE (la requête part tout de suite, le
 * retour est instantané) mais SÉQUENCÉ : ce que la frappe change à l'écran
 * (le solde de Meeshes, le niveau, le rang) attend que la scène ait fini de
 * jouer.
 *
 * LA CÉRÉMONIE (#11177, conception de l'épopée § 7) : la scène part au toucher
 * et la passerelle répond pendant le tissage. La porte PORTE cette réponse
 * jusqu'à la scène (`confirm`, `refuse`, `onAnswer`) — tant qu'elle n'est pas
 * venue, Meo garde le marteau levé — et c'est la scène qui l'ouvre quand la
 * pièce arrive dans l'Héritage (`settle`). Une seule scène joue la cérémonie
 * d'une frappe (`claim`), même si deux sont montées.
 *
 * Elle ne retient RIEN quand aucune scène n'est à l'écran (`registerStrikeStage`)
 * ni quand l'utilisateur limite les animations : un geste qu'on ne voit pas
 * n'attend pas. Le refus de la passerelle l'ouvre aussitôt (`refuse`) — rien ne
 * reste suspendu. Si la scène ne l'ouvre pas (démontée, module absent), elle
 * s'ouvre d'elle-même après la plus longue cérémonie et une marge.
 */
const LONGEST_CEREMONY_MS = Math.max(...(['silver', 'gold', 'prism'] as const).map((edition) => mintCeremonyPlan({ edition, mode: 'normal' }).endMs));

export const STRIKE_SETTLE_MS = LONGEST_CEREMONY_MS + 4000;

/** La pièce que la passerelle confirme, quand sa réponse la porte. */
export type StrikeCoin = { readonly number: number; readonly edition: MeeshEdition };

/** Où en est la frappe en cours : aucune, attendue, confirmée, ou refusée avec son code. */
export type StrikeAnswer =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'confirmed'; readonly coin?: StrikeCoin }
  | { readonly kind: 'refused'; readonly code: string | undefined };

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
  /** Ouvre tout de suite (démontage). */
  readonly cancel: () => void;
  /** La passerelle a confirmé : la scène peut abattre le marteau. N'ouvre pas la porte. */
  readonly confirm: (coin?: StrikeCoin) => void;
  /** La passerelle a refusé : la scène ramène la lumière, la porte s'ouvre. */
  readonly refuse: (code?: string) => void;
  /** La scène a fini (la pièce est dans l'Héritage, ou on a passé la scène) : la porte s'ouvre. */
  readonly settle: () => void;
  readonly answer: () => StrikeAnswer;
  /** Écoute la réponse ; un abonné qui arrive pendant une frappe lit tout de suite celle qui est venue. */
  readonly onAnswer: (listener: (answer: StrikeAnswer) => void) => () => void;
  /** La première scène qui réclame la frappe en cours la joue ; les autres non. */
  readonly claim: () => boolean;
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
  let answer: StrikeAnswer = { kind: 'idle' };
  let claimed = true;
  const listeners = new Set<(answer: StrikeAnswer) => void>();

  const answered = (next: StrikeAnswer): void => {
    answer = next;
    listeners.forEach((listener) => listener(next));
  };

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
      claimed = false;
      answered({ kind: 'pending' });
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
    confirm: (coin) => answered(coin === undefined ? { kind: 'confirmed' } : { kind: 'confirmed', coin }),
    refuse: (code) => {
      answered({ kind: 'refused', code });
      open();
    },
    settle: open,
    answer: () => answer,
    onAnswer: (listener) => {
      listeners.add(listener);
      if (answer.kind !== 'idle') listener(answer);
      return () => void listeners.delete(listener);
    },
    claim: () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
  };
}

/** LA porte de l'application : une frappe à la fois. */
export const strikeGate: StrikeGate = createStrikeGate();
