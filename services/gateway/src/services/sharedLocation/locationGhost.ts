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
import { isDeclaredMinor, minorProtectedBetween } from '@meeshy/shared/utils/age';
import {
  reflectSharedLocationGhost,
  replaySharedLocationBatteryOf,
  type LocationGhostChange,
  type SharedLocationRelayDeps,
} from './sharedLocationRelay';

export type LocationGhostDb = Pick<PrismaClient, 'user'> & Partial<Pick<PrismaClient, 'relationFeatureSetting'>>;

export type LocationGhostWrite = { readonly state: LocationGhostState; readonly change: LocationGhostChange };

const stateOf = (ghostAt: Date | null): LocationGhostState => ({ ghost: ghostAt !== null, ghostAt: ghostAt?.toISOString() ?? null });

const ghostAtOf = async (db: LocationGhostDb, userId: string): Promise<Date | null> =>
  (await db.user.findUnique({ where: { id: userId }, select: { locationGhostAt: true } }))?.locationGhostAt ?? null;

/**
 * Un mineur déclaré qui se met en fantôme global efface ses accords au palier envers les Sangs face
 * auxquels sa protection s'applique (deux âges connus, écart de plus de 5 ans, C7, #20361) : sans cela,
 * son fantôme se lèverait tout seul envers eux le jour de sa majorité. Entre pairs, la loi du Sang est entière.
 */
async function minorGhostRevokesBundles(db: LocationGhostDb, userId: string): Promise<void> {
  if (!db.relationFeatureSetting) return;
  const now = new Date();
  const user = await db.user.findUnique({ where: { id: userId }, select: { birthDate: true } });
  if (!isDeclaredMinor(user?.birthDate ?? null, now)) return;
  const rows = await db.relationFeatureSetting.findMany({ where: { ownerId: userId, bloodBundleAcceptedAt: { not: null } }, select: { otherId: true } });
  if (rows.length === 0) return;
  const people = await db.user.findMany({ where: { id: { in: rows.map((row) => row.otherId) } }, select: { id: true, birthDate: true } });
  const protectedIds = people.filter((other) => minorProtectedBetween({ emitterBirthDate: user?.birthDate, otherBirthDate: other.birthDate, now })).map((other) => other.id);
  if (protectedIds.length === 0) return;
  await db.relationFeatureSetting.updateMany({ where: { ownerId: userId, otherId: { in: protectedIds } }, data: { bloodBundleAcceptedAt: null, bloodBundleVersion: null } });
}

export async function writeLocationGhost(db: LocationGhostDb, userId: string, ghost: boolean, at: Date): Promise<LocationGhostWrite> {
  const current = await ghostAtOf(db, userId);
  if ((current !== null) === ghost) return { state: stateOf(current), change: 'unchanged' };
  const next = ghost ? at : null;
  await db.user.updateMany({ where: { id: userId }, data: { locationGhostAt: next } });
  if (ghost) await minorGhostRevokesBundles(db, userId);
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
