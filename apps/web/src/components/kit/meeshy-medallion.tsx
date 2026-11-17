import '@/styles/kit-medallion.css';
import '@/styles/kit-motion.css';
import type { ReactNode } from 'react';

import {
  meeshyMedallionOutline,
  meeshyMedallionRecipe,
  meeshyMedallionStyle,
  type MeeshyMedallionDecor,
  type MeeshyMedallionFill,
  type MeeshyMedallionKind,
  type MeeshyMedallionShape,
  type MeeshyMedallionSize,
  type MeeshyMedallionState,
} from './meeshy-medallion-recipe';

export * from './meeshy-medallion-recipe';

export type MeeshyMedallionProps = {
  readonly glyph?: ReactNode;
  readonly value?: string | undefined;
  readonly kind?: MeeshyMedallionKind | undefined;
  readonly tint?: string | undefined;
  readonly shape?: MeeshyMedallionShape | undefined;
  readonly fill?: MeeshyMedallionFill | undefined;
  readonly size?: MeeshyMedallionSize | undefined;
  readonly decor?: MeeshyMedallionDecor | undefined;
  readonly state?: MeeshyMedallionState | undefined;
  readonly gradientEnd?: string | undefined;
  readonly surface?: string | undefined;
  readonly label?: string | undefined;
  readonly lockedName?: string | undefined;
  readonly supportsShape?: boolean | undefined;
  readonly isAnimated?: boolean | undefined;
  readonly className?: string | undefined;
};

const LOCK = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
    <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
  </svg>
);

const canClip = (): boolean =>
  typeof CSS === 'undefined' || typeof CSS.supports !== 'function' || CSS.supports('clip-path', 'polygon(0% 0%, 100% 0%, 100% 100%)');

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const nameOf = (label: string | undefined, state: MeeshyMedallionState, lockedName: string | undefined): string | undefined => {
  if (label === undefined || label === '') return undefined;
  return state === 'locked' && lockedName !== undefined ? `${label}, ${lockedName}` : label;
};

/**
 * Un médaillon : décoratif par défaut (absent de l'arbre d'accessibilité), une image
 * nommée quand l'hôte donne un `label`. Jamais un bouton. Le halo et les ondes ne
 * changent pas la boîte : aucun voisin ne bouge ni ne se repeint.
 */
export function MeeshyMedallion({ glyph, value, kind, tint, shape, fill, size, decor, state = 'normal', gradientEnd, surface, label, lockedName, supportsShape, isAnimated = true, className }: MeeshyMedallionProps) {
  const recipe = meeshyMedallionRecipe({ kind, tint, shape, fill, size, decor, state, supportsShape: supportsShape ?? canClip(), reduceMotion: !isAnimated || prefersReducedMotion() });
  const name = nameOf(label, state, lockedName);
  const hasValue = value !== undefined && value !== '' && !recipe.showsLock;
  const clip = recipe.shape === 'scallop' || recipe.shape === 'blob' ? { clipPath: meeshyMedallionOutline(recipe.shape) } : undefined;
  return (
    <span
      className={className === undefined ? 'kit-medallion' : `kit-medallion ${className}`}
      style={meeshyMedallionStyle(recipe, tint, gradientEnd, surface)}
      data-kit-medallion=""
      data-shape={recipe.shape}
      data-kind={recipe.kind}
      data-state={state}
      data-background={recipe.background}
      data-motion={recipe.motion.kind}
      {...(name === undefined ? { 'aria-hidden': 'true' as const } : { role: 'img', 'aria-label': name })}
    >
      {recipe.halo === null ? null : <span className="kit-medallion__halo" aria-hidden="true" />}
      {Array.from({ length: recipe.waves }, (_, index) => (
        <span key={index} className="kit-medallion__wave" aria-hidden="true" style={{ animationDelay: `calc(${index} * var(--kit-medallion-waves-seconds) / ${recipe.waves})` }} />
      ))}
      <span className="kit-medallion__shape" aria-hidden="true" style={clip} />
      {recipe.dashed === null ? null : <span className="kit-medallion__dashed" aria-hidden="true" />}
      {recipe.showsLock ? (
        <span className="kit-medallion__glyph" data-kit-medallion-glyph="" aria-hidden="true">
          {LOCK}
        </span>
      ) : hasValue ? (
        <span className="kit-medallion__value" data-kit-medallion-value="" aria-hidden="true">
          {value}
        </span>
      ) : glyph === undefined || glyph === null ? null : (
        <span className="kit-medallion__glyph" data-kit-medallion-glyph="" aria-hidden="true">
          {glyph}
        </span>
      )}
      {recipe.struck === null ? null : <span className="kit-medallion__strike" aria-hidden="true" />}
    </span>
  );
}

export type MeeshyMedallionRowProps = {
  readonly earned: number;
  readonly total: number;
  readonly caption: string;
  readonly children?: ReactNode;
};

/** La rangée de récompenses : les gagnés d'abord, les verrouillés ensuite, puis le compte ; elle se dit en UNE phrase. */
export function MeeshyMedallionRow({ earned, total, caption, children }: MeeshyMedallionRowProps) {
  return (
    <div className="kit-medallion-row" role="group" aria-label={caption} data-kit-medallion-row="" data-earned={String(earned)} data-total={String(total)}>
      {children}
      <span className="kit-medallion-row__count" aria-hidden="true">
        {earned} / {total}
      </span>
    </div>
  );
}
