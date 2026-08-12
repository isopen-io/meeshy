/**
 * Découvrabilité géographique des posts — quantification déterministe en
 * grille, INDÉPENDANTE de `metadata.location` (voir `sharedPlace.ts`, qui ne
 * sert que l'affichage). Alimente `Post.geoPoint`/`Post.geoPrecision` (index
 * `2dsphere`, voir `InitService.ensurePostGeoIndex`).
 *
 * Design : docs/superpowers/specs/2026-08-02-post-geolocation-nearby-search-design.md
 * §2 — le client envoie toujours la coordonnée EXACTE captée ; SEUL le
 * serveur calcule l'arrondi de grille avant écriture. Arrondi déterministe
 * à taille de cellule FIXE, jamais de bruit aléatoire : un bruit indépendant
 * à chaque publication se moyenne statistiquement sur plusieurs posts et
 * finit par révéler la position réelle, alors qu'une grille fixe retombe
 * toujours sur la même cellule pour un même lieu réel — rien à moyenner.
 */

export type DiscoverabilityPrecision = 'EXACT' | 'NEIGHBORHOOD' | 'CITY' | 'REGION';

export type GeoPoint = {
  type: 'Point';
  coordinates: [number, number];
};

type GridStep = {
  step: number;
  decimals: number;
};

/** Rayon approximatif : NEIGHBORHOOD ~1km, CITY ~10km, REGION ~100km (§2). */
const GRID: Record<Exclude<DiscoverabilityPrecision, 'EXACT'>, GridStep> = {
  NEIGHBORHOOD: { step: 0.01, decimals: 2 },
  CITY: { step: 0.1, decimals: 1 },
  REGION: { step: 1, decimals: 0 },
};

/** Mêmes bornes que `validCoordinates` de `sharedPlace.ts` ; `NaN` échoue toute comparaison. */
function validCoordinates(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' && typeof longitude === 'number' &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180
  );
}

function isDiscoverabilityPrecision(value: unknown): value is DiscoverabilityPrecision {
  return value === 'EXACT' || value === 'NEIGHBORHOOD' || value === 'CITY' || value === 'REGION';
}

/**
 * Arrondit une valeur au pas de grille le plus proche (arrondi symétrique
 * "au plus proche", moitié vers le haut) puis nettoie les artefacts de
 * virgule flottante introduits par la division/multiplication via `toFixed`
 * — sans ce nettoyage, `-58.3816` en grille CITY produirait
 * `-58.400000000000006` au lieu de `-58.4`.
 */
function quantizeToGrid(value: number, { step, decimals }: GridStep): number {
  const snapped = Math.round(value / step) * step;
  return Number(snapped.toFixed(decimals));
}

/**
 * Quantifie une coordonnée exacte à la précision de découvrabilité demandée.
 * Retourne un Point GeoJSON `{ type: 'Point', coordinates: [lng, lat] }` —
 * ordre GeoJSON, PAS [lat, lng]. `EXACT` renvoie la coordonnée telle quelle
 * (aucun arrondi). Retourne `null` si les coordonnées ou la précision sont
 * invalides — jamais de valeur par défaut silencieuse.
 */
export function quantizeCoordinate(
  latitude: unknown,
  longitude: unknown,
  precision: unknown
): GeoPoint | null {
  if (!validCoordinates(latitude, longitude)) return null;
  if (!isDiscoverabilityPrecision(precision)) return null;

  const lat = latitude as number;
  const lng = longitude as number;

  if (precision === 'EXACT') {
    return { type: 'Point', coordinates: [lng, lat] };
  }

  const grid = GRID[precision];
  return {
    type: 'Point',
    coordinates: [quantizeToGrid(lng, grid), quantizeToGrid(lat, grid)],
  };
}

/**
 * Résout la taille de cellule de grille (en degrés) pour la carte de densité
 * (`GET /posts/nearby/density`) à partir d'un `cellSizeKm` demandé par le
 * client (niveau de zoom carte). Cale TOUJOURS sur l'un des tiers déjà
 * définis par `quantizeCoordinate` ci-dessus (`GRID`) plutôt que d'accepter
 * une taille de cellule arbitraire : une grille non alignée sur les tiers de
 * découvrabilité produirait des cellules qui ne correspondent à aucune borne
 * de floutage connue dans le reste du produit — incohérent, et impossible à
 * documenter simplement côté client.
 *
 * EXACT (aucun arrondi) est délibérément ABSENT de ce mapping : une carte de
 * densité sans le moindre regroupement dégénère en un point par post
 * (`count` toujours 1), ce qui n'est plus une densité. Le tier le plus fin
 * disponible ici est NEIGHBORHOOD (~1km, 0.01°).
 *
 * Retourne `null` si `cellSizeKm` n'est pas un nombre fini strictement positif
 * — jamais de valeur par défaut silencieuse (même contrat que
 * `quantizeCoordinate`).
 */
export function resolveDensityGridStepDegrees(cellSizeKm: unknown): number | null {
  if (typeof cellSizeKm !== 'number' || !Number.isFinite(cellSizeKm) || cellSizeKm <= 0) {
    return null;
  }
  if (cellSizeKm <= 1) return GRID.NEIGHBORHOOD.step;
  if (cellSizeKm <= 10) return GRID.CITY.step;
  return GRID.REGION.step;
}
