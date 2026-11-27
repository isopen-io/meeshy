/**
 * **UN TALKIE DEPUIS UN AVATAR POSÉ PARMI D'AUTRES GESTES** (#19888, iso `TalkieLongHold` iOS #19885, épingle de la
 * carte des cercles) — un toucher garde son effet ; seul un appui LONG ouvre la voix, qui part tant que le doigt (ou
 * Espace) reste posé. Le relâcher qui ferme la voix avale le toucher qui le suit : on a parlé, on n'a choisi personne.
 */

/** L'attente avant que la voix s'ouvre : au-delà d'un toucher, en deçà d'une hésitation (iOS : 0,35 s). */
export const TALKIE_LONG_HOLD_MS = 350;

/** Arme un minuteur ; rend de quoi l'annuler. */
export type HoldSchedule = (fire: () => void, ms: number) => () => void;

export const timeoutSchedule: HoldSchedule = (fire, ms) => {
  const timer = setTimeout(fire, ms);
  return () => clearTimeout(timer);
};

export type LongHold = {
  down(): void;
  /** `held` : la voix était ouverte, elle se ferme ; `tap` : un toucher, que l'hôte laisse passer. */
  up(): 'held' | 'tap';
  /** Le geste est perdu (pointeur annulé, focus quitté) : une voix ouverte se ferme. */
  cancel(): void;
  /** Vrai UNE fois après une voix fermée par le relâcher : le toucher qui suit ne choisit rien. */
  swallowsTap(): boolean;
};

type Phase = { readonly kind: 'rest' } | { readonly kind: 'waiting'; readonly cancel: () => void } | { readonly kind: 'holding' };

export function createLongHold({
  onHold,
  onRelease,
  schedule = timeoutSchedule,
  ms = TALKIE_LONG_HOLD_MS,
}: {
  readonly onHold: () => void;
  readonly onRelease: () => void;
  readonly schedule?: HoldSchedule;
  readonly ms?: number;
}): LongHold {
  let phase: Phase = { kind: 'rest' };
  let swallow = false;
  const settle = (): 'held' | 'tap' => {
    const was = phase;
    phase = { kind: 'rest' };
    if (was.kind === 'waiting') was.cancel();
    if (was.kind !== 'holding') return 'tap';
    onRelease();
    return 'held';
  };
  return {
    down() {
      if (phase.kind !== 'rest') return;
      swallow = false;
      phase = {
        kind: 'waiting',
        cancel: schedule(() => {
          if (phase.kind !== 'waiting') return;
          phase = { kind: 'holding' };
          onHold();
        }, ms),
      };
    },
    up() {
      const outcome = settle();
      swallow = outcome === 'held';
      return outcome;
    },
    cancel() {
      settle();
    },
    swallowsTap() {
      const was = swallow;
      swallow = false;
      return was;
    },
  };
}
