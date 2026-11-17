/**
 * LE FANTÔME GLOBAL DE POSITION (#19203) — « masque ma position pour tous, Sang compris ».
 * UN champ, `User.locationGhostAt` : nul = visible, daté = en fantôme depuis cette date. Ce
 * module en est le SEUL écrivain : `PUT /me/location/ghost` (hors drapeau Sang) et le réglage
 * global de `PUT /me/location/blood-settings` (sous drapeau, rétrocompatible) y passent.
 *
 * `setLocationGhost` fait suivre le partage temporaire en cours : une entrée coupe, une sortie
 * rétablit sans republier, un réglage répété ne touche rien — et garde la date d'entrée.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { LocationGhostState } from '@meeshy/shared/types/shared-location';
import {
  reflectSharedLocationGhost,
  replaySharedLocationBatteryOf,
  type LocationGhostChange,
  type SharedLocationRelayDeps,
} from './sharedLocationRelay';

export type LocationGhostDb = Pick<PrismaClient, 'user'>;

export type LocationGhostWrite = { readonly state: LocationGhostState; readonly change: LocationGhostChange };

const stateOf = (ghostAt: Date | null): LocationGhostState => ({ ghost: ghostAt !== null, ghostAt: ghostAt?.toISOString() ?? null });

const ghostAtOf = async (db: LocationGhostDb, userId: string): Promise<Date | null> =>
  (await db.user.findUnique({ where: { id: userId }, select: { locationGhostAt: true } }))?.locationGhostAt ?? null;

export async function writeLocationGhost(db: LocationGhostDb, userId: string, ghost: boolean, at: Date): Promise<LocationGhostWrite> {
  const current = await ghostAtOf(db, userId);
  if ((current !== null) === ghost) return { state: stateOf(current), change: 'unchanged' };
  const next = ghost ? at : null;
  await db.user.updateMany({ where: { id: userId }, data: { locationGhostAt: next } });
  return { state: stateOf(next), change: ghost ? 'entered' : 'left' };
}

export type LocationGhostParams = {
  readonly db: LocationGhostDb;
  readonly relay: SharedLocationRelayDeps;
  readonly report: (error: unknown) => void;
};

const bestEffort = async (report: (error: unknown) => void, effect: () => Promise<void>): Promise<void> => {
  try {
    await effect();
  } catch (error) {
    report(error);
  }
};

/**
 * Règle le fantôme global et y fait suivre le partage temporaire. La SORTIE est fail-closed : le
 * partage est retenu jusqu'à sa position suivante AVANT que le compte quitte le fantôme ; si la
 * retenue lève, rien n'est écrit et l'appel lève — jamais une position prise en fantôme servie au
 * rattrapage. L'ENTRÉE écrit d'abord (le compte fait foi) puis coupe ; une coupure ratée est
 * journalisée et la position suivante relit le fantôme. La batterie se rejoue après l'écriture.
 */
export async function setLocationGhost(params: LocationGhostParams, userId: string, ghost: boolean): Promise<LocationGhostState> {
  const current = await ghostAtOf(params.db, userId);
  if ((current !== null) === ghost) return stateOf(current);
  if (!ghost) await reflectSharedLocationGhost(params.relay, userId, 'left');
  const written = await writeLocationGhost(params.db, userId, ghost, new Date(params.relay.now()));
  if (written.change === 'unchanged') return written.state;
  if (ghost) await bestEffort(params.report, () => reflectSharedLocationGhost(params.relay, userId, 'entered'));
  await bestEffort(params.report, () => replaySharedLocationBatteryOf(params.relay, userId));
  return written.state;
}
