import { useId } from 'react';

/**
 * **LE BLOOM D'UNE IMAGE, PEINT EN HALO** (#9498, D-176) — `CIBloom` floute
 * l'image et l'ajoute sur elle-même ; le web le rend par un filtre SVG que le
 * média référence en fin de sa chaîne CSS (`url(#…)`) : un flou gaussien,
 * atténué à l'intensité du bloom, fondu en `screen` sur l'image.
 *
 * Le rayon de CoreImage est de 10 px de la source ; le web le compte en
 * FRACTION de la boîte du média (`primitiveUnits="objectBoundingBox"`), sur une
 * source supposée large de 1080 px — sur chaque axe, pour rester circulaire.
 */
const BLOOM_RADIUS_FRACTION = 10 / 1080;

const round4 = (value: number): number => Math.round(value * 10000) / 10000;

/** Un identifiant de filtre par instance — deux images au bloom, deux halos. */
export function useGlowFilterId(): string {
  return `scene-glow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/** La référence à ajouter à la chaîne `filter` du média, ou `undefined` sans bloom. */
export const glowFilterRef = (id: string, glow: number | undefined): string | undefined =>
  glow === undefined ? undefined : `url(#${id})`;

export function MediaGlowFilter({ id, glow, aspect }: { readonly id: string; readonly glow: number | undefined; readonly aspect: number }) {
  if (glow === undefined) return null;
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const amount = round4(glow);
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute' }}>
      <filter id={id} x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation={`${round4(BLOOM_RADIUS_FRACTION)} ${round4(BLOOM_RADIUS_FRACTION * ratio)}`} result="blurred" />
        <feColorMatrix in="blurred" type="matrix" values={`${amount} 0 0 0 0 0 ${amount} 0 0 0 0 0 ${amount} 0 0 0 0 0 1 0`} result="glow" />
        <feBlend in="SourceGraphic" in2="glow" mode="screen" />
      </filter>
    </svg>
  );
}
