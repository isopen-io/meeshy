/**
 * QUI PEUT LIRE LES CLÉS PUBLIQUES D'UN UTILISATEUR — site unique, pour
 * `/signal/keys/:userId` (clients publiés) et `/e2ee/keys/:userId` (#3706).
 *
 * Soi-même (ses autres appareils), quelqu'un qui partage une conversation
 * active avec lui, ou un ami accepté. Tout autre demandeur raclerait l'annuaire
 * et épuiserait les pré-clés uniques.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { amitieAcceptee } from '../friendship';

type KeyAccessPrisma = Pick<PrismaClient, 'participant' | 'friendRequest'>;

export async function mayReadKeysOf(prisma: KeyAccessPrisma, requesterUserId: string, targetUserId: string): Promise<boolean> {
  if (requesterUserId === targetUserId) return true;
  const memberships = await prisma.participant.findMany({
    where: { userId: requesterUserId, isActive: true },
    select: { conversationId: true },
  });
  const conversationIds = memberships.map((membership) => membership.conversationId);
  const shared = conversationIds.length > 0
    ? await prisma.participant.findFirst({
        where: { userId: targetUserId, conversationId: { in: conversationIds }, isActive: true },
        select: { id: true },
      })
    : null;
  if (shared) return true;
  return amitieAcceptee(prisma, requesterUserId, targetUserId);
}
