import type { SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasDocument } from '@/lib/canvas/document';
import { captionWordLimit, tileCarriesCaption, type TiledLayoutMode } from '@/lib/feed/mosaic-layout';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { FeedMosaicFrame } from './feed-mosaic-frame';
import { FeedSceneSurface } from './feed-scene-surface';

/**
 * `FeedSceneMosaic` — LA MOSAÏQUE DE SCÈNES (#6898, D-78 : « chaque tuile
 * montre la scène de sa slide »). La boîte, les tuiles et le « +N » sont ceux
 * de `FeedMosaicFrame`, partagés avec `FeedMediaMosaic` — seule la SOURCE de
 * la tuile change : une scène ARRÊTÉE (`frame="tile"`), jamais un média.
 *
 * L'index de la scène touchée VOYAGE au tap (`onOpenScene`, miroir
 * `PostSceneMosaicSurface(onTapScene:)`).
 */
export type FeedSceneMosaicProps = {
  readonly document: CanvasDocument;
  readonly carrier: SceneCarrier;
  readonly preferredLanguages: readonly string[];
  readonly layout: TiledLayoutMode;
  readonly authorName?: string;
  /** L'index VOYAGE avec le POST — miroir `PostSceneMosaicSurface(onTapScene:
   * { index in … })` : la tuile touchée dit QUELLE scène de QUEL post ouvrir,
   * `carrier.postId` étant déjà connu de ce composant. */
  readonly onOpenScene?: (postId: string, sceneIndex: number) => void;
};

export function FeedSceneMosaic({ document, carrier, preferredLanguages, layout, authorName, onOpenScene }: FeedSceneMosaicProps) {
  const count = document.scenes.length;
  const language = currentInterfaceLanguage();

  return (
    <FeedMosaicFrame
      count={count}
      layout={layout}
      label={translate(language, 'feed.scene.count', { count: String(count) })}
      markers={{ 'data-feed-scene-mosaic': '' }}
      renderTile={(tile) => (
        <FeedSceneSurface
          document={document}
          sceneIndex={tile.index}
          carrier={carrier}
          preferredLanguages={preferredLanguages}
          active={false}
          frame="tile"
          overflow={tile.overflow}
          showCaption={tile.overflow === 0 && tileCarriesCaption(layout, tile.index, count)}
          captionWordLimit={captionWordLimit(layout, count, tile.width)}
          {...(authorName !== undefined ? { authorName } : {})}
          {...(onOpenScene !== undefined ? { onOpen: (openedIndex: number) => onOpenScene(carrier.postId, openedIndex) } : {})}
        />
      )}
    />
  );
}
