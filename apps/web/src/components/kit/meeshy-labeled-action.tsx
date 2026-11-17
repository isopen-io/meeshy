import '@/styles/kit-labeled-action.css';
import { Children, cloneElement, Fragment, isValidElement, memo, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';

import { MeeshyGlassButtonFace, type MeeshyGlassButtonKind } from './meeshy-glass-button';
import {
  MEESHY_LABELED_ACTION_MEASURE,
  meeshyActionGridRecipe,
  meeshyActionGridStyle,
  meeshyLabeledActionRecipe,
  meeshyLabeledActionStyle,
  type MeeshyActionColumns,
  type MeeshyLabeledActionSize,
  type MeeshyLabeledActionValueKind,
} from './meeshy-labeled-action-recipe';
import { MeeshySkeleton } from './meeshy-skeleton';

export * from './meeshy-labeled-action-recipe';

export type MeeshyLabeledActionWords = {
  readonly pending?: string | undefined;
  readonly active?: string | undefined;
  readonly unavailable?: string | undefined;
};

export type MeeshyLabeledActionProps = {
  readonly title: string;
  readonly glyph: ReactNode;
  readonly onPress: () => void;
  readonly label?: string | undefined;
  readonly value?: string | undefined;
  readonly valueKind?: MeeshyLabeledActionValueKind | undefined;
  readonly badge?: string | undefined;
  readonly kind?: MeeshyGlassButtonKind | undefined;
  readonly size?: MeeshyLabeledActionSize | undefined;
  readonly isPending?: boolean | undefined;
  readonly isFeatured?: boolean | undefined;
  readonly isLoading?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly hint?: string | undefined;
  readonly tint?: string | undefined;
  readonly words?: MeeshyLabeledActionWords | undefined;
  readonly menu?: ReactNode;
  readonly menuLabel?: string | undefined;
  readonly className?: string | undefined;
};

/**
 * Une action libellée : le disque de K02 (muet), le libellé visible, une valeur facultative
 * et une pastille, dans UN seul bouton. Toucher le libellé ou la valeur fait ce que fait le
 * disque. En attente : un anneau, l'action retenue, « occupé ». Désactivé : aucune action,
 * sa raison dite par `hint`. L'état se dit en mots (`words`) et par ARIA, jamais par la
 * seule couleur.
 */
export const MeeshyLabeledAction = memo(function MeeshyLabeledAction({
  title,
  glyph,
  onPress,
  label,
  value,
  valueKind,
  badge,
  kind,
  size,
  isPending,
  isFeatured,
  isLoading,
  disabled,
  hint,
  tint,
  words,
  menu,
  menuLabel,
  className,
}: MeeshyLabeledActionProps) {
  if (title === '') throw new Error('MeeshyLabeledAction : le libellé est obligatoire — aucune action n’est un glyphe seul.');
  const hintId = useId();
  const [isPressed, setPressed] = useState(false);
  const recipe = meeshyLabeledActionRecipe({ kind, size, isPending, isFeatured, isEnabled: disabled !== true, hasValue: value !== undefined, valueKind });
  const hasValue = value !== undefined && value !== '';
  if (isLoading === true && !hasValue) {
    return (
      <div className="kit-action" style={meeshyLabeledActionStyle(recipe, tint)} data-kit-action="" data-size={recipe.size} data-loading="">
        <MeeshySkeleton shape={{ kind: 'circle', diameter: recipe.disc }} />
        <MeeshySkeleton shape={{ kind: 'line', widthRatio: 0.7 }} />
      </div>
    );
  }
  const isActive = recipe.kind === 'active';
  const stateWord = isPending === true ? words?.pending : disabled === true ? words?.unavailable : isActive ? words?.active : undefined;
  const press = (): void => {
    if (recipe.isActionable) onPress();
  };
  return (
    <div
      className={className === undefined ? 'kit-action' : `kit-action ${className}`}
      style={meeshyLabeledActionStyle(recipe, tint)}
      data-kit-action=""
      data-size={recipe.size}
      data-kind={recipe.kind}
      data-pending={isPending === true ? '' : undefined}
      data-featured={isFeatured === true ? '' : undefined}
      data-pressed={isPressed && recipe.isActionable ? '' : undefined}
    >
      <button
        type="button"
        className="kit-action__hit"
        data-kit-action-hit=""
        aria-label={label}
        aria-pressed={kind === undefined ? undefined : isActive}
        aria-busy={isPending === true ? true : undefined}
        aria-disabled={disabled === true ? true : undefined}
        aria-describedby={disabled === true && hint !== undefined ? hintId : undefined}
        onClick={press}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
      >
        <span className="kit-action__disc">
          <MeeshyGlassButtonFace glyph={glyph} kind={recipe.kind} size={recipe.size} pressed={isPressed && recipe.isActionable} disabled={disabled === true} badge={badge} />
          {isPending === true ? <span className="kit-action__ring" aria-hidden="true" data-kit-action-ring="" /> : null}
        </span>
        <span className="kit-action__title" data-kit-action-title="">
          {title}
        </span>
        {hasValue ? (
          <span className="kit-action__value" data-kit-action-value="" data-tone={recipe.valueTone}>
            {value}
          </span>
        ) : null}
        {badge === undefined || badge === '' ? null : <span className="sr-only">{`, ${badge}`}</span>}
        {stateWord === undefined ? null : <span className="sr-only">{`, ${stateWord}`}</span>}
      </button>
      {disabled === true && hint !== undefined ? (
        <span className="sr-only" id={hintId}>
          {hint}
        </span>
      ) : null}
      {menu === undefined || menu === null ? null : (
        <div className="kit-action__menu" data-menu-label={menuLabel}>
          {menu}
        </div>
      )}
    </div>
  );
});

export type MeeshyActionGridProps = {
  readonly children: ReactNode;
  readonly columns?: MeeshyActionColumns | undefined;
  readonly size?: MeeshyLabeledActionSize | undefined;
  readonly width?: number | undefined;
  readonly textScale?: number | undefined;
  readonly className?: string | undefined;
};

type ActionElement = ReactElement<MeeshyLabeledActionProps>;

const DEFAULT_WIDTH = 350;

const useGridWidth = (provided: number | undefined) => {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | undefined>(undefined);
  useEffect(() => {
    const node = ref.current;
    if (provided !== undefined || node === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setMeasured(entry?.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [provided]);
  return { ref, width: provided ?? measured ?? DEFAULT_WIDTH };
};

const buttonsOf = (root: HTMLElement): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('[data-kit-action-hit]'));

const move = (rows: readonly number[], index: number, key: string, isRtl: boolean, total: number): number => {
  const starts = rows.reduce<number[]>((acc) => [...acc, (acc.at(-1) ?? 0) + (acc.length === 0 ? 0 : (rows[acc.length - 1] ?? 0))], []);
  const row = Math.max(0, starts.findLastIndex((start) => start <= index));
  const column = index - (starts[row] ?? 0);
  const next = key === 'ArrowRight' ? (isRtl ? -1 : 1) : key === 'ArrowLeft' ? (isRtl ? 1 : -1) : 0;
  if (next !== 0) return Math.min(total - 1, Math.max(0, index + next));
  if (key === 'Home') return 0;
  if (key === 'End') return total - 1;
  const targetRow = key === 'ArrowDown' ? row + 1 : key === 'ArrowUp' ? row - 1 : row;
  if (targetRow < 0 || targetRow >= rows.length) return index;
  return Math.min((starts[targetRow] ?? 0) + Math.min(column, (rows[targetRow] ?? 1) - 1), total - 1);
};

/**
 * La grille d'actions : colonnes égales alignées en haut, jamais une action seule sur sa
 * ligne ; les destructives sortent de l'ordre et se posent en 56 dans une bande, à la fin.
 * Au clavier, les flèches suivent la grille (un seul arrêt de tabulation), Tab en sort.
 */
export const MeeshyActionGrid = memo(function MeeshyActionGrid({ children, columns, size, width, textScale, className }: MeeshyActionGridProps) {
  const items = Children.toArray(children).filter(isValidElement) as ActionElement[];
  const danger = items.filter((item) => item.props.kind === 'destructive');
  const regular = items.filter((item) => item.props.kind !== 'destructive');
  const { ref, width: gridWidth } = useGridWidth(width);
  const recipe = meeshyActionGridRecipe({ width: gridWidth, count: regular.length, columns, size, textScale });
  const rootRef = useRef<HTMLDivElement>(null);
  const setRover = (focused: HTMLElement | null): void => {
    const root = rootRef.current;
    if (root === null) return;
    const all = buttonsOf(root);
    const keep = focused ?? all.find((button) => button.tabIndex === 0) ?? all[0];
    for (const button of all) button.tabIndex = button === keep ? 0 : -1;
  };
  useEffect(() => setRover(null));
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const root = rootRef.current;
    if (root === null || !['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const all = buttonsOf(root);
    const index = all.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const isRtl = document.documentElement.dir === 'rtl';
    const target = all[move([...recipe.rows, ...(danger.length === 0 ? [] : [danger.length])], index, event.key, isRtl, all.length)];
    target?.focus();
    setRover(target ?? null);
  };
  let cursor = 0;
  const classes = ['kit-action-grid', ...(className === undefined ? [] : [className])].join(' ');
  return (
    <div
      className={classes}
      style={meeshyActionGridStyle(recipe)}
      data-kit-action-grid=""
      ref={(node) => {
        rootRef.current = node;
        ref.current = node;
      }}
      onKeyDown={onKeyDown}
      onFocus={(event) => setRover(event.target instanceof HTMLElement && event.target.hasAttribute('data-kit-action-hit') ? event.target : null)}
    >
      {recipe.rows.map((count, rowIndex) => {
        const row = regular.slice(cursor, cursor + count);
        cursor += count;
        return (
          <div key={rowIndex} className="kit-action-grid__row" data-kit-action-row="" data-count={count}>
            {row.map((item, index) => (
              <Fragment key={item.key ?? index}>{cloneElement(item, { size: recipe.size })}</Fragment>
            ))}
          </div>
        );
      })}
      {danger.length === 0 ? null : (
        <div className="kit-action-grid__danger" data-kit-action-danger="">
          {danger.map((item, index) => (
            <Fragment key={item.key ?? index}>{cloneElement(item, { size: MEESHY_LABELED_ACTION_MEASURE.danger.size })}</Fragment>
          ))}
        </div>
      )}
    </div>
  );
});
