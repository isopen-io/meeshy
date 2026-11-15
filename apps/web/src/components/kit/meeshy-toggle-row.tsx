import '@/styles/kit-toggle-row.css';
import { useId, type CSSProperties, type ReactNode } from 'react';

import { impact } from '@/lib/view/haptics';

import { useMeeshyGlassHost } from './meeshy-glass-tone';
import type { MeeshyGlassTone } from './meeshy-glass-recipe';
import {
  meeshyToggleRowAccessibilityLabel,
  meeshyToggleRowRecipe,
  meeshyToggleRowVisibleSubtitle,
  type MeeshyToggleRowAccessory,
  type MeeshyToggleRowHaptic,
  type MeeshyToggleRowKind,
  type MeeshyToggleRowRecipe,
} from './meeshy-toggle-row-recipe';

export {
  MEESHY_TOGGLE_ROW,
  meeshyToggleRowAccessibilityLabel,
  meeshyToggleRowRecipe,
  meeshyToggleRowVisibleSubtitle,
  type MeeshyToggleRowAccessory,
  type MeeshyToggleRowHaptic,
  type MeeshyToggleRowKind,
  type MeeshyToggleRowRecipe,
  type MeeshyToggleRowValue,
} from './meeshy-toggle-row-recipe';

export type MeeshyToggleRowContent = {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly accessory?: MeeshyToggleRowAccessory | undefined;
  readonly kind?: MeeshyToggleRowKind | undefined;
  readonly showsDivider?: boolean | undefined;
  readonly tone?: MeeshyGlassTone | undefined;
  readonly tint?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly leading?: ReactNode;
  readonly titleAccessory?: ReactNode;
  readonly trailing?: ReactNode;
};

export type MeeshyToggleRowProps = MeeshyToggleRowContent & {
  readonly onAction: () => void;
  readonly haptic?: MeeshyToggleRowHaptic | undefined;
  readonly className?: string | undefined;
};

export type MeeshyToggleRowFaceProps = MeeshyToggleRowContent & {
  readonly isPressed?: boolean | undefined;
  readonly className?: string | undefined;
};

const ariaOf = (accessory: MeeshyToggleRowAccessory): Record<string, string | boolean> => {
  if (accessory.type === 'toggle') return { role: 'switch', 'aria-checked': accessory.isOn };
  if (accessory.type === 'checkbox') return { role: 'checkbox', 'aria-checked': accessory.isChecked };
  if (accessory.type === 'check') return { 'aria-pressed': accessory.isSelected };
  return {};
};

type Resolved = {
  readonly content: MeeshyToggleRowContent;
  readonly recipe: MeeshyToggleRowRecipe;
  readonly kind: MeeshyToggleRowKind;
  readonly accessory: MeeshyToggleRowAccessory;
  readonly valueId: string;
};

const ICON = { width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' } as const;

function Switch({ isOn }: { readonly isOn: boolean }) {
  return (
    <span className="kit-row__switch" data-on={isOn ? '' : undefined} aria-hidden="true">
      <span className="kit-row__thumb" />
    </span>
  );
}

function Accessory({ accessory, valueId }: { readonly accessory: MeeshyToggleRowAccessory; readonly valueId: string }) {
  if (accessory.type === 'toggle') return <Switch isOn={accessory.isOn} />;
  if (accessory.type === 'check') return accessory.isSelected ? <svg {...ICON} className="kit-row__check"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> : null;
  if (accessory.type === 'checkbox')
    return (
      <svg {...ICON} className="kit-row__box" data-checked={accessory.isChecked ? '' : undefined}>
        <path d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z" fill={accessory.isChecked ? 'currentColor' : 'none'} />
        {accessory.isChecked ? <path d="M7 12.5l3.5 3.5L17 9" stroke="var(--color-on-media)" /> : null}
      </svg>
    );
  if (accessory.type === 'chevron') return <svg {...ICON} className="kit-row__chevron"><path d="M9 6l6 6-6 6" /></svg>;
  if (accessory.type === 'value') return <span id={valueId} className="kit-row__value">{accessory.text}</span>;
  return null;
}

const styleOf = (recipe: MeeshyToggleRowRecipe): CSSProperties =>
  ({
    '--kit-row-ink': recipe.titleInk,
    '--kit-row-sub': recipe.subtitleInk,
    '--kit-row-accessory': recipe.accessoryInk,
    '--kit-row-track': recipe.trackOn,
    '--kit-row-divider': recipe.dividerInk,
    '--kit-row-min': `${recipe.minimumHeight}px`,
    '--kit-row-opacity': recipe.contentOpacity,
    '--kit-row-pressed-veil': recipe.pressedVeil,
    '--kit-row-hover-veil': recipe.hoveredVeil,
  }) as CSSProperties;

function Body({ resolved }: { readonly resolved: Resolved }) {
  const { content, accessory, valueId } = resolved;
  const subtitle = meeshyToggleRowVisibleSubtitle(content.subtitle);
  return (
    <>
      <span className="kit-row__veil" aria-hidden="true" />
      {content.showsDivider === true ? <span className="kit-row__divider" aria-hidden="true" /> : null}
      <span className="kit-row__line">
        <span className="kit-row__main">
          {content.leading === undefined || content.leading === null ? null : (
            <span className="kit-row__lead kit-row__dimmed" aria-hidden="true">
              {content.leading}
            </span>
          )}
          <span className="kit-row__text">
            <span className="kit-row__title-line">
              <span className="kit-row__title kit-row__dimmed">{content.title}</span>
              {content.titleAccessory === undefined || content.titleAccessory === null ? null : (
                <span aria-hidden="true">{content.titleAccessory}</span>
              )}
            </span>
            {subtitle === null ? null : <span className="kit-row__subtitle">{subtitle}</span>}
          </span>
        </span>
        <span className="kit-row__accessories kit-row__dimmed" aria-hidden="true">
          {content.trailing === undefined || content.trailing === null ? null : <span>{content.trailing}</span>}
          <Accessory accessory={accessory} valueId={valueId} />
        </span>
      </span>
    </>
  );
}

const resolve = (content: MeeshyToggleRowContent, valueId: string, hostTone: MeeshyGlassTone): Resolved => {
  const tone = content.tone ?? hostTone;
  const kind = content.kind ?? 'normal';
  const accessory = content.accessory ?? { type: 'none' };
  const recipe = meeshyToggleRowRecipe({
    accessory,
    kind,
    tone,
    tint: content.tint ?? null,
    isEnabled: content.disabled !== true,
  });
  return { content, recipe, kind, accessory, valueId };
};

export function MeeshyToggleRowFace({ isPressed = false, className, ...content }: MeeshyToggleRowFaceProps) {
  const host = useMeeshyGlassHost();
  const valueId = useId();
  const resolved = resolve(content, valueId, host.tone);
  const classes = ['kit-row', className].filter((part): part is string => part !== undefined).join(' ');
  return (
    <div
      className={classes}
      data-kind={resolved.kind}
      data-accessory={resolved.accessory.type}
      data-disabled={content.disabled === true ? '' : undefined}
      data-pressed={isPressed ? '' : undefined}
      style={styleOf(resolved.recipe)}
    >
      <Body resolved={resolved} />
    </div>
  );
}

export function MeeshyToggleRow({ onAction, haptic = 'light', className, ...content }: MeeshyToggleRowProps) {
  const host = useMeeshyGlassHost();
  const valueId = useId();
  const resolved = resolve(content, valueId, host.tone);
  const { recipe, accessory, kind } = resolved;
  const isEnabled = content.disabled !== true;
  const label = meeshyToggleRowAccessibilityLabel({ title: content.title, subtitle: content.subtitle });
  const hasValue = recipe.value.type === 'text';
  const classes = ['kit-row', 'kit-row--action', className].filter((part): part is string => part !== undefined).join(' ');
  const aria = ariaOf(accessory);
  return (
    <button
      type="button"
      className={classes}
      data-kind={kind}
      data-accessory={accessory.type}
      data-chosen={recipe.isChosen ? '' : undefined}
      disabled={!isEnabled}
      aria-label={label}
      aria-describedby={hasValue ? valueId : undefined}
      {...aria}
      style={styleOf(recipe)}
      onClick={() => {
        if (!isEnabled) return;
        if (haptic === 'light') impact('light');
        onAction();
      }}
    >
      <Body resolved={resolved} />
    </button>
  );
}
