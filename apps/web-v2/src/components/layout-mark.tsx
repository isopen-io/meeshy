import { mosaicTiles, type MosaicLayoutMode } from '@/lib/feed/mosaic-layout';

/**
 * **LE GLYPHE D'UN AGENCEMENT — LA GÉOMÉTRIE, PAS UN PICTOGRAMME DESSINÉ À LA
 * MAIN** (#7684, D-4) : « le glyphe ANNONCE la disposition […] dessine la
 * géométrie que le mode produit » (`ComposerMosaicChoice.swift:227-237`).
 * `mosaicTiles(3, mode)` (`lib/feed/mosaic-layout.ts`) est le SEUL calcul de
 * rectangles du dépôt ; ce composant ne fait que les peindre en `<rect>`,
 * jamais une seconde géométrie approximée pour l'icône.
 *
 * Le carrousel n'a pas de tuiles côte à côte (`isPagedLayout`) : son glyphe
 * est un cadre unique + trois points, comme `ComposerMosaicChoice.swift`
 * le décrit pour ce mode paginé.
 */
export function LayoutMark({ mode, size = 20 }: { readonly mode: MosaicLayoutMode; readonly size?: number }) {
  if (mode === 'carousel') {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="20.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="20.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="20.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  const tiles = mosaicTiles(3, mode);
  const PAD = 2;
  const BOX = 24 - PAD * 2;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      {tiles.map((tile) => (
        <rect
          key={tile.index}
          x={PAD + Math.max(0, tile.x) * BOX}
          y={PAD + tile.y * BOX}
          width={Math.min(1 - Math.max(0, tile.x), tile.width) * BOX}
          height={tile.height * BOX}
          rx="1.5"
        />
      ))}
    </svg>
  );
}
