/**
 * CE QUI MASQUE LA POSITION D'UN SANG, ET CE QUI NE LA MASQUE PLUS (#20361, directive porteur du
 * 2026-11-22) : le fantôme GLOBAL (`User.locationGhostAt`) et le fantôme CIBLÉ
 * (`RelationFeatureSetting.ghostAt`, sur la ligne de l'ÉMETTEUR) ne masquent plus rien à un Sang
 * pour qui l'émetteur a donné l'accord au palier, à la version courante (`bloodBundleAcceptedOf`) :
 * entre Sangs, on ne se cache plus, on redescend. Avant cet accord, le fantôme reste appliqué
 * (décision par défaut B, #20367 : un refus déjà donné n'est pas lu comme un accord).
 *
 * Le site UNIQUE de ces lectures pour la position continue, la carte, l'historique, le signal et la
 * proximité. La position TEMPORAIRE (Amis) garde son propre fantôme (`sharedLocationRelay`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { bloodBundleAcceptedOf } from '../relations/relationConsent';

type VeilDb = Pick<PrismaClient, 'relationFeatureSetting' | 'user'>;

const BUNDLE_SELECT = { bloodBundleAcceptedAt: true, bloodBundleVersion: true } as const;

export async function inGlobalGhost(prisma: Pick<PrismaClient, 'user'>, ownerId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: ownerId }, select: { locationGhostAt: true } });
  return row?.locationGhostAt != null;
}

/** Les émetteurs parmi `ownerIds` qui masquent aujourd'hui leur position à `viewerId`. */
export async function ownersHidingFrom(prisma: VeilDb, viewerId: string, ownerIds: readonly string[]): Promise<ReadonlySet<string>> {
  if (ownerIds.length === 0) return new Set();
  const [global, rows] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...ownerIds] }, locationGhostAt: { not: null } }, select: { id: true } }),
    prisma.relationFeatureSetting.findMany({ where: { ownerId: { in: [...ownerIds] }, otherId: viewerId }, select: { ownerId: true, ghostAt: true, ...BUNDLE_SELECT } }),
  ]);
  const accepted = new Set(rows.filter(bloodBundleAcceptedOf).map((row) => row.ownerId));
  const targeted = rows.filter((row) => row.ghostAt != null).map((row) => row.ownerId);
  return new Set([...global.map((row) => row.id), ...targeted].filter((id) => !accepted.has(id)));
}

/**
 * Le voile du point que `ownerId` enregistre : ses fantômes ciblés (`hidden`) et, en fantôme
 * GLOBAL, une liste d'AUTORISATION (`onlyTo`) — les seuls Sangs pour qui il a donné l'accord au
 * palier. Jamais une liste d'exclusion tirée d'un instantané des lecteurs : un lecteur absent de
 * l'instantané (tronqué, hors drapeau, devenu Sang après coup) serait servi (fail-open).
 * `everyone` : en fantôme global, personne n'est autorisé (rien ne doit être rangé).
 */
export type PointVeil = {
  readonly hidden: ReadonlySet<string>;
  readonly onlyTo: ReadonlySet<string> | null;
  readonly everyone: boolean;
};

export const veilAllows = (veil: PointVeil, readerId: string): boolean =>
  !veil.hidden.has(readerId) && (veil.onlyTo === null || veil.onlyTo.has(readerId));

export async function pointVeilOf(prisma: VeilDb, ownerId: string): Promise<PointVeil> {
  const [global, rows] = await Promise.all([
    inGlobalGhost(prisma, ownerId),
    prisma.relationFeatureSetting.findMany({ where: { ownerId, OR: [{ ghostAt: { not: null } }, { bloodBundleAcceptedAt: { not: null } }] }, select: { otherId: true, ghostAt: true, ...BUNDLE_SELECT } }),
  ]);
  const accepted = new Set(rows.filter(bloodBundleAcceptedOf).map((row) => row.otherId));
  const targeted = rows.filter((row) => row.ghostAt != null && !accepted.has(row.otherId)).map((row) => row.otherId);
  if (!global) return { hidden: new Set(targeted), onlyTo: null, everyone: false };
  return { hidden: new Set(targeted), onlyTo: accepted, everyone: accepted.size === 0 };
}
