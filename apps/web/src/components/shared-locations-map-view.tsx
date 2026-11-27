import { useRef, type ReactNode } from 'react';

import type { UserPresenceStatus } from '@meeshy/shared/utils/user-presence';

import { translateCircles } from '@/lib/i18n-circles-catalog';
import { relationLevelIcon, relationLevelLabel, relationLevelTint } from '@/lib/relations/level-labels';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { SharedLocation } from '@/lib/api/shared-locations';
import { useBatteryBadge } from '@/lib/battery/use-battery';
import type { BatteryBadge } from '@/lib/battery/battery-view';
import { useListeningBand, type ListeningBand } from '@/lib/now-playing/listening-band';
import type { PhoneUnreachableBadge } from '@/lib/phone-reachability/phone-reachability-view';
import { usePhoneUnreachableBadge } from '@/lib/phone-reachability/use-phone-reachability';
import { spreadPins, type ScreenPoint } from '@/lib/map/fan';
import { metersToPixels, screenPoint, tilesCovering, TILE_SIZE, type MapView } from '@/lib/map/slippy';

import { Avatar } from './avatar';
import { MeeshyAvatarMorph } from './kit/meeshy-avatar-morph';
import { MeeshyMapPin } from './kit/meeshy-map-pin';

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
 * - **Le cercle se voit et s'entend** (#17013) : l'épingle prend la couleur et l'icône du
 *   cercle que le SERVEUR a jugé pour moi (`circle`), et le lecteur d'écran le nomme. Sans
 *   cercle servi (serveur antérieur), l'épingle reste neutre : aucun client ne le recalcule.
 * - **Accessible** : la carte est un `application` focalisable (flèches = glisser, + / − =
 *   zoom) ; la LISTE dit la même chose que les épingles, pour qui n'a pas la carte.
 * - **Personne ne cache personne** (#19883) : des épingles qui se recouvrent (toutes au même
 *   centre à la précision « ville ») s'ouvrent en éventail autour du point servi ; le flou
 *   reste centré sur ce point, et chaque épingle garde le cercle de SA personne.
 * - **Ce que vit la personne** (#20658, iso iOS #19885) : son écoute défile sur l'avatar
 *   de l'épingle, sa batterie ou son téléphone injoignable s'y posent, lus dans les caches
 *   déjà servis — aucune requête de plus, rien sans entrée servie. L'épingle et la ligne
 *   de la liste le disent au lecteur d'écran.
 * - **Pure** : l'état (vue, positions, noms) est tenu par `shared-locations-map.tsx`.
 */

export type SharedLocationPerson = {
  readonly name: string | null;
  readonly initials: string;
  readonly avatar: string | undefined;
  /** Servie ou absente : jamais déduite d'ici. */
  readonly presence: UserPresenceStatus | undefined;
};

/** Ce que la personne vit, tel que servi à ce lecteur : chaque signal absent n'ajoute rien. */
export type SharedLocationLife = {
  readonly listening?: ListeningBand;
  readonly battery?: BatteryBadge;
  readonly unreachable?: PhoneUnreachableBadge;
};

/** Les caches de l'onglet, observés sans requête (`enabled: false`) : la même source que l'en-tête d'un direct. */
export function useServedLife(userId: string, language: InterfaceLanguage): SharedLocationLife {
  const listening = useListeningBand(userId, language);
  const battery = useBatteryBadge(userId, language);
  const unreachable = usePhoneUnreachableBadge(userId, language);
  return { ...(listening === undefined ? {} : { listening }), ...(battery === undefined ? {} : { battery }), ...(unreachable === undefined ? {} : { unreachable }) };
}

/** Le téléphone injoignable l'emporte sur la batterie, comme sur l'avatar (`avatar.tsx`). */
export function lifeSpoken(life: SharedLocationLife): readonly string[] {
  const device = life.unreachable?.spoken ?? life.battery?.spoken;
  return [life.listening?.spoken, device].filter((part): part is string => part !== undefined);
}

const withLife = (text: string, life: SharedLocationLife): string => [text, ...lifeSpoken(life)].join(', ');

export type SharedLocationsMapViewProps = {
  readonly language: InterfaceLanguage;
  readonly locations: readonly SharedLocation[];
  readonly view: MapView;
  readonly personOf: (userId: string) => SharedLocationPerson;
  readonly formatTime: (iso: string) => string;
  readonly online: boolean;
  /** `loading` : le premier rattrapage n'a pas répondu (rien ne dit « personne ») ; `failed` : il a échoué. */
  readonly status: 'loading' | 'failed' | 'ready';
  readonly onRetry: () => void;
  readonly onZoom: (delta: 1 | -1) => void;
  readonly onPan: (dx: number, dy: number) => void;
  /** La personne choisie (la fiche qui a ouvert la carte, ou l'épingle touchée) ; absente, aucune. */
  readonly selectedUserId?: string | null;
  /** Sans lui, l'épingle est une image nommée ; avec lui, un bouton qui choisit la personne. */
  readonly onSelect?: (userId: string) => void;
  /** Ce qui se dit de la personne choisie, posé SOUS la carte et non par-dessus : la carte reste manipulable. */
  readonly detail?: ReactNode;
  /** Ce que vit chaque personne ; par défaut les caches servis (`useServedLife`). Appelé comme un hook, une fois par épingle et par ligne. */
  readonly usePersonLife?: (userId: string, language: InterfaceLanguage) => SharedLocationLife;
};

const TILE_URL = (z: number, x: number, y: number): string => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
/** Les libellés SANS paramètre : `translateCircles` exige les siens, et une union de clés ne les lui donne pas. */
type PlainKey = 'positions.failed' | 'positions.retry' | 'positions.offline' | 'positions.map.a11y' | 'positions.zoomIn' | 'positions.zoomOut' | 'positions.attribution' | 'positions.empty' | 'positions.list.title' | 'positions.cannotEmit';
const PIN_SIZE = 56;
const PIN_AVATAR = 48;
/** Sous ce diamètre le cercle ne se voit pas : l'épingle suffit (position exacte). */
const MIN_VISIBLE_BLUR = 16;
const KEY_PAN_PIXELS = 80;
/** Deux épingles plus proches que leur diamètre se recouvrent : elles s'écartent d'au moins cela. */
const FAN_DISTANCE = PIN_SIZE + 4;
/** Un bouton posé sur la carte (épingle, zoom) garde son toucher : la carte capture le pointeur pour glisser, et un
 * pointeur capturé enverrait le clic à la carte, jamais au bouton. Glisser part donc du fond de carte. */
const keepsItsTouch = (event: { stopPropagation(): void }): void => event.stopPropagation();

export function rowText({ language, location, person, formatTime }: { readonly language: InterfaceLanguage; readonly location: SharedLocation; readonly person: SharedLocationPerson; readonly formatTime: (iso: string) => string }): string {
  const name = person.name ?? translateCircles(language, 'positions.someone');
  const params = { name: location.circle === undefined ? name : `${name} · ${relationLevelLabel(language, location.circle)}`, time: formatTime(location.expiresAt) };
  const byPrecision = {
    exact: () => translateCircles(language, 'positions.row.exact', params),
    neighborhood: () => translateCircles(language, 'positions.row.neighborhood', params),
    city: () => translateCircles(language, 'positions.row.city', params),
  } as const satisfies Record<SharedLocation['precision'], () => string>;
  return byPrecision[location.precision]();
}

const isOnMap = (at: ScreenPoint, view: MapView): boolean => at.x >= 0 && at.y >= 0 && at.x <= view.width && at.y <= view.height;

function Pin({
  location,
  text,
  person,
  view,
  pinAt,
  selected,
  onSelect,
  language,
  usePersonLife,
}: {
  readonly language: InterfaceLanguage;
  readonly usePersonLife: (userId: string, language: InterfaceLanguage) => SharedLocationLife;
  readonly location: SharedLocation;
  readonly text: string;
  readonly person: SharedLocationPerson;
  readonly view: MapView;
  /** Là où l'épingle se pose : le point servi, ou sa place dans l'éventail. */
  readonly pinAt: ScreenPoint;
  readonly selected: boolean;
  readonly onSelect: ((userId: string) => void) | undefined;
}) {
  const life = usePersonLife(location.userId, language);
  const at = screenPoint(location, view);
  if (!isOnMap(at, view)) return null;
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
            opacity: selected ? 0.9 : 0.7,
          }}
        />
      ) : null}
      <span
        data-shared-location-pin={location.userId}
        onPointerDown={keepsItsTouch}
        className="absolute grid place-items-center"
        style={{ left: pinAt.x - PIN_SIZE / 2, top: pinAt.y - PIN_SIZE / 2, width: PIN_SIZE, height: PIN_SIZE, zIndex: selected ? 1 : 0 }}
      >
        <MeeshyMapPin
          label={withLife(text, life)}
          isSelected={selected}
          precision="exact"
          {...(location.circle === undefined
            ? {}
            : {
                tint: relationLevelTint(location.circle),
                badge: (
                  <span data-shared-location-circle={location.circle} aria-hidden="true">
                    {relationLevelIcon(location.circle)}
                  </span>
                ),
              })}
          {...(onSelect === undefined ? {} : { onPress: () => onSelect(location.userId) })}
        >
          <MeeshyAvatarMorph id={location.userId} size={PIN_AVATAR}>
            <Avatar
              initials={person.initials}
              color="var(--color-brand)"
              size={PIN_AVATAR}
              {...(person.presence === undefined ? {} : { presence: person.presence })}
              {...(person.avatar === undefined ? {} : { src: person.avatar })}
              {...(person.name === null ? {} : { name: person.name })}
              {...life}
              redundant
            />
          </MeeshyAvatarMorph>
        </MeeshyMapPin>
      </span>
    </>
  );
}

function Row({ userId, text, language, usePersonLife }: { readonly userId: string; readonly text: string; readonly language: InterfaceLanguage; readonly usePersonLife: (userId: string, language: InterfaceLanguage) => SharedLocationLife }) {
  const life = usePersonLife(userId, language);
  return (
    <li data-shared-location-row={userId} className="text-body">
      {withLife(text, life)}
    </li>
  );
}

export function SharedLocationsMapView({ language, locations, view, personOf, formatTime, online, status, onRetry, onZoom, onPan, selectedUserId = null, onSelect, detail = null, usePersonLife = useServedLife }: SharedLocationsMapViewProps) {
  const t = (key: PlainKey): string => translateCircles(language, key);
  const drag = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const rows = locations.map((location) => ({ location, person: personOf(location.userId) })).map((row) => ({ ...row, text: rowText({ language, ...row, formatTime }) }));
  const placed = spreadPins(
    rows.map(({ location }) => ({ id: location.userId, ...screenPoint(location, view) })).filter((pin) => isOnMap(pin, view)),
    FAN_DISTANCE,
  );
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
          <Pin key={location.userId} location={location} text={text} person={person} view={view} pinAt={placed.get(location.userId) ?? screenPoint(location, view)} selected={selectedUserId === location.userId} onSelect={onSelect} language={language} usePersonLife={usePersonLife} />
        ))}
        <div className="absolute right-2 top-2 grid gap-2" onPointerDown={keepsItsTouch}>
          {zoomButton(1, 'positions.zoomIn', '+')}
          {zoomButton(-1, 'positions.zoomOut', '−')}
        </div>
        <small className="absolute bottom-0 right-0 px-2 py-1 text-caption" style={{ backgroundColor: 'var(--color-panel)', color: 'var(--color-ink-muted)' }}>
          {t('positions.attribution')}
        </small>
      </div>
      {detail}
      {status === 'failed' ? (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <p className="text-body" style={{ color: 'var(--color-ink)' }}>
            {t('positions.failed')}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[44px] rounded-card px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ backgroundColor: 'var(--color-panel)', color: 'var(--color-brand)', border: '1px solid var(--color-border)' }}
          >
            {t('positions.retry')}
          </button>
        </div>
      ) : null}
      {rows.length === 0 ? (
        status === 'ready' ? (
          <p className="text-body" style={{ color: 'var(--color-ink-muted)' }}>
            {t('positions.empty')}
          </p>
        ) : status === 'loading' ? (
          <div aria-busy="true" className="h-6" />
        ) : null
      ) : (
        <div>
          <h2 className="text-title font-bold">{t('positions.list.title')}</h2>
          <ul className="grid gap-2">
            {rows.map(({ location, text }) => (
              <Row key={location.userId} userId={location.userId} text={text} language={language} usePersonLife={usePersonLife} />
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
