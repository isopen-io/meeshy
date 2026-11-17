import '@/styles/kit-media-grid.css';
import '@/styles/kit-motion.css';
import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { impact } from '@/lib/view/haptics';

import {
  MEESHY_MEDIA_GRID_MEASURE,
  meeshyMediaGridPlacement,
  meeshyMediaGridRecipe,
  meeshyMediaGridStyle,
  type MeeshyMediaGridLayout,
  type MeeshyMediaGridRecipe,
  type MeeshyMediaGridSpacing,
  type MeeshyMediaTileKind,
  type MeeshyMediaTileShape,
} from './meeshy-media-grid-recipe';

export * from './meeshy-media-grid-recipe';

export type MeeshyMediaTileBadge = { readonly glyph?: ReactNode; readonly value?: string | undefined };

export type MeeshyMediaGridItem = {
  readonly id: string;
  readonly kind: MeeshyMediaTileKind;
  readonly label: string;
  readonly aspect?: number | undefined;
  readonly badge?: MeeshyMediaTileBadge | undefined;
  readonly caption?: string | undefined;
  readonly overline?: string | undefined;
  readonly text?: string | undefined;
  readonly tint?: string | undefined;
};

export type MeeshyMediaTileSize = { readonly width: number; readonly height: number };

type RenderSlots = {
  readonly content?: ((item: MeeshyMediaGridItem, size: MeeshyMediaTileSize) => ReactNode) | undefined;
  readonly captionLeading?: ((item: MeeshyMediaGridItem) => ReactNode) | undefined;
  readonly hoverActions?: ((item: MeeshyMediaGridItem) => ReactNode) | undefined;
};

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export type MeeshyMediaTileProps = RenderSlots & {
  readonly item: MeeshyMediaGridItem;
  readonly shape?: MeeshyMediaTileShape | undefined;
  readonly layout?: MeeshyMediaGridLayout | undefined;
  readonly size?: MeeshyMediaTileSize | undefined;
  readonly onOpen?: ((id: string) => void) | undefined;
  readonly haptic?: 'light' | 'none' | undefined;
  readonly tint?: string | undefined;
};

const TileBody = ({ item, size, slots }: { readonly item: MeeshyMediaGridItem; readonly size: MeeshyMediaTileSize; readonly slots: RenderSlots }) => {
  if (item.kind === 'text') {
    return (
      <span className="kit-media__text" data-kit-media-text="">
        {item.overline === undefined ? null : <span className="kit-media__overline">{item.overline}</span>}
        <span className="kit-media__sentence">{item.text}</span>
      </span>
    );
  }
  if (item.kind === 'ghost') return <span className="kit-media__ghost" />;
  if (item.kind === 'skeleton') return null;
  return <span className="kit-media__image">{slots.content?.(item, size) ?? null}</span>;
};

/** Une tuile : un bouton nommé par l'hôte qui rend son identifiant une fois, au doigt levé. Un fantôme et un squelette n'ont ni cible ni voix. */
export const MeeshyMediaTile = memo(function MeeshyMediaTile({ item, shape, layout, size = { width: 0, height: 0 }, onOpen, haptic = 'light', tint, content, captionLeading, hoverActions }: MeeshyMediaTileProps) {
  const [state, setState] = useState({ pressed: false, hovered: false, focused: false });
  const recipe: MeeshyMediaGridRecipe = meeshyMediaGridRecipe({ layout, shape, kind: item.kind, isPressed: state.pressed, isHovered: state.hovered, isFocused: state.focused, reduceMotion: prefersReducedMotion() });
  const style = { '--kit-media-scale': recipe.scale, '--kit-media-veil': recipe.veil, '--kit-media-elevation': `${recipe.elevation / 16}rem`, ...(item.aspect === undefined || recipe.aspect !== null ? {} : { aspectRatio: String(item.aspect) }), ...(item.tint === undefined && tint === undefined ? {} : { '--kit-media-tint': item.tint ?? tint }) } as CSSProperties;
  const slots = { content, captionLeading, hoverActions };
  const decorations = (
    <>
      {item.badge === undefined ? null : (
        <span className="kit-media__badge" aria-hidden="true" data-kit-media-badge="">
          {item.badge.glyph}
          {item.badge.value}
        </span>
      )}
      {item.caption === undefined ? null : (
        <span className="kit-media__caption" aria-hidden="true">
          {captionLeading?.(item)}
          <span data-kit-media-caption="">{item.caption}</span>
        </span>
      )}
    </>
  );
  const frame = recipe.aspect !== null ? { aspectRatio: String(recipe.aspect) } : undefined;
  if (!recipe.isInteractive || onOpen === undefined) {
    return (
      <span className="kit-media" data-kit-media-tile="" data-kind={item.kind} aria-hidden={recipe.isInteractive ? undefined : 'true'} style={{ ...frame, ...style }}>
        <TileBody item={item} size={size} slots={slots} />
        {recipe.isInteractive ? decorations : null}
      </span>
    );
  }
  return (
    <span
      className="kit-media-cell"
      onMouseOver={() => setState((previous) => (previous.hovered ? previous : { ...previous, hovered: true }))}
      onMouseLeave={() => setState((previous) => ({ ...previous, hovered: false }))}
    >
      <button
        type="button"
        className="kit-media"
        aria-label={item.label}
        data-kit-media-tile=""
        data-kind={item.kind}
        style={{ ...frame, ...style }}
        onPointerDown={() => setState((previous) => ({ ...previous, pressed: true }))}
        onPointerUp={() => setState((previous) => ({ ...previous, pressed: false }))}
        onPointerCancel={() => setState((previous) => ({ ...previous, pressed: false }))}
        onPointerLeave={() => setState((previous) => ({ ...previous, pressed: false }))}
        onFocus={() => setState((previous) => ({ ...previous, focused: true }))}
        onBlur={() => setState((previous) => ({ ...previous, focused: false }))}
        onClick={() => {
          if (haptic === 'light') impact('light');
          onOpen(item.id);
        }}
      >
        <TileBody item={item} size={size} slots={slots} />
        {decorations}
        <span className="kit-media__veil" aria-hidden="true" />
      </button>
      {recipe.showsHoverActions && hoverActions !== undefined ? <span className="kit-media__actions">{hoverActions(item)}</span> : null}
    </span>
  );
});

export type MeeshyMediaGridProps = RenderSlots & {
  readonly label: string;
  readonly items: readonly MeeshyMediaGridItem[];
  readonly onOpen: (id: string) => void;
  readonly layout?: MeeshyMediaGridLayout | undefined;
  readonly columns?: number | undefined;
  readonly shape?: MeeshyMediaTileShape | undefined;
  readonly spacing?: MeeshyMediaGridSpacing | undefined;
  readonly tint?: string | undefined;
  readonly onReachEnd?: (() => void) | undefined;
  readonly haptic?: 'light' | 'none' | undefined;
  readonly className?: string | undefined;
};

function useWidth(): readonly [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(MEESHY_MEDIA_GRID_MEASURE.fallbackWidth);
  useEffect(() => {
    const node = ref.current;
    if (node === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next !== undefined && next > 0) setWidth((previous) => (previous === next ? previous : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function useReachEnd(onReachEnd: (() => void) | undefined): React.RefObject<HTMLSpanElement | null> {
  const sentinel = useRef<HTMLSpanElement | null>(null);
  const latest = useRef(onReachEnd);
  latest.current = onReachEnd;
  const active = onReachEnd !== undefined;
  useEffect(() => {
    const node = sentinel.current;
    if (!active || node === null || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) latest.current?.();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [active]);
  return sentinel;
}

/**
 * Une grille de médias en trois dispositions : `regular` (colonnes égales), `masonry` (hauteurs
 * libres, chaque tuile dans la colonne la plus courte) et `row` (une ligne, jamais paresseuse).
 * Une liste nommée ; chaque tuile touchée rend son identifiant. L'image, son chargement et sa
 * mise en cache restent à l'hôte.
 */
export const MeeshyMediaGrid = memo(function MeeshyMediaGrid(props: MeeshyMediaGridProps) {
  const { label, items, onOpen, layout = 'regular', shape, spacing, tint, onReachEnd, haptic, className, content, captionLeading, hoverActions } = props;
  const recipe = meeshyMediaGridRecipe({ layout, shape, columns: props.columns, spacing });
  const [ref, width] = useWidth();
  const sentinel = useReachEnd(onReachEnd);
  const shown = layout === 'row' ? items.slice(0, recipe.columns) : items;
  const columnWidth = Math.max((width - recipe.gap * (recipe.columns - 1)) / recipe.columns, 0);
  const tileSize = (aspect: number | undefined): MeeshyMediaTileSize => ({ width: columnWidth, height: columnWidth / (recipe.aspect ?? (aspect !== undefined && aspect > 0 ? aspect : 1)) });
  const tile = (item: MeeshyMediaGridItem) => (
    <li key={item.id} role="listitem" className="kit-media-item">
      <MeeshyMediaTile item={item} shape={shape} layout={layout} size={tileSize(item.aspect)} onOpen={onOpen} haptic={haptic} tint={tint} content={content} captionLeading={captionLeading} hoverActions={hoverActions} />
    </li>
  );
  const classes = className === undefined ? 'kit-media-grid' : `kit-media-grid ${className}`;
  const style = meeshyMediaGridStyle(recipe, tint);
  if (layout === 'masonry') {
    const placed = meeshyMediaGridPlacement({ aspects: shown.map((item) => item.aspect), columns: recipe.columns, spacing: recipe.gap, width });
    return (
      <div ref={ref} className={classes} data-kit-media-grid="" data-layout="masonry" style={style}>
        <ul className="kit-media-grid__lanes" role="list" aria-label={label} style={{ display: 'contents' }}>
          {placed.columns.map((lane, laneIndex) => (
            <li key={laneIndex} className="kit-media-lane" role="presentation">
              <ul role="list" className="kit-media-lane__list">
                {lane.map((index) => tile(shown[index] as MeeshyMediaGridItem))}
              </ul>
            </li>
          ))}
        </ul>
        {onReachEnd === undefined ? null : <span ref={sentinel} className="kit-media-grid__end" aria-hidden="true" />}
      </div>
    );
  }
  return (
    <div ref={ref} className={classes} data-kit-media-grid="" data-layout={layout} style={style}>
      <ul className="kit-media-grid__tiles" role="list" aria-label={label}>
        {shown.map(tile)}
      </ul>
      {onReachEnd === undefined ? null : <span ref={sentinel} className="kit-media-grid__end" aria-hidden="true" />}
    </div>
  );
});
