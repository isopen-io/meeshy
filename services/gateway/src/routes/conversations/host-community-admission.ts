import type { FastifyInstance, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  invitedEntrants,
  planCommunityAdmission,
  type CommunityAdmission,
} from '../../services/conversations/communityMembershipSync';
import {
  refuseCommunityAddition,
  spendCommunityAdditionBatch,
  spendCommunityAdditionByActor,
} from '../../utils/community-addition-budget';
import { sendForbidden, sendNotFound } from '../../utils/response';

type AdmittedPlan = Extract<CommunityAdmission, { kind: 'admitted' }>;

export type HostCommunityGate =
  | { readonly kind: 'proceed'; readonly admission: AdmittedPlan | null }
  | { readonly kind: 'replied' };

export type HostCommunityRequest = {
  readonly communityId: string;
  readonly actorId: string;
  readonly createdBy: string;
  readonly isPrivate: boolean;
  readonly actorRole: string | null;
  readonly participantIds: readonly string[];
};

/**
 * Créer un salon dans une communauté y fait ENTRER ses participants (#16639) :
 * c'est une INVITATION, décidée AVANT la création sous la loi de
 * `POST /communities/:id/invite`, pour refuser sans rien écrire.
 *
 * #20464 — elle débite aussi le budget des ajouts sans accord (`…/invite` et
 * `…/members`) : une unité par personne qui ENTRE à l'acteur, une à chacune,
 * tout ou rien. Sonder un compte non ajoutable coûte une unité, comme sur
 * `…/invite` : la porte n'est pas un sondage gratuit. Un refus est déjà
 * envoyé quand cette fonction rend `replied`.
 */
export async function gateHostCommunityAdmission(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  reply: FastifyReply,
  request: HostCommunityRequest,
): Promise<HostCommunityGate> {
  const admission = await planCommunityAdmission(prisma, request);
  if (admission.kind === 'refused') {
    if (admission.reason === 'invite-forbidden') {
      sendForbidden(reply, 'Only admins and moderators can add people to a private community', { code: 'COMMUNITY_INVITE_FORBIDDEN' });
      return { kind: 'replied' };
    }
    const probe = await spendCommunityAdditionByActor(fastify, request.actorId);
    if (probe.allowed) sendNotFound(reply, 'User to invite not found');
    else refuseCommunityAddition(reply, probe.retryAfter);
    return { kind: 'replied' };
  }
  const budget = await spendCommunityAdditionBatch(fastify, {
    actorId: request.actorId,
    communityId: request.communityId,
    targetIds: invitedEntrants(admission),
  });
  if (!budget.allowed) {
    refuseCommunityAddition(reply, budget.retryAfter);
    return { kind: 'replied' };
  }
  return { kind: 'proceed', admission };
}
