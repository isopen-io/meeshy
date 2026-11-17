/**
 * LE FANTÔME GLOBAL DE POSITION (#19203) — « masque ma position pour tous, Sang compris ».
 * UN champ, `User.locationGhostAt` : nul = visible, daté = en fantôme depuis cette date. Ce
 * module en est le SEUL écrivain : `PUT /me/location/ghost` (hors drapeau Sang) et le réglage
 * global de `PUT /me/location/blood-settings` (sous drapeau, rétrocompatible) y passent.
 *
 * Il rend la TRANSITION, pour que le partage temporaire en cours la suive
 * (`reflectSharedLocationGhost`) : une entrée coupe, une sortie rétablit sans republier, un
 * réglage répété ne touche rien — et garde la date d'entrée.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { LocationGhostState } from '@meeshy/shared/types/shared-location';
import type { LocationGhostChange } from './sharedLocationRelay';

export type LocationGhostDb = Pick<PrismaClient, 'user'>;

export type LocationGhostWrite = { readonly state: LocationGhostState; readonly change: LocationGhostChange };

const stateOf = (ghostAt: Date | null): LocationGhostState => ({ ghost: ghostAt !== null, ghostAt: ghostAt?.toISOString() ?? null });

export async function writeLocationGhost(db: LocationGhostDb, userId: string, ghost: boolean, at: Date): Promise<LocationGhostWrite> {
  const row = await db.user.findUnique({ where: { id: userId }, select: { locationGhostAt: true } });
  const current = row?.locationGhostAt ?? null;
  if ((current !== null) === ghost) return { state: stateOf(current), change: 'unchanged' };
  const next = ghost ? at : null;
  await db.user.update({ where: { id: userId }, data: { locationGhostAt: next } });
  return { state: stateOf(next), change: ghost ? 'entered' : 'left' };
}
