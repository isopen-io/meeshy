import '@/styles/kit-button.css';
import '@/styles/kit-motion.css';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';

import {
  MEESHY_BUTTON_MEASURE,
  meeshyButtonHold,
  meeshyButtonRecipe,
  meeshyButtonStyle,
  type MeeshyButtonHoldState,
  type MeeshyButtonKind,
  type MeeshyButtonShape,
  type MeeshyButtonSize,
  type MeeshyButtonWidth,
} from './meeshy-button-recipe';
import { meeshyGlassRecipe, useMeeshyGlassHost } from './meeshy-glass-tone';
import { meeshyMotionPlay, meeshyMotionRecipe } from './meeshy-motion';

export * from './meeshy-button-recipe';

const BUSY_GLYPH = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M8 2a6 6 0 1 0 6 6" />
  </svg>
);

const CLOCK_GLYPH = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 5v3l2 1.5" />
  </svg>
);

export type MeeshyButtonProps = {
  readonly title: string;
  readonly onPress?: (() => void) | undefined;
  readonly glyph?: ReactNode;
  readonly trailing?: ReactNode;
  readonly kind?: MeeshyButtonKind | undefined;
  readonly size?: MeeshyButtonSize | undefined;
  readonly shape?: MeeshyButtonShape | undefined;
  readonly width?: MeeshyButtonWidth | undefined;
  readonly tint?: string | undefined;
  readonly isDestructive?: boolean | undefined;
  readonly isPending?: boolean | undefined;
  readonly pendingLabel?: string | undefined;
  readonly isDeferred?: boolean | undefined;
  readonly deferredLabel?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly disabledReason?: string | undefined;
  readonly shortcut?: string | undefined;
  readonly holdState?: MeeshyButtonHoldState | undefined;
  readonly onHoldChange?: ((held: boolean) => void) | undefined;
  readonly scheme?: 'dark' | 'light' | undefined;
  readonly className?: string | undefined;
};

const HOLD_KEY = ' ';

const useHold = (report: ((held: boolean) => void) | undefined) => {
  const target = useRef(report);
  target.current = report;
  const hold = useMemo(() => meeshyButtonHold((held) => target.current?.(held)), []);
  useEffect(() => () => hold.cancel(), [hold]);
  return hold;
};

const describedBy = (ids: readonly (string | null)[]): string | undefined => {
  const kept = ids.filter((id): id is string => id !== null);
  return kept.length === 0 ? undefined : kept.join(' ');
};

export function MeeshyButton({
  title,
  onPress,
  glyph,
  trailing,
  kind,
  size,
  shape = 'capsule',
  width = 'fit',
  tint,
  isDestructive,
  isPending = false,
  pendingLabel,
  isDeferred = false,
  deferredLabel,
  disabled = false,
  disabledReason,
  shortcut,
  holdState,
  onHoldChange,
  scheme,
  className,
}: MeeshyButtonProps) {
  const identity = useId();
  const [isPressed, setPressed] = useState(false);
  const host = useMeeshyGlassHost();
  const hold = useHold(onHoldChange);
  const isHold = shape === 'hold';
  const recipe = meeshyButtonRecipe({ kind, size, shape, scheme, isPressed, isEnabled: !disabled, isPending, isDeferred, isDestructive });
  const glass =
    recipe.kind === 'glass'
      ? meeshyGlassRecipe({ tone: host.tone, tint: null, isInteractive: recipe.isActionEnabled, isPressed: isPressed && recipe.isActionEnabled, isNested: host.nested, material: host.opaque ? 'opaque' : 'drawn' })
      : null;
  const reasonId = disabled && disabledReason !== undefined ? `${identity}-reason` : null;
  const busyId = isPending && pendingLabel !== undefined ? `${identity}-busy` : null;
  const deferredId = isDeferred && deferredLabel !== undefined ? `${identity}-deferred` : null;
  const isNamedByLabel = shape !== 'capsule';
  const heldNow = holdState === 'held' || holdState === 'live';

  const press = useCallback(() => {
    if (!recipe.isActionEnabled) return;
    if (recipe.playsHaptic) meeshyMotionPlay(meeshyMotionRecipe('morph').haptic);
    onPress?.();
  }, [recipe.isActionEnabled, recipe.playsHaptic, onPress]);

  const onClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (!isHold) return press();
    if (event.detail !== 0 || !recipe.isActionEnabled) return;
    if (hold.isHeld()) hold.up();
    else hold.down();
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    if (!recipe.isActionEnabled) return;
    setPressed(true);
    if (!isHold) return;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // un pointeur déjà relâché : le maintien commence quand même, il s'arrête au lever
    }
    hold.down();
  };

  const release = (): void => {
    setPressed(false);
    if (isHold) hold.up();
  };

  const onContextMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    if (isHold) event.preventDefault();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!isHold || event.key !== HOLD_KEY || event.repeat || !recipe.isActionEnabled) return;
    event.preventDefault();
    setPressed(true);
    hold.down();
  };

  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!isHold || event.key !== HOLD_KEY) return;
    event.preventDefault();
    release();
  };

  const classes = ['kit-button', ...(glass === null ? [] : [glass.className]), ...(className === undefined ? [] : [className])].join(' ');
  const glyphSlot = isPending ? BUSY_GLYPH : glyph;
  const hasGlyphSlot = glyphSlot !== undefined && glyphSlot !== null;

  return (
    <button
      type="button"
      {...(glass === null ? {} : glass.attributes)}
      className={classes}
      style={meeshyButtonStyle(recipe, tint, width)}
      data-kit-button=""
      data-kind={recipe.kind}
      data-shape={recipe.shape}
      data-size={recipe.shape === 'capsule' ? String(size ?? 50) : recipe.shape}
      data-width={width}
      {...(isPressed && recipe.isActionEnabled ? { 'data-pressed': '' } : {})}
      {...(holdState === undefined ? {} : { 'data-hold-state': holdState })}
      aria-busy={isPending ? 'true' : undefined}
      aria-disabled={disabled ? 'true' : undefined}
      aria-label={isNamedByLabel ? title : undefined}
      aria-describedby={describedBy([reasonId, busyId, deferredId])}
      aria-keyshortcuts={shortcut}
      aria-pressed={isHold ? heldNow : undefined}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={() => (isPressed ? release() : undefined)}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
    >
      <span className="kit-button__veil" aria-hidden="true" />
      <span className="kit-button__body">
        {hasGlyphSlot ? (
          <span className="kit-button__glyph" aria-hidden="true" {...(isPending ? { 'data-kit-button-busy': '' } : {})}>
            {glyphSlot}
          </span>
        ) : null}
        {shape === 'capsule' ? <span className="kit-button__title">{title}</span> : null}
        {trailing === undefined || trailing === null ? null : (
          <span className="kit-button__trailing" aria-hidden="true">
            {trailing}
          </span>
        )}
      </span>
      {isDeferred ? (
        <span className="kit-button__deferred" aria-hidden="true" data-kit-button-deferred="">
          {CLOCK_GLYPH}
        </span>
      ) : null}
      {reasonId === null ? null : (
        <span id={reasonId} className="kit-button__reason" aria-hidden="true">
          {disabledReason}
        </span>
      )}
      {busyId === null ? null : (
        <span id={busyId} className="kit-button__sr" aria-hidden="true">
          {pendingLabel}
        </span>
      )}
      {deferredId === null ? null : (
        <span id={deferredId} className="kit-button__sr" aria-hidden="true">
          {deferredLabel}
        </span>
      )}
    </button>
  );
}

export type MeeshyButtonPairProps = {
  readonly primary: ReactNode;
  readonly secondary: ReactNode;
  readonly className?: string | undefined;
};

/** Deux boutons sur une ligne : le principal prend 1,6 part, l'autre 1 ; si un libellé ne tient pas, la paire s'empile, le principal en haut. */
export function MeeshyButtonPair({ primary, secondary, className }: MeeshyButtonPairProps) {
  return (
    <div
      className={className === undefined ? 'kit-button-pair' : `kit-button-pair ${className}`}
      data-kit-button-pair=""
      style={
        {
          '--kit-button-pair-primary': MEESHY_BUTTON_MEASURE.pair.primary,
          '--kit-button-pair-secondary': MEESHY_BUTTON_MEASURE.pair.secondary,
          '--kit-button-pair-gap': `${MEESHY_BUTTON_MEASURE.pair.gap / 16}rem`,
        } as CSSProperties
      }
    >
      <div className="kit-button-pair__primary">{primary}</div>
      <div className="kit-button-pair__secondary">{secondary}</div>
    </div>
  );
}
