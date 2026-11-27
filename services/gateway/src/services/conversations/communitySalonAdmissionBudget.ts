import type { FastifyInstance } from 'fastify';
import {
  refundCommunityAdditionByActor,
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
 * l'acteur est déjà refusé. Refusé par une cible, le geste ne coûte à l'acteur
 * qu'une unité, comme tout geste refusé.
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
  return spendCommunityEntrants(fastify, actorId, invited);
}

/**
 * Le prix de `invited` personnes qu'un même geste fait entrer sans leur accord :
 * l'acteur paie leur nombre, puis chacune débite son seau ; refusé par une
 * cible, le geste ne coûte à l'acteur qu'une unité. Partagé par la création
 * d'un salon, son rattachement (#20464) et la bascule en privée (#20694).
 */
export async function spendCommunityEntrants(
  fastify: FastifyInstance,
  actorId: string,
  invited: readonly string[]
): Promise<CommunityAdditionVerdict> {
  if (invited.length === 0) return ALLOWED;
  const byActor = await spendCommunityAdditionByActor(fastify, actorId, invited.length);
  if (!byActor.allowed) return byActor;
  const ofTargets = await spendCommunityAdditionOfTargets(fastify, invited, actorId);
  if (!ofTargets.allowed) await refundCommunityAdditionByActor(fastify, actorId, invited.length - 1);
  return ofTargets;
}
