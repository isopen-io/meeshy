import '@/styles/kit-chip-row.css';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { impact } from '@/lib/view/haptics';

import {
  meeshyChipAccessibility,
  meeshyChipName,
  meeshyChipRecipe,
  meeshyChipRevealTarget,
  meeshyChipRowProblems,
  meeshyChipRowResponse,
  meeshyChipRowStep,
  meeshyChipRowTrigger,
  meeshyChipRowWheel,
  meeshyScrollEdges,
  meeshyScrollSides,
  type MeeshyChipKind,
  type MeeshyChipRole,
  type MeeshyChipRowHaptic,
  type MeeshyChipRowLayout,
  type MeeshyChipRowMode,
  type MeeshyChipRowSemantics,
  type MeeshyChipRowSize,
  type MeeshyChipRowSurface,
  type MeeshyChipTrailing,
} from './meeshy-chip-row-rule';
import { meeshyChipInkToken, meeshyChipRowStyle, meeshyChipStyle } from './meeshy-chip-row-style';

export * from './meeshy-chip-row-rule';
export { meeshyChipInkToken, meeshyChipRowStyle, meeshyChipStyle } from './meeshy-chip-row-style';

type MeeshyChipData = Readonly<Record<`data-${string}`, string>>;

export type MeeshyChip = {
  readonly id: string;
  readonly title: string;
  readonly icon?: ReactNode;
  readonly trailing?: MeeshyChipTrailing | undefined;
  readonly kind?: MeeshyChipKind | undefined;
  readonly tint?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly accessibilityLabel?: string | undefined;
  readonly hint?: string | undefined;
  readonly probe?: MeeshyChipData | undefined;
};

export type MeeshyChipLabel = (chip: MeeshyChip, ink: string) => ReactNode;

const TRAILING_PATH: Readonly<Record<Exclude<MeeshyChipTrailing, 'none'>, string>> = {
  chevron: 'M3 6l5 5 5-5',
  remove: 'M4 4l8 8M12 4l-8 8',
};

function TrailingGlyph({ kind }: { readonly kind: Exclude<MeeshyChipTrailing, 'none'> }) {
  return (
    <span className="kit-chip__trailing" aria-hidden="true" data-kit-chip-trailing={kind}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={TRAILING_PATH[kind]} />
      </svg>
    </span>
  );
}

const ARIA_BY_ROLE: Readonly<Record<MeeshyChipRole, (isSelected: boolean) => Readonly<Record<string, string | boolean>>>> = {
  radio: (isSelected) => ({ role: 'radio', 'aria-checked': isSelected }),
  toggle: (isSelected) => ({ 'aria-pressed': isSelected }),
  tab: (isSelected) => ({ role: 'tab', 'aria-selected': isSelected }),
  button: () => ({}),
  menu: () => ({ 'aria-haspopup': 'menu' }),
};

type CellProps = {
  readonly chip: MeeshyChip;
  readonly isSelected: boolean;
  readonly isTabStop: boolean;
  readonly isForcedPressed: boolean;
  readonly isEnabled: boolean;
  readonly mode: MeeshyChipRowMode;
  readonly semantics: MeeshyChipRowSemantics;
  readonly surface: MeeshyChipRowSurface;
  readonly chipLabel: MeeshyChipLabel | undefined;
  readonly onActivate: (id: string) => void;
};

const sameData = (left: MeeshyChipData | undefined, right: MeeshyChipData | undefined): boolean => {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  const keys = Object.keys(left) as readonly `data-${string}`[];
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
};

const sameChip = (left: MeeshyChip, right: MeeshyChip): boolean =>
  left === right ||
  (left.id === right.id &&
    left.title === right.title &&
    left.icon === right.icon &&
    left.trailing === right.trailing &&
    left.kind === right.kind &&
    left.tint === right.tint &&
    left.disabled === right.disabled &&
    left.accessibilityLabel === right.accessibilityLabel &&
    left.hint === right.hint &&
    sameData(left.probe, right.probe));

const sameCell = (left: CellProps, right: CellProps): boolean =>
  left.isSelected === right.isSelected &&
  left.isTabStop === right.isTabStop &&
  left.isForcedPressed === right.isForcedPressed &&
  left.isEnabled === right.isEnabled &&
  left.mode === right.mode &&
  left.semantics === right.semantics &&
  left.surface === right.surface &&
  left.chipLabel === right.chipLabel &&
  left.onActivate === right.onActivate &&
  sameChip(left.chip, right.chip);

const titleOf = (chip: MeeshyChip, chipLabel: MeeshyChipLabel | undefined, ink: string): ReactNode => {
  if (chipLabel !== undefined) return <span className="kit-chip__title">{chipLabel(chip, ink)}</span>;
  return chip.title === '' ? null : <span className="kit-chip__title">{chip.title}</span>;
};

const MeeshyChipCell = memo(function MeeshyChipCell({ chip, isSelected, isTabStop, isForcedPressed, isEnabled, mode, semantics, surface, chipLabel, onActivate }: CellProps) {
  const kind = chip.kind ?? 'choice';
  const trailing = chip.trailing ?? 'none';
  const enabled = isEnabled && chip.disabled !== true;
  const access = meeshyChipAccessibility({ mode, semantics, kind, isSelected });
  const name = meeshyChipName(chip);
  const isGlyphOnly = chip.title === '' && chip.icon !== undefined;
  const ink = meeshyChipInkToken(meeshyChipRecipe({ surface, isSelected: access.isSelected, isTinted: chip.tint !== undefined }).ink);
  return (
    <button
      type="button"
      {...ARIA_BY_ROLE[access.role](access.isSelected)}
      {...(chip.title === '' || (chip.accessibilityLabel ?? '') !== '' ? { 'aria-label': name } : {})}
      {...(chip.hint === undefined || chip.hint === '' ? {} : { 'aria-description': chip.hint })}
      disabled={!enabled}
      tabIndex={isTabStop ? 0 : -1}
      className="kit-chip"
      style={meeshyChipStyle({ surface, isSelected: access.isSelected, isEnabled: enabled, tint: chip.tint })}
      data-kit-chip={chip.id}
      data-kit-chip-kind={kind}
      {...(access.isSelected ? { 'data-selected': '' } : {})}
      {...(isForcedPressed ? { 'data-pressed': '' } : {})}
      {...(isGlyphOnly ? { 'data-glyph-only': '' } : {})}
      {...chip.probe}
      onClick={() => onActivate(chip.id)}
    >
      <span className="kit-chip__fill" aria-hidden="true" />
      <span className="kit-chip__body">
        {chip.icon === undefined ? null : (
          <span className="kit-chip__glyph" aria-hidden="true">
            {chip.icon}
          </span>
        )}
        {titleOf(chip, chipLabel, ink)}
      </span>
      {trailing === 'none' ? null : <TrailingGlyph kind={trailing} />}
    </button>
  );
}, sameCell);

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isRightToLeft = (element: HTMLElement): boolean => typeof getComputedStyle === 'function' && getComputedStyle(element).direction === 'rtl';

const cellsOf = (row: HTMLElement): readonly HTMLButtonElement[] => [...row.querySelectorAll<HTMLButtonElement>('[data-kit-chip]')];

const centerChip = (row: HTMLElement, id: string, isAnimated: boolean): void => {
  const target = cellsOf(row).find((cell) => cell.dataset['kitChip'] === id);
  if (target === undefined) return;
  const viewport = row.getBoundingClientRect();
  const frame = target.getBoundingClientRect();
  const delta = frame.left + frame.width / 2 - (viewport.left + viewport.width / 2);
  if (Math.abs(delta) < 0.5) return;
  if (typeof row.scrollBy === 'function') row.scrollBy({ left: delta, behavior: isAnimated && !prefersReducedMotion() ? 'smooth' : 'auto' });
  else row.scrollLeft += delta;
};

const setAttribute = (element: HTMLElement, name: string, isOn: boolean): void => {
  if (element.hasAttribute(name) === isOn) return;
  if (isOn) element.setAttribute(name, '');
  else element.removeAttribute(name);
};

const measureEdges = (row: HTMLElement, isRtl: boolean): void => {
  const edges = meeshyScrollEdges({ content: row.scrollWidth, viewport: row.clientWidth, offset: Math.abs(row.scrollLeft) });
  const sides = meeshyScrollSides(edges, isRtl);
  setAttribute(row, 'data-overflow', edges.start || edges.end);
  setAttribute(row, 'data-edge-low', sides.low);
  setAttribute(row, 'data-edge-high', sides.high);
};

const useEdgeFade = (row: { readonly current: HTMLDivElement | null }, track: { readonly current: HTMLDivElement | null }, isScrolling: boolean, count: number): void => {
  useEffect(() => {
    const element = row.current;
    if (element === null || !isScrolling) return undefined;
    let isRtl = isRightToLeft(element);
    const onScroll = (): void => measureEdges(element, isRtl);
    const onResize = (): void => {
      isRtl = isRightToLeft(element);
      measureEdges(element, isRtl);
    };
    const onWheel = (event: WheelEvent): void => {
      const delta = meeshyChipRowWheel({ deltaX: event.deltaX, deltaY: event.deltaY, scrollLeft: element.scrollLeft, maxScroll: element.scrollWidth - element.clientWidth, rtl: isRtl });
      if (delta === null) return;
      event.preventDefault();
      element.scrollLeft += delta;
    };
    onResize();
    element.addEventListener('scroll', onScroll, { passive: true });
    element.addEventListener('wheel', onWheel, { passive: false });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);
    observer?.observe(element);
    if (track.current !== null) observer?.observe(track.current);
    return () => {
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('wheel', onWheel);
      observer?.disconnect();
      for (const name of ['data-overflow', 'data-edge-low', 'data-edge-high']) element.removeAttribute(name);
    };
  }, [row, track, isScrolling, count]);
};

const GROUP_ROLE = (mode: MeeshyChipRowMode, semantics: MeeshyChipRowSemantics): 'radiogroup' | 'tablist' | 'group' => {
  if (semantics === 'tabs') return 'tablist';
  return mode === 'single' || mode === 'singleOrNone' ? 'radiogroup' : 'group';
};

const playHaptic = (): void => {
  impact('light');
};

export type MeeshyChipRowProps = {
  readonly chips: readonly MeeshyChip[];
  readonly selection: readonly string[];
  readonly label: string;
  readonly onChange: (next: readonly string[], tapped: string) => void;
  readonly onAction?: ((id: string) => void) | undefined;
  readonly mode?: MeeshyChipRowMode | undefined;
  readonly layout?: MeeshyChipRowLayout | undefined;
  readonly semantics?: MeeshyChipRowSemantics | undefined;
  readonly surface?: MeeshyChipRowSurface | undefined;
  readonly size?: MeeshyChipRowSize | undefined;
  readonly inset?: number | undefined;
  readonly revealsSelection?: boolean | undefined;
  readonly haptic?: MeeshyChipRowHaptic | undefined;
  readonly chipLabel?: MeeshyChipLabel | undefined;
  readonly disabled?: boolean | undefined;
  readonly previewPressed?: string | undefined;
  readonly className?: string | undefined;
  readonly data?: MeeshyChipData | undefined;
};

export function MeeshyChipRow({
  chips,
  selection,
  label,
  onChange,
  onAction,
  mode = 'single',
  layout = 'scroll',
  semantics = 'choice',
  surface = 'onMedia',
  size = 'regular',
  inset = 0,
  revealsSelection = true,
  haptic = 'light',
  chipLabel,
  disabled = false,
  previewPressed,
  className,
  data,
}: MeeshyChipRowProps) {
  const problems = meeshyChipRowProblems({ label, chips });
  if (problems.length > 0 && import.meta.env.PROD !== true) throw new Error(problems.join(' ; '));

  const row = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const latest = useRef({ chips, selection, mode, haptic, onChange, onAction, isEnabled: !disabled });
  latest.current = { chips, selection, mode, haptic, onChange, onAction, isEnabled: !disabled };

  const onActivate = useCallback((id: string): void => {
    const { chips: current, selection: chosen, mode: how, haptic: cue, onChange: change, onAction: act, isEnabled } = latest.current;
    const chip = current.find((candidate) => candidate.id === id);
    if (chip === undefined) return;
    meeshyChipRowTrigger({
      response: meeshyChipRowResponse({ selection: chosen, tapped: id, mode: how, kind: chip.kind }),
      tapped: id,
      isEnabled: isEnabled && chip.disabled !== true,
      haptic: cue,
      play: playHaptic,
      onChange: change,
      onAction: act,
    });
  }, []);

  const isScrolling = layout === 'scroll';
  const order = chips.map((chip) => chip.id);
  const previous = useRef<string | null>(null);
  const selectionKey = selection.join('\u0000');
  useLayoutEffect(() => {
    const element = row.current;
    const before = previous.current;
    previous.current = selectionKey;
    if (element === null || !isScrolling || !revealsSelection || before === selectionKey) return;
    const target = meeshyChipRevealTarget({ order, previous: before === null ? [] : before.split('\u0000'), current: selection });
    if (target !== null) centerChip(element, target, before !== null);
  }, [selectionKey, isScrolling, revealsSelection]);
  useEdgeFade(row, track, isScrolling, chips.length);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const cells = cellsOf(event.currentTarget).filter((cell) => !cell.disabled);
    const index = cells.findIndex((cell) => cell === document.activeElement);
    const next = meeshyChipRowStep({ key: event.key, index, count: cells.length, rtl: isRightToLeft(event.currentTarget) });
    const target = next === null ? undefined : cells[next];
    if (target === undefined) return;
    event.preventDefault();
    target.focus();
    const id = target.dataset['kitChip'];
    const chip = chips.find((candidate) => candidate.id === id);
    const picksOnFocus = (mode === 'single' || mode === 'singleOrNone') && (chip?.kind ?? 'choice') === 'choice';
    if (picksOnFocus && id !== undefined && !selection.includes(id)) onActivate(id);
  };

  const onFocus = (event: { readonly target: EventTarget; readonly currentTarget: HTMLElement }): void => {
    const focused = event.target;
    if (!(focused instanceof HTMLElement) || focused.dataset['kitChip'] === undefined) return;
    for (const cell of cellsOf(event.currentTarget)) cell.tabIndex = cell === focused ? 0 : -1;
  };

  if (chips.length === 0) return null;

  const stop = chips.find((chip) => selection.includes(chip.id) && chip.disabled !== true) ?? chips.find((chip) => chip.disabled !== true);
  const classes = ['kit-chip-row', ...(className === undefined ? [] : [className])].join(' ');
  return (
    <div
      ref={row}
      role={GROUP_ROLE(mode, semantics)}
      aria-label={label}
      {...(disabled ? { 'aria-disabled': true } : {})}
      className={classes}
      style={meeshyChipRowStyle({ size, inset })}
      data-layout={layout}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      {...data}
    >
      <div ref={track} className="kit-chip-row__track">
        {chips.map((chip) => (
          <MeeshyChipCell
            key={chip.id}
            chip={chip}
            isSelected={mode !== 'actions' && (chip.kind ?? 'choice') === 'choice' && selection.includes(chip.id)}
            isTabStop={chip.id === stop?.id}
            isForcedPressed={previewPressed === chip.id}
            isEnabled={!disabled}
            mode={mode}
            semantics={semantics}
            surface={surface}
            chipLabel={chipLabel}
            onActivate={onActivate}
          />
        ))}
      </div>
    </div>
  );
}
