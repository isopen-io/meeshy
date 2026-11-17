import '@/styles/kit-code-card.css';
import '@/styles/kit-motion.css';
import { memo, useEffect, useMemo, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';

import { encodeQr, type QrMatrix } from '@/lib/qr';

import { MeeshyGlass } from './meeshy-glass-tone';
import {
  MEESHY_CODE_CARD_MEASURE,
  meeshyCodeCardRecipe,
  meeshyCodeCardStyleVars,
  meeshyCodeTilt,
  type MeeshyCodeCardFace,
  type MeeshyCodeCardSize,
  type MeeshyCodeCardStyle,
  type MeeshyCodeCardTilt,
  type MeeshyCodeReticleState,
} from './meeshy-code-card-recipe';
import { MeeshySkeleton } from './meeshy-skeleton';

export * from './meeshy-code-card-recipe';

/** L'encodeur pur : la matrice du produit (`lib/qr.ts`), mise en cache par payload — jamais un second encodeur. */
export const encodeMeeshyCode = (payload: string): QrMatrix | null => encodeQr(payload);

const cache = new Map<string, QrMatrix | null>();
const CACHE_LIMIT = 24;

const encoded = (payload: string): QrMatrix | null => {
  if (cache.has(payload)) return cache.get(payload) ?? null;
  const matrix = encodeMeeshyCode(payload);
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(payload, matrix);
  return matrix;
};

const EYE = 7;

const isEye = (x: number, y: number, size: number): boolean => (x < EYE && y < EYE) || (x >= size - EYE && y < EYE) || (x < EYE && y >= size - EYE);

const round = (value: number): string => String(Math.round(value * 100) / 100);

/** Un seul tracé pour toute la matrice : chaque module sombre est un carré à 86 % de sa case, aux coins à 36 %. */
const modulesPath = (matrix: QrMatrix): string => {
  const { moduleShare, moduleRadius } = MEESHY_CODE_CARD_MEASURE;
  const inset = (1 - moduleShare) / 2;
  const r = moduleShare * moduleRadius;
  const w = moduleShare - 2 * r;
  return matrix.modules
    .flatMap((row, y) => row.flatMap((dark, x) => (dark && !isEye(x, y, matrix.size) ? [`M${round(x + inset + r)} ${round(y + inset)}h${round(w)}a${round(r)} ${round(r)} 0 0 1 ${round(r)} ${round(r)}v${round(w)}a${round(r)} ${round(r)} 0 0 1 ${round(-r)} ${round(r)}h${round(-w)}a${round(r)} ${round(r)} 0 0 1 ${round(-r)} ${round(-r)}v${round(-w)}a${round(r)} ${round(r)} 0 0 1 ${round(r)} ${round(-r)}z`] : [])))
    .join('');
};

export type MeeshyCodeMatrixProps = {
  readonly payload: string;
  readonly label: string;
  readonly tint?: string | undefined;
  readonly side?: number | undefined;
  readonly center?: ReactNode;
  readonly isDecorative?: boolean | undefined;
  readonly className?: string | undefined;
};

/**
 * La matrice dessinée : modules arrondis en un seul tracé, trois yeux à la teinte (anneau
 * d'un module, pupille de trois à l'encre), pastille au centre. Une image nommée par `label` :
 * le `payload` n'apparaît dans aucun nom. Elle ne se reflète jamais, même en arabe.
 */
export const MeeshyCodeMatrix = memo(function MeeshyCodeMatrix({ payload, label, tint, side = 160, center, isDecorative, className }: MeeshyCodeMatrixProps) {
  const matrix = useMemo(() => encoded(payload), [payload]);
  const recipe = meeshyCodeCardRecipe({ size: side as MeeshyCodeCardSize, tint, modules: matrix?.size });
  if (matrix === null) return null;
  const n = matrix.size;
  const eyes: readonly (readonly [number, number])[] = [[0, 0], [n - EYE, 0], [0, n - EYE]];
  const a11y = isDecorative === true ? { 'aria-hidden': 'true' as const } : { role: 'img', 'aria-label': label };
  return (
    <div className={className === undefined ? 'kit-code-matrix' : `kit-code-matrix ${className}`} dir="ltr" style={{ ...meeshyCodeCardStyleVars(recipe), inlineSize: `${side / 16}rem`, blockSize: `${side / 16}rem` } as CSSProperties} {...a11y}>
      <svg viewBox={`0 0 ${n} ${n}`} aria-hidden="true" shapeRendering="geometricPrecision">
        <path d={modulesPath(matrix)} className="kit-code-matrix__modules" data-kit-code-modules="" />
        {eyes.map(([x, y]) => (
          <g key={`${x}-${y}`} data-kit-code-eye="">
            <rect x={x + 0.5} y={y + 0.5} width={EYE - 1} height={EYE - 1} rx={2.3} className="kit-code-matrix__ring" fill="none" strokeWidth={1} />
            <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.9} className="kit-code-matrix__pupil" />
          </g>
        ))}
      </svg>
      {center === undefined || center === null || !recipe.showsCenter ? null : <span className="kit-code-matrix__center">{center}</span>}
    </div>
  );
});

export type MeeshyCodePlateProps = MeeshyCodeMatrixProps;

/** La plaque et sa matrice, sorties de la carte et posées à plat : dans un billet, une rangée, une notification. */
export const MeeshyCodePlate = memo(function MeeshyCodePlate(props: MeeshyCodePlateProps) {
  const side = props.side ?? 72;
  const recipe = meeshyCodeCardRecipe({ size: side as MeeshyCodeCardSize, tint: props.tint });
  return (
    <div className="kit-code-plate" data-kit-code-plate="" style={meeshyCodeCardStyleVars(recipe)}>
      <MeeshyCodeMatrix {...props} side={side} />
    </div>
  );
});

const systemReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasFinePointer = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;

const applyTilt = (node: HTMLElement, angle: number): void => {
  const tilt = meeshyCodeTilt(angle);
  node.style.setProperty('--kit-code-pivot', `${tilt.pivot}deg`);
  node.style.setProperty('--kit-code-glint', `${tilt.glint}%`);
  node.style.setProperty('--kit-code-plate-x', `${tilt.plate}px`);
  node.style.setProperty('--kit-code-center-x', `${tilt.center}px`);
};

/** Le pointeur fin incline la carte ; sans capteur ni pointeur, ou sous mouvement réduit, elle reste à plat. Posé sur l'élément, jamais dans l'état React. */
function useTilt(ref: RefObject<HTMLDivElement | null>, mode: MeeshyCodeCardTilt): void {
  useEffect(() => {
    const node = ref.current;
    if (node === null || mode === 'none') return;
    const onMove = (event: PointerEvent): void => {
      if (!hasFinePointer()) return;
      const box = node.getBoundingClientRect();
      if (box.width === 0) return;
      applyTilt(node, ((event.clientX - box.left) / box.width - 0.5) * 2 * MEESHY_CODE_CARD_MEASURE.tilt.pivot);
    };
    const onLeave = (): void => applyTilt(node, 0);
    node.addEventListener('pointermove', onMove, { passive: true });
    node.addEventListener('pointerleave', onLeave);
    return () => {
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerleave', onLeave);
    };
  }, [ref, mode]);
}

export type MeeshyCodeCardProps = {
  readonly payload?: string | undefined;
  readonly label: string;
  readonly caption?: string | undefined;
  readonly tint?: string | undefined;
  readonly style?: MeeshyCodeCardStyle | undefined;
  readonly size?: MeeshyCodeCardSize | undefined;
  readonly tilt?: MeeshyCodeCardTilt | undefined;
  readonly face?: MeeshyCodeCardFace | undefined;
  readonly reticleState?: MeeshyCodeReticleState | undefined;
  readonly center?: ReactNode;
  readonly header?: ReactNode;
  readonly viewfinder?: ReactNode;
  readonly onPress?: (() => void) | undefined;
  readonly className?: string | undefined;
};

const has = (slot: ReactNode): boolean => slot !== undefined && slot !== null && slot !== false;

/**
 * Une carte à code : verre de K01, plaque claire, matrice, légende. Sans `payload` : le
 * squelette à la taille finale de la carte. Un payload que l'encodeur refuse ne fait pas
 * attendre : aucune matrice, aucun squelette. Prête : la matrice le remplace en fondu, rien ne
 * bouge autour. Incliner ne re-rend ni l'hôte ni les voisins. Avec `onPress` : un bouton
 * nommé (l'hôte décide quoi en faire, par exemple agrandir une miniature).
 */
export const MeeshyCodeCard = memo(function MeeshyCodeCard({ payload, label, caption, tint, style, size, tilt, face = 'code', reticleState = 'idle', center, header, viewfinder, onPress, className }: MeeshyCodeCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const matrix = useMemo(() => (payload === undefined ? null : encoded(payload)), [payload]);
  const recipe = meeshyCodeCardRecipe({ style, size, tilt, tint, modules: matrix?.size, reduceMotion: systemReducedMotion() });
  useTilt(ref, recipe.tilt);
  const isPressable = onPress !== undefined;
  const isWaiting = face === 'code' && recipe.style !== 'reticle' && payload === undefined;
  const classes = ['kit-code-card', ...(className === undefined ? [] : [className])].join(' ');
  const showsCode = face === 'code' && recipe.style !== 'reticle' && matrix !== null && payload !== undefined && !recipe.isRefused;
  const inner = (
    <>
      {has(header) ? (
        <div className="kit-code-card__header" data-kit-code-header="">
          {header}
        </div>
      ) : null}
      {isWaiting ? <MeeshySkeleton shape={{ kind: 'card', aspect: 1, radius: recipe.plateRadius }} /> : null}
      {showsCode ? (
        <div className="kit-code-card__plate" data-kit-code-plate="">
          <MeeshyCodeMatrix payload={payload} label={label} tint={tint} side={recipe.side} center={center} isDecorative={isPressable} />
        </div>
      ) : null}
      {recipe.style === 'reticle' ? (
        <div className="kit-code-card__view" data-kit-code-view="">
          {viewfinder}
          <span className="kit-code-card__reticle" aria-hidden="true" data-kit-code-reticle="" data-state={reticleState} />
        </div>
      ) : null}
      {recipe.showsCaption && caption !== undefined && face === 'code' ? (
        <p className="kit-code-card__caption" data-kit-code-caption="">
          {caption}
        </p>
      ) : null}
      {recipe.hasGlint ? <span className="kit-code-card__glint" aria-hidden="true" /> : null}
    </>
  );
  const body = recipe.style === 'glass' ? (
    <MeeshyGlass className="kit-code-card__surface">{inner}</MeeshyGlass>
  ) : (
    <div className="kit-code-card__surface" data-plain="">
      {inner}
    </div>
  );
  return (
    <div ref={ref} className={classes} style={meeshyCodeCardStyleVars(recipe)} data-kit-code-card="" data-style={recipe.style} data-tilt={recipe.tilt} data-ready={showsCode ? '' : undefined} data-face={face}>
      {isPressable ? (
        <button type="button" className="kit-code-card__press" aria-label={label} onClick={onPress}>
          {body}
        </button>
      ) : (
        body
      )}
    </div>
  );
});
