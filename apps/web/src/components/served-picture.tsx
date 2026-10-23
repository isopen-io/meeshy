import type { ReactNode } from 'react';

/**
 * `ServedPicture` (W12, #11318) — l'AVIF d'abord : enveloppe l'`<img>` d'une
 * pièce dans une `<picture>` dont la `<source type="image/avif">` porte les
 * variantes AVIF (S7, #11262), au MÊME `sizes` que l'image. Un navigateur qui
 * ne décode pas l'AVIF ignore la source et retombe sur le `srcset` WebP de
 * l'`<img>`, puis sur son `src`, l'original HD (verdict du porteur : la photo
 * reste HD). Sans variante AVIF, l'`<img>` est rendue telle quelle, sans
 * `<picture>` : le DOM d'avant ce lot.
 *
 * La `<picture>` n'a aucune boîte propre : l'`<img>` absolue se cale toujours
 * sur l'ancêtre positionné de la tuile.
 */
export function ServedPicture({
  avifSrcSet,
  sizes,
  children,
}: {
  readonly avifSrcSet: string | undefined;
  readonly sizes: string;
  readonly children: ReactNode;
}) {
  if (avifSrcSet === undefined) return <>{children}</>;
  return (
    <picture>
      <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} />
      {children}
    </picture>
  );
}
