import { FeedMediaSurface } from './feed-media-surface';
import { FeedMosaicFrame } from './feed-mosaic-frame';
import { ViewerCaption } from './viewer-caption';
import type { FeedCardMedia } from '@/lib/feed/card-model';
import { captionWordLimit, tileCarriesCaption, type MosaicTile, type TiledLayoutMode } from '@/lib/feed/mosaic-layout';
import { truncateWords } from '@/lib/feed/text';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/** Le voile sous une légende posée sur un média — carrousel et mosaïque. */
export const CAPTION_SCRIM = { background: 'linear-gradient(to top, var(--color-scrim-strong), transparent)' } as const;

function MosaicTileMedia({
  tile,
  item,
  layout,
  count,
}: {
  readonly tile: MosaicTile;
  readonly item: FeedCardMedia;
  readonly layout: TiledLayoutMode;
  readonly count: number;
}) {
  /* Le « +N » porte déjà un voile et un chiffre au centre : une légende y
     ferait une troisième chose au même endroit (`PostSceneMosaic`). */
  const caption =
    tile.overflow === 0 && item.caption !== undefined && tileCarriesCaption(layout, tile.index, count)
      ? truncateWords(item.caption, captionWordLimit(layout, count, tile.width)).text
      : undefined;
  return (
    <>
      <FeedMediaSurface media={item} playable />
      {caption !== undefined ? (
        /* MARQUÉE pour être mesurable (#6864) — `captionOrigin` dit d'OÙ
           vient la légende, et c'est ce que la recette doit pouvoir lire à
           l'écran plutôt que dans le modèle. Ses adresses s'ouvrent par `/l/`
           (#9074, `ViewerCaption`). */
        <ViewerCaption
          probe={{ 'data-feed-mosaic-caption': item.captionOrigin ?? 'media' }}
          text={caption}
          trackingLinks={item.trackingLinks}
          className="absolute inset-x-0 bottom-0 px-2 py-1.5 text-check text-on-media"
          style={CAPTION_SCRIM}
          lang={item.captionLanguage}
        />
      ) : null}
    </>
  );
}

/**
 * LES QUATRE MOSAÏQUES D'UNE PUBLICATION (#6514) — vague, hero, défilement
 * continu, sinusoïde : la moitié rendu de `PostSceneMosaic.swift`, dont la
 * géométrie vit dans `lib/feed/mosaic-layout.ts` et la boîte dans
 * `FeedMosaicFrame` (partagée avec `FeedSceneMosaic`, #6898). Le carrousel,
 * cinquième agencement et défaut, reste `FeedMediaCarousel` : il pagine au
 * lieu de poser des tuiles.
 *
 * Une tuile montre ici un MÉDIA de la publication, dans l'ordre servi : c'est
 * le REPLI d'une publication sans document de scènes (D-78) — une publication
 * v:3 à scènes passe par `FeedSceneMosaic`, dont chaque tuile monte SA scène.
 */
export function FeedMediaMosaic({ media, layout }: { readonly media: readonly FeedCardMedia[]; readonly layout: TiledLayoutMode }) {
  const language = currentInterfaceLanguage();
  return (
    <FeedMosaicFrame
      count={media.length}
      layout={layout}
      label={translate(language, 'feed.post.media.mosaic', { count: String(media.length) })}
      markers={{ 'data-feed-media': '' }}
      renderTile={(tile) => {
        const item = media[tile.index];
        return item === undefined ? null : <MosaicTileMedia tile={tile} item={item} layout={layout} count={media.length} />;
      }}
    />
  );
}
