import { useLayoutEffect, useRef, type RefObject } from 'react';

import { prefersReducedMotion } from '@/lib/view/reduced-motion';

/**
 * LA CARTE QUI PART SORT EN MOUVEMENT (#18322) — `OnboardingOverlay.swift` fait sortir la carte
 * quittée vers le bord de début avec un fondu (`removal: .move(edge: .leading)`), un fondu seul sous
 * « Réduire les animations ». La scène est remontée par `key={step}` : la carte quittée est démontée
 * dans l'image même où la suivante entre. Une copie inerte de sa boîte, posée à la même place dans
 * l'accueil, joue donc la sortie puis s'en va ; la vraie carte, son état et ses effets sont déjà partis.
 *
 * La copie ne garde ni identifiant, ni nom de champ, ni attribut `data-onb-*`, ni rôle, ni `aria-*` :
 * rien ne la confond avec la carte vivante, ni un lecteur d'écran, ni un sélecteur de l'accueil. Les
 * autres `data-*` restent, parce que la feuille en lit l'apparence (`data-current` des segments).
 */

/** La sortie, plus courte que l'entrée (`onb-enter`, 560 ms) : la carte suivante est déjà là. */
export const ONB_STAGE_EXIT_MS = 280;
/** Le fondu court des fiches sous réduction. */
export const ONB_STAGE_EXIT_REDUCED_MS = 150;

const stripIdentity = (root: HTMLElement): void => {
  for (const node of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    for (const name of node.getAttributeNames()) {
      if (name === 'id' || name === 'name' || name === 'autofocus' || name === 'role' || name.startsWith('data-onb') || name.startsWith('aria-')) node.removeAttribute(name);
    }
    node.style.animation = 'none';
  }
};

export function leaveStageAsGhost(node: HTMLElement): HTMLElement | null {
  const host = node.closest<HTMLElement>('[data-onboarding]');
  if (host === null || !node.isConnected || typeof node.animate !== 'function') return null;
  const box = node.getBoundingClientRect();
  const frame = host.getBoundingClientRect();
  const shift = getComputedStyle(host).getPropertyValue('--onb-enter').trim() || '32px';
  const reduced = prefersReducedMotion();

  const ghost = node.cloneNode(true) as HTMLElement;
  stripIdentity(ghost);
  ghost.setAttribute('data-onb-ghost', '');
  ghost.setAttribute('inert', '');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    position: 'absolute',
    left: `${box.left - frame.left}px`,
    top: `${box.top - frame.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    margin: '0',
    pointerEvents: 'none',
  });
  host.appendChild(ghost);

  const frames = reduced ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `calc(-1 * ${shift}) 0` }];
  const duration = reduced ? ONB_STAGE_EXIT_REDUCED_MS : ONB_STAGE_EXIT_MS;
  const timer = setTimeout(() => ghost.remove(), duration * 2);
  const leaving = ghost.animate(frames, { duration, easing: 'ease-in', fill: 'forwards' });
  leaving.onfinish = () => {
    clearTimeout(timer);
    ghost.remove();
  };
  return ghost;
}

/** La référence à poser sur un élément qui sort de l'accueil en mouvement quand il est démonté. */
export function useLeavesAsGhost<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useLayoutEffect(
    () => () => {
      if (ref.current !== null) leaveStageAsGhost(ref.current);
    },
    [],
  );
  return ref;
}
