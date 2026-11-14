import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isMemberCreator } from '@meeshy/shared/types/role-types';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'OrphanedSalonLinks' });

const CREATOR_ROLES = ['creator', 'CREATOR'];

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

type CreatorRow = { readonly conversationId: string; readonly role: string; readonly isActive: boolean; readonly userId: string | null };

/**
 * La REPRISE durable de #16712 (#18104). La sortie d'un créateur sans héritier
 * inscrit ferme les liens de son salon pendant la requête ; si cette écriture
 * lève, rien n'est marqué et le balayage des révocations différées ne voit rien.
 * Cette passe retrouve donc, à chaque balayage horaire, les salons :
 *
 * - VIVANTS, d'une communauté qui GARDE ses salons (privée, ou désactivée —
 *   `communityGuardsItsSalons`) ;
 * - qui ont encore un lien ACTIF ;
 * - dont un créateur est SORTI (une ligne `creator` inactive) et qu'aucun
 *   créateur INSCRIT actif ne gouverne.
 *
 * La preuve de sortie est exigée à dessein : un salon qui n'a JAMAIS eu de ligne
 * `creator` (données héritées) n'est pas « resté sans créateur » au sens de
 * #16712, et une révocation ne se défait pas. Il reste à mesurer en staging.
 *
 * Ne rejette jamais : une lecture qui lève rend `[]`, et la passe suivante reprend.
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
  const communities = await prisma.community.findMany({
    where: { OR: [{ isPrivate: true }, { isActive: false }] },
    select: { id: true },
  });
  if (communities.length === 0) return [];

  const salons = await prisma.conversation.findMany({
    where: { communityId: { in: communities.map((community) => community.id) }, isActive: true },
    select: { id: true },
  });
  if (salons.length === 0) return [];

  const linked = await prisma.conversationShareLink.findMany({
    where: { conversationId: { in: salons.map((salon) => salon.id) }, isActive: true },
    select: { conversationId: true },
  });
  const candidates = [...new Set(linked.map((link) => link.conversationId))];
  if (candidates.length === 0) return [];

  const creators: CreatorRow[] = await prisma.participant.findMany({
    where: { conversationId: { in: candidates }, role: { in: CREATOR_ROLES } },
    select: { conversationId: true, role: true, isActive: true, userId: true },
  });
  const rows = creators.filter((row) => isMemberCreator(row.role));
  const governed = new Set(rows.filter((row) => row.isActive && row.userId).map((row) => row.conversationId));
  const departed = new Set(rows.filter((row) => !row.isActive).map((row) => row.conversationId));
  return candidates.filter((id) => departed.has(id) && !governed.has(id));
}
