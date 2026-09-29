import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { chromeAfter, chromeHidden, CHROME_IDLE_MS, type ChromeCue, type ChromeVisibility } from './call-controls';

/**
 * **CE QUI EFFACE LES COMMANDES D'UNE VIDÉO** (#8391, #8550) — le branchement
 * DOM de `chromeAfter` et `chromeHidden`, sur une scène vidéo seulement :
 *
 * - TOUCHER la scène (n'importe où hors d'un bouton, d'un champ ou du cadre
 *   des commandes) efface TOUTES les commandes — en-tête, pilule et son
 *   panneau, capsule de zoom, pastilles d'état ; un second toucher les rend ;
 * - au bout de `CHROME_IDLE_MS` sans geste, elles s'effacent d'elles-mêmes —
 *   jamais avec le focus CLAVIER dans les commandes (`:focus-visible`),
 *   jamais sous `prefers-reduced-motion` ; bouger la souris les rend ;
 * - le clavier et le focus les rendent toujours.
 *
 * Un geste n'écrit qu'une référence : bouger la souris ne rend pas l'écran
 * d'appel à chaque pixel. Seul le passage caché ↔ visible est un état.
 */

const STIRS = ['pointermove', 'wheel'] as const;
const KEYS = ['keydown', 'focusin'] as const;

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
  '[tabindex]:not([tabindex="-1"])',
  '[data-call-chrome-keep]',
].join(', ');

/**
 * Décidé à la DESCENTE du toucher (phase de capture), avant que la cible
 * n'agisse : sous Preact, un bouton qui change d'état (« Couper le micro » →
 * « Activer le micro ») remplace son glyphe pendant son propre gestionnaire,
 * et à la remontée la cible, détachée, n'a plus de bouton parmi ses ancêtres.
 */
export const tapTogglesChrome = (event: Event): boolean => event.target instanceof Element && event.target.closest(INTERACTIVE) === null;

const prefersReducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const keyboardInside = (controls: HTMLElement | null): boolean => {
  const focused = typeof document === 'undefined' ? null : document.activeElement;
  return controls !== null && focused instanceof HTMLElement && controls.contains(focused) && focused.matches(':focus-visible');
};

/** `held` : un sous-menu est ouvert — on y regarde (l'aperçu d'une capture, un effet qu'on essaie) ; l'écran ne s'efface pas de lui-même. */
type ChromeInput = { readonly videoScene: boolean; readonly root: RefObject<HTMLElement | null>; readonly controls: RefObject<HTMLElement | null>; readonly held?: boolean };

export function useCallChrome({ videoScene, root, controls, held = false }: ChromeInput): boolean {
  const [visibility, setVisibility] = useState<ChromeVisibility>('shown');
  const lastGesture = useRef(Date.now());
  const scene = useRef(videoScene);
  scene.current = videoScene;

  const cue = useCallback((next: ChromeCue) => {
    lastGesture.current = Date.now();
    setVisibility((current) => chromeAfter(current, next));
  }, []);

  useEffect(() => {
    const element = root.current;
    if (element === null) return undefined;
    const stir = () => cue('stir');
    const key = () => cue('key');
    const press = (event: Event) => {
      lastGesture.current = Date.now();
      if (!tapTogglesChrome(event)) cue('stir');
    };
    const tap = (event: Event) => {
      if (scene.current && tapTogglesChrome(event)) cue('tap');
    };
    STIRS.forEach((name) => element.addEventListener(name, stir, { passive: true }));
    KEYS.forEach((name) => element.addEventListener(name, key));
    element.addEventListener('pointerdown', press, { passive: true, capture: true });
    element.addEventListener('click', tap, { capture: true });
    return () => {
      STIRS.forEach((name) => element.removeEventListener(name, stir));
      KEYS.forEach((name) => element.removeEventListener(name, key));
      element.removeEventListener('pointerdown', press, { capture: true });
      element.removeEventListener('click', tap, { capture: true });
    };
  }, [root, cue]);

  useEffect(() => {
    if (!videoScene) setVisibility('shown');
  }, [videoScene]);

  useEffect(() => {
    if (!videoScene || held || visibility !== 'shown' || prefersReducedMotion()) return undefined;
    const pending = { handle: setTimeout(() => undefined, 0) };
    const check = (): void => {
      const idleMs = Date.now() - lastGesture.current;
      const hide = chromeHidden({ videoScene, idleMs, keyboardInside: keyboardInside(controls.current), reducedMotion: false });
      if (hide) {
        setVisibility((current) => chromeAfter(current, 'rest'));
        return;
      }
      pending.handle = setTimeout(check, idleMs >= CHROME_IDLE_MS ? CHROME_IDLE_MS : CHROME_IDLE_MS - idleMs);
    };
    pending.handle = setTimeout(check, Math.max(0, CHROME_IDLE_MS - (Date.now() - lastGesture.current)));
    return () => clearTimeout(pending.handle);
  }, [videoScene, held, visibility, controls]);

  return videoScene && visibility !== 'shown';
}
