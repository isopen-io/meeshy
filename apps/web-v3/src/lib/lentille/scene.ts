import { useEffect, useRef, useState } from 'react';

import {
  DECALAGE_DE_BANDE,
  DEMI_HAUTEUR_DE_BANDE,
  centreDeLaBande,
  elisLeFocus,
  perspective,
  respiration,
} from './loi';

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

const MOUVEMENT_REDUIT = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * L'ACTIVITÉ DE LA SCÈNE : 1 pendant le défilement, 0 après un temps de repos.
 * La respiration en dépend — c'est un effet du MOUVEMENT, pas un état de la
 * liste. Sans ce retour à zéro, une liste immobile garderait ses voisines
 * écartées, ce qui ferait lire l'écart comme une séparation permanente.
 */
const REPOS_MS = 220;

export function useScene(cadre: { current: HTMLElement | null }): Scene {
  const [focus, setFocus] = useState<string | null>(null);
  const focusRef = useRef<string | null>(null);
  const demande = useRef(0);
  const repos = useRef<ReturnType<typeof setTimeout> | null>(null);
  const niveau = useRef(0);

  useEffect(() => {
    const element = cadre.current;
    if (element === null) return;

    const reduit = MOUVEMENT_REDUIT();

    const passe = () => {
      demande.current = 0;
      const boite = element.getBoundingClientRect();
      const rangs = element.querySelectorAll<HTMLElement>('[data-ligne]');
      if (rangs.length === 0) return;

      const focusY = centreDeLaBande({
        hautDuCadre: boite.top,
        basDuCadre: boite.bottom - DECALAGE_DE_BANDE,
        defilement: element.scrollTop,
      });

      /**
       * UNE seule passe de LECTURE, puis une seule passe d'ÉCRITURE. Les
       * entrelacer ferait, à chaque rangée, une invalidation puis une
       * relecture — le « layout thrashing » : O(n) recalculs au lieu d'un.
       */
      const mesures: { readonly noeud: HTMLElement; readonly id: string; readonly milieuY: number }[] = [];
      for (const rang of rangs) {
        const r = rang.getBoundingClientRect();
        const id = rang.dataset.ligne;
        if (id === undefined) continue;
        mesures.push({ noeud: rang, id, milieuY: r.top + r.height / 2 });
      }

      const elu = elisLeFocus({
        candidats: mesures,
        focusY,
        courant: focusRef.current,
        hysteresis: DEMI_HAUTEUR_DE_BANDE,
      });

      for (const m of mesures) {
        const distance = focusY - m.milieuY;
        const p = reduit ? { alpha: 1, echelle: 1 } : perspective(distance);
        const souffle = respiration({ distance, niveau: niveau.current, mouvementReduit: reduit });
        const visuel = m.noeud.firstElementChild;
        if (visuel instanceof HTMLElement) {
          visuel.style.opacity = String(p.alpha);
          visuel.style.transform = `translateY(${souffle}px) scale(${p.echelle})`;
        }
      }

      if (elu !== focusRef.current) {
        focusRef.current = elu;
        setFocus(elu);
      }
    };

    const auDefilement = () => {
      niveau.current = 1;
      if (repos.current !== null) clearTimeout(repos.current);
      repos.current = setTimeout(() => {
        niveau.current = 0;
        // Une dernière passe pour refermer la respiration proprement.
        if (demande.current === 0) demande.current = requestAnimationFrame(passe);
      }, REPOS_MS);
      if (demande.current === 0) demande.current = requestAnimationFrame(passe);
    };

    element.addEventListener('scroll', auDefilement, { passive: true });
    // Une passe initiale : sans elle, rien n'est élu tant qu'on n'a pas défilé.
    demande.current = requestAnimationFrame(passe);

    return () => {
      element.removeEventListener('scroll', auDefilement);
      if (demande.current !== 0) cancelAnimationFrame(demande.current);
      if (repos.current !== null) clearTimeout(repos.current);
    };
  }, [cadre]);

  return { focus };
}
