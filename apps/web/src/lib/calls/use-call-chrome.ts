import { useEffect, useRef, useState, type RefObject } from 'react';

import { chromeAfter, type ChromeCue, type ChromeVisibility } from './call-controls';

/**
 * **CE QUI RANGE LES COMMANDES D'UNE VIDÉO** (#8391, #8550, #8988) — le
 * branchement DOM de `chromeAfter`, sur une scène vidéo seulement :
 *
 * - TOUCHER la scène (n'importe où hors d'un bouton, d'un champ ou du cadre
 *   des commandes) range TOUTES les commandes — en-tête, pilule et son
 *   panneau, capsule de zoom, pastilles d'état ; le toucher suivant les rend ;
 * - rien d'autre ne les range : aucune attente, aucun mouvement de souris
 *   (#8988, directive porteur du 2026-10-01) ;
 * - le clavier les rend toujours. La touche s'écoute sur le DOCUMENT : un clic
 *   sur la scène, qui n'est pas focalisable, emporte le focus HORS de l'écran
 *   d'appel, sur le `<dialog>` qui le porte (`call-layer.tsx`, mesuré dans
 *   Chromium), où un écouteur posé sur l'écran ne l'entend plus ; le focus
 *   qui entre dans l'écran les rend aussi.
 */

/** Ce qui AGIT à l'endroit touché : le toucher lui appartient, il n'efface rien. */
const INTERACTIVE = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[role="button"]',
  '[role="slider"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="alertdialog"]',
  '[role="dialog"]',
  '[role="toolbar"]',
  '[tabindex]:not([tabindex="-1"])',
  '[data-call-header]',
  '[data-call-chrome-keep]',
].join(', ');

/**
 * Décidé à la DESCENTE du toucher (phase de capture), avant que la cible
 * n'agisse : sous Preact, un bouton qui change d'état (« Couper le micro » →
 * « Activer le micro ») remplace son glyphe pendant son propre gestionnaire,
 * et à la remontée la cible, détachée, n'a plus de bouton parmi ses ancêtres.
 *
 * Un toucher qui rate de peu (le titre d'une feuille, l'espace entre deux
 * boutons d'une rangée, un vide de l'en-tête — #8735) appartient à ce qu'il
 * touche. L'écran d'appel étant lui-même un dialogue, seul ce qui agit À
 * L'INTÉRIEUR de l'élément écouté (`currentTarget`) retient le toucher.
 */
export const tapTogglesChrome = (event: Event): boolean => {
  if (!(event.target instanceof Element)) return false;
  const hit = event.target.closest(INTERACTIVE);
  const scope = event.currentTarget;
  return hit === null || hit === scope || (scope instanceof Node && !scope.contains(hit));
};

type ChromeInput = { readonly videoScene: boolean; readonly root: RefObject<HTMLElement | null> };

/**
 * Ce que montrent les commandes : `shown` hors d'une scène vidéo, sinon
 * l'état de `chromeAfter` — que l'écran projette en opacité et en visibilité.
 */
export function useCallChrome({ videoScene, root }: ChromeInput): ChromeVisibility {
  const [visibility, setVisibility] = useState<ChromeVisibility>('shown');
  const scene = useRef(videoScene);
  scene.current = videoScene;

  useEffect(() => {
    const element = root.current;
    if (element === null) return undefined;
    const page = element.ownerDocument;
    const cue = (next: ChromeCue) => setVisibility((current) => chromeAfter(current, next));
    const key = () => cue('key');
    const tap = (event: Event) => {
      if (scene.current && tapTogglesChrome(event)) cue('tap');
    };
    page.addEventListener('keydown', key);
    element.addEventListener('focusin', key);
    element.addEventListener('click', tap, { capture: true });
    return () => {
      page.removeEventListener('keydown', key);
      element.removeEventListener('focusin', key);
      element.removeEventListener('click', tap, { capture: true });
    };
  }, [root]);

  useEffect(() => {
    if (!videoScene) setVisibility('shown');
  }, [videoScene]);

  return videoScene ? visibility : 'shown';
}
