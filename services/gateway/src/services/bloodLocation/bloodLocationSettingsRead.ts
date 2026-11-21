/**
 * LA RELECTURE de mes réglages de position (#19452) — l'écriture est `updateBloodLocationSettings`
 * (et `PUT /me/location/ghost`). Deux lectures, toutes deux pour SOI :
 *
 * - le fantôme GLOBAL, `User.locationGhostAt`, hors drapeau Sang (il ne fait que retirer de la
 *   visibilité, tout compte peut s'y trouver) ;
 * - le fantôme CIBLÉ et le rayon d'une personne, la ligne `relationFeatureSetting` dont je suis
 *   PROPRIÉTAIRE. La ligne inverse — ce que l'autre a réglé pour moi — n'est jamais lue.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  BLOOD_PROXIMITY_DEFAULT_RADIUS_METERS,
  type BloodLocationSettingsReading,
  type LocationGhostReading,
} from '@meeshy/shared/types/blood-location';
import { clampRadius } from './bloodLocationService';

export type LocationSettingsReadDb = Pick<PrismaClient, 'user' | 'relationFeatureSetting'>;

const ghostAtOf = async (db: Pick<PrismaClient, 'user'>, userId: string): Promise<Date | null> =>
  (await db.user.findUnique({ where: { id: userId }, select: { locationGhostAt: true } }))?.locationGhostAt ?? null;

export async function readLocationGhost(db: Pick<PrismaClient, 'user'>, userId: string): Promise<LocationGhostReading> {
  const ghostAt = await ghostAtOf(db, userId);
  return { ghost: ghostAt !== null, ghostAt: ghostAt?.toISOString() ?? null };
}

export async function readBloodLocationSettings(db: LocationSettingsReadDb, ownerId: string, otherId: string): Promise<BloodLocationSettingsReading> {
  const [ghostAt, row] = await Promise.all([
    ghostAtOf(db, ownerId),
    db.relationFeatureSetting.findUnique({
      where: { ownerId_otherId: { ownerId, otherId } },
      select: { ghostAt: true, proximityRadiusMeters: true },
    }),
  ]);
  return {
    userId: otherId,
    ghost: ghostAt !== null,
    ghostFor: (row?.ghostAt ?? null) !== null,
    proximityRadiusMeters: clampRadius(row?.proximityRadiusMeters ?? BLOOD_PROXIMITY_DEFAULT_RADIUS_METERS),
  };
}
