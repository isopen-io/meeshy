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
import {
  closePendingJoinRequests,
  expireStaleJoinRequests,
  JOIN_REQUEST_COOLDOWN_MS,
  liveJoinRequestWhere
} from '../../services/community-join-request-lifecycle';

const logger = enhancedLogger.child({ module: 'CommunityAdmission' });

export { JOIN_REQUEST_COOLDOWN_MS };

const MEMBER_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  isOnline: true,
  // Lu pour la garde de présence de l'intendant (`gateCoMemberPresence`) ; jamais déclaré au schéma servi.
  deactivatedAt: true
} as const;

type Engagement = Pick<EngagementService, 'recordActivity'>;

export type Admission = {
  readonly communityId: string;
  readonly userId: string;
  readonly via: CommunityJoinVia;
  readonly joinCountry: string | null;
  /** Le créateur : il ne se paie pas l'engagement en revenant dans la sienne. */
  readonly createdBy: string;
  /** Qui fait entrer : l'intendant qui accepte ; la personne elle-même par défaut. */
  readonly decidedBy?: string;
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
  const { communityId, userId, via, joinCountry } = admission;
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

  await afterEntry(fastify, engagement, admission);

  return { member, admitted: true } as const;
}

/**
 * Ce qui SUIT l'écriture de l'appartenance (#19914) : succès « cercles »,
 * engagement, diffusion, clôture des demandes. L'entrée a eu lieu ; aucune
 * de ces suites ne peut plus la faire passer pour un échec — chacune est
 * gardée seule, et une panne y est journalisée, jamais remontée.
 */
async function afterEntry(fastify: FastifyInstance, engagement: Engagement, admission: Admission): Promise<void> {
  const { communityId, userId, via, createdBy } = admission;
  const failed = (effect: string) => (err: unknown) => logger.warn(`${effect} failed after entry`, { err });
  const settle = async (effect: string, run: () => unknown): Promise<void> => {
    try {
      await run();
    } catch (err) {
      failed(effect)(err);
    }
  };

  // Succès « cercles » (#5759) : best-effort et idempotent, non attendu.
  settle('cercles achievement', () =>
    new CerclesAchievements(fastify.prisma).recordEvent({ kind: 'community.join', userId, communityId })
  ).catch(failed('cercles achievement'));

  // `social.community_joined` (#8959) — une fois par communauté, non attendu.
  settle('engagement social.community_joined', () =>
    engagement.recordActivity(userId, 'social.community_joined', { targetId: communityId, targetOwnerId: createdBy })
  ).catch(failed('engagement social.community_joined'));

  await settle('member broadcast', () =>
    scheduleCommunityMemberBroadcastFrom(fastify, { kind: 'joined', communityId, userId, role: 'member', via })
  );

  // #19872 — une demande restée en attente (la communauté validait chaque entrée) se clôt.
  await settle('join request closure', () =>
    closePendingJoinRequests(fastify.prisma, { communityId, userIds: [userId], decidedBy: admission.decidedBy ?? userId })
  );
}

export type MembershipAfterFailure =
  | { readonly kind: 'entered'; readonly member: NonNullable<Awaited<ReturnType<typeof readActiveMember>>> }
  | { readonly kind: 'absent' }
  | { readonly kind: 'unknown' };

function readActiveMember(fastify: FastifyInstance, communityId: string, userId: string) {
  return fastify.prisma.communityMember.findFirst({
    where: { communityId, userId, isActive: true },
    include: { user: { select: MEMBER_USER_SELECT } }
  });
}

/**
 * Après une erreur d'`admitCommunityMember`, ce que la base dit VRAIMENT
 * (#19914) : la personne est entrée (écriture engagée malgré l'erreur), elle
 * n'est pas entrée, ou la relecture n'a rien prouvé. Seul `absent` autorise
 * à rouvrir une demande ; une ignorance ne rouvre rien.
 */
export async function membershipAfterFailure(
  fastify: FastifyInstance,
  communityId: string,
  userId: string
): Promise<MembershipAfterFailure> {
  try {
    const member = await readActiveMember(fastify, communityId, userId);
    return member ? { kind: 'entered', member } : { kind: 'absent' };
  } catch (err) {
    logger.warn('membership re-read failed after admission error', { err });
    return { kind: 'unknown' };
  }
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
  await expireStaleJoinRequests(fastify.prisma, { communityId, userId, now });
  const live = liveJoinRequestWhere(now);
  const pending = await fastify.prisma.communityJoinRequest.findFirst({
    where: { communityId, userId, ...live },
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
    where: { communityId, userId, ...live },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
    take: 1
  });
  const kept = pendings[0]?.id ?? created.id;
  if (kept !== created.id) {
    await fastify.prisma.communityJoinRequest.deleteMany({ where: { id: created.id, status: 'pending' } });
    return { kind: 'pending', requestId: kept };
  }
  // #19872 — une invitation a pu la faire entrer entre le contrôle « non-membre » et l'écriture :
  // la demande naît close, et personne n'est relancé.
  const enteredMeanwhile = await fastify.prisma.communityMember.findFirst({
    where: { communityId, userId, isActive: true },
    select: { id: true }
  });
  if (enteredMeanwhile) {
    await closePendingJoinRequests(fastify.prisma, { communityId, userIds: [userId], decidedBy: null, now });
    return { kind: 'pending', requestId: created.id };
  }
  scheduleCommunityJoinRequestedFrom(fastify, { communityId, requestId: created.id, userId });
  return { kind: 'pending', requestId: created.id };
}
