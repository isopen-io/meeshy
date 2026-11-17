import '@/styles/kit-choice-tiles.css';
import '@/styles/kit-motion.css';
import { memo, useState, type KeyboardEvent, type ReactNode } from 'react';

import { impact } from '@/lib/view/haptics';

import { focusKitRadio, kitRadioKeyTarget } from './kit-radio-focus';
import {
  meeshyChoiceColumns,
  meeshyChoiceIsLocked,
  meeshyChoiceTilesRecipe,
  meeshyChoiceTilesStyle,
  type MeeshyChoiceContent,
  type MeeshyChoiceFormat,
  type MeeshyChoiceItemState,
  type MeeshyChoiceSelection,
  type MeeshyChoiceSurface,
} from './meeshy-choice-tiles-recipe';

export * from './meeshy-choice-tiles-recipe';

export type MeeshyChoiceItem = {
  readonly id: string;
  readonly title: string;
  readonly detail?: string | undefined;
  readonly value?: string | undefined;
  readonly unit?: string | undefined;
  readonly glyph?: ReactNode;
  readonly tint?: string | undefined;
  readonly state?: MeeshyChoiceItemState | undefined;
  readonly spansRow?: boolean | undefined;
};

type ChoiceTileProps = {
  readonly item: MeeshyChoiceItem;
  readonly isSelected: boolean;
  readonly isMultiple: boolean;
  readonly content: MeeshyChoiceContent;
  readonly format: MeeshyChoiceFormat;
  readonly surface: MeeshyChoiceSurface;
  readonly columns: number;
  readonly tint: string | undefined;
  readonly index: number;
  readonly count: number;
  readonly focusable: boolean;
  readonly forceDisabled: boolean;
  readonly leading?: ((item: MeeshyChoiceItem) => ReactNode) | undefined;
  readonly trailing?: ((item: MeeshyChoiceItem) => ReactNode) | undefined;
  readonly onTouch: (item: MeeshyChoiceItem) => void;
  readonly onKeyDown?: ((event: KeyboardEvent<HTMLElement>) => void) | undefined;
};

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CHECK = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 8.5l3 3 6-6.5" />
  </svg>
);
const LOCK = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4.5 7.5h7v5h-7zM6 7.5V5.5a2 2 0 014 0v2" />
  </svg>
);

function Head({ item, content, recipeValue, leading }: { readonly item: MeeshyChoiceItem; readonly content: MeeshyChoiceContent; readonly recipeValue: boolean; readonly leading: ChoiceTileProps['leading'] }) {
  if (leading !== undefined) return <span className="kit-choice__head">{leading(item)}</span>;
  if (recipeValue) {
    return (
      <span className="kit-choice__value" aria-hidden="true">
        <span className="kit-choice__number">{item.value}</span>
        {item.unit === undefined ? null : <span className="kit-choice__unit">{item.unit}</span>}
      </span>
    );
  }
  if (item.glyph === undefined) return null;
  return (
    <span className="kit-choice__head" data-content={content} aria-hidden="true">
      {item.glyph}
    </span>
  );
}

function ChoiceTile(props: ChoiceTileProps) {
  const { item, isSelected, isMultiple, content, format, surface, columns, tint, index, count, focusable, forceDisabled, leading, trailing, onTouch, onKeyDown } = props;
  const [isPressed, setPressed] = useState(false);
  const state: MeeshyChoiceItemState = forceDisabled ? 'disabled' : (item.state ?? 'enabled');
  const effectiveFormat: MeeshyChoiceFormat = item.spansRow === true && format === 'square' ? 'wide' : format;
  const recipe = meeshyChoiceTilesRecipe({ content, format: effectiveFormat, surface, columns, isSelected, isPressed, state, reduceMotion: prefersReducedMotion() });
  const locked = meeshyChoiceIsLocked(state) ? state.locked : null;
  const label = [item.title, item.value === undefined ? null : `${item.value}${item.unit === undefined ? '' : ` ${item.unit}`}`, item.detail, `${index + 1} / ${count}`].filter((part): part is string => part !== null && part !== undefined).join(', ');
  return (
    <button
      type="button"
      role={isMultiple ? 'checkbox' : 'radio'}
      aria-checked={isSelected}
      aria-label={label}
      aria-disabled={locked !== null ? 'true' : undefined}
      disabled={recipe.isDisabled}
      tabIndex={focusable ? 0 : -1}
      className="kit-choice"
      data-kit-choice-id={item.id}
      data-format={effectiveFormat}
      data-content={content}
      data-selected={recipe.tintedFill ? '' : undefined}
      data-locked={locked !== null ? '' : undefined}
      data-inverted={recipe.invertsDisc ? '' : undefined}
      data-fade={recipe.checkFades ? '' : undefined}
      style={meeshyChoiceTilesStyle(recipe, item.tint ?? tint)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={() => onTouch(item)}
      onKeyDown={onKeyDown}
    >
      <Head item={item} content={content} recipeValue={content === 'value' && item.value !== undefined} leading={leading} />
      <span className="kit-choice__body" aria-hidden="true">
        <span className="kit-choice__title">{item.title}</span>
        {item.detail === undefined || effectiveFormat === 'compact' ? null : <span className="kit-choice__detail">{item.detail}</span>}
        {locked === null ? null : (
          <span className="kit-choice__locked" data-kit-choice-locked="">
            {LOCK}
            {locked}
          </span>
        )}
      </span>
      {effectiveFormat === 'wide' && trailing !== undefined ? <span className="kit-choice__trailing" aria-hidden="true">{trailing(item)}</span> : null}
      {recipe.showsCheck ? <span className="kit-choice__check" aria-hidden="true">{CHECK}</span> : null}
    </button>
  );
}

export type MeeshyChoiceTilesProps = {
  readonly label: string;
  readonly items: readonly MeeshyChoiceItem[];
  readonly selection: MeeshyChoiceSelection;
  readonly onSelect: (id: string) => void;
  readonly columns?: number | undefined;
  readonly content?: MeeshyChoiceContent | undefined;
  readonly format?: MeeshyChoiceFormat | undefined;
  readonly surface?: MeeshyChoiceSurface | undefined;
  readonly tint?: string | undefined;
  readonly allowsEmpty?: boolean | undefined;
  readonly maxSelected?: number | undefined;
  readonly countLabel?: ((selected: number, total: number) => string) | undefined;
  readonly onLockedTap?: ((id: string) => void) | undefined;
  readonly leading?: ((item: MeeshyChoiceItem) => ReactNode) | undefined;
  readonly trailing?: ((item: MeeshyChoiceItem) => ReactNode) | undefined;
  readonly haptic?: 'selection' | 'none' | undefined;
  readonly className?: string | undefined;
};

const isMultipleSelection = (selection: MeeshyChoiceSelection): selection is { readonly multiple: ReadonlySet<string> } => 'multiple' in selection;

/**
 * Une grille de tuiles qui choisissent : deux à huit options expliquées, un choix marqué par
 * trois signes. En choix unique : un groupe radio, les flèches déplacent le choix ET le
 * focus, la tuile choisie ne se relâche pas (sauf `allowsEmpty`). En choix multiple : des
 * cases à cocher, le compte dit à la voix, un plafond qui éteint les tuiles libres. Une
 * tuile verrouillée dit ce qui l'ouvre et ne répond qu'à `onLockedTap`.
 */
export const MeeshyChoiceTiles = memo(function MeeshyChoiceTiles(props: MeeshyChoiceTilesProps) {
  const { label, items, selection, onSelect, content = 'option', format = 'square', surface = 'tonal', tint, allowsEmpty = false, maxSelected, countLabel, onLockedTap, leading, trailing, haptic = 'selection', className } = props;
  const columns = meeshyChoiceColumns(props.columns);
  const isMultiple = isMultipleSelection(selection);
  const selected = isMultiple ? selection.multiple : new Set(selection.single === null ? [] : [selection.single]);
  const atCeiling = isMultiple && maxSelected !== undefined && selected.size >= maxSelected;
  const gutter = meeshyChoiceTilesRecipe({ surface }).gutter;
  const enabledIds = items.filter((item) => item.state === undefined || item.state === 'enabled').map((item) => item.id);
  const checkedIndex = isMultiple ? -1 : items.findIndex((item) => item.id === selection.single);
  const focusIndex = checkedIndex >= 0 ? checkedIndex : Math.max(items.findIndex((item) => item.id === enabledIds[0]), 0);

  const touch = (item: MeeshyChoiceItem): void => {
    if (meeshyChoiceIsLocked(item.state)) {
      onLockedTap?.(item.id);
      return;
    }
    if (item.state === 'disabled') return;
    const isChosen = selected.has(item.id);
    if (isMultiple) {
      if (!isChosen && atCeiling) return;
    } else if (isChosen && !allowsEmpty) return;
    if (haptic === 'selection') impact('light');
    onSelect(item.id);
  };

  const keyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (isMultiple) return;
    const from = items.findIndex((item) => item.id === event.currentTarget.getAttribute('data-kit-choice-id'));
    const dir = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
    const target = kitRadioKeyTarget({ key: event.key, from, lastIndex: items.length - 1, isRtl: dir });
    if (target === null) return;
    event.preventDefault();
    focusKitRadio(event.currentTarget, target);
    const next = items[target];
    if (next !== undefined) touch(next);
  };

  return (
    <div className={className === undefined ? 'kit-choice-tiles' : `kit-choice-tiles ${className}`} data-kit-choice-tiles="">
      <div
        className="kit-choice-grid"
        role={isMultiple ? 'group' : 'radiogroup'}
        aria-label={label}
        data-surface={surface}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: `${gutter / 16}rem` }}
      >
        {items.map((item, index) => (
          <ChoiceTile
            key={item.id}
            item={item}
            isSelected={selected.has(item.id)}
            isMultiple={isMultiple}
            content={content}
            format={format}
            surface={surface}
            columns={columns}
            tint={tint}
            index={index}
            count={items.length}
            focusable={index === focusIndex}
            forceDisabled={atCeiling && !selected.has(item.id) && (item.state === undefined || item.state === 'enabled')}
            leading={leading}
            trailing={trailing}
            onTouch={touch}
            onKeyDown={keyDown}
          />
        ))}
      </div>
      {isMultiple && countLabel !== undefined ? (
        <span className="sr-only" role="status" aria-live="polite">
          {countLabel(selected.size, items.length)}
        </span>
      ) : null}
    </div>
  );
});
