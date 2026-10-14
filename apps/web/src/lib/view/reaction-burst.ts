/**
 * LE RETOUR D'UN DOUBLE TOUCHER (#10599) — l'emoji posé éclot là où le doigt
 * a touché, puis s'efface. Un élément ÉPHÉMÈRE posé sur `document.body`, hors
 * de toute rangée : aucun rendu du fil n'est relancé, et la rangée virtualisée
 * peut disparaître sans emporter l'animation. Un `transform` et une opacité
 * seulement — composités, aucune mise en page.
 *
 * Sous « Réduire les animations », l'emoji apparaît et s'efface sur place, sans
 * échelle ni déplacement. `aria-hidden` : la pastille de la rangée, mise à jour
 * en optimiste, est ce que le lecteur d'écran lit.
 */

export const REACTION_BURST_MS = 560;
export const REACTION_BURST_REDUCED_MS = 360;

const CENTER = 'translate(-50%, -50%)';

const KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: `${CENTER} scale(0.4)` },
  { opacity: 1, transform: `${CENTER} scale(1.2)`, offset: 0.35 },
  { opacity: 1, transform: `${CENTER} scale(1)`, offset: 0.6 },
  { opacity: 0, transform: 'translate(-50%, -120%) scale(1)' },
];

const REDUCED_KEYFRAMES: Keyframe[] = [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }];

export function playReactionBurst(input: { readonly emoji: string; readonly x: number; readonly y: number; readonly reducedMotion: boolean }): HTMLElement {
  const burst = document.createElement('span');
  burst.textContent = input.emoji;
  burst.setAttribute('aria-hidden', 'true');
  burst.dataset.reactionBurst = '';
  Object.assign(burst.style, {
    position: 'fixed',
    left: `${input.x}px`,
    top: `${input.y}px`,
    transform: CENTER,
    fontSize: '44px',
    lineHeight: '1',
    pointerEvents: 'none',
    zIndex: '70',
  });
  document.body.append(burst);
  const duration = input.reducedMotion ? REACTION_BURST_REDUCED_MS : REACTION_BURST_MS;
  const remove = (): void => burst.remove();
  setTimeout(remove, duration + 80);
  if (typeof burst.animate === 'function') {
    const animation = burst.animate(input.reducedMotion ? REDUCED_KEYFRAMES : KEYFRAMES, { duration, easing: 'ease-out', fill: 'forwards' });
    void animation.finished.then(remove, remove);
  }
  return burst;
}
