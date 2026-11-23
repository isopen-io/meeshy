import { memo, type ReactNode } from 'react';

import type { SharedLocationPrecision } from '@meeshy/shared/types/shared-location-constants';

import { metersToPixels, tilesCovering, TILE_SIZE, type GeoPoint, type MapView } from '@/lib/map/slippy';

/**
 * **LE BLOC HÉROS DE CARTE D'UNE FICHE** (#20242, iso `ProfileWhereHero.swift`) — la carte pleine largeur centrée sur
 * la DERNIÈRE position connue, le titre et la légende (« Dernière position · il y a 7 min ») posés sur un voile en bas ;
 * un toucher ouvre la carte. L'hôte ne le pose que s'il a une position SERVIE : jamais de carte vide.
 *
 * Le fond est fait des tuiles de la carte (`shared-locations-map-view.tsx`), dessinées pour une largeur fixe et
 * centrées : la position reste au milieu quelle que soit la largeur de la fiche, sans mesure ni écouteur. Le cercle
 * dit le flou de la précision accordée ; `pin` (l'avatar de la personne) se pose au centre.
 */

export const PROFILE_WHERE_HERO_HEIGHT = 200;
/** Assez large pour la colonne la plus large de la fiche ; ce qui dépasse est rogné. */
const CANVAS_WIDTH = 768;
const ZOOM: Readonly<Record<SharedLocationPrecision, number>> = { exact: 15, neighborhood: 14, city: 11 };
/** Sous ce diamètre le cercle ne se voit pas : l'épingle suffit (même seuil que la carte). */
const MIN_VISIBLE_BLUR = 16;
const TILE_URL = (z: number, x: number, y: number): string => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

export const ProfileWhereHero = memo(function ProfileWhereHero({
  point,
  precision,
  radiusMeters,
  title,
  caption,
  detail,
  label,
  attribution,
  pin,
  onOpen,
}: {
  readonly point: GeoPoint;
  readonly precision: SharedLocationPrecision;
  readonly radiusMeters: number;
  readonly title: string;
  /** « Dernière position · il y a 7 min ». */
  readonly caption: string;
  /** La précision accordée et le temps qui reste ; absente sur ma propre fiche. */
  readonly detail?: string;
  /** Ce que le lecteur d'écran entend : l'action et la légende. */
  readonly label: string;
  readonly attribution: string;
  readonly pin: ReactNode;
  readonly onOpen: () => void;
}) {
  const view: MapView = { center: point, zoom: ZOOM[precision], width: CANVAS_WIDTH, height: PROFILE_WHERE_HERO_HEIGHT };
  const blur = metersToPixels(radiusMeters, point.latitude, view.zoom) * 2;
  return (
    <button
      type="button"
      data-profile-where-hero=""
      aria-label={label}
      onClick={onOpen}
      className="btn-press relative block w-full overflow-hidden rounded-card text-start focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ height: PROFILE_WHERE_HERO_HEIGHT, backgroundColor: 'var(--color-bg-sunken)', outlineColor: 'var(--color-brand)' }}
    >
      <span aria-hidden="true" className="pointer-events-none absolute top-0" style={{ left: '50%', width: CANVAS_WIDTH, height: PROFILE_WHERE_HERO_HEIGHT, marginLeft: -CANVAS_WIDTH / 2 }}>
        {tilesCovering(view).map((tile) => (
          <img
            key={`${tile.z}/${tile.x}/${tile.y}/${tile.left}/${tile.top}`}
            src={TILE_URL(tile.z, tile.x, tile.y)}
            alt=""
            width={TILE_SIZE}
            height={TILE_SIZE}
            draggable={false}
            loading="lazy"
            referrerPolicy="origin"
            className="absolute max-w-none select-none"
            style={{ left: tile.left, top: tile.top }}
          />
        ))}
        {blur < MIN_VISIBLE_BLUR ? null : (
          <span
            className="absolute rounded-full"
            style={{
              left: CANVAS_WIDTH / 2 - blur / 2,
              top: PROFILE_WHERE_HERO_HEIGHT / 2 - blur / 2,
              width: blur,
              height: blur,
              backgroundColor: 'color-mix(in srgb, var(--color-brand) 18%, transparent)',
              border: '1.5px solid color-mix(in srgb, var(--color-brand) 55%, transparent)',
            }}
          />
        )}
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {pin}
      </span>
      <small aria-hidden="true" className="pointer-events-none absolute right-0 top-0 px-2 py-0.5 text-caption" style={{ backgroundColor: 'var(--color-panel)', color: 'var(--color-ink-muted)' }}>
        {attribution}
      </small>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 grid gap-0.5 px-4 pb-3 pt-8"
        style={{ background: 'linear-gradient(to top, var(--color-scrim-strong), transparent)', color: 'var(--color-ios-on-brand)' }}
      >
        <span className="truncate text-body font-semibold">{title}</span>
        <span className="truncate text-caption">{caption}</span>
        {detail === undefined ? null : <span className="truncate text-caption opacity-90">{detail}</span>}
      </span>
    </button>
  );
});
