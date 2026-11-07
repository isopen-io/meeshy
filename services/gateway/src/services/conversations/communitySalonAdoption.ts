import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { applyCommunityAdmission } from './communityMembershipSync';
import { exitCommunitySalons, type SalonExitDeps } from './communitySalonExit';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'CommunitySalonAdoption' });

export type SalonAdoptionPrisma = Pick<PrismaClient, 'conversation' | 'participant' | 'communityMember' | 'user'>;

export type SalonAdoptionRequest = {
  readonly communityId: string;
  readonly createdBy: string;
};

/**
 * Une bascule qui ferme les salons : une communauté PUBLIQUE qui devient
 * privée. Déjà privée, ses portes tenaient la loi (#16695) ; redevenue
 * publique, ses salons s'ouvrent et personne n'a à entrer ni à sortir.
 */
export function isBecomingPrivate(change: { readonly before: boolean; readonly requested: boolean | undefined }): boolean {
  return change.before === false && change.requested === true;
}

/**
 * QUI ENTRE DANS LA COMMUNAUTÉ quand elle devient privée (#16723).
 *
 * Les salons d'une communauté privée sont réservés à ses membres (#16695).
 * La bascule ferme la porte aux nouveaux venus ; elle ne retire pas en silence
 * une conversation à qui y était déjà. Chaque occupant INSCRIT et actif d'un
 * salon (clos compris : une archive se lit par sa seule ligne `Participant`)
 * qui n'est pas membre actif y entre donc, sous l'autorité du créateur — la
 * loi de `planCommunityAdmission` : compte vivant, aucun blocage avec le
 * créateur dans un sens ou dans l'autre, ligne d'un ancien membre réactivée
 * en MEMBER. Le créateur n'est jamais réinscrit : il revient dans ses salons
 * sans ligne (#16703).
 *
 * Écrit AVANT la bascule : une panne laisse la communauté publique, intacte,
 * et la requête rejouable. Rend ceux qui ne peuvent pas entrer, pour qu'ils
 * SORTENT des salons une fois la bascule écrite (`exitSalonOutsiders`).
 * Les invités sans compte et les bots ne sont pas des membres possibles : ils
 * ne sont ni lus ni touchés.
 */
export async function admitSalonOccupants(
  prisma: SalonAdoptionPrisma,
  request: SalonAdoptionRequest,
): Promise<readonly string[]> {
  const salons = await prisma.conversation.findMany({
    where: { communityId: request.communityId },
    select: { id: true },
  });
  if (salons.length === 0) return [];

  const occupations = await prisma.participant.findMany({
    where: { conversationId: { in: salons.map((salon) => salon.id) }, isActive: true, type: 'user' },
    select: { userId: true },
  });
  const occupants = [...new Set(occupations.flatMap((o) => (o.userId ? [o.userId] : [])))]
    .filter((userId) => userId !== request.createdBy);
  if (occupants.length === 0) return [];

  const rows = await prisma.communityMember.findMany({
    where: { communityId: request.communityId, userId: { in: occupants } },
    select: { id: true, userId: true, isActive: true },
  });
  const rowOf = new Map(
    [...rows].sort((a, b) => Number(a.isActive) - Number(b.isActive)).map((row) => [row.userId, row]),
  );
  const entering = occupants.filter((userId) => rowOf.get(userId)?.isActive !== true);
  if (entering.length === 0) return [];

  const addable = await addableUnderCreator(prisma, request.createdBy, entering);
  const admitted = entering.filter((userId) => addable.has(userId));
  await applyCommunityAdmission(prisma, request.communityId, {
    kind: 'admitted',
    reactivations: admitted.flatMap((userId) => {
      const row = rowOf.get(userId);
      return row ? [{ id: row.id, role: 'member' as const }] : [];
    }),
    creations: admitted.filter((userId) => !rowOf.has(userId)).map((userId) => ({ userId, role: 'member' as const })),
  });
  return entering.filter((userId) => !addable.has(userId));
}

/**
 * La loi d'`isAddableUser` PAR PERSONNE (là où `planCommunityAdmission` la
 * rend pour tout un lot) : un refus n'arrête pas la bascule, il fait sortir
 * celui qu'il vise. Trois lectures pour tout le lot.
 */
async function addableUnderCreator(
  prisma: SalonAdoptionPrisma,
  createdBy: string,
  userIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const ids = [...userIds];
  const living = await prisma.user.findMany({
    where: { id: { in: ids }, isActive: true, deactivatedAt: null, deletedAt: null },
    select: { id: true },
    take: ids.length,
  });
  const creator = await prisma.user.findUnique({ where: { id: createdBy }, select: { blockedUserIds: true } });
  const blockedByCreator = new Set(creator?.blockedUserIds ?? []);
  const blockingCreator = await prisma.user.findMany({
    where: { id: { in: ids }, blockedUserIds: { has: createdBy } },
    select: { id: true },
    take: ids.length,
  });
  const blocking = new Set(blockingCreator.map((user) => user.id));
  return new Set(
    living.map((user) => user.id).filter((id) => !blockedByCreator.has(id) && !blocking.has(id)),
  );
}

/**
 * Ceux qui n'ont pas pu entrer sortent de chaque salon, par la loi de #16704.
 * Contrat : NE REJETTE JAMAIS — la bascule est déjà écrite, et un 500 nierait
 * un fait durable.
 */
export async function exitSalonOutsiders(
  deps: SalonExitDeps,
  request: { readonly communityId: string; readonly userIds: readonly string[]; readonly now: Date },
): Promise<void> {
  for (const userId of request.userIds) {
    try {
      await exitCommunitySalons(deps, { communityId: request.communityId, userId, now: request.now });
    } catch (error) {
      logger.error('Salon outsider exit failed', { communityId: request.communityId, error });
    }
  }
}
