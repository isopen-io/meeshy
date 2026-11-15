import * as relationsEndpoints from '@meeshy/shared/api/endpoints/relations';
import { SHARED_LOCATION_DEFAULT_PRECISION, SHARED_LOCATION_PRECISIONS } from '@meeshy/shared/types/shared-location-constants';
import type { SharedLocationChangedEventData, SharedLocationOwnRecipient, SharedLocationOwnSnapshot } from '@meeshy/shared/types/shared-location';

import { bboxQuery, type GeoBbox } from '@/lib/map/slippy';

import { unwrap } from './client';
import { HORS_DISQUE_PREFIXE } from './souverain';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LES POSITIONS QU'ON ME PARTAGE, CÔTÉ PORT** (#16984) — `GET /relations/locations?bbox=`
 * (`routes/relations/locations.ts`) : les partages en cours qui me sont destinés, chacun
 * DÉJÀ tronqué à la précision que son émetteur m'a donnée. Le direct passe ensuite par
 * `location:share-changed` (`lib/shared-locations/shared-locations-live.ts`).
 *
 * Décodé à la main (le web n'embarque pas Zod sur ce chemin), TOLÉRANT et FERMÉ :
 * - une ligne illisible se saute, elle ne fait pas tomber les autres ;
 * - une précision inconnue se lit `city`, la plus floue — jamais plus fine ;
 * - seuls les sept champs servis traversent : rien n'est fabriqué, rien ne voyage à côté.
 */

export type SharedLocation = SharedLocationChangedEventData;
export type SharedLocationDeps = { readonly source: DataSource; readonly transport: HttpTransport };

type Wire = Readonly<Record<string, unknown>>;

const objectOf = (raw: unknown): Wire | null => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Wire) : null);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const numberWithin = (value: unknown, min: number, max: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
const instantOf = (value: unknown): string | null => {
  const text = textOf(value);
  return text !== null && !Number.isNaN(Date.parse(text)) ? text : null;
};

export function decodeSharedLocation(raw: unknown): SharedLocation | null {
  const wire = objectOf(raw);
  if (wire === null) return null;
  const userId = textOf(wire.userId);
  const latitude = numberWithin(wire.latitude, -90, 90);
  const longitude = numberWithin(wire.longitude, -180, 180);
  const radiusMeters = numberWithin(wire.radiusMeters, 0, Number.MAX_SAFE_INTEGER);
  const updatedAt = instantOf(wire.updatedAt);
  const expiresAt = instantOf(wire.expiresAt);
  if (userId === null || latitude === null || longitude === null || radiusMeters === null || updatedAt === null || expiresAt === null) return null;
  const precision = SHARED_LOCATION_PRECISIONS.find((candidate) => candidate === wire.precision) ?? SHARED_LOCATION_DEFAULT_PRECISION;
  return { userId, latitude, longitude, precision, radiusMeters, updatedAt, expiresAt };
}

export async function loadSharedLocations(deps: SharedLocationDeps & { readonly bbox: GeoBbox; readonly signal?: AbortSignal }): Promise<ApiResult<readonly SharedLocation[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: [] };
  const result = await deps.transport.request<unknown>({
    method: 'GET',
    path: `${relationsEndpoints.locations}?bbox=${bboxQuery(deps.bbox)}`,
    ...(deps.signal === undefined ? {} : { signal: deps.signal }),
  });
  if (!result.ok) return result;
  const items = objectOf(result.data)?.items;
  return { ok: true, data: Array.isArray(items) ? items.flatMap((row) => decodeSharedLocation(row) ?? []) : [] };
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

const decodeOwnRecipient = (raw: unknown): SharedLocationOwnRecipient | null => {
  const wire = objectOf(raw);
  const userId = textOf(wire?.userId);
  const expiresAt = instantOf(wire?.expiresAt);
  if (wire === null || userId === null || !OBJECT_ID.test(userId) || expiresAt === null) return null;
  const precision = SHARED_LOCATION_PRECISIONS.find((candidate) => candidate === wire.precision) ?? SHARED_LOCATION_DEFAULT_PRECISION;
  return { userId: userId.toLowerCase(), precision, expiresAt };
};

/**
 * MON partage, tel que la passerelle le sert (`GET /relations/locations/mine`, #18389). Une réponse
 * sans liste lisible vaut `null` (« je ne sais pas ») : le centre garde alors la sienne, plutôt que de
 * lire une panne comme « plus aucun partage ». Une ligne illisible se saute.
 */
export function decodeOwnSharedLocation(raw: unknown): SharedLocationOwnSnapshot | null {
  const wire = objectOf(raw);
  if (wire === null || !Array.isArray(wire.recipients)) return null;
  return { recipients: wire.recipients.flatMap((row) => decodeOwnRecipient(row) ?? []), expiresAt: instantOf(wire.expiresAt) };
}

/** `null` : hors ligne, refus, passerelle d'avant (404) ou données de démonstration — rien n'est conclu. */
export async function loadOwnSharedLocation(deps: SharedLocationDeps): Promise<SharedLocationOwnSnapshot | null> {
  if (__FIXTURES__ && deps.source === 'fixtures') return null;
  const result = await deps.transport.request<unknown>({ method: 'GET', path: relationsEndpoints.locationsMine });
  return result.ok ? decodeOwnSharedLocation(result.data) : null;
}

/**
 * Sous le préfixe qui ne touche pas le disque (`souverain.ts`) : le cache de requêtes est
 * déshydraté dans `localStorage`, et la position d'un lien n'a rien à y survivre — ni à la
 * session, ni au partage, ni à un blocage. Le seau `api` du service worker l'exclut aussi
 * (`net/api-runtime-cache.ts`) : sans cela, sa copie disque était rejouée hors réseau.
 */
export const SHARED_LOCATIONS_QUERY_KEY = [HORS_DISQUE_PREFIXE, 'relations', 'locations'] as const;

/** Un rattrapage dit SON emprise et l'instant (horloge locale) où il est parti : il fait foi dans cette emprise, à cet instant. */
export type SharedLocationsSnapshot = { readonly items: readonly SharedLocation[]; readonly bbox: GeoBbox; readonly requestedAt: number };

export function sharedLocationsQueryOptions(deps: SharedLocationDeps, bbox: GeoBbox) {
  return {
    queryKey: [...SHARED_LOCATIONS_QUERY_KEY, bboxQuery(bbox)] as const,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }): Promise<SharedLocationsSnapshot> => {
      const requestedAt = Date.now();
      const items = unwrap(await loadSharedLocations({ ...deps, bbox, ...(signal === undefined ? {} : { signal }) }));
      return { items, bbox, requestedAt };
    },
  };
}
