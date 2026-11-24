/**
 * NE PLUS RECEVOIR LA POSITION CONTINUE D'UN SANG (#19454) — REMPLACÉ entre Sangs qui ont donné
 * l'accord au palier (#20361, directive porteur du 2026-11-22) : la coupure du lecteur ne vaut plus
 * dès que SA ligne porte l'accord à la version courante ; avant, elle reste appliquée (décision B,
 * #20367), et aucune nouvelle coupure ne s'écrit entre Sangs (409). Le site UNIQUE qui dit quels émetteurs
 * un lecteur a coupés (`RelationFeatureSetting.bloodLocationMutedAt`, sur la ligne du LECTEUR).
 * Préférence de réception, jamais un retrait du consentement de l'émetteur : la proximité, la carte
 * (`include=blood`) et tout signal de position continue la lisent ici, et rien n'en part vers l'émetteur.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { bloodBundleAcceptedOf } from '../relations/relationConsent';

type MuteDb = Pick<PrismaClient, 'relationFeatureSetting'>;

export async function bloodLocationMutedBy(prisma: MuteDb, readerId: string, ownerIds: readonly string[]): Promise<ReadonlySet<string>> {
  if (ownerIds.length === 0) return new Set();
  const rows = await prisma.relationFeatureSetting.findMany({
    where: { ownerId: readerId, otherId: { in: [...ownerIds] }, bloodLocationMutedAt: { not: null } },
    select: { otherId: true, bloodBundleAcceptedAt: true, bloodBundleVersion: true },
  });
  return new Set(rows.filter((row) => !bloodBundleAcceptedOf(row)).map((row) => row.otherId));
}

/** Les lecteurs, parmi `readerIds`, qui ont coupé la position continue de `ownerId`. */
export async function bloodLocationMutedFor(prisma: MuteDb, ownerId: string, readerIds: readonly string[]): Promise<ReadonlySet<string>> {
  if (readerIds.length === 0) return new Set();
  const rows = await prisma.relationFeatureSetting.findMany({
    where: { ownerId: { in: [...readerIds] }, otherId: ownerId, bloodLocationMutedAt: { not: null } },
    select: { ownerId: true, bloodBundleAcceptedAt: true, bloodBundleVersion: true },
  });
  return new Set(rows.filter((row) => !bloodBundleAcceptedOf(row)).map((row) => row.ownerId));
}
