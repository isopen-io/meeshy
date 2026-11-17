import '@/styles/kit-badge.css';
import '@/styles/kit-motion.css';
import { useState, type CSSProperties, type ReactNode } from 'react';

import {
  MEESHY_BADGE_MEASURE,
  meeshyBadgeCountSpoken,
  meeshyBadgeCountText,
  meeshyBadgeRecipe,
  meeshyBadgeStyle,
  type MeeshyBadgeContentKind,
  type MeeshyBadgeKind,
  type MeeshyBadgeShape,
  type MeeshyBadgeSize,
  type MeeshyBadgeSurface,
} from './meeshy-badge-recipe';
import { meeshyGlassRecipe, useMeeshyGlassHost } from './meeshy-glass-tone';

export * from './meeshy-badge-recipe';

export type MeeshyBadgeContent =
  | { readonly label: string }
  | { readonly count: number; readonly of?: number | undefined; readonly cap?: number | undefined }
  | { readonly code: string }
  | { readonly ordinal: number }
  | { readonly time: string }
  | { readonly glyph: true };

export type MeeshyBadgeLeading = 'none' | 'dot' | 'liveDot' | { readonly glyph: ReactNode };

export type MeeshyBadgeProps = {
  readonly content: MeeshyBadgeContent;
  readonly leading?: MeeshyBadgeLeading | undefined;
  readonly surface?: MeeshyBadgeSurface | undefined;
  readonly kind?: MeeshyBadgeKind | undefined;
  readonly tint?: string | undefined;
  readonly size?: MeeshyBadgeSize | undefined;
  readonly shape?: MeeshyBadgeShape | undefined;
  readonly lineLimit?: number | null | undefined;
  readonly isCurrent?: boolean | undefined;
  readonly isStale?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly label?: string | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly scheme?: 'dark' | 'light' | undefined;
  readonly className?: string | undefined;
};

type Rendered = { readonly kind: MeeshyBadgeContentKind; readonly text: string | null; readonly spoken: string | null };

const render = (content: MeeshyBadgeContent): Rendered => {
  if ('count' in content) {
    const options = { of: content.of, ...(content.cap === undefined ? {} : { cap: content.cap }) };
    const text = meeshyBadgeCountText(content.count, options);
    return { kind: 'count', text: text === '' ? null : text, spoken: text === '' ? null : meeshyBadgeCountSpoken(content.count, options) };
  }
  if ('label' in content) return { kind: 'label', text: content.label, spoken: null };
  if ('code' in content) return { kind: 'code', text: content.code, spoken: null };
  if ('ordinal' in content) return { kind: 'ordinal', text: String(content.ordinal), spoken: null };
  if ('time' in content) return { kind: 'time', text: content.time, spoken: null };
  return { kind: 'glyph', text: null, spoken: null };
};

const isHidden = (leading: MeeshyBadgeLeading): leading is 'dot' | 'liveDot' | { readonly glyph: ReactNode } => leading !== 'none';

function Lead({ leading }: { readonly leading: MeeshyBadgeLeading }) {
  if (!isHidden(leading)) return null;
  const isLive = leading === 'liveDot';
  return (
    <span className="kit-badge__lead" aria-hidden="true" data-kit-badge-lead="" data-dot={leading === 'dot' || isLive ? (isLive ? 'live' : 'fixed') : undefined}>
      {typeof leading === 'object' ? leading.glyph : null}
    </span>
  );
}

/**
 * Une pastille : inerte (un `<span>`, sans rôle) ou touchable (un `<button>` de 44
 * de cible qui déborde sans changer l'encombrement). Un compte à zéro ne rend rien
 * et ne prend aucune place ; un glyphe seul exige un nom dit. Inerte, son nom dit
 * (« 100 non lus » sous « 99+ ») est un texte réservé à la voix, jamais un
 * `aria-label` : ARIA l'interdit sur un `<span>` sans rôle, et les lecteurs l'ignorent.
 */
export function MeeshyBadge({ content, leading = 'none', surface, kind, tint, size, shape, lineLimit, isCurrent, isStale, disabled = false, label, onPress, scheme, className }: MeeshyBadgeProps) {
  const [isPressed, setPressed] = useState(false);
  const host = useMeeshyGlassHost();
  const shown = render(content);
  if (shown.kind === 'glyph' && (label === undefined || label === '')) throw new Error('MeeshyBadge : un glyphe seul exige un label (nom dit).');
  const isInteractive = onPress !== undefined;
  const recipe = meeshyBadgeRecipe({ surface, kind, tint, size, shape, scheme, lineLimit, content: shown.kind, isCurrent, isStale, isInteractive, isPressed, isEnabled: !disabled });
  if (shown.kind === 'count' && shown.text === null) return null;
  const glass =
    recipe.fill === 'glass' ? meeshyGlassRecipe({ tone: host.tone, tint: null, isInteractive: recipe.isActionEnabled, isPressed: isPressed && recipe.isActionEnabled, isNested: host.nested, material: host.opaque ? 'opaque' : 'drawn' }) : null;
  const classes = ['kit-badge', ...(glass === null ? [] : [glass.className]), ...(className === undefined ? [] : [className])].join(' ');
  const name = label ?? shown.spoken ?? undefined;
  const shared = {
    className: classes,
    style: meeshyBadgeStyle(recipe, tint),
    'data-kit-badge': '',
    'data-surface': recipe.surface,
    'data-kind': recipe.kind,
    'data-size': String(recipe.height),
    ...(recipe.hasAccentRim ? { 'data-current': '' } : {}),
    ...(recipe.isDesaturated ? { 'data-stale': '' } : {}),
    ...(recipe.radii === null ? {} : { 'data-bubble': '' }),
    ...(glass === null ? {} : glass.attributes),
  };
  const spokenApart = !isInteractive && name !== undefined && name !== shown.text;
  const body = (
    <>
      <Lead leading={leading} />
      {shown.text === null ? null : (
        <span className="kit-badge__content" data-kit-badge-content="" data-content={shown.kind} {...(spokenApart ? { 'aria-hidden': 'true' as const } : {})}>
          {shown.text}
        </span>
      )}
    </>
  );
  if (!isInteractive) {
    return (
      <span {...shared}>
        {body}
        {spokenApart ? <span className="sr-only">{name}</span> : null}
      </span>
    );
  }
  return (
    <button
      type="button"
      {...shared}
      aria-label={name}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={() => (recipe.isActionEnabled ? onPress() : undefined)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      {...(isPressed && recipe.isActionEnabled ? { 'data-pressed': '' } : {})}
    >
      {body}
    </button>
  );
}

export type MeeshyBadgeAlignment = 'topEnd' | 'topStart' | 'bottomEnd' | 'bottomStart';

export type MeeshyBadgeAnchorProps = {
  readonly badge: ReactNode;
  readonly children: ReactNode;
  readonly alignment?: MeeshyBadgeAlignment | undefined;
  readonly cutout?: string | undefined;
  readonly badgeSize?: MeeshyBadgeSize | undefined;
};

/** La pastille au coin d'un hôte : détourée de 3 à la couleur du fond, décalée d'un quart de sa hauteur vers l'extérieur, sans jamais couvrir le visage ni changer l'encombrement de l'hôte. */
export function MeeshyBadgeAnchor({ badge, children, alignment = 'topEnd', cutout, badgeSize = 22 }: MeeshyBadgeAnchorProps) {
  const style = {
    '--kit-badge-offset': `${badgeSize / 4 / 16}rem`,
    '--kit-badge-cutout-ring': `${MEESHY_BADGE_MEASURE.cutoutRing / 16}rem`,
    ...(cutout === undefined ? {} : { '--kit-badge-cutout': cutout }),
  } as CSSProperties;
  return (
    <span className="kit-badge-anchor" data-kit-badge-anchor="" data-alignment={alignment} style={style}>
      {children}
      <span className="kit-badge-anchor__badge">{badge}</span>
    </span>
  );
}
