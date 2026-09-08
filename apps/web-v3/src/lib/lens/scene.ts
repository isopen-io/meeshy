import { useEffect, useRef, useState } from 'react';

import { SCENE_ENTER_DURATION_MS, SCENE_FLATTEN_DURATION_MS, SCENE_REST_DELAY_MS } from '@/lib/reading-mode/metrics';

import {
  BAND_OFFSET,
  BAND_HALF_HEIGHT,
  bandCenter,
  blend,
  breathing,
  electFocus,
  enterLevel,
  perspective,
} from './law';

/**
 * LA SCÈNE DE LA LENTILLE — ce qui transforme un défilement en perspective,
 * et ce qui l'APLATIT au repos (#5694, écart 2).
 *
 * QUATRE RÈGLES GOUVERNENT CE FICHIER, et chacune vient d'un piège précis.
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
 *    d'état. Seules la rangée ÉLUE et le NIVEAU DE SCÈNE traversent React
 *    (`focus`, `level`) parce qu'ils changent de CONTENU (le supplément
 *    magnifié) et non seulement d'apparence — et `level` ne change que DEUX
 *    fois par session de défilement (miroir `LentilleSceneActivity.level`,
 *    doc-comment Swift), jamais par tick.
 *
 * 3. **`prefers-reduced-motion` coupe la perspective, jamais l'élection.**
 *    Un utilisateur qui réduit les animations perd le relief ; il ne doit pas
 *    perdre le repère.
 *
 * 4. **AU REPOS, LA LISTE S'APLATIT** (`LentilleSceneActivity.noteScroll`/
 *    `.flatten`, `Perspective/LentilleSceneActivity.swift:33-55`) :
 *    `level` vaut 1 pendant le défilement et jusqu'à `SCENE_REST_DELAY_MS`
 *    après le dernier tick, 0 au repos — `blend(perspective(distance),
 *    level)` fond alors CHAQUE rangée vers l'identité, quelle que soit sa
 *    distance à la bande de focus. La MAGNIFICATION suit : `magnified` (posé
 *    par l'appelant) doit se gater par `level > 0` — une rangée élue ne
 *    reste visuellement magnifiée qu'en scène active, exactement
 *    `LentilleMagnifiableRow.isMagnified = scene.level > 0 &&
 *    election.electedId == id` (`Mode/LentilleMagnification.swift:435-437`).
 *    Le retour à l'identité est ANIMÉ (`SCENE_FLATTEN_DURATION_MS`, une
 *    transition CSS posée juste avant l'écriture finale, jamais pendant le
 *    défilement actif — sinon chaque écriture par image serait, elle aussi,
 *    transitionnée, et la perspective prendrait du retard sur le doigt).
 */

/** Ce que la scène remet à la liste, et qui traverse React. */
export type Scene = {
  /** L'identifiant de la rangée élue par la bande de focus. */
  readonly focus: string | null;
  /**
   * 1 pendant le défilement et jusqu'au repos, 0 après
   * `SCENE_REST_DELAY_MS` d'immobilité. Gate la magnification : une rangée
   * n'est visuellement magnifiée que si `level > 0`.
   */
  readonly level: number;
};

const REDUCED_MOTION = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const flattenTransition = (reduced: boolean): string =>
  reduced ? 'none' : `opacity ${SCENE_FLATTEN_DURATION_MS}ms ease-in-out, transform ${SCENE_FLATTEN_DURATION_MS}ms ease-in-out`;

export function useScene(frame: { current: HTMLElement | null }): Scene {
  const [focus, setFocus] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const focusRef = useRef<string | null>(null);
  const levelRef = useRef(0);
  const enteredAt = useRef<number | null>(null);
  const request = useRef(0);
  const rest = useRef<ReturnType<typeof setTimeout> | null>(null);

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
       * L'ENTRÉE EST EASE-OUT (`enterLevel`, `SCENE_ENTER_DURATION_MS`) —
       * atteint 1 avant même la fin de la fenêtre, l'écrêtage évite un
       * dépassement au-delà.
       */
      const currentLevel = (() => {
        if (levelRef.current === 0) return 0;
        if (enteredAt.current === null) return 1;
        const elapsed = performance.now() - enteredAt.current;
        return elapsed >= SCENE_ENTER_DURATION_MS ? 1 : enterLevel(elapsed, SCENE_ENTER_DURATION_MS);
      })();

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
        const rawP = reduced ? { alpha: 1, scale: 1 } : perspective(distance);
        const p = reduced ? rawP : blend(rawP, currentLevel);
        const breath = breathing({ distance, level: currentLevel, reducedMotion: reduced });
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

      /**
       * L'ENTRÉE EST UNE ANIMATION, DONC ELLE A BESOIN D'UN MOTEUR.
       *
       * `enterLevel` interpole sur `SCENE_ENTER_DURATION_MS` — mais rien ne
       * REJOUE la passe une fois le doigt arrêté : `pass` n'était planifiée
       * que par un événement `scroll`. Un défilement d'UN SEUL événement
       * (roulette d'un cran, `scrollTo`, PagePrécédente au clavier, fin de
       * geste) laissait donc la perspective figée à sa première fraction —
       * mesuré : opacités 0,990 à 1,000, échelles 0,999, pendant les 4,5 s
       * qui précèdent l'aplatissement — PENDANT que `level = 1` avait déjà
       * ouvert le supplément magnifié. Une scène à moitié armée : le
       * contenu de la rangée élue paraît, le relief qui la désigne jamais.
       *
       * Tant que la scène monte, la passe se replanifie donc elle-même — et
       * s'arrête d'elle-même dès `currentLevel === 1`, sans minuteur ni
       * boucle permanente.
       */
      if (levelRef.current === 1 && currentLevel < 1 && request.current === 0) {
        request.current = requestAnimationFrame(pass);
      }
    };

    /**
     * L'APLATISSEMENT — miroir `LentilleSceneActivity.flatten()` : le niveau
     * retombe à 0, ANIMÉ. La transition CSS n'est posée que pour CETTE
     * écriture (jamais pendant le défilement actif, § règle 4 du
     * doc-comment) et effacée par la prochaine entrée en scène.
     */
    const flatten = () => {
      levelRef.current = 0;
      enteredAt.current = null;
      setLevel(0);
      for (const rank of element.querySelectorAll<HTMLElement>('[data-row]')) {
        const visual = rank.firstElementChild;
        if (visual instanceof HTMLElement) {
          visual.style.transition = flattenTransition(reduced);
          visual.style.opacity = '1';
          visual.style.transform = 'translateY(0px) scale(1)';
        }
      }
    };

    const onScroll = () => {
      if (levelRef.current === 0) {
        levelRef.current = 1;
        enteredAt.current = performance.now();
        setLevel(1);
        // Une nouvelle entrée en scène : effacer la transition posée par un
        // éventuel aplatissement précédent, sans quoi les écritures par
        // image de la passe active seraient, elles aussi, transitionnées —
        // la perspective prendrait du retard sur le doigt.
        for (const rank of element.querySelectorAll<HTMLElement>('[data-row]')) {
          const visual = rank.firstElementChild;
          if (visual instanceof HTMLElement) visual.style.transition = '';
        }
      }
      if (rest.current !== null) clearTimeout(rest.current);
      rest.current = setTimeout(flatten, SCENE_REST_DELAY_MS);
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

  return { focus, level };
}
