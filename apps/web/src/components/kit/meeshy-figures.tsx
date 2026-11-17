import '@/styles/kit-figures.css';
import '@/styles/kit-motion.css';
import { Children, cloneElement, Fragment, isValidElement, memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { MeeshyMeter } from './meeshy-meter';
import { MeeshySkeleton } from './meeshy-skeleton';
import {
  MEESHY_FIGURES_MEASURE,
  meeshyFiguresRecipe,
  meeshyFiguresStyle,
  meeshySparkPath,
  type MeeshyFigureSize,
  type MeeshyFigureTrend,
} from './meeshy-figures-recipe';

export * from './meeshy-figures-recipe';

const space = <span className="sr-only"> </span>;

const ARROW: Readonly<Record<MeeshyFigureTrend['direction'], string>> = { up: 'M3 10l5-5 5 5', down: 'M3 6l5 5 5-5', flat: 'M3 8h10' };

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Les rangs (depuis la fin) dont le chiffre diffère : seuls ceux-là roulent. */
const changedRanks = (previous: string | null, next: string): ReadonlySet<number> => {
  if (previous === null || previous === next) return new Set();
  const a = [...previous].reverse();
  const b = [...next].reverse();
  return new Set(b.flatMap((char, rank) => (char !== a[rank] ? [rank] : [])));
};

function Digits({ value, rolls }: { readonly value: string; readonly rolls: boolean }) {
  const previous = useRef<string | null>(null);
  const changed = useMemo(() => (rolls && !prefersReducedMotion() ? changedRanks(previous.current, value) : new Set<number>()), [value, rolls]);
  useEffect(() => {
    previous.current = value;
  }, [value]);
  const chars = [...value];
  return (
    <>
      {chars.map((char, index) => {
        const rank = chars.length - 1 - index;
        const isRolling = changed.has(rank);
        return (
          <span key={`${rank}-${isRolling ? value : ''}`} className="kit-figure__digit" {...(isRolling ? { 'data-rolling': '' } : {})}>
            {char}
          </span>
        );
      })}
    </>
  );
}

export type MeeshyFigureProps = {
  readonly value?: string | undefined;
  readonly unit: string;
  readonly tint?: string | undefined;
  readonly trend?: MeeshyFigureTrend | undefined;
  readonly size?: MeeshyFigureSize | undefined;
  readonly rolls?: boolean | undefined;
  readonly isLoading?: boolean | undefined;
  readonly isEmphasized?: boolean | undefined;
  readonly isGhost?: boolean | undefined;
  readonly emptyLabel?: string | undefined;
  readonly accessory?: ReactNode;
  readonly className?: string | undefined;
};

/**
 * Un chiffre : sa valeur en grand, son unité dessous, dite après lui. Sans valeur, « — »
 * se dit « aucune donnée » — jamais zéro, un vrai zéro s'écrit 0. Chargement, vide et valeur
 * occupent le même encombrement ; le squelette est ignoré dès qu'une valeur existe. La
 * teinte colore l'accessoire, jamais le chiffre. Le chiffre roule quand la valeur change,
 * jamais à l'apparition.
 */
export const MeeshyFigure = memo(function MeeshyFigure({ value, unit, tint, trend, size, rolls = true, isLoading, isEmphasized, isGhost, emptyLabel, accessory, className }: MeeshyFigureProps) {
  if (unit === '') throw new Error('MeeshyFigure : l’unité est obligatoire, un chiffre n’est jamais seul.');
  const recipe = meeshyFiguresRecipe({ size });
  const hasValue = value !== undefined && value !== '' && isGhost !== true;
  const waits = isLoading === true && !hasValue;
  const style = { ...meeshyFiguresStyle(recipe), ...(tint === undefined ? {} : { '--kit-figure-tint': tint }) } as CSSProperties;
  return (
    <div
      className={className === undefined ? 'kit-figure' : `kit-figure ${className}`}
      style={style}
      data-kit-figure=""
      data-size={recipe.size}
      data-state={waits ? 'loading' : hasValue ? 'value' : 'empty'}
      data-emphasized={isEmphasized === true ? '' : undefined}
      data-ghost={isGhost === true ? '' : undefined}
    >
      <div className="kit-figure__line">
        {waits ? (
          <MeeshySkeleton shape={{ kind: 'pill', width: recipe.valueSize * 2, height: recipe.valueSize }} />
        ) : hasValue ? (
          <span className="kit-figure__value" data-kit-figure-value="">
            <Digits value={value} rolls={rolls} />
          </span>
        ) : (
          <>
            <span className="kit-figure__value" data-kit-figure-value="" aria-hidden="true">
              —
            </span>
            {emptyLabel === undefined ? null : <span className="sr-only">{emptyLabel}</span>}
          </>
        )}
        {accessory === undefined || accessory === null ? null : <span className="kit-figure__accessory">{accessory}</span>}
      </div>
      {space}
      <span className="kit-figure__unit">{unit}</span>
      {space}
      {trend === undefined ? null : (
        <span className="kit-figure__trend" data-kit-figure-trend="" data-direction={trend.direction}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={ARROW[trend.direction]} />
          </svg>
          <span>{trend.text}</span>
        </span>
      )}
    </div>
  );
});

export type MeeshyFigureBandProps = {
  readonly children: ReactNode;
  readonly size?: MeeshyFigureSize | undefined;
  readonly width?: number | undefined;
  readonly isStacked?: boolean | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly label?: string | undefined;
  readonly className?: string | undefined;
};

const useWidth = (provided: number | undefined) => {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | undefined>(undefined);
  useEffect(() => {
    const node = ref.current;
    if (provided !== undefined || node === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setMeasured(entry?.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [provided]);
  return { ref, width: provided ?? measured };
};

/**
 * Une bande de deux à quatre chiffres, séparés par des filets (entre deux, jamais au bord),
 * tous à la même taille. Une bande est UN élément : « 1 284 clics, 912 visiteurs uniques ».
 * Avec `onPress`, toute la bande est un seul bouton, nommé par `label`.
 */
export const MeeshyFigureBand = memo(function MeeshyFigureBand({ children, size, width, isStacked, onPress, label, className }: MeeshyFigureBandProps) {
  const figures = Children.toArray(children).filter(isValidElement) as ReactElement<MeeshyFigureProps>[];
  if (figures.length > MEESHY_FIGURES_MEASURE.bandMax) throw new Error('MeeshyFigureBand : quatre chiffres au plus.');
  const { ref, width: measured } = useWidth(width);
  const recipe = meeshyFiguresRecipe({ size, count: figures.length, width: measured, isStacked });
  const content = figures.map((figure, index) => (
    <Fragment key={figure.key ?? index}>
      {index > 0 ? <span className="kit-figure-band__rule" aria-hidden="true" data-kit-figure-rule="" /> : null}
      {cloneElement(figure, { size: recipe.size })}
    </Fragment>
  ));
  const classes = ['kit-figure-band', ...(className === undefined ? [] : [className])].join(' ');
  const attributes = { ref, className: classes, style: meeshyFiguresStyle(recipe), 'data-kit-figure-band': '', 'data-stacked': recipe.isStacked ? '' : undefined, 'data-size': recipe.size };
  return onPress === undefined ? (
    <div {...attributes} role="group">
      {content}
    </div>
  ) : (
    <div {...attributes}>
      <button type="button" className="kit-figure-band__press" aria-label={label} onClick={onPress}>
        {content}
      </button>
    </div>
  );
});

export type MeeshySparkProps = { readonly points: readonly number[]; readonly summary: string; readonly tint?: string | undefined; readonly className?: string | undefined };

/** Une mini-courbe : un seul tracé (deux chemins : l'aire et le trait), nommée par une phrase, jamais par ses sept nombres. */
export const MeeshySpark = memo(function MeeshySpark({ points, summary, tint, className }: MeeshySparkProps) {
  const drawing = meeshySparkPath(points);
  if (drawing === null) return null;
  const { width, height, stroke, endDot } = MEESHY_FIGURES_MEASURE.spark;
  return (
    <svg
      className={className === undefined ? 'kit-spark' : `kit-spark ${className}`}
      role="img"
      aria-label={summary}
      viewBox={`0 0 ${width} ${height}`}
      style={tint === undefined ? undefined : ({ '--kit-figure-tint': tint } as CSSProperties)}
      data-kit-spark=""
    >
      <path d={drawing.area} className="kit-spark__area" fillOpacity={MEESHY_FIGURES_MEASURE.spark.areaOpacity} />
      <path d={drawing.line} className="kit-spark__line" fill="none" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={drawing.end[0]} cy={drawing.end[1]} r={endDot / 2} className="kit-spark__dot" />
    </svg>
  );
});

export type MeeshyShareBarProps = {
  readonly title: string;
  readonly value: string;
  readonly share: number;
  readonly tint?: string | undefined;
  readonly leading?: ReactNode;
  readonly className?: string | undefined;
};

/** Une rangée de part : pastille, libellé, valeur déjà écrite et jauge (une `MeeshyMeter`) bornée de 0 à 1. */
export const MeeshyShareBar = memo(function MeeshyShareBar({ title, value, share, tint, leading, className }: MeeshyShareBarProps) {
  const bounded = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0;
  const recipe = meeshyFiguresRecipe({});
  return (
    <div className={className === undefined ? 'kit-share' : `kit-share ${className}`} style={meeshyFiguresStyle(recipe)} data-kit-share="">
      {leading === undefined || leading === null ? null : <span className="kit-share__leading">{leading}</span>}
      <div className="kit-share__body">
        <div className="kit-share__head">
          <span className="kit-share__title">{title}</span>
          <span className="kit-share__value">{value}</span>
        </div>
        <MeeshyMeter value={Math.round(bounded * 100)} total={100} label={title} spokenValue={value} tint={tint} size={8} animatesOnAppear={false} />
      </div>
    </div>
  );
});

export type MeeshyFigureTileProps = {
  readonly value?: string | undefined;
  readonly unit: string;
  readonly glyph?: ReactNode;
  readonly tint?: string | undefined;
  readonly footer?: ReactNode;
  readonly onPress?: (() => void) | undefined;
  readonly emptyLabel?: string | undefined;
};

/** La tuile touchable : glyphe, chiffre, libellé, un seul nom dit, une cible de 44 au moins. */
export const MeeshyFigureTile = memo(function MeeshyFigureTile({ value, unit, glyph, tint, footer, onPress, emptyLabel }: MeeshyFigureTileProps) {
  const body = (
    <>
      {glyph === undefined || glyph === null ? null : (
        <span className="kit-figure-tile__glyph" aria-hidden="true">
          {glyph}
        </span>
      )}
      <MeeshyFigure value={value} unit={unit} tint={tint} size="compact" emptyLabel={emptyLabel} />
      {footer === undefined || footer === null ? null : <span className="kit-figure-tile__footer">{footer}</span>}
    </>
  );
  return onPress === undefined ? (
    <div className="kit-figure-tile" data-kit-figure-tile="">
      {body}
    </div>
  ) : (
    <button type="button" className="kit-figure-tile" data-kit-figure-tile="" onClick={onPress}>
      {body}
    </button>
  );
});
