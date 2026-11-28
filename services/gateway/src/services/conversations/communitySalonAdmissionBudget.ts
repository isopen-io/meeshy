import type { FastifyInstance } from 'fastify';
import {
  refundCommunityAdditionByActor,
  spendCommunityAdditionByActor,
  spendCommunityAdditionOfTargetsUndoable,
  type CommunityAdditionVerdict,
  type UndoableCommunityAddition,
} from '../../utils/community-addition-budget';
import type { CommunityAdmission } from './communityMembershipSync';

const ALLOWED: CommunityAdditionVerdict = { allowed: true, retryAfter: 0 };
const NOTHING_TO_GIVE_BACK = async (): Promise<void> => undefined;
const settled = (verdict: CommunityAdditionVerdict): UndoableCommunityAddition => ({ verdict, rendre: NOTHING_TO_GIVE_BACK });

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
  return (await spendCommunitySalonAdmissionUndoable(fastify, actorId, admission)).verdict;
}

/**
 * `spendCommunitySalonAdmission`, dont le débit accepté se REND quand
 * l'écriture n'a pas lieu (#20740). Une tentative vers un compte non ajoutable
 * ne se rend jamais : c'est elle que le seau de l'acteur doit compter, sans
 * quoi la porte redeviendrait un sondage gratuit des comptes ajoutables.
 */
export async function spendCommunitySalonAdmissionUndoable(
  fastify: FastifyInstance,
  actorId: string,
  admission: CommunityAdmission
): Promise<UndoableCommunityAddition> {
  if (admission.kind === 'refused') {
    if (admission.reason !== 'not-addable' || admission.attempted === 0) return settled(ALLOWED);
    return settled(await spendCommunityAdditionByActor(fastify, actorId, admission.attempted));
  }
  const invited = [...admission.creations, ...admission.reactivations]
    .filter((entrant) => entrant.via === 'invited')
    .map((entrant) => entrant.userId);
  return spendCommunityEntrantsUndoable(fastify, actorId, invited);
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
  return (await spendCommunityEntrantsUndoable(fastify, actorId, invited)).verdict;
}

async function spendCommunityEntrantsUndoable(
  fastify: FastifyInstance,
  actorId: string,
  invited: readonly string[]
): Promise<UndoableCommunityAddition> {
  if (invited.length === 0) return settled(ALLOWED);
  const byActor = await spendCommunityAdditionByActor(fastify, actorId, invited.length);
  if (!byActor.allowed) return settled(byActor);
  const ofTargets = await spendCommunityAdditionOfTargetsUndoable(fastify, invited, actorId);
  if (!ofTargets.verdict.allowed) {
    await refundCommunityAdditionByActor(fastify, actorId, invited.length - 1);
    return settled(ofTargets.verdict);
  }
  return {
    verdict: ofTargets.verdict,
    rendre: async () => {
      await Promise.all([ofTargets.rendre(), refundCommunityAdditionByActor(fastify, actorId, invited.length)]);
    },
  };
}

/**
 * Le budget d'admission d'un salon, lié à UN serveur — ce que reçoit
 * `admitConversationMember` (`CommunityAdmissionBudget`).
 */
export type BoundCommunityAdmissionBudget = (actorId: string, admission: CommunityAdmission) => Promise<UndoableCommunityAddition>;

export function communityAdmissionBudgetOf(fastify: FastifyInstance): BoundCommunityAdmissionBudget {
  return (actorId, admission) => spendCommunitySalonAdmissionUndoable(fastify, actorId, admission);
}

let budgetHost: FastifyInstance | null = null;

/**
 * Le serveur dont les seaux paient les entrées qui n'arrivent PAS par une route
 * Fastify — l'invitation dans un appel (#20740), servie par le transport
 * socket. Posé une fois au montage de Socket.IO (`MeeshySocketIOHandler`) :
 * c'est le MÊME serveur que les routes, donc les MÊMES seaux (même clé
 * mémoire, même Redis), et passer de l'appel à la route ne rouvre aucun quota.
 */
export function setCommunityAdmissionBudgetHost(fastify: FastifyInstance | null): void {
  budgetHost = fastify;
}

/** `null` tant qu'aucun serveur n'est posé — un transport monté sans Fastify (tests). */
export function hostedCommunityAdmissionBudget(): BoundCommunityAdmissionBudget | null {
  const host = budgetHost;
  return host ? communityAdmissionBudgetOf(host) : null;
}

/**
 * L'écriture qu'un débit a payée : si elle lève, rien n'est entré, et le débit
 * se REND avant que l'erreur remonte (#20740). Un rendu qui échoue à son tour
 * n'efface pas l'erreur d'origine.
 */
export async function givenBackOnFailure<T>(spend: UndoableCommunityAddition | null, write: PromiseLike<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    await spend?.rendre().catch(() => undefined);
    throw error;
  }
}
