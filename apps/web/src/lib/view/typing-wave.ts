/**
 * LA VAGUE DE FRAPPE (#8288) — l'effet de la barre du composeur universel iOS,
 * rejoué par le champ en verre liquide du téléphone de l'inscription.
 *
 * iOS : `UniversalComposerBar` pose `typeWave` à chaque frappe, et la barre
 * s'étire en `scaleEffect(x: 1.015, y: 0.97)` sous un ressort vif
 * (`response: 0.2, dampingFraction: 0.35`) — un rebond, puis le repos. Le
 * miroir iOS de cette loi est `TypingWave` (`apps/ios/.../TypingWave.swift`).
 *
 * Un TRANSFORM seul : composité par le navigateur, il ne relance aucune mise en
 * page — la frappe reste à 60/120 images par seconde. Une frappe rapide annule
 * la vague précédente au lieu de l'empiler. Sous « Réduire les animations »,
 * rien ne bouge.
 */

export const TYPING_WAVE = {
  stretchX: 1.015,
  squashY: 0.97,
  durationMs: 320,
} as const;

type WaveAnimation = { cancel(): void; readonly finished?: Promise<unknown> };

export type TypingWaveTarget = {
  readonly animate?: (keyframes: Keyframe[], options: KeyframeAnimationOptions) => WaveAnimation;
};

const KEYFRAMES: Keyframe[] = [
  { transform: 'scale(1, 1)' },
  { transform: `scale(${TYPING_WAVE.stretchX}, ${TYPING_WAVE.squashY})`, offset: 0.3 },
  { transform: 'scale(0.996, 1.008)', offset: 0.62 },
  { transform: 'scale(1, 1)' },
];

const running = new WeakMap<object, WaveAnimation>();

export function playTypingWave(target: TypingWaveTarget | null, deps: { readonly reducedMotion: () => boolean }): void {
  if (target === null || typeof target.animate !== 'function' || deps.reducedMotion()) return;
  running.get(target)?.cancel();
  const animation = target.animate(KEYFRAMES, { duration: TYPING_WAVE.durationMs, easing: 'ease-out' });
  // Une vague annulée par la frappe suivante REJETTE `finished` : ce n'est pas une panne.
  animation.finished?.catch(() => undefined);
  running.set(target, animation);
}
