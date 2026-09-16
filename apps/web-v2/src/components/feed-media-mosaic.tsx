import { FeedMediaSurface } from './feed-media-surface';
import type { FeedCardMedia } from '@/lib/feed/card-model';
import {
  MOSAIC_OVERFLOW_LABEL_SIZE,
  MOSAIC_OVERFLOW_VEIL_OPACITY,
  MOSAIC_TILE_RADIUS,
  captionWordLimit,
  mosaicAspectRatio,
  mosaicTiles,
  tileCarriesCaption,
  type MosaicTile,
  type TiledLayoutMode,
} from '@/lib/feed/mosaic-layout';
import { truncateWords } from '@/lib/feed/text';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/** Une fraction en pourcentage CSS, arrondie au millième de point : `0.634`
 * s'écrit `63.4%`, jamais `63.400000000000006%`. */
const percent = (fraction: number): string => `${Math.round(fraction * 100_000) / 1000}%`;

function MosaicTileView({
  tile,
  item,
  layout,
  count,
  span,
}: {
  readonly tile: MosaicTile;
  readonly item: FeedCardMedia;
  readonly layout: TiledLayoutMode;
  readonly count: number;
  readonly span: number;
}) {
  /* Le « +N » porte déjà un voile et un chiffre au centre : une légende y
     ferait une troisième chose au même endroit (`PostSceneMosaic`). */
  const caption =
    tile.overflow === 0 && item.caption !== undefined && tileCarriesCaption(layout, tile.index, count)
      ? truncateWords(item.caption, captionWordLimit(layout, count, tile.width)).text
      : undefined;
  return (
    <div
      data-feed-mosaic-tile={tile.index}
      className="absolute"
      style={{ left: percent(tile.x / span), top: percent(tile.y), width: percent(tile.width / span), height: percent(tile.height) }}
    >
      <div className="relative size-full overflow-hidden" style={{ borderRadius: MOSAIC_TILE_RADIUS, backgroundColor: 'var(--color-ios-card)' }}>
        <FeedMediaSurface media={item} playable />
        {caption !== undefined ? (
          <p
            className="absolute inset-x-0 bottom-0 px-2 py-1.5 text-check text-white"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }}
            {...(item.captionLanguage !== undefined ? { lang: item.captionLanguage } : {})}
          >
            {caption}
          </p>
        ) : null}
        {tile.overflow > 0 ? (
          <span
            data-feed-mosaic-overflow
            className="absolute inset-0 grid place-items-center font-bold text-white"
            style={{ backgroundColor: `rgba(0,0,0,${MOSAIC_OVERFLOW_VEIL_OPACITY})`, fontSize: MOSAIC_OVERFLOW_LABEL_SIZE }}
          >
            {`+${tile.overflow}`}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * LES QUATRE MOSAÏQUES D'UNE PUBLICATION (#6514) — vague, hero, défilement
 * continu, sinusoïde : la moitié rendu de `PostSceneMosaic.swift`, dont la
 * géométrie vit dans `lib/feed/mosaic-layout.ts`. Le carrousel, cinquième
 * agencement et défaut, reste `FeedMediaCarousel` : il pagine au lieu de poser
 * des tuiles.
 *
 * Une tuile montre un MÉDIA de la publication, dans l'ordre servi. iOS y monte
 * le player de la scène correspondante ; ce client ne rend pas encore les
 * scènes, et le média qu'une scène porte est ce qu'il sait peindre.
 *
 * `reel` DÉBORDE volontairement à droite (l'amorce qui dit « il y en a
 * d'autres ») : la boîte fait la largeur de la carte, son CONTENU s'étend et
 * défile. Un conteneur défilant reçoit le focus clavier, sans quoi ses tuiles
 * 3 et 4 seraient hors d'atteinte de qui n'a pas de doigt.
 */
export function FeedMediaMosaic({ media, layout }: { readonly media: readonly FeedCardMedia[]; readonly layout: TiledLayoutMode }) {
  const tiles = mosaicTiles(media.length, layout);
  const last = tiles[tiles.length - 1];
  const span = last === undefined ? 1 : Math.max(1, last.x + last.width);
  const scrolls = span > 1;
  const language = currentInterfaceLanguage();

  return (
    <div
      data-feed-media
      data-feed-layout={layout}
      role="group"
      aria-label={translate(language, 'feed.post.media.mosaic', { count: String(media.length) })}
      {...(scrolls ? { tabIndex: 0 } : {})}
      className={
        scrolls
          ? 'overflow-x-auto overflow-y-hidden overscroll-x-contain focus-visible:outline-2 focus-visible:outline-offset-2'
          : 'overflow-hidden'
      }
      style={{ aspectRatio: `1 / ${mosaicAspectRatio(layout)}`, borderRadius: MOSAIC_TILE_RADIUS, outlineColor: 'var(--color-ios-brand)' }}
    >
      <div className="relative h-full" style={{ width: percent(span) }}>
        {tiles.map((tile) => {
          const item = media[tile.index];
          return item === undefined ? null : (
            <MosaicTileView key={item.id} tile={tile} item={item} layout={layout} count={media.length} span={span} />
          );
        })}
      </div>
    </div>
  );
}
