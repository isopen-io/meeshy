import '@/styles/kit-glass-button.css';
import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode, type SyntheticEvent } from 'react';

import { impact } from '@/lib/view/haptics';

import {
  MEESHY_GLASS_BUTTON_LONG_PRESS,
  impliedMeeshyGlassButtonKind,
  meeshyGlassButtonAccessibility,
  meeshyGlassButtonRecipe,
  meeshyGlassButtonStyle,
  meeshyGlassPressReport,
  performMeeshyGlassButtonTrigger,
  type MeeshyGlassButtonActivation,
  type MeeshyGlassButtonHaptic,
  type MeeshyGlassButtonKind,
  type MeeshyGlassButtonSize,
} from './meeshy-glass-button-recipe';
import { meeshyGlassRecipe, useMeeshyGlassHost, type MeeshyGlassTint, type MeeshyGlassTone } from './meeshy-glass-tone';

export {
  MEESHY_GLASS_BUTTON_KINDS,
  MEESHY_GLASS_BUTTON_LONG_PRESS,
  MEESHY_GLASS_BUTTON_LONG_PRESS_SHORTCUTS,
  MEESHY_GLASS_BUTTON_SIZES,
  impliedMeeshyGlassButtonKind,
  meeshyGlassButtonAccessibility,
  meeshyGlassButtonRecipe,
  meeshyGlassButtonStyle,
  meeshyGlassPressReport,
  performMeeshyGlassButtonTrigger,
  type MeeshyGlassButtonActivation,
  type MeeshyGlassButtonFill,
  type MeeshyGlassButtonGlassRequest,
  type MeeshyGlassButtonHaptic,
  type MeeshyGlassButtonInk,
  type MeeshyGlassButtonKind,
  type MeeshyGlassButtonPopup,
  type MeeshyGlassButtonRecipe,
  type MeeshyGlassButtonRecipeInput,
  type MeeshyGlassButtonShadow,
  type MeeshyGlassButtonSize,
} from './meeshy-glass-button-recipe';

type MeeshyGlassButtonData = Readonly<Record<`data-${string}`, string>>;

type DiscProps = {
  readonly as: 'button' | 'span';
  readonly kind: MeeshyGlassButtonKind;
  readonly size: MeeshyGlassButtonSize;
  readonly tone: MeeshyGlassTone | undefined;
  readonly tint: MeeshyGlassTint | undefined;
  readonly glyphTint: string | undefined;
  readonly enabled: boolean;
  readonly pressed: boolean;
  readonly glyph: ReactNode;
  readonly badge: ReactNode;
  readonly className: string | undefined;
  readonly attributes: Readonly<Record<string, unknown>>;
};

function Disc({ as: Tag, kind, size, tone, tint, glyphTint, enabled, pressed, glyph, badge, className, attributes }: DiscProps) {
  const host = useMeeshyGlassHost();
  const resolvedTone = tone ?? host.tone;
  const material = host.opaque ? 'opaque' : 'drawn';
  const input = { kind, size, tone: resolvedTone, material, isNested: host.nested, isEnabled: enabled, glyphTint: glyphTint ?? null } as const;
  const recipe = meeshyGlassButtonRecipe(input);
  const isHeld = pressed && enabled;
  const glass =
    recipe.glass === 'neutral'
      ? meeshyGlassRecipe({ tone: resolvedTone, tint: tint ?? null, isInteractive: enabled, isPressed: isHeld, isNested: host.nested, material })
      : null;
  const classes = [recipe.className, ...(glass === null ? [] : [glass.className]), ...(className === undefined ? [] : [className])].join(' ');
  return (
    <Tag {...attributes} {...recipe.attributes} {...(glass === null ? (isHeld ? { 'data-pressed': '' } : {}) : glass.attributes)} className={classes} style={meeshyGlassButtonStyle(input)}>
      <span className="kit-btn__fill" aria-hidden="true" />
      <span className="kit-btn__veil" aria-hidden="true" />
      <span className="kit-btn__glyph" aria-hidden="true">
        {glyph}
      </span>
      {badge === undefined || badge === null ? null : (
        <span className="kit-btn__badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </Tag>
  );
}

export type MeeshyGlassButtonFaceProps = {
  readonly glyph: ReactNode;
  readonly kind?: MeeshyGlassButtonKind | undefined;
  readonly size?: MeeshyGlassButtonSize | undefined;
  readonly tone?: MeeshyGlassTone | undefined;
  readonly tint?: MeeshyGlassTint | undefined;
  readonly glyphTint?: string | undefined;
  readonly pressed?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly badge?: ReactNode;
  readonly className?: string | undefined;
};

export function MeeshyGlassButtonFace({ glyph, kind = 'normal', size = 44, tone, tint, glyphTint, pressed = false, disabled = false, badge, className }: MeeshyGlassButtonFaceProps) {
  return (
    <Disc as="span" kind={kind} size={size} tone={tone} tint={tint} glyphTint={glyphTint} enabled={!disabled} pressed={pressed} glyph={glyph} badge={badge} className={className} attributes={{}} />
  );
}

const playHaptic = (haptic: MeeshyGlassButtonHaptic): void => {
  if (haptic === 'light') impact('light');
};

const PRESS_KEYS: ReadonlySet<string> = new Set([' ', 'Enter']);

export type MeeshyGlassButtonProps = {
  readonly label: string;
  readonly glyph: ReactNode;
  readonly onPress: () => void;
  readonly hint?: string | undefined;
  readonly value?: string | undefined;
  readonly kind?: MeeshyGlassButtonKind | undefined;
  readonly size?: MeeshyGlassButtonSize | undefined;
  readonly activation?: MeeshyGlassButtonActivation | undefined;
  readonly tone?: MeeshyGlassTone | undefined;
  readonly tint?: MeeshyGlassTint | undefined;
  readonly glyphTint?: string | undefined;
  readonly haptic?: MeeshyGlassButtonHaptic | undefined;
  readonly onPressChange?: ((pressed: boolean) => void) | undefined;
  readonly onLongPress?: (() => void) | undefined;
  readonly longPressLabel?: string | undefined;
  readonly badge?: ReactNode;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
  readonly data?: MeeshyGlassButtonData | undefined;
};

export function MeeshyGlassButton({
  label,
  glyph,
  onPress,
  hint,
  value,
  kind,
  size = 44,
  activation,
  tone,
  tint,
  glyphTint,
  haptic = 'light',
  onPressChange,
  onLongPress,
  longPressLabel,
  badge,
  disabled = false,
  className,
  data,
}: MeeshyGlassButtonProps) {
  const enabled = !disabled;
  const isPressed = useRef(false);
  const longFired = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const latest = useRef({ onPressChange, onLongPress, haptic, enabled });
  latest.current = { onPressChange, onLongPress, haptic, enabled };

  const stopTimer = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };

  const report = (next: boolean): void => {
    const said = meeshyGlassPressReport(isPressed.current, next);
    isPressed.current = next;
    if (said !== null) latest.current.onPressChange?.(said);
  };

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      const said = meeshyGlassPressReport(isPressed.current, null);
      isPressed.current = false;
      if (said !== null) latest.current.onPressChange?.(said);
    },
    [],
  );

  const performLong = (): void => {
    const { onLongPress: longPress, haptic: cue, enabled: on } = latest.current;
    if (longPress !== undefined) performMeeshyGlassButtonTrigger({ isEnabled: on, haptic: cue, play: playHaptic, action: longPress });
  };

  const activate = (): void => {
    if (longFired.current) {
      longFired.current = false;
      return;
    }
    performMeeshyGlassButtonTrigger({ isEnabled: enabled, haptic, play: playHaptic, action: onPress });
  };

  const watchesLong = onLongPress !== undefined;

  const gestures =
    onPressChange === undefined && !watchesLong
      ? {}
      : {
          onPointerDown: (event: PointerEvent) => {
            if (!latest.current.enabled || event.button > 0) return;
            longFired.current = false;
            report(true);
            if (!watchesLong) return;
            origin.current = { x: event.clientX, y: event.clientY };
            timer.current = setTimeout(() => {
              timer.current = null;
              longFired.current = true;
              performLong();
            }, MEESHY_GLASS_BUTTON_LONG_PRESS.durationMs);
          },
          onPointerMove: (event: PointerEvent) => {
            const from = origin.current;
            if (from !== null && Math.hypot(event.clientX - from.x, event.clientY - from.y) > MEESHY_GLASS_BUTTON_LONG_PRESS.maxMovement) stopTimer();
          },
          onPointerUp: () => {
            stopTimer();
            report(false);
          },
          onPointerCancel: () => {
            stopTimer();
            report(false);
          },
          onPointerLeave: () => {
            stopTimer();
            report(false);
          },
          onKeyDown: (event: KeyboardEvent) => {
            if (!PRESS_KEYS.has(event.key) || event.repeat || !latest.current.enabled) return;
            longFired.current = false;
            report(true);
          },
          onKeyUp: (event: KeyboardEvent) => {
            if (PRESS_KEYS.has(event.key)) report(false);
          },
          onBlur: () => report(false),
          ...(watchesLong
            ? {
                onContextMenu: (event: SyntheticEvent) => {
                  event.preventDefault();
                  const isHolding = origin.current !== null;
                  stopTimer();
                  if (longFired.current) return;
                  longFired.current = isHolding;
                  performLong();
                },
              }
            : {}),
        };

  const attributes = {
    type: 'button',
    ...meeshyGlassButtonAccessibility({ label, hint, value, activation, hasLongPress: watchesLong, longPressLabel }),
    ...(disabled ? { disabled: true } : {}),
    ...gestures,
    onClick: activate,
    ...data,
  };

  return (
    <Disc
      as="button"
      kind={kind ?? impliedMeeshyGlassButtonKind(activation)}
      size={size}
      tone={tone}
      tint={tint}
      glyphTint={glyphTint}
      enabled={enabled}
      pressed={false}
      glyph={glyph}
      badge={badge}
      className={className}
      attributes={attributes}
    />
  );
}
