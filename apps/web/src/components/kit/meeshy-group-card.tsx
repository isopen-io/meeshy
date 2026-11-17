import '@/styles/kit-group-card.css';
import { Children, Fragment, memo, useState, type ReactNode } from 'react';

import { MeeshyGlass } from './meeshy-glass-tone';
import { MeeshySectionHeader } from './meeshy-section-header';
import {
  meeshyGroupCardRecipe,
  meeshyGroupCardStyle,
  type MeeshyGroupCardLayout,
  type MeeshyGroupCardSize,
  type MeeshyGroupCardSurface,
  type MeeshyGroupCardTail,
} from './meeshy-group-card-recipe';

export * from './meeshy-group-card-recipe';

export type MeeshyGroupCardProps = {
  readonly surface?: MeeshyGroupCardSurface | undefined;
  readonly layout?: MeeshyGroupCardLayout | undefined;
  readonly size?: MeeshyGroupCardSize | undefined;
  readonly tail?: MeeshyGroupCardTail | undefined;
  readonly overline?: string | undefined;
  readonly headerTrailing?: ReactNode;
  readonly media?: ReactNode;
  readonly emblem?: ReactNode;
  readonly footer?: ReactNode;
  readonly tint?: string | undefined;
  readonly dividerInset?: number | undefined;
  readonly isHighlighted?: boolean | undefined;
  readonly isLocked?: boolean | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly label?: string | undefined;
  readonly className?: string | undefined;
  readonly children?: ReactNode;
};

const has = (slot: ReactNode): boolean => slot !== undefined && slot !== null && slot !== false;

const INERT = { inert: true } as Record<string, boolean>;

/** Le filet que la carte trace elle-même, en retrait : jamais avant le premier enfant ni après le dernier. */
export function MeeshyGroupCardDivider({ inset }: { readonly inset?: number | undefined }) {
  return <span className="kit-group__divider" aria-hidden="true" data-kit-group-divider="" style={inset === undefined ? undefined : { '--kit-group-inset': `${inset / 16}rem` } as never} />;
}

function Body({ children, tracesDividers }: { readonly children: ReactNode; readonly tracesDividers: boolean }) {
  const items = Children.toArray(children);
  return (
    <>
      {items.map((child, index) => (
        <Fragment key={index}>
          {tracesDividers && index > 0 ? <MeeshyGroupCardDivider /> : null}
          {child}
        </Fragment>
      ))}
    </>
  );
}

/**
 * Une carte de groupe : une surface, cinq emplacements, des filets tracés par elle. Sans
 * `onPress` : un groupe nommé par son sur-titre, ses enfants atteignables un à un. Avec :
 * un seul bouton étiré dessous, nommé par `label` (obligatoire, sinon la carte échoue).
 * Verrouillée : annoncée inactive, le contenu inerte, le pied reste lisible.
 */
export const MeeshyGroupCard = memo(function MeeshyGroupCard({
  surface,
  layout,
  size,
  tail,
  overline,
  headerTrailing,
  media,
  emblem,
  footer,
  tint,
  dividerInset,
  isHighlighted,
  isLocked,
  onPress,
  label,
  className,
  children,
}: MeeshyGroupCardProps) {
  if (onPress !== undefined && (label === undefined || label === '')) throw new Error('MeeshyGroupCard : onPress demande un label, le nom dit de la carte.');
  const [isPressed, setPressed] = useState(false);
  const recipe = meeshyGroupCardRecipe({ surface, layout, size, tail, tint, dividerInset, isPressed, isHighlighted, isLocked });
  const showsHeader = (overline !== undefined && overline !== '') || has(headerTrailing);
  const classes = ['kit-group', ...(className === undefined ? [] : [className])].join(' ');
  const attributes = {
    className: classes,
    style: meeshyGroupCardStyle(recipe, tint),
    'data-kit-group': '',
    'data-surface': recipe.surface,
    'data-layout': recipe.layout,
    'data-fill': recipe.fill,
    'data-border': recipe.border,
    'data-rule': recipe.rule,
    'data-ink': recipe.ink,
    'data-border-style': recipe.borderStyle,
    'data-tail': recipe.tailSide === 'none' ? undefined : recipe.tailSide,
    'data-highlighted': isHighlighted === true ? '' : undefined,
    'data-locked': isLocked === true ? '' : undefined,
    'data-pressed': isPressed && recipe.isActionable ? '' : undefined,
    role: 'group',
    'aria-label': overline === undefined || overline === '' ? label : undefined,
    'aria-disabled': isLocked === true ? ('true' as const) : undefined,
  };
  const inner = (
    <>
      {onPress === undefined ? null : (
        <button
          type="button"
          className="kit-group__hit"
          data-kit-group-hit=""
          aria-label={label}
          aria-disabled={recipe.isActionable ? undefined : true}
          onClick={() => recipe.isActionable && onPress()}
          onPointerDown={() => setPressed(true)}
          onPointerUp={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          onPointerCancel={() => setPressed(false)}
        />
      )}
      {has(media) ? (
        <div className="kit-group__media" data-kit-group-media="" {...(isLocked === true ? INERT : {})}>
          {media}
        </div>
      ) : null}
      {has(emblem) ? (
        <div className="kit-group__emblem" data-kit-group-emblem="">
          {emblem}
        </div>
      ) : null}
      {showsHeader ? (
        <div className="kit-group__header" data-kit-group-header="">
          {overline === undefined || overline === '' ? <span /> : <MeeshySectionHeader form="overline" title={overline} />}
          {has(headerTrailing) ? <div className="kit-group__header-trailing">{headerTrailing}</div> : null}
        </div>
      ) : null}
      <div className="kit-group__content" data-kit-group-content="" {...(isLocked === true ? INERT : {})}>
        <Body tracesDividers={recipe.tracesDividers}>{children}</Body>
      </div>
      {has(footer) ? (
        <div className="kit-group__footer" data-kit-group-footer="">
          {footer}
        </div>
      ) : null}
    </>
  );
  return recipe.usesGlass ? (
    <MeeshyGlass {...attributes} className={classes}>
      {inner}
    </MeeshyGlass>
  ) : (
    <section {...attributes}>{inner}</section>
  );
});
