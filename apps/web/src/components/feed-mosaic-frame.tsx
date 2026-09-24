import type { ReactNode } from 'react';

import {
  MOSAIC_OVERFLOW_LABEL_SIZE,
  MOSAIC_OVERFLOW_VEIL_OPACITY,
  MOSAIC_TILE_RADIUS,
  mosaicAspectRatio,
  mosaicTiles,
  type MosaicTile,
  type TiledLayoutMode,
} from '@/lib/feed/mosaic-layout';

/** Une fraction en pourcentage CSS, arrondie au millième de point : `0.634`
 * s'écrit `63.4%`, jamais `63.400000000000006%`. */
const percent = (fraction: number): string => `${Math.round(fraction * 100_000) / 1000}%`;

/**
 * `FeedMosaicFrame` — LA BOÎTE D'UNE MOSAÏQUE DU FIL (#6514, extraite par
 * #6898) : le rapport de l'agencement, le `span` et le défilement de `reel`,
 * la position de chaque tuile, son rayon, et le report « +N ». La SOURCE de la
 * tuile — un MÉDIA (`FeedMediaMosaic`) ou une SCÈNE ARRÊTÉE
 * (`FeedSceneMosaic`) — est la seule chose que l'hôte fournit.
 *
 * Extraite plutôt que recopiée : la première forme du lot #6898 portait deux
 * copies de cette géométrie, et deux mosaïques voisines d'un même fil
 * auraient dérivé à la première retouche de l'une d'elles.
 *
 * `reel` DÉBORDE volontairement à droite (l'amorce qui dit « il y en a
 * d'autres ») : la boîte fait la largeur de la carte, son CONTENU s'étend et
 * défile. Un conteneur défilant reçoit le focus clavier, sans quoi ses tuiles
 * 3 et 4 seraient hors d'atteinte de qui n'a pas de doigt.
 */
export function FeedMosaicFrame({
  count,
  layout,
  label,
  markers,
  renderTile,
}: {
  readonly count: number;
  readonly layout: TiledLayoutMode;
  readonly label: string;
  /** Les marques de recette de l'HÔTE (`data-feed-media`,
   * `data-feed-scene-mosaic`) — ce qui distingue les deux natures au DOM. */
  readonly markers: Readonly<Record<`data-${string}`, string>>;
  readonly renderTile: (tile: MosaicTile) => ReactNode;
}) {
  const tiles = mosaicTiles(count, layout);
  const last = tiles[tiles.length - 1];
  const span = last === undefined ? 1 : Math.max(1, last.x + last.width);
  const scrolls = span > 1;

  return (
    <div
      {...markers}
      data-feed-layout={layout}
      role="group"
      aria-label={label}
      {...(scrolls ? { tabIndex: 0 } : {})}
      className={
        scrolls
          ? 'overflow-x-auto overflow-y-hidden overscroll-x-contain focus-visible:outline-2 focus-visible:outline-offset-2'
          : 'overflow-hidden'
      }
      style={{ aspectRatio: `1 / ${mosaicAspectRatio(layout)}`, borderRadius: MOSAIC_TILE_RADIUS, outlineColor: 'var(--color-ios-brand)' }}
    >
      <div className="relative h-full" style={{ width: percent(span) }}>
        {tiles.map((tile) => (
          <div
            key={tile.index}
            data-feed-mosaic-tile={tile.index}
            className="absolute"
            style={{ left: percent(tile.x / span), top: percent(tile.y), width: percent(tile.width / span), height: percent(tile.height) }}
          >
            <div className="relative size-full overflow-hidden" style={{ borderRadius: MOSAIC_TILE_RADIUS, backgroundColor: 'var(--color-ios-card)' }}>
              {renderTile(tile)}
              {/* Le « +N » porte un voile et un chiffre au centre : il laisse
                  passer le geste vers la tuile qu'il recouvre. */}
              {tile.overflow > 0 ? (
                <span
                  data-feed-mosaic-overflow
                  className="pointer-events-none absolute inset-0 grid place-items-center font-bold text-white"
                  style={{ backgroundColor: `rgba(0,0,0,${MOSAIC_OVERFLOW_VEIL_OPACITY})`, fontSize: MOSAIC_OVERFLOW_LABEL_SIZE }}
                >
                  {`+${tile.overflow}`}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
