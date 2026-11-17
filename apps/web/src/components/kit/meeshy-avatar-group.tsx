import '@/styles/kit-avatar-group.css';
import '@/styles/kit-motion.css';
import { memo, type KeyboardEvent, type ReactNode } from 'react';

import { impact } from '@/lib/view/haptics';

import { focusKitRadio, kitRadioKeyTarget } from './kit-radio-focus';
import { MeeshySkeleton } from './meeshy-skeleton';
import {
  meeshyAvatarGroupRecipe,
  meeshyAvatarGroupStyle,
  type MeeshyAvatarGroupLayout,
  type MeeshyAvatarGroupSelection,
  type MeeshyAvatarGroupSize,
} from './meeshy-avatar-group-recipe';

export * from './meeshy-avatar-group-recipe';

export type MeeshyAvatarGroupProps = {
  readonly count: number;
  readonly cell: (index: number, size: MeeshyAvatarGroupSize) => ReactNode;
  readonly layout?: MeeshyAvatarGroupLayout | undefined;
  readonly size?: MeeshyAvatarGroupSize | undefined;
  readonly max?: number | undefined;
  readonly selection?: MeeshyAvatarGroupSelection | undefined;
  readonly onSelectionChange?: ((next: MeeshyAvatarGroupSelection) => void) | undefined;
  readonly caption?: ((index: number) => string | null | undefined) | undefined;
  readonly summary?: string | undefined;
  readonly showsChevron?: boolean | undefined;
  readonly label?: string | undefined;
  readonly isEnabled?: ((index: number) => boolean) | undefined;
  readonly tint?: string | undefined;
  readonly surface?: string | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly trailing?: ReactNode;
  readonly className?: string | undefined;
};

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CHECK = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 8.5l3 3 6-6.5" />
  </svg>
);
const CHEVRON = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3l5 5-5 5" />
  </svg>
);

const isMultiple = (selection: MeeshyAvatarGroupSelection): selection is { readonly multiple: ReadonlySet<number> } => 'multiple' in selection;

function Faces({ count, size, cell, recipe, trailing }: { readonly count: number; readonly size: MeeshyAvatarGroupSize; readonly cell: MeeshyAvatarGroupProps['cell']; readonly recipe: ReturnType<typeof meeshyAvatarGroupRecipe>; readonly trailing?: ReactNode }) {
  return (
    <span className="kit-avatar-group__faces" aria-hidden="true" data-count={count}>
      {Array.from({ length: recipe.visible }, (_, index) => (
        <span key={index} className="kit-avatar-group__face" style={{ zIndex: recipe.visible - index }}>
          {cell(index, size)}
        </span>
      ))}
      {recipe.overflowLabel === null ? null : (
        <span className="kit-avatar-group__face kit-avatar-group__overflow" data-kit-group-overflow="">
          {recipe.overflowLabel}
        </span>
      )}
      {trailing}
    </span>
  );
}

function Selectable(props: MeeshyAvatarGroupProps & { readonly recipe: ReturnType<typeof meeshyAvatarGroupRecipe>; readonly selection: MeeshyAvatarGroupSelection }) {
  const { recipe, selection, onSelectionChange, caption, isEnabled, cell, label, layout, trailing } = props;
  const multiple = isMultiple(selection);
  const chosen = multiple ? selection.multiple : new Set(selection.single === null ? [] : [selection.single]);
  const indices = Array.from({ length: recipe.visible }, (_, index) => index);
  const enabled = (index: number): boolean => isEnabled === undefined || isEnabled(index);
  const firstFocus = chosen.size > 0 ? Math.min(...chosen) : (indices.find(enabled) ?? 0);
  const toggle = (index: number): void => {
    if (!enabled(index) || onSelectionChange === undefined) return;
    impact('light');
    if (multiple) {
      const next = new Set(chosen);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      onSelectionChange({ multiple: next });
    } else if (!chosen.has(index)) onSelectionChange({ single: index });
  };
  const keyDown = (event: KeyboardEvent<HTMLElement>, index: number): void => {
    if (multiple) return;
    const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
    const target = kitRadioKeyTarget({ key: event.key, from: index, lastIndex: recipe.visible - 1, isRtl: rtl });
    if (target === null) return;
    event.preventDefault();
    focusKitRadio(event.currentTarget, target);
    toggle(target);
  };
  return (
    <div
      className="kit-avatar-group__cells"
      role={multiple ? 'group' : 'radiogroup'}
      aria-label={label ?? props.summary}
      data-layout={typeof layout === 'object' ? 'grid' : (layout ?? 'rail')}
      style={recipe.columns === null ? undefined : { gridTemplateColumns: `repeat(${recipe.columns}, minmax(0, 1fr))` }}
    >
      {indices.map((index) => {
        const name = caption?.(index) ?? undefined;
        const isChosen = chosen.has(index);
        return (
          <button
            key={index}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={isChosen}
            aria-label={name === undefined ? undefined : name}
            disabled={!enabled(index)}
            tabIndex={index === firstFocus ? 0 : -1}
            className="kit-avatar-group__cell"
            data-kit-group-cell=""
            data-selected={isChosen ? '' : undefined}
            onClick={() => toggle(index)}
            onKeyDown={(event) => keyDown(event, index)}
          >
            <span className="kit-avatar-group__disc" aria-hidden="true">{cell(index, recipe.size)}</span>
            {isChosen ? <span className="kit-avatar-group__check" aria-hidden="true">{CHECK}</span> : null}
            {name === undefined ? null : <span className="kit-avatar-group__caption" aria-hidden="true">{name}</span>}
            {name === undefined ? null : <span className="sr-only">{name}</span>}
          </button>
        );
      })}
      {trailing === undefined ? null : <span className="kit-avatar-group__trailing" data-kit-group-trailing="">{trailing}</span>}
    </div>
  );
}

function Named(props: MeeshyAvatarGroupProps & { readonly recipe: ReturnType<typeof meeshyAvatarGroupRecipe> }) {
  const { recipe, caption, cell, layout, label, trailing } = props;
  return (
    <ul className="kit-avatar-group__cells" role="list" aria-label={label ?? props.summary} data-layout={typeof layout === 'object' ? 'grid' : (layout ?? 'rail')} style={recipe.columns === null ? undefined : { gridTemplateColumns: `repeat(${recipe.columns}, minmax(0, 1fr))` }}>
      {Array.from({ length: recipe.visible }, (_, index) => {
        const name = caption?.(index) ?? undefined;
        return (
          <li key={index} className="kit-avatar-group__cell" data-kit-group-cell="">
            <span className="kit-avatar-group__disc" aria-hidden="true">{cell(index, recipe.size)}</span>
            {name === undefined ? null : <span className="kit-avatar-group__caption">{name}</span>}
          </li>
        );
      })}
      {recipe.overflowLabel === null ? null : <li className="kit-avatar-group__cell kit-avatar-group__overflow" data-kit-group-overflow="">{recipe.overflowLabel}</li>}
      {trailing === undefined ? null : <li className="kit-avatar-group__trailing" data-kit-group-trailing="">{trailing}</li>}
    </ul>
  );
}

/**
 * Un groupe d'avatars en quatre dispositions. Pile et duo sont UNE image nommée par une
 * phrase (ou une seule cible quand `onPress` est donné) ; rangée et grille nomment chaque
 * cellule, et portent une sélection unique (groupe radio) ou multiple (cases à cocher) dont
 * le nouvel état revient à l'hôte. L'hôte n'est appelé que pour les rangs visibles.
 */
export const MeeshyAvatarGroup = memo(function MeeshyAvatarGroup(props: MeeshyAvatarGroupProps) {
  const { count, cell, layout = 'stack', size, max, selection, summary, showsChevron = false, label, tint, surface, onPress, trailing, className } = props;
  const recipe = meeshyAvatarGroupRecipe({ layout, size, count, max, reduceMotion: prefersReducedMotion() });
  if (!recipe.isRenderable) return null;
  const classes = className === undefined ? 'kit-avatar-group' : `kit-avatar-group ${className}`;
  const style = meeshyAvatarGroupStyle(recipe, tint, surface);
  const isCompact = layout === 'stack' || layout === 'duo';
  if (!isCompact) {
    return (
      <div className={classes} data-kit-avatar-group="" data-layout={typeof layout === 'object' ? 'grid' : layout} style={style}>
        {selection === undefined ? <Named {...props} recipe={recipe} /> : <Selectable {...props} recipe={recipe} selection={selection} />}
      </div>
    );
  }
  const name = label ?? summary;
  const body = (
    <>
      <Faces count={count} size={recipe.size} cell={cell} recipe={recipe} trailing={trailing} />
      {summary === undefined ? null : <span className="kit-avatar-group__summary" aria-hidden="true">{summary}</span>}
      {showsChevron ? <span className="kit-avatar-group__chevron" aria-hidden="true">{CHEVRON}</span> : null}
    </>
  );
  return onPress === undefined ? (
    <div className={classes} role="img" aria-label={name} data-kit-avatar-group="" data-layout={layout as string} data-breathes={recipe.breathes ? '' : undefined} style={style}>
      {body}
    </div>
  ) : (
    <button type="button" className={`${classes} kit-avatar-group--press`} aria-label={name} data-kit-avatar-group="" data-layout={layout as string} data-breathes={recipe.breathes ? '' : undefined} style={style} onClick={onPress}>
      {body}
    </button>
  );
});

export type MeeshyAvatarGroupSkeletonProps = {
  readonly layout?: MeeshyAvatarGroupLayout | undefined;
  readonly size?: MeeshyAvatarGroupSize | undefined;
  readonly count?: number | undefined;
};

/** Le squelette du groupe : les atomes de K38 aux mêmes diamètres et chevauchements ; aucun reflet propre. */
export const MeeshyAvatarGroupSkeleton = memo(function MeeshyAvatarGroupSkeleton({ layout = 'stack', size = 40, count = 3 }: MeeshyAvatarGroupSkeletonProps) {
  const recipe = meeshyAvatarGroupRecipe({ layout, size, count });
  if (!recipe.isRenderable) return null;
  return (
    <span className="kit-avatar-group kit-avatar-group--skeleton" aria-hidden="true" style={meeshyAvatarGroupStyle(recipe, undefined, undefined)}>
      <span className="kit-avatar-group__faces">
        {Array.from({ length: recipe.visible }, (_, index) => (
          <span key={index} className="kit-avatar-group__face">
            <MeeshySkeleton shape={{ kind: 'circle', diameter: recipe.size }} />
          </span>
        ))}
      </span>
    </span>
  );
});
