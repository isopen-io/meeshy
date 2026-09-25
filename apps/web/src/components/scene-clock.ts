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
  /** Émis UNE fois par tour de boucle (`loops: true`), APRÈS le modulo —
   * miroir `loopPass` (`MeeshyScenePlayer.swift:58-60, 270-273`, #6903) : le
   * son de fond d'un réel REPART avec chaque tour (l'hôte remonte sa piste
   * sur ce signal), sans jamais remonter le PLAYER (Zero Unnecessary
   * Re-render). Jamais émis pour une scène qui NE boucle pas. */
  readonly onLoop: (() => void) | undefined;
};

export type SceneClockHandle = {
  readonly subscribe: (listener: (t: number) => void) => () => void;
  /** LE PARCOURS AU DOIGT (#7879) — pose le temps (borné à `[0, durée]`),
   * redessine SUR-LE-CHAMP chaque abonné et `onTime`, même en pause : c'est
   * « l'actualisation des frames en temps réel » du glissé, sans rendu
   * React. Réarme la fin d'une scène qui ne boucle pas, et relance la
   * boucle d'images si la lecture court encore. */
  readonly seek: (t: number) => void;
  /** Entendu à CHAQUE `seek`, jamais à chaque trame — les `<video>` et
   * `<audio>` de la scène, qui courent sur leur propre horloge, s'y recalent
   * (`useMediaSeek`, `scene-media-seek.ts`). */
  readonly subscribeSeek: (listener: (t: number) => void) => () => void;
  /** Le temps courant, en secondes — le point de départ d'un pas clavier. */
  readonly now: () => number;
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
  const seekListeners = useRef<Set<(t: number) => void>>(new Set());
  /** La boucle d'images du rendu `enabled && playing` en cours, `null` hors
   * lecture — `seek` la relance quand une scène TERMINÉE repart en arrière. */
  const loop = useRef<((now: number) => void) | null>(null);
  const duration = useRef(durationSeconds);
  duration.current = durationSeconds;
  const callbacks = useLatestCallback({ onTime: params.onTime, onEnded: params.onEnded, onLoop: params.onLoop });

  useEffect(() => {
    if (!enabled || !playing) {
      lastFrame.current = null;
      return;
    }
    ended.current = false;
    const tick = (now: number) => {
      rafId.current = null;
      if (lastFrame.current === null) lastFrame.current = now;
      const deltaSeconds = (now - lastFrame.current) / 1000;
      lastFrame.current = now;
      let t = elapsed.current + deltaSeconds;
      const hasDuration = durationSeconds !== null && durationSeconds > 0;
      let stop = false;
      if (hasDuration && durationSeconds !== null && t >= durationSeconds) {
        if (loops) {
          t = t % durationSeconds;
          callbacks.current.onLoop?.();
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
    loop.current = tick;
    rafId.current = requestAnimationFrame(tick);
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      rafId.current = null;
      lastFrame.current = null;
      loop.current = null;
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
      subscribeSeek(listener: (t: number) => void) {
        seekListeners.current.add(listener);
        return () => {
          seekListeners.current.delete(listener);
        };
      },
      seek(target: number) {
        const cap = duration.current;
        const floor = Math.max(0, Number.isFinite(target) ? target : 0);
        const t = cap !== null && cap > 0 ? Math.min(cap, floor) : floor;
        elapsed.current = t;
        // La trame suivante repart d'ICI : le temps écoulé AVANT le seek ne
        // compte pas, sinon un seek en lecture sauterait d'un delta.
        lastFrame.current = null;
        if (cap === null || t < cap) ended.current = false;
        for (const listener of listeners.current) listener(t);
        for (const listener of seekListeners.current) listener(t);
        callbacks.current.onTime?.(t);
        const tick = loop.current;
        if (tick !== null && rafId.current === null && !ended.current) rafId.current = requestAnimationFrame(tick);
      },
      now: () => elapsed.current,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}
