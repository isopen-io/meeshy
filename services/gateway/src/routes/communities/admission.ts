/**
 * L'ENTRÉE dans une communauté, en un seul chemin (#19429) : l'adhésion
 * directe (`POST /communities/:id/join`) et l'acceptation d'une demande
 * (`POST /communities/:id/join-requests/:requestId/accept`) font entrer la
 * même personne de la même façon — ligne réactivée ou créée, succès
 * « cercles », engagement, diffusion. Deux chemins écrits deux fois avaient
 * divergé : l'acceptation n'enregistrait ni succès ni engagement.
 *
 * Et la DEMANDE d'entrée d'une communauté qui valide chaque arrivée :
 * une seule en attente par personne (deux envois simultanés convergent sur la
 * plus ancienne), aucune nouvelle demande pendant `JOIN_REQUEST_COOLDOWN_MS`
 * après un refus — les intendants ne se relancent pas à volonté.
 */
import type { FastifyInstance } from 'fastify';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { CommunityRole } from './types';
import { scheduleCommunityMemberBroadcastFrom } from '../../services/community-member-broadcast';
import { scheduleCommunityJoinRequestedFrom } from '../../services/community-join-request-broadcast';
import { CerclesAchievements } from '../../services/achievements/CerclesAchievements';
import type { EngagementService } from '../../services/engagement/EngagementService';
import type { CommunityJoinVia } from '../../services/community-entries';

const logger = enhancedLogger.child({ module: 'CommunityAdmission' });

/** Sept jours après un refus avant qu'une nouvelle demande ne parte. */
export const JOIN_REQUEST_COOLDOWN_MS = 7 * 24 * 3_600_000;

const MEMBER_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  isOnline: true
} as const;

type Engagement = Pick<EngagementService, 'recordActivity'>;

export type Admission = {
  readonly communityId: string;
  readonly userId: string;
  readonly via: CommunityJoinVia;
  readonly joinCountry: string | null;
  /** Le créateur : il ne se paie pas l'engagement en revenant dans la sienne. */
  readonly createdBy: string;
};

/**
 * Fait entrer `userId`. Une ligne ACTIVE n'est pas réécrite (rendue telle
 * quelle, `admitted: false`) ; une ligne laissée par un départ se RÉACTIVE
 * (#5760) — créer en sa présence ferait une seconde ligne pour la paire —, et
 * le rôle repart de MEMBER et `joinedAt` prend la date de CE retour (les
 * statistiques d'entrée, #19429, se lisent dessus).
 */
export async function admitCommunityMember(
  fastify: FastifyInstance,
  engagement: Engagement,
  admission: Admission
) {
  const { communityId, userId, via, joinCountry, createdBy } = admission;
  const existing = await fastify.prisma.communityMember.findFirst({
    where: { communityId, userId },
    include: { user: { select: MEMBER_USER_SELECT } }
  });
  if (existing?.isActive) return { member: existing, admitted: false } as const;

  const entry = { role: CommunityRole.MEMBER as string, joinedVia: via, joinCountry };
  const member = existing
    ? await fastify.prisma.communityMember.update({
        where: { id: existing.id },
        data: { ...entry, isActive: true, leftAt: null, joinedAt: new Date() },
        include: { user: { select: MEMBER_USER_SELECT } }
      })
    : await fastify.prisma.communityMember.create({
        data: { communityId, userId, ...entry },
        include: { user: { select: MEMBER_USER_SELECT } }
      });

  // Succès « cercles » (#5759) APRÈS l'écriture : best-effort et idempotent.
  void new CerclesAchievements(fastify.prisma)
    .recordEvent({ kind: 'community.join', userId, communityId })
    .catch(() => undefined);

  // `social.community_joined` (#8959) — une fois par communauté.
  engagement
    .recordActivity(userId, 'social.community_joined', { targetId: communityId, targetOwnerId: createdBy })
    .catch((err: unknown) => logger.warn('engagement social.community_joined failed', { err }));

  scheduleCommunityMemberBroadcastFrom(fastify, { kind: 'joined', communityId, userId, role: 'member', via });

  return { member, admitted: true } as const;
}

export type EntryRequestOutcome =
  | { readonly kind: 'pending'; readonly requestId: string }
  | { readonly kind: 'cooldown' };

/**
 * Pose (ou retrouve) la demande d'entrée de `userId`. Les intendants ne sont
 * prévenus que de la demande qui RESTE : une demande déjà en attente, ou la
 * perdante d'une course, ne relance personne.
 */
export async function requestCommunityEntry(
  fastify: FastifyInstance,
  request: { readonly communityId: string; readonly userId: string; readonly via: CommunityJoinVia; readonly country: string | null },
  now: Date = new Date()
): Promise<EntryRequestOutcome> {
  const { communityId, userId, via, country } = request;
  const pending = await fastify.prisma.communityJoinRequest.findFirst({
    where: { communityId, userId, status: 'pending' },
    select: { id: true }
  });
  if (pending) return { kind: 'pending', requestId: pending.id };

  const recentRefusal = await fastify.prisma.communityJoinRequest.findFirst({
    where: { communityId, userId, status: 'rejected', decidedAt: { gte: new Date(now.getTime() - JOIN_REQUEST_COOLDOWN_MS) } },
    select: { id: true }
  });
  if (recentRefusal) return { kind: 'cooldown' };

  const created = await fastify.prisma.communityJoinRequest.create({
    data: { communityId, userId, status: 'pending', via, country },
    select: { id: true }
  });
  // Deux envois simultanés ont pu créer chacun la leur : la plus ancienne reste.
  const pendings = await fastify.prisma.communityJoinRequest.findMany({
    where: { communityId, userId, status: 'pending' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true }
  });
  const kept = pendings[0]?.id ?? created.id;
  if (kept !== created.id) {
    await fastify.prisma.communityJoinRequest.deleteMany({ where: { id: created.id, status: 'pending' } });
    return { kind: 'pending', requestId: kept };
  }
  scheduleCommunityJoinRequestedFrom(fastify, { communityId, requestId: created.id, userId });
  return { kind: 'pending', requestId: created.id };
}
