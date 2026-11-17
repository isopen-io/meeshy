import '@/styles/kit-map-pin.css';
import '@/styles/kit-motion.css';
import { Children, memo, useState, type ReactNode } from 'react';

import { impact } from '@/lib/view/haptics';

import {
  MEESHY_MAP_PIN_MEASURE,
  mapPinRem,
  meeshyMapPinCaption,
  meeshyMapPinRecipe,
  meeshyMapPinStyle,
  meeshyPinClusterCount,
  type MeeshyMapPinKind,
  type MeeshyMapPinPrecision,
} from './meeshy-map-pin-recipe';

export * from './meeshy-map-pin-recipe';

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export type MeeshyBlurDiscProps = {
  readonly radius: number;
  readonly tint?: string | undefined;
  readonly isSelected?: boolean | undefined;
  readonly isStale?: boolean | undefined;
};

/** Le disque de flou : deux fois le rayon reçu, centré sous l'épingle. Sous 32 de rayon il ne dépasserait pas l'épingle : il n'est pas dessiné. Il se tait à la voix. */
export const MeeshyBlurDisc = memo(function MeeshyBlurDisc({ radius, tint, isSelected = false, isStale = false }: MeeshyBlurDiscProps) {
  const recipe = meeshyMapPinRecipe({ precision: { area: radius }, isSelected, isStale });
  if (!recipe.drawsDisc) return null;
  return (
    <span
      className="kit-blur-disc"
      aria-hidden="true"
      data-kit-blur-disc=""
      data-stale={isStale ? '' : undefined}
      style={{ ...meeshyMapPinStyle(recipe, tint), '--kit-pin-disc': mapPinRem(recipe.discDiameter), '--kit-pin-disc-opacity': recipe.discOpacity } as never}
    />
  );
});

export type MeeshyMapPinProps = {
  readonly label: string;
  readonly children?: ReactNode;
  readonly tint?: string | undefined;
  readonly precision?: MeeshyMapPinPrecision | undefined;
  readonly kind?: MeeshyMapPinKind | undefined;
  readonly isLive?: boolean | undefined;
  readonly isSelected?: boolean | undefined;
  readonly isStale?: boolean | undefined;
  readonly caption?: string | undefined;
  readonly hint?: string | undefined;
  readonly badge?: ReactNode;
  readonly above?: ReactNode;
  readonly below?: ReactNode;
  readonly ghostGlyph?: ReactNode;
  readonly onPress?: (() => void) | undefined;
  readonly className?: string | undefined;
};

function PinBody(props: MeeshyMapPinProps & { readonly isPressed: boolean }) {
  const { children, tint, precision, kind, isLive, isSelected, isStale, caption, badge, above, below, ghostGlyph, isPressed } = props;
  const recipe = meeshyMapPinRecipe({ kind, precision, isLive, isSelected, isStale, isPressed, reduceMotion: prefersReducedMotion() });
  const word = meeshyMapPinCaption(caption);
  return (
    <span className="kit-pin__stage" style={meeshyMapPinStyle(recipe, tint)} data-kind={recipe.kind} data-selected={isSelected === true && recipe.kind === 'other' ? '' : undefined} data-stale={isStale === true && recipe.kind === 'other' ? '' : undefined}>
      {recipe.drawsDisc ? <MeeshyBlurDisc radius={recipe.discDiameter / 2} tint={tint} isSelected={isSelected} isStale={isStale} /> : null}
      {recipe.drawsPulse ? <span className="kit-pin__pulse" aria-hidden="true" data-kit-pin-pulse="" data-animates={recipe.pulseAnimates ? '' : undefined} /> : null}
      {above === undefined ? null : <span className="kit-pin__above">{above}</span>}
      <span className="kit-pin__body" aria-hidden="true">
        {recipe.drawsRing ? <span className="kit-pin__selection" /> : null}
        <span className="kit-pin__content">{recipe.kind === 'ghost' ? (ghostGlyph ?? <span className="kit-pin__ghost-mark" />) : children}</span>
        {badge === undefined ? null : <span className="kit-pin__badge">{badge}</span>}
      </span>
      {recipe.drawsPoint ? <span className="kit-pin__point" aria-hidden="true" data-kit-pin-point="" /> : null}
      {below !== undefined ? <span className="kit-pin__below">{below}</span> : word === null ? null : <span className="kit-pin__caption" aria-hidden="true" data-kit-pin-caption="">{word}</span>}
    </span>
  );
}

/**
 * Une épingle de personne : le contenu de l'hôte sous un liseré, un disque de précision, une
 * onde. Sans action elle est une image nommée, jamais un bouton ; avec une action, une seule
 * cible de 44 au moins, qui part une fois au relâcher. Un tic de sélection quand elle devient
 * choisie par un toucher — jamais par l'hôte seul.
 */
export const MeeshyMapPin = memo(function MeeshyMapPin(props: MeeshyMapPinProps) {
  const { label, hint, onPress, isSelected = false, className } = props;
  const [isPressed, setPressed] = useState(false);
  const classes = className === undefined ? 'kit-pin' : `kit-pin ${className}`;
  if (onPress === undefined) {
    return (
      <span className={classes} role="img" aria-label={label} data-kit-map-pin="" data-selected={isSelected ? '' : undefined}>
        <PinBody {...props} isPressed={false} />
      </span>
    );
  }
  return (
    <button
      type="button"
      className={classes}
      aria-label={label}
      aria-pressed={isSelected}
      data-kit-map-pin=""
      data-selected={isSelected ? '' : undefined}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={() => {
        if (!isSelected) impact('light');
        onPress();
      }}
    >
      <PinBody {...props} isPressed={isPressed} />
      {hint === undefined ? null : <span className="sr-only">{hint}</span>}
    </button>
  );
});

export type MeeshyPinClusterProps = {
  readonly label: string;
  readonly count: number;
  readonly children?: ReactNode;
  readonly tint?: string | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly hint?: string | undefined;
  readonly className?: string | undefined;
};

function ClusterBody({ count, text, children, tint }: { readonly count: number; readonly text: string; readonly children?: ReactNode; readonly tint?: string | undefined }) {
  const items = Children.toArray(children).slice(0, MEESHY_MAP_PIN_MEASURE.clusterMax);
  return (
    <span
      className="kit-pin-cluster__stage"
      aria-hidden="true"
      data-count={count}
      style={{ '--kit-pin-cluster': mapPinRem(MEESHY_MAP_PIN_MEASURE.cluster), '--kit-pin-overlap': mapPinRem(MEESHY_MAP_PIN_MEASURE.clusterOverlap), '--kit-pin-count': mapPinRem(MEESHY_MAP_PIN_MEASURE.clusterCount), ...(tint === undefined ? {} : { '--kit-pin-tint': tint }) } as never}
    >
      {items.length === 0 ? <span className="kit-pin-cluster__fill" data-kit-pin-cluster-fill="" /> : items.map((item, index) => <span key={index} className="kit-pin-cluster__item" data-kit-pin-cluster-item="">{item}</span>)}
      <span className="kit-pin-cluster__count" data-kit-pin-count="">{text}</span>
    </span>
  );
}

/** La grappe : trois contenus recouverts dans une gélule, et le compte qu'on lui donne (« 99+ » au-delà de 99). Sous 2, rien. L'hôte décide qui se regroupe. */
export const MeeshyPinCluster = memo(function MeeshyPinCluster({ label, count, children, tint, onPress, hint, className }: MeeshyPinClusterProps) {
  const text = meeshyPinClusterCount(count);
  if (text === null) return null;
  const classes = className === undefined ? 'kit-pin-cluster' : `kit-pin-cluster ${className}`;
  if (onPress === undefined) {
    return (
      <span className={classes} role="img" aria-label={label} data-kit-pin-cluster="">
        <ClusterBody count={count} text={text} tint={tint}>{children}</ClusterBody>
      </span>
    );
  }
  return (
    <button type="button" className={classes} aria-label={label} data-kit-pin-cluster="" onClick={onPress}>
      <ClusterBody count={count} text={text} tint={tint}>{children}</ClusterBody>
      {hint === undefined ? null : <span className="sr-only">{hint}</span>}
    </button>
  );
});

export type MeeshyMapPinPreviewProps = {
  readonly label: string;
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly tint?: string | undefined;
  readonly background?: ReactNode;
  readonly children?: ReactNode;
  readonly onPress?: (() => void) | undefined;
};

/** La vignette d'aperçu : un fond recadré par l'hôte, un voile de lisibilité, une légende, UNE seule cible. */
export const MeeshyMapPinPreview = memo(function MeeshyMapPinPreview({ label, title, subtitle, tint, background, children, onPress }: MeeshyMapPinPreviewProps) {
  const body = (
    <>
      <span className="kit-pin-preview__background" aria-hidden="true">{background}</span>
      <span className="kit-pin-preview__veil" aria-hidden="true" />
      <span className="kit-pin-preview__pin" aria-hidden="true">{children}</span>
      <span className="kit-pin-preview__legend">
        <span className="kit-pin-preview__title">{title}</span>
        {subtitle === undefined ? null : <span className="kit-pin-preview__subtitle">{subtitle}</span>}
      </span>
    </>
  );
  const style = tint === undefined ? undefined : ({ '--kit-pin-tint': tint } as never);
  return onPress === undefined ? (
    <span className="kit-pin-preview" role="img" aria-label={label} data-kit-pin-preview="" style={style}>{body}</span>
  ) : (
    <button type="button" className="kit-pin-preview" aria-label={label} data-kit-pin-preview="" style={style} onClick={onPress}>{body}</button>
  );
});
