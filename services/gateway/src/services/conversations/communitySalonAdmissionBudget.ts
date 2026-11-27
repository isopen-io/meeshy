import type { FastifyInstance } from 'fastify';
import {
  spendCommunityAdditionByActor,
  spendCommunityAdditionOfTargets,
  type CommunityAdditionVerdict,
} from '../../utils/community-addition-budget';
import type { CommunityAdmission } from './communityMembershipSync';

const ALLOWED: CommunityAdditionVerdict = { allowed: true, retryAfter: 0 };

/**
 * Le budget des ajouts sans accord (#19812) appliqué à la création d'un salon
 * dans une communauté (#20464). Un plan refusé pour autorisation n'arrive pas
 * ici (le refus d'accès passe AVANT le budget) ; un plan refusé pour un compte
 * non ajoutable paie ses tentatives sur le seau de l'acteur ; un plan admis paie
 * ses entrants INVITÉS — jamais l'appelant qui revient, jamais un membre déjà
 * actif — puis débite le seau de chacun, sans entamer celui des cibles quand
 * l'acteur est déjà refusé.
 */
export async function spendCommunitySalonAdmission(
  fastify: FastifyInstance,
  actorId: string,
  admission: CommunityAdmission
): Promise<CommunityAdditionVerdict> {
  if (admission.kind === 'refused') {
    if (admission.reason !== 'not-addable' || admission.attempted === 0) return ALLOWED;
    return spendCommunityAdditionByActor(fastify, actorId, admission.attempted);
  }
  const invited = [...admission.creations, ...admission.reactivations]
    .filter((entrant) => entrant.via === 'invited')
    .map((entrant) => entrant.userId);
  if (invited.length === 0) return ALLOWED;
  const byActor = await spendCommunityAdditionByActor(fastify, actorId, invited.length);
  if (!byActor.allowed) return byActor;
  return spendCommunityAdditionOfTargets(fastify, invited, actorId);
}
