/**
 * Le SCELLÉ d'un point de l'historique (#13937) : AES-256-GCM (`secret-at-rest`), lié au compte
 * comme données authentifiées — une valeur recopiée sous un autre compte ne s'ouvre pas. Le point
 * porte avec lui les lecteurs qui n'ont pas le droit de le voir (`hiddenFrom`, le fantôme ciblé du
 * moment) : l'identifiant n'est jamais en clair en base. Sans clé dans un environnement servi,
 * {@link sealPoint} LÈVE — rien n'est rangé en clair.
 */
import { openSecret, sealSecret } from '../../utils/secret-at-rest';

export type SealedPoint = {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracy?: number;
  readonly hiddenFrom: readonly string[];
  /** Arrivé à une vitesse impossible depuis le point précédent : rangé, jamais servi à la proximité. */
  readonly implausible?: true;
};

const contextOf = (ownerId: string): string => `BloodLocationPoint.sealed:${ownerId.toLowerCase()}`;

export const sealPoint = (ownerId: string, point: SealedPoint): string => sealSecret(JSON.stringify(point), contextOf(ownerId));

const isCoordinate = (value: unknown, bound: number): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= bound;

/** Le point, ou `null` (illisible, scellé pour un autre compte, forme inattendue). */
export function openPoint(ownerId: string, sealed: string): SealedPoint | null {
  try {
    const value: unknown = JSON.parse(openSecret(sealed, contextOf(ownerId)));
    if (typeof value !== 'object' || value === null) return null;
    const row = value as Record<string, unknown>;
    if (!isCoordinate(row.latitude, 90) || !isCoordinate(row.longitude, 180)) return null;
    const hiddenFrom = Array.isArray(row.hiddenFrom) ? row.hiddenFrom.filter((id): id is string => typeof id === 'string') : [];
    const accuracy = typeof row.accuracy === 'number' && Number.isFinite(row.accuracy) && row.accuracy >= 0 ? row.accuracy : undefined;
    return {
      latitude: row.latitude,
      longitude: row.longitude,
      hiddenFrom,
      ...(accuracy === undefined ? {} : { accuracy }),
      ...(row.implausible === true ? { implausible: true as const } : {}),
    };
  } catch {
    return null;
  }
}
