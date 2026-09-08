import { useEffect, useRef, useState } from 'react';

import {
  BAND_OFFSET,
  BAND_HALF_HEIGHT,
  bandCenter,
  electFocus,
  perspective,
  breathing,
} from './law';

/**
 * LA SCÈNE DE LA LENTILLE — ce qui transforme un défilement en perspective.
 *
 * TROIS RÈGLES GOUVERNENT CE FICHIER, et chacune vient d'un piège précis.
 *
 * 1. **On ne lit la géométrie qu'UNE fois par image.** Chaque
 *    `getBoundingClientRect()` force le navigateur à recalculer la mise en
 *    page. En lire une par rangée à chaque événement `scroll` — qui se
 *    déclenche plus souvent que les images — produirait la saccade qu'on
 *    cherche précisément à éviter. Un `requestAnimationFrame` coalesce donc
 *    tous les événements d'une image en une seule passe.
 *
 * 2. **On n'écrit que `transform` et `opacity`, et JAMAIS par l'état React.**
 *    Repasser par un rendu à chaque image ferait diffuser l'arbre entier
 *    soixante fois par seconde. La passe écrit donc directement dans le style
 *    des nœuds — c'est ce que `visualEffect` fait sur iOS, et pour la même
 *    raison : la perspective est une passe d'AFFICHAGE, pas un changement
 *    d'état. Seule la rangée ÉLUE traverse React, parce qu'elle change de
 *    contenu (son supplément) et non seulement d'apparence.
 *
 * 3. **`prefers-reduced-motion` coupe la perspective, jamais l'élection.**
 *    Un utilisateur qui réduit les animations perd le relief ; il ne doit pas
 *    perdre le repère. La rangée reste élue, elle reste magnifiée, et tout est
 *    rendu à opacité et échelle pleines.
 */

/** Ce que la scène remet à la liste, et qui traverse React. */
export type Scene = {
  /** L'identifiant de la rangée élue par la bande de focus. */
  readonly focus: string | null;
};

const REDUCED_MOTION = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * L'ACTIVITÉ DE LA SCÈNE : 1 pendant le défilement, 0 après un temps de repos.
 * La respiration en dépend — c'est un effet du MOUVEMENT, pas un état de la
 * liste. Sans ce retour à zéro, une liste immobile garderait ses voisines
 * écartées, ce qui ferait lire l'écart comme une séparation permanente.
 */
const REST_MS = 220;

export function useScene(frame: { current: HTMLElement | null }): Scene {
  const [focus, setFocus] = useState<string | null>(null);
  const focusRef = useRef<string | null>(null);
  const request = useRef(0);
  const rest = useRef<ReturnType<typeof setTimeout> | null>(null);
  const level = useRef(0);

  useEffect(() => {
    const element = frame.current;
    if (element === null) return;

    const reduced = REDUCED_MOTION();

    const pass = () => {
      request.current = 0;
      const box = element.getBoundingClientRect();
      const ranks = element.querySelectorAll<HTMLElement>('[data-row]');
      if (ranks.length === 0) return;

      const focusY = bandCenter({
        frameTop: box.top,
        frameBottom: box.bottom - BAND_OFFSET,
        scroll: element.scrollTop,
      });

      /**
       * UNE seule passe de LECTURE, puis une seule passe d'ÉCRITURE. Les
       * entrelacer ferait, à chaque rangée, une invalidation puis une
       * relecture — le « layout thrashing » : O(n) recalculs au lieu d'un.
       */
      const metrics: { readonly node: HTMLElement; readonly id: string; readonly midY: number }[] = [];
      for (const rank of ranks) {
        const r = rank.getBoundingClientRect();
        const id = rank.dataset.row;
        if (id === undefined) continue;
        metrics.push({ node: rank, id, midY: r.top + r.height / 2 });
      }

      const elected = electFocus({
        candidates: metrics,
        focusY,
        current: focusRef.current,
        hysteresis: BAND_HALF_HEIGHT,
      });

      for (const m of metrics) {
        const distance = focusY - m.midY;
        const p = reduced ? { alpha: 1, scale: 1 } : perspective(distance);
        const breath = breathing({ distance, level: level.current, reducedMotion: reduced });
        const visual = m.node.firstElementChild;
        if (visual instanceof HTMLElement) {
          visual.style.opacity = String(p.alpha);
          visual.style.transform = `translateY(${breath}px) scale(${p.scale})`;
        }
      }

      if (elected !== focusRef.current) {
        focusRef.current = elected;
        setFocus(elected);
      }
    };

    const onScroll = () => {
      level.current = 1;
      if (rest.current !== null) clearTimeout(rest.current);
      rest.current = setTimeout(() => {
        level.current = 0;
        // Une dernière passe pour refermer la respiration proprement.
        if (request.current === 0) request.current = requestAnimationFrame(pass);
      }, REST_MS);
      if (request.current === 0) request.current = requestAnimationFrame(pass);
    };

    element.addEventListener('scroll', onScroll, { passive: true });
    // Une passe initiale : sans elle, rien n'est élu tant qu'on n'a pas défilé.
    request.current = requestAnimationFrame(pass);

    return () => {
      element.removeEventListener('scroll', onScroll);
      if (request.current !== 0) cancelAnimationFrame(request.current);
      if (rest.current !== null) clearTimeout(rest.current);
    };
  }, [frame]);

  return { focus };
}
