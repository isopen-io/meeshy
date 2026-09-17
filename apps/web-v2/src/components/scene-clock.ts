import { useEffect, useMemo, useRef } from 'react';

/**
 * L'HORLOGE D'UN PLAYER DE SCÈNE (#6901, D6, Étape 4) — UNE boucle
 * `requestAnimationFrame` par player, démarrée SEULEMENT si `enabled &&
 * playing` : une scène sans objet temporisé (`hasTimedObjects`, D-79)
 * n'entre JAMAIS ici (`enabled: false`), et ne planifie donc AUCUN rappel
 * (T-E5).
 *
 * `t` est en SECONDES depuis le départ de la scène ; la pause NE remet PAS à
 * zéro (`startsPaused` toujours vrai côté player, `hostIsPaused` — la lecture
 * est une COMMANDE) : l'horloge REPREND où elle en était.
 *
 * **AUCUN `setState` par trame** (Zero Unnecessary Re-render) : les abonnés
 * (`SceneObjectFrame`) écrivent `style` sur leur propre `ref`, jamais un état
 * React qui re-rendrait le fil entier à 60 Hz.
 */
export type SceneClockParams = {
  readonly enabled: boolean;
  readonly playing: boolean;
  readonly loops: boolean;
  readonly durationSeconds: number | null;
  /** Throttlé à ≤ 10 Hz — la chrome de lecture n'a pas besoin de 60 Hz. Non
   * optionnel (mais `| undefined`) : `exactOptionalPropertyTypes` distingue
   * « absent » de « fourni, indéfini » — l'appelant construit toujours
   * l'objet complet. */
  readonly onTime: ((t: number) => void) | undefined;
  readonly onEnded: (() => void) | undefined;
};

export type SceneClockHandle = {
  readonly subscribe: (listener: (t: number) => void) => () => void;
};

const ON_TIME_INTERVAL_MS = 100;

function useLatestCallback<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useSceneClock(params: SceneClockParams): SceneClockHandle {
  const { enabled, playing, loops, durationSeconds } = params;
  const listeners = useRef<Set<(t: number) => void>>(new Set());
  const elapsed = useRef(0);
  const lastFrame = useRef<number | null>(null);
  const rafId = useRef<number | null>(null);
  const lastOnTimeAt = useRef(0);
  const ended = useRef(false);
  const callbacks = useLatestCallback({ onTime: params.onTime, onEnded: params.onEnded });

  useEffect(() => {
    if (!enabled || !playing) {
      lastFrame.current = null;
      return;
    }
    ended.current = false;
    const tick = (now: number) => {
      if (lastFrame.current === null) lastFrame.current = now;
      const deltaSeconds = (now - lastFrame.current) / 1000;
      lastFrame.current = now;
      let t = elapsed.current + deltaSeconds;
      const hasDuration = durationSeconds !== null && durationSeconds > 0;
      let stop = false;
      if (hasDuration && durationSeconds !== null && t >= durationSeconds) {
        if (loops) {
          t = t % durationSeconds;
        } else {
          t = durationSeconds;
          if (!ended.current) {
            ended.current = true;
            callbacks.current.onEnded?.();
          }
          stop = true;
        }
      }
      elapsed.current = t;
      for (const listener of listeners.current) listener(t);
      if (now - lastOnTimeAt.current >= ON_TIME_INTERVAL_MS) {
        lastOnTimeAt.current = now;
        callbacks.current.onTime?.(t);
      }
      if (!stop) rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      rafId.current = null;
      lastFrame.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, playing, loops, durationSeconds]);

  // UNE SEULE POIGNÉE POUR LA VIE DU PLAYER (revue-correction #6901) : elle
  // ne ferme que sur des `ref`, donc rien ne justifie de la recréer — et son
  // IDENTITÉ est une dépendance d'effet chez chaque abonné
  // (`SceneObjectFrame`, `[object, timed, clock, layout]`). Un objet neuf par
  // rendu désabonnait puis réabonnait les SIX couches à chaque rendu du
  // player, en réécrivant leur pose au passage — l'inverse de ce que
  // l'horloge existe pour éviter (Zero Unnecessary Re-render).
  return useMemo<SceneClockHandle>(
    () => ({
      subscribe(listener: (t: number) => void) {
        listeners.current.add(listener);
        listener(elapsed.current);
        return () => {
          listeners.current.delete(listener);
        };
      },
    }),
    [],
  );
}
