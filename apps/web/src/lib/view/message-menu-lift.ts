import { PREVIEW_FADE_MS, PREVIEW_LIFT_MS } from './message-menu-metrics';

/**
 * L'APERÇU SE SOULÈVE DEPUIS SA RANGÉE, ET Y RETOURNE (#11206) — un FLIP :
 * l'hôte est posé à sa place FINALE (`placeMessageMenuCluster`), et l'animation
 * part du décalage qui le ramène sur la rangée pressée. Seuls `transform` et
 * `opacity` s'animent — les deux propriétés qui ne relancent pas la mise en
 * page — et l'animation n'a AUCUN `fill` : une fois finie, l'hôte retrouve son
 * style inline, sans transform résiduel quand l'aperçu tient à l'échelle 1
 * (le texte reste net, aucun calque composité ne survit).
 *
 * Le RETOUR se joue sur un FANTÔME : le menu se démonte aussitôt (le focus
 * revient à la rangée, l'action choisie part sans attendre), et une copie
 * inerte de l'hôte redescend sur la rangée, qui ne réapparaît qu'à son arrivée.
 *
 * Sous `prefers-reduced-motion`, ni montée ni descente : un fondu de 150 ms.
 */

export type LiftOffset = { readonly dx: number; readonly dy: number };

type LiftAnchor = { readonly left: number; readonly right: number; readonly top: number };
type LiftPlacement = { readonly previewLeft: number; readonly previewWidth: number; readonly previewTop: number };

/** Le décalage qui ramène l'hôte placé sur la rangée — bord à bord, du côté
 * d'où le message part (droite pour un envoi, gauche sinon), au pixel entier. */
export function liftOffset({
  anchor,
  placement,
  isMine,
}: {
  readonly anchor: LiftAnchor;
  readonly placement: LiftPlacement;
  readonly isMine: boolean;
}): LiftOffset {
  const dx = isMine ? anchor.right - (placement.previewLeft + placement.previewWidth) : anchor.left - placement.previewLeft;
  return { dx: Math.round(dx), dy: Math.round(anchor.top - placement.previewTop) };
}

const translateOf = ({ dx, dy }: LiftOffset): string => `translate(${dx}px, ${dy}px)`;

export type LiftMotion = { readonly keyframes: readonly Keyframe[]; readonly options: KeyframeAnimationOptions };

const LIFT_EASING = 'cubic-bezier(0.2, 0.9, 0.3, 1)';

/** Les images clés de la montée (`in`) ou du retour (`out`). `rest` : le
 * transform de l'hôte posé (`none` à l'échelle 1). */
export function liftMotion({
  direction,
  offset,
  rest,
  reduced,
}: {
  readonly direction: 'in' | 'out';
  readonly offset: LiftOffset;
  readonly rest: string;
  readonly reduced: boolean;
}): LiftMotion {
  if (reduced) {
    const fade = [{ opacity: 0 }, { opacity: 1 }];
    return { keyframes: direction === 'in' ? fade : [...fade].reverse(), options: { duration: PREVIEW_FADE_MS, easing: 'ease-out' } };
  }
  const travel = [{ transform: translateOf(offset) }, { transform: rest }];
  return { keyframes: direction === 'in' ? travel : [...travel].reverse(), options: { duration: PREVIEW_LIFT_MS, easing: LIFT_EASING } };
}

const canAnimate = (element: HTMLElement): boolean => typeof element.animate === 'function';

/** Joue la montée de l'hôte ; `data-lifting` dure le temps du geste. */
export function playLift(host: HTMLElement, motion: LiftMotion): void {
  if (!canAnimate(host)) return;
  host.setAttribute('data-lifting', '');
  const animation = host.animate([...motion.keyframes], motion.options);
  void animation.finished.then(
    () => host.removeAttribute('data-lifting'),
    () => host.removeAttribute('data-lifting'),
  );
}

/** Ce que le fantôme ne doit JAMAIS porter : il n'est pas l'aperçu, et aucun
 * gate ni lecteur d'écran ne doit le compter pour tel. */
const GHOST_STRIPPED = ['data-message-menu-preview-host', 'data-message-menu-piece-host', 'data-lifting', 'id'] as const;

/**
 * Joue le retour sur un FANTÔME de l'hôte, posé sur `document.body` le temps
 * de la descente ; la promesse se résout à l'arrivée (fantôme retiré). `null` :
 * rien à jouer — l'appelant rend la rangée tout de suite.
 */
export function playReturn(
  host: HTMLElement,
  { motion, skin, layer }: { readonly motion: LiftMotion; readonly skin: Readonly<Record<string, string>>; readonly layer: number },
): Promise<void> | null {
  if (!canAnimate(host) || typeof document === 'undefined') return null;
  const ghost = host.cloneNode(true) as HTMLElement;
  GHOST_STRIPPED.forEach((name) => ghost.removeAttribute(name));
  ghost.querySelectorAll('[data-message-preview]').forEach((node) => node.removeAttribute('data-message-preview'));
  ghost.setAttribute('data-message-menu-return', '');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  ghost.style.zIndex = String(layer);
  ghost.style.pointerEvents = 'none';
  Object.entries(skin).forEach(([name, value]) => ghost.style.setProperty(name, value));
  document.body.append(ghost);
  if (!canAnimate(ghost)) {
    ghost.remove();
    return null;
  }
  const animation = ghost.animate([...motion.keyframes], { ...motion.options, fill: 'forwards' });
  return animation.finished.then(
    () => ghost.remove(),
    () => ghost.remove(),
  );
}
