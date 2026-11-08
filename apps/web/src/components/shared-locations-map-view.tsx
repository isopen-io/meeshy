import { useRef } from 'react';

import type { UserPresenceStatus } from '@meeshy/shared/utils/user-presence';

import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { SharedLocation } from '@/lib/api/shared-locations';
import { metersToPixels, screenPoint, tilesCovering, TILE_SIZE, type MapView } from '@/lib/map/slippy';

import { Avatar } from './avatar';

/**
 * **LA CARTE DES POSITIONS PARTAGÉES, SA VUE** (#16984) — le web REÇOIT les positions de
 * mes liens (dès Ami), il n'émet pas : un navigateur ne suit pas une position en arrière-
 * plan (spec cercles § 1.5), et la page le dit au lieu de proposer un bouton qui mentirait.
 * Référence : la carte des posts d'iOS (`FeedPostsMapView.swift`), réutilisée pour les
 * positions des proches ; le web n'avait AUCUNE carte (tuiles OpenStreetMap, comme
 * Android `TileMapView.kt` — aucun SDK, aucune clé).
 *
 * - **Rien n'est fabriqué hors de la charge servie** : l'épingle est posée sur la position
 *   TRONQUÉE que le serveur a rendue, le cercle de flou a le rayon SERVI, l'anneau de
 *   présence n'existe que si une présence a été servie.
 * - **Accessible** : la carte est un `application` focalisable (flèches = glisser, + / − =
 *   zoom) ; la LISTE dit la même chose que les épingles, pour qui n'a pas la carte.
 * - **Pure** : l'état (vue, positions, noms) est tenu par `shared-locations-map.tsx`.
 */

export type SharedLocationPerson = {
  readonly name: string | null;
  readonly initials: string;
  readonly avatar: string | undefined;
  /** Servie ou absente : jamais déduite d'ici. */
  readonly presence: UserPresenceStatus | undefined;
};

export type SharedLocationsMapViewProps = {
  readonly language: InterfaceLanguage;
  readonly locations: readonly SharedLocation[];
  readonly view: MapView;
  readonly personOf: (userId: string) => SharedLocationPerson;
  readonly formatTime: (iso: string) => string;
  readonly online: boolean;
  readonly onZoom: (delta: 1 | -1) => void;
  readonly onPan: (dx: number, dy: number) => void;
};

const TILE_URL = (z: number, x: number, y: number): string => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
/** Les libellés SANS paramètre : `translateCircles` exige les siens, et une union de clés ne les lui donne pas. */
type PlainKey = 'positions.offline' | 'positions.map.a11y' | 'positions.zoomIn' | 'positions.zoomOut' | 'positions.attribution' | 'positions.empty' | 'positions.list.title' | 'positions.cannotEmit';
const PIN_SIZE = 40;
/** Sous ce diamètre le cercle ne se voit pas : l'épingle suffit (position exacte). */
const MIN_VISIBLE_BLUR = 16;
const KEY_PAN_PIXELS = 80;

export function rowText({ language, location, person, formatTime }: { readonly language: InterfaceLanguage; readonly location: SharedLocation; readonly person: SharedLocationPerson; readonly formatTime: (iso: string) => string }): string {
  const params = { name: person.name ?? translateCircles(language, 'positions.someone'), time: formatTime(location.expiresAt) };
  const byPrecision = {
    exact: () => translateCircles(language, 'positions.row.exact', params),
    neighborhood: () => translateCircles(language, 'positions.row.neighborhood', params),
    city: () => translateCircles(language, 'positions.row.city', params),
  } as const satisfies Record<SharedLocation['precision'], () => string>;
  return byPrecision[location.precision]();
}

function Pin({ location, text, person, view }: { readonly location: SharedLocation; readonly text: string; readonly person: SharedLocationPerson; readonly view: MapView }) {
  const at = screenPoint(location, view);
  if (at.x < 0 || at.y < 0 || at.x > view.width || at.y > view.height) return null;
  const blur = Math.round(metersToPixels(location.radiusMeters, location.latitude, view.zoom) * 2);
  return (
    <>
      {blur >= MIN_VISIBLE_BLUR ? (
        <span
          aria-hidden="true"
          data-blur-diameter={blur}
          className="pointer-events-none absolute rounded-full"
          style={{
            left: at.x - blur / 2,
            top: at.y - blur / 2,
            width: blur,
            height: blur,
            backgroundColor: 'var(--color-brand-softer)',
            border: '1px solid var(--color-brand)',
            opacity: 0.7,
          }}
        />
      ) : null}
      <span
        role="img"
        aria-label={text}
        data-shared-location-pin={location.userId}
        className="absolute grid place-items-center"
        style={{ left: at.x - PIN_SIZE / 2, top: at.y - PIN_SIZE / 2, width: PIN_SIZE, height: PIN_SIZE }}
      >
        <Avatar
          initials={person.initials}
          color="var(--color-brand)"
          size={PIN_SIZE}
          {...(person.presence === undefined ? {} : { presence: person.presence })}
          {...(person.avatar === undefined ? {} : { src: person.avatar })}
          {...(person.name === null ? {} : { name: person.name })}
          redundant
        />
      </span>
    </>
  );
}

export function SharedLocationsMapView({ language, locations, view, personOf, formatTime, online, onZoom, onPan }: SharedLocationsMapViewProps) {
  const t = (key: PlainKey): string => translateCircles(language, key);
  const drag = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const rows = locations.map((location) => ({ location, person: personOf(location.userId) })).map((row) => ({ ...row, text: rowText({ language, ...row, formatTime }) }));
  const onKeyDown = (event: { readonly key: string; preventDefault(): void }): void => {
    const moves: Readonly<Record<string, readonly [number, number]>> = {
      ArrowLeft: [-KEY_PAN_PIXELS, 0],
      ArrowRight: [KEY_PAN_PIXELS, 0],
      ArrowUp: [0, -KEY_PAN_PIXELS],
      ArrowDown: [0, KEY_PAN_PIXELS],
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      onPan(move[0], move[1]);
      return;
    }
    if (event.key === '+' || event.key === '=') onZoom(1);
    if (event.key === '-') onZoom(-1);
  };
  const zoomButton = (delta: 1 | -1, label: PlainKey, glyph: string) => (
    <button
      type="button"
      aria-label={t(label)}
      onClick={() => onZoom(delta)}
      className="grid min-h-[44px] min-w-[44px] place-items-center rounded-card text-title font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ backgroundColor: 'var(--color-panel)', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
  return (
    <section className="grid gap-4" data-shared-locations>
      {!online ? (
        <p role="status" className="text-caption" style={{ color: 'var(--color-ink-muted)' }}>
          {t('positions.offline')}
        </p>
      ) : null}
      <div
        role="application"
        tabIndex={0}
        aria-label={t('positions.map.a11y')}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const from = drag.current;
          if (from === null) return;
          drag.current = { x: event.clientX, y: event.clientY };
          onPan(from.x - event.clientX, from.y - event.clientY);
        }}
        onPointerUp={() => void (drag.current = null)}
        onPointerCancel={() => void (drag.current = null)}
        className="relative overflow-hidden rounded-card focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ width: view.width, height: view.height, maxWidth: '100%', backgroundColor: 'var(--color-bg-sunken)', touchAction: 'none' }}
      >
        {tilesCovering(view).map((tile) => (
          <img
            key={`${tile.z}/${tile.x}/${tile.y}/${tile.left}/${tile.top}`}
            src={TILE_URL(tile.z, tile.x, tile.y)}
            alt=""
            width={TILE_SIZE}
            height={TILE_SIZE}
            draggable={false}
            referrerPolicy="origin"
            className="pointer-events-none absolute max-w-none select-none"
            style={{ left: tile.left, top: tile.top }}
          />
        ))}
        {rows.map(({ location, person, text }) => (
          <Pin key={location.userId} location={location} text={text} person={person} view={view} />
        ))}
        <div className="absolute right-2 top-2 grid gap-2">
          {zoomButton(1, 'positions.zoomIn', '+')}
          {zoomButton(-1, 'positions.zoomOut', '−')}
        </div>
        <small className="absolute bottom-0 right-0 px-2 py-1 text-caption" style={{ backgroundColor: 'var(--color-panel)', color: 'var(--color-ink-muted)' }}>
          {t('positions.attribution')}
        </small>
      </div>
      {rows.length === 0 ? (
        <p className="text-body" style={{ color: 'var(--color-ink-muted)' }}>
          {t('positions.empty')}
        </p>
      ) : (
        <div>
          <h2 className="text-title font-bold">{t('positions.list.title')}</h2>
          <ul className="grid gap-2">
            {rows.map(({ location, text }) => (
              <li key={location.userId} data-shared-location-row={location.userId} className="text-body">
                {text}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-caption" style={{ color: 'var(--color-ink-muted)' }}>
        {t('positions.cannotEmit')}
      </p>
    </section>
  );
}
