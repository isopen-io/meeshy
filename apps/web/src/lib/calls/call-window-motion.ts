/**
 * **L'ÉCRAN D'APPEL SE CONTRACTE VERS L'APPEL RÉDUIT ET SE REDÉPLOIE DEPUIS LUI** (P18.4, P18.8) — miroir d'iOS
 * `CallShareCapsuleMotion.window` (#18464) et d'Android `CallShareCapsuleMotion.window` (#18449), mêmes vecteurs.
 * La capsule vit en haut au centre : l'écran s'y contracte au dixième et en repart. La bulle flotte où on l'a
 * posée : l'écran part de son centre MESURÉ, en fractions de l'écran, borné à lui. Sans appel réduit vivant,
 * l'échelle courte au centre. « Réduire les animations » : échelle 1, un fondu seul. Transformation et opacité
 * seulement ; l'ancre est `transform-origin`, posée par le moteur (`pill-motion-engine.ts`). Pur.
 */
export type CallWindowMotion = { readonly scale: number; readonly pivotX: number; readonly pivotY: number };

export const WINDOW_CONTRACTED_SCALE = 0.1;
export const WINDOW_SHORT_SCALE = 0.92;

export type WindowPoint = { readonly x: number; readonly y: number };
export type WindowSize = { readonly width: number; readonly height: number };

/** D'où l'écran part, ou vers quoi il se contracte : la capsule, ou la bulle là où elle flotte (`null` : pas mesurée). */
export type WindowFrom = { readonly kind: 'capsule' } | { readonly kind: 'bubble'; readonly center: WindowPoint; readonly size: WindowSize } | { readonly kind: 'none' };

export function callWindow({ reducedMotion, capsuleLive }: { readonly reducedMotion: boolean; readonly capsuleLive: boolean }): CallWindowMotion {
  if (reducedMotion) return { scale: 1, pivotX: 0.5, pivotY: 0.5 };
  return capsuleLive ? { scale: WINDOW_CONTRACTED_SCALE, pivotX: 0.5, pivotY: 0 } : { scale: WINDOW_SHORT_SCALE, pivotX: 0.5, pivotY: 0.5 };
}

const clamped = (value: number): number => Math.min(Math.max(value, 0), 1);

export function callWindowFromBubble({ reducedMotion, center, size }: { readonly reducedMotion: boolean; readonly center: WindowPoint; readonly size: WindowSize }): CallWindowMotion {
  if (reducedMotion || size.width <= 0 || size.height <= 0) return callWindow({ reducedMotion, capsuleLive: true });
  return { scale: WINDOW_CONTRACTED_SCALE, pivotX: clamped(center.x / size.width), pivotY: clamped(center.y / size.height) };
}

export const windowMotionOf = (from: WindowFrom, reducedMotion: boolean): CallWindowMotion =>
  from.kind === 'bubble' ? callWindowFromBubble({ reducedMotion, center: from.center, size: from.size }) : callWindow({ reducedMotion, capsuleLive: from.kind === 'capsule' });

export const windowOrigin = ({ pivotX, pivotY }: CallWindowMotion): string => `${pivotX * 100}% ${pivotY * 100}%`;

/** `seen` : la transformation sous laquelle l'écran qui repart se voit (le glissé vers le bas) — il s'y contracte, sans revenir d'abord. */
export function windowSwapKeyframes(entering: boolean, motion: CallWindowMotion, seen = 'none'): readonly Keyframe[] {
  if (motion.scale === 1) return entering ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
  const scaled = `scale(${motion.scale})`;
  if (entering) return [{ opacity: 0, transform: scaled }, { opacity: 1, transform: 'none' }];
  return [{ opacity: 1, transform: seen }, { opacity: 0, transform: seen === 'none' ? scaled : `${seen} ${scaled}` }];
}
