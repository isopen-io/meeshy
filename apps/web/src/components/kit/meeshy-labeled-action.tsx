import '@/styles/kit-labeled-action.css';
import { Children, cloneElement, Fragment, isValidElement, memo, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactElement, type ReactNode, type RefObject } from 'react';

import { MEESHY_GLASS_BUTTON_LONG_PRESS, MEESHY_GLASS_BUTTON_LONG_PRESS_SHORTCUTS, MeeshyGlassButtonFace, type MeeshyGlassButtonKind } from './meeshy-glass-button';
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

const MENU_FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Le pressage d'une action libellée n'est que l'état de la face : jamais l'action elle-même. */
const toggleState = (kind: MeeshyGlassButtonKind | undefined): boolean | undefined => (kind === 'active' ? true : kind === 'normal' ? false : undefined);

/**
 * Le menu de l'appui long : fermé au repos, ouvert par l'appui tenu 500 ms (au doigt), le clic
 * droit ou Maj+F10 / la touche Menu (au clavier) — comme K02. Le relâcher qui suit un appui
 * tenu ne joue pas l'action. Ouvert, le focus entre dans le menu ; Échap le referme et rend
 * le focus au bouton ; choisir un élément ou toucher ailleurs le referme.
 */
function useActionMenu(hasMenu: boolean, isEnabled: boolean, button: RefObject<HTMLButtonElement | null>, root: RefObject<HTMLDivElement | null>, panel: RefObject<HTMLDivElement | null>) {
  const [isOpen, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const longFired = useRef(false);
  const stop = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };
  useEffect(() => stop, []);
  useEffect(() => {
    if (!isOpen) return;
    panel.current?.querySelector<HTMLElement>(MENU_FOCUSABLE)?.focus();
    const onOutside = (event: Event): void => {
      if (event.target instanceof Node && root.current?.contains(event.target) === true) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [isOpen, panel, root]);
  const opens = hasMenu && isEnabled;
  const close = (returnFocus: boolean): void => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  };
  return {
    isOpen: hasMenu && isOpen,
    close,
    consumesClick: (): boolean => {
      if (!longFired.current) return false;
      longFired.current = false;
      return true;
    },
    handlers: {
      onPointerDown: (event: PointerEvent): void => {
        longFired.current = false;
        if (!opens || event.button > 0) return;
        stop();
        origin.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(() => {
          timer.current = null;
          longFired.current = true;
          setOpen(true);
        }, MEESHY_GLASS_BUTTON_LONG_PRESS.durationMs);
      },
      onPointerMove: (event: PointerEvent): void => {
        const from = origin.current;
        if (from !== null && Math.hypot(event.clientX - from.x, event.clientY - from.y) > MEESHY_GLASS_BUTTON_LONG_PRESS.maxMovement) stop();
      },
      onPointerEnd: stop,
      onContextMenu: (event: MouseEvent): void => {
        if (!opens) return;
        event.preventDefault();
        stop();
        setOpen(true);
      },
      onKeyDown: (event: KeyboardEvent): void => {
        if (!opens || !((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu')) return;
        event.preventDefault();
        setOpen(true);
      },
    },
  };
}

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
  const menuId = useId();
  const [isPressed, setPressed] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hasMenu = menu !== undefined && menu !== null;
  const actionMenu = useActionMenu(hasMenu, disabled !== true, buttonRef, rootRef, panelRef);
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
    if (actionMenu.consumesClick()) return;
    if (recipe.isActionable) onPress();
  };
  const release = (): void => {
    setPressed(false);
    actionMenu.handlers.onPointerEnd();
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
      ref={rootRef}
    >
      <button
        ref={buttonRef}
        type="button"
        className="kit-action__hit"
        data-kit-action-hit=""
        aria-label={label}
        aria-pressed={toggleState(kind)}
        aria-busy={isPending === true ? true : undefined}
        aria-disabled={disabled === true ? true : undefined}
        aria-describedby={disabled === true && hint !== undefined ? hintId : undefined}
        aria-haspopup={hasMenu ? 'menu' : undefined}
        aria-expanded={hasMenu ? actionMenu.isOpen : undefined}
        aria-controls={actionMenu.isOpen ? menuId : undefined}
        aria-keyshortcuts={hasMenu ? MEESHY_GLASS_BUTTON_LONG_PRESS_SHORTCUTS : undefined}
        onClick={press}
        onPointerDown={(event) => {
          setPressed(true);
          actionMenu.handlers.onPointerDown(event);
        }}
        onPointerMove={actionMenu.handlers.onPointerMove}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onContextMenu={actionMenu.handlers.onContextMenu}
        onKeyDown={actionMenu.handlers.onKeyDown}
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
      {actionMenu.isOpen ? (
        <div
          ref={panelRef}
          id={menuId}
          className="kit-action__menu"
          role="group"
          aria-label={menuLabel ?? title}
          data-kit-action-menu=""
          onClick={() => actionMenu.close(false)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            actionMenu.close(true);
          }}
        >
          {menu}
        </div>
      ) : null}
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
