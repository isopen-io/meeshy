/**
 * **LA CARTE À TUILES, SES MATHS (#16984)** — miroir de `SlippyMap.kt` (Android,
 * `core/model/.../location/`) : projection de Mercator en pixels-monde, emprise visible,
 * cadrage, tuiles à poser. Aucun SDK de carte, aucune clé ; la vue ne fait que poser ce
 * que ce module calcule. Pur : aucune horloge, aucun DOM.
 */

export const TILE_SIZE = 256;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 17;
const CITY_ZOOM = 12;
const MAX_MERCATOR_LATITUDE = 85.05112878;
const EARTH_CIRCUMFERENCE_METERS = 40_075_016.686;

export type GeoPoint = { readonly latitude: number; readonly longitude: number };
export type GeoBbox = { readonly minLongitude: number; readonly minLatitude: number; readonly maxLongitude: number; readonly maxLatitude: number };
export type MapSize = { readonly width: number; readonly height: number };
export type MapView = MapSize & { readonly center: GeoPoint; readonly zoom: number };
export type PlacedTile = { readonly z: number; readonly x: number; readonly y: number; readonly left: number; readonly top: number };

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const worldSize = (zoom: number): number => TILE_SIZE * 2 ** zoom;
const radians = (degrees: number): number => (degrees * Math.PI) / 180;
const degrees = (value: number): number => (value * 180) / Math.PI;

export function worldPixel(point: GeoPoint, zoom: number): { readonly x: number; readonly y: number } {
  const size = worldSize(zoom);
  const sine = Math.sin(radians(clamp(point.latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE)));
  return {
    x: ((point.longitude + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size,
  };
}

function geoOfWorldPixel(pixel: { readonly x: number; readonly y: number }, zoom: number): GeoPoint {
  const size = worldSize(zoom);
  return {
    longitude: (pixel.x / size) * 360 - 180,
    latitude: degrees(Math.atan(Math.sinh(Math.PI * (1 - (2 * pixel.y) / size)))),
  };
}

/** Des mètres au sol en pixels d'écran, à cette latitude et à ce zoom. */
export const metersToPixels = (meters: number, latitude: number, zoom: number): number =>
  (meters * worldSize(zoom)) / (EARTH_CIRCUMFERENCE_METERS * Math.cos(radians(clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE))));

/** L'emprise visible, toujours dans les bornes que le serveur accepte. */
export function viewBbox(view: MapView): GeoBbox {
  const centre = worldPixel(view.center, view.zoom);
  const northWest = geoOfWorldPixel({ x: centre.x - view.width / 2, y: centre.y - view.height / 2 }, view.zoom);
  const southEast = geoOfWorldPixel({ x: centre.x + view.width / 2, y: centre.y + view.height / 2 }, view.zoom);
  return {
    minLongitude: clamp(northWest.longitude, -180, 180),
    minLatitude: clamp(southEast.latitude, -90, 90),
    maxLongitude: clamp(southEast.longitude, -180, 180),
    maxLatitude: clamp(northWest.latitude, -90, 90),
  };
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** `minLon,minLat,maxLon,maxLat`, arrondi pour que la clé de cache d'une emprise tienne entre deux pixels de glisse. */
export const bboxQuery = (bbox: GeoBbox): string => [bbox.minLongitude, bbox.minLatitude, bbox.maxLongitude, bbox.maxLatitude].map(round3).join(',');

export function fitView(points: readonly GeoPoint[], size: MapSize): Pick<MapView, 'center' | 'zoom'> {
  if (points.length === 0) return { center: { latitude: 20, longitude: 0 }, zoom: MIN_ZOOM };
  const [first, ...rest] = points;
  if (first === undefined || rest.length === 0) return { center: first ?? { latitude: 20, longitude: 0 }, zoom: CITY_ZOOM };
  const longitudes = points.map((point) => point.longitude);
  const latitudes = points.map((point) => point.latitude);
  const center = {
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
  };
  const fits = (zoom: number): boolean => {
    const box = viewBbox({ center, zoom, ...size });
    const margin = 0.9;
    const spanLon = (box.maxLongitude - box.minLongitude) * margin;
    const spanLat = (box.maxLatitude - box.minLatitude) * margin;
    return Math.max(...longitudes) - Math.min(...longitudes) <= spanLon && Math.max(...latitudes) - Math.min(...latitudes) <= spanLat;
  };
  const zoom = Array.from({ length: MAX_ZOOM - MIN_ZOOM + 1 }, (_, index) => MAX_ZOOM - index).find(fits) ?? MIN_ZOOM;
  return { center, zoom };
}

/** Les tuiles qui couvrent la vue, posées au pixel près ; `x` reboucle autour de l'antiméridien. */
export function tilesCovering(view: MapView): readonly PlacedTile[] {
  const tilesPerSide = 2 ** view.zoom;
  const centre = worldPixel(view.center, view.zoom);
  const originX = centre.x - view.width / 2;
  const originY = centre.y - view.height / 2;
  const columns = range(Math.floor(originX / TILE_SIZE), Math.floor((originX + view.width) / TILE_SIZE));
  const rows = range(Math.floor(originY / TILE_SIZE), Math.floor((originY + view.height) / TILE_SIZE)).filter((row) => row >= 0 && row < tilesPerSide);
  return rows.flatMap((row) =>
    columns.map((column) => ({
      z: view.zoom,
      x: ((column % tilesPerSide) + tilesPerSide) % tilesPerSide,
      y: row,
      left: Math.round(column * TILE_SIZE - originX),
      top: Math.round(row * TILE_SIZE - originY),
    })),
  );
}

const range = (from: number, to: number): readonly number[] => Array.from({ length: to - from + 1 }, (_, index) => from + index);

/** Où poser un point sur l'écran, en pixels depuis le coin haut-gauche de la vue. */
export function screenPoint(point: GeoPoint, view: MapView): { readonly x: number; readonly y: number } {
  const centre = worldPixel(view.center, view.zoom);
  const target = worldPixel(point, view.zoom);
  return { x: target.x - centre.x + view.width / 2, y: target.y - centre.y + view.height / 2 };
}
