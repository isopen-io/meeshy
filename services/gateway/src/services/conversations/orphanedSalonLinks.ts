import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isMemberCreator } from '@meeshy/shared/types/role-types';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'OrphanedSalonLinks' });

/**
 * Ferme et MARQUE (`guestRevocationPendingAt`) tous les liens de partage des
 * salons nommés : la garde commune (`guestAccessEnd`) refuse chaque invité dès
 * cet instant, et la révocation différée (`runPendingGuestRevocation`) les fait
 * sortir. Un salon dont l'écriture lève n'est pas compté : rien n'est marqué,
 * la passe suivante le retrouvera. Ne rejette jamais.
 */
export async function closeOrphanedSalonLinks(
  prisma: PrismaClient,
  conversationIds: readonly string[],
  now: Date,
): Promise<readonly string[]> {
  const closed: string[] = [];
  for (const conversationId of conversationIds) {
    try {
      const links = await prisma.conversationShareLink.findMany({ where: { conversationId }, select: { id: true } });
      if (links.length === 0) continue;
      const ids = links.map((link) => link.id);
      await prisma.conversationShareLink.updateMany({
        where: { id: { in: ids } },
        data: { isActive: false, guestRevocationPendingAt: now },
      });
      closed.push(...ids);
    } catch (error) {
      logger.error('Orphaned community salon links could not be closed', { conversationId, error });
    }
  }
  return closed;
}

/**
 * La reprise ne regarde que les sorties postérieures à la règle qu'elle
 * rattrape (#16712, fusionnée le 2026-11-13) : un salon laissé sans créateur
 * AVANT elle (données héritées, anciens chemins de départ) n'a jamais promis
 * la fermeture de ses liens, et une révocation ne se défait pas.
 */
export const ORPHANED_SALON_SWEEP_SINCE = new Date('2026-11-13T00:00:00.000Z');

const CREATOR_ROLES = ['creator', 'CREATOR', 'Creator'];

type CreatorRow = { readonly conversationId: string; readonly role: string; readonly isActive: boolean; readonly userId: string | null; readonly leftAt?: Date | null };

/**
 * La REPRISE durable de #16712 (#18104). La sortie d'un créateur sans héritier
 * inscrit ferme les liens de son salon pendant la requête ; si cette écriture
 * lève, rien n'est marqué et le balayage des révocations différées ne voit rien.
 * Cette passe retrouve donc, à chaque balayage horaire, les salons :
 *
 * - dont un créateur est SORTI depuis `ORPHANED_SALON_SWEEP_SINCE` (une ligne
 *   `creator` inactive) et qu'aucun créateur INSCRIT actif ne gouverne ;
 * - VIVANTS, d'une communauté qui GARDE ses salons (privée, ou désactivée —
 *   `communityGuardsItsSalons`) ;
 * - qui ont encore un lien ACTIF créé AVANT cette sortie — un lien créé après
 *   n'est pas celui que la sortie devait fermer, et la passe ne rejoue pas la
 *   règle à chaque nouveau lien.
 *
 * La lecture part des sorties récentes (peu nombreuses), jamais de l'ensemble
 * des communautés. Ne rejette jamais : une lecture qui lève rend `[]`, et la
 * passe suivante reprend.
 */
export async function closeLinksOfOrphanedSalons(prisma: PrismaClient, now: Date): Promise<readonly string[]> {
  try {
    const orphans = await findOrphanedSalons(prisma);
    if (orphans.length === 0) return [];
    logger.warn('Orphaned community salons still had active share links, closing them', { salons: orphans.length });
    return await closeOrphanedSalonLinks(prisma, orphans, now);
  } catch (error) {
    logger.warn('Orphaned community salon sweep failed', { error });
    return [];
  }
}

async function findOrphanedSalons(prisma: PrismaClient): Promise<readonly string[]> {
  const departures: CreatorRow[] = await prisma.participant.findMany({
    where: { role: { in: CREATOR_ROLES }, isActive: false, leftAt: { gte: ORPHANED_SALON_SWEEP_SINCE } },
    select: { conversationId: true, role: true, isActive: true, userId: true, leftAt: true },
  });
  const departedAt = new Map<string, Date>();
  departures
    .filter((row) => isMemberCreator(row.role) && row.leftAt)
    .forEach((row) => {
      const known = departedAt.get(row.conversationId);
      if (!known || row.leftAt! > known) departedAt.set(row.conversationId, row.leftAt!);
    });
  if (departedAt.size === 0) return [];

  const salons = await prisma.conversation.findMany({
    where: { id: { in: [...departedAt.keys()] }, isActive: true, communityId: { not: null } },
    select: { id: true, communityId: true },
  });
  const communityIds = [...new Set(salons.map((salon) => salon.communityId).filter((id): id is string => !!id))];
  if (communityIds.length === 0) return [];

  const guarding = await prisma.community.findMany({
    where: { id: { in: communityIds }, OR: [{ isPrivate: true }, { isActive: false }] },
    select: { id: true },
  });
  const guardingIds = new Set(guarding.map((community) => community.id));
  const guardedSalons = salons.filter((salon) => salon.communityId && guardingIds.has(salon.communityId)).map((salon) => salon.id);
  if (guardedSalons.length === 0) return [];

  const governors: CreatorRow[] = await prisma.participant.findMany({
    where: { conversationId: { in: guardedSalons }, role: { in: CREATOR_ROLES }, isActive: true },
    select: { conversationId: true, role: true, isActive: true, userId: true },
  });
  const governed = new Set(governors.filter((row) => isMemberCreator(row.role) && row.userId).map((row) => row.conversationId));
  const ungoverned = guardedSalons.filter((id) => !governed.has(id));
  if (ungoverned.length === 0) return [];

  const links = await prisma.conversationShareLink.findMany({
    where: { conversationId: { in: ungoverned }, isActive: true },
    select: { conversationId: true, createdAt: true },
  });
  const stale = links.filter((link) => link.createdAt <= departedAt.get(link.conversationId)!);
  return [...new Set(stale.map((link) => link.conversationId))];
}
