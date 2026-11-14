/**
 * LA PORTE D'UNE DEMANDE DE CRAN (#13933) : charge ce que la loi partagée
 * (`evaluateRelationRequest`) juge — le niveau effectif, la série, le cool-down de
 * l'ÉMETTEUR — et rend son verdict. Le gateway ne réécrit pas la loi : il lui
 * apporte les faits.
 *
 * Trois sites passent par ici : l'ENVOI (cran suivant, cool-down, éligibilité),
 * l'ACCEPTATION (le lien a pu tomber, la série se briser entre la demande et la
 * réponse — le cool-down de l'émetteur n'est alors plus l'affaire de celui qui
 * répond) et le RITUEL du Sang (même cran, même éligibilité).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { relationLevelIfAtLeast, relationPairKey, relationRungAfter, type RelationLevel, type RelationRequestLevel } from '@meeshy/shared/types/relation';
import { relationThresholdsFor } from '@meeshy/shared/utils/relation-levels';
import { evaluateRelationRequest, type RelationRequestRefusalCode } from '@meeshy/shared/utils/relation-request';
import { niveauEffectif } from '../friendship';
import { cooldownUntilOf, type UserRelationRow } from './userRelationWriter';
import { loadRelationProgress } from './relationProgress';

export type RelationRequestGateDb = Pick<PrismaClient, 'friendRequest' | 'userRelation' | 'pairInteractionDay'>;

export type RelationRequestJudgement =
  | { readonly allowed: true; readonly currentLevel: RelationLevel; readonly alreadyReached: boolean }
  | { readonly allowed: false; readonly code: RelationRequestRefusalCode; readonly currentLevel: RelationLevel };

const COOLDOWN_SELECT = { id: true, userLowId: true, userHighId: true, levelSince: true, cooldownLowUntil: true, cooldownHighUntil: true } as const;

/**
 * Le cran d'une demande qui n'en NOMME aucun (#18108) : le suivant, borné à Ami.
 * « Ajouter » depuis Public vise Connaissance, depuis Connaissance vise Ami ;
 * au-delà, Proche et Sang ne se demandent que nommés — `null`.
 */
export const unnamedRequestRung = (currentLevel: RelationLevel): RelationRequestLevel | null => {
  const next = relationRungAfter(currentLevel);
  return next === 'ACQUAINTANCE' || next === 'FRIEND' ? next : null;
};

export const thresholdsNow = () => relationThresholdsFor(process.env.DEPLOY_ENV ?? process.env.NODE_ENV);

export async function judgeRelationRequest(
  prisma: RelationRequestGateDb,
  params: {
    readonly requesterId: string;
    readonly otherId: string;
    readonly targetLevel: RelationRequestLevel;
    readonly now: Date;
    /** À la réponse, le cool-down de l'émetteur ne retient pas celui qui accepte. */
    readonly ignoreCooldown?: boolean;
  },
): Promise<RelationRequestJudgement> {
  const { requesterId, otherId, targetLevel, now } = params;
  const [currentLevel, row] = await Promise.all([
    niveauEffectif(prisma, requesterId, otherId),
    prisma.userRelation.findUnique({ where: { userLowId_userHighId: relationPairKey(requesterId, otherId) }, select: COOLDOWN_SELECT }),
  ]);
  const link: UserRelationRow | null = row;

  if (params.ignoreCooldown && relationLevelIfAtLeast(currentLevel, targetLevel) !== null) {
    return { allowed: true, currentLevel, alreadyReached: true };
  }

  const needsSeries = targetLevel === 'CLOSE' || targetLevel === 'BLOOD';
  const progress = needsSeries
    ? await loadRelationProgress(prisma, { userA: requesterId, userB: otherId, level: currentLevel, levelSince: link?.levelSince ?? null, now })
    : null;

  const verdict = evaluateRelationRequest({
    targetLevel,
    currentLevel,
    eligibleFor: progress?.series.eligibleFor ?? null,
    cooldownUntil: params.ignoreCooldown ? null : cooldownUntilOf(link, requesterId),
    now,
  });

  return verdict.allowed === true
    ? { allowed: true, currentLevel, alreadyReached: false }
    : { allowed: false, code: verdict.code, currentLevel };
}

/**
 * Une demande EN SUSPENS entre deux personnes retient la suivante (#13933) : une
 * demande en attente dans un sens ou dans l'autre, et — pour son ÉMETTEUR — une
 * demande REFUSÉE, qu'il lit « en attente » (RG-07 : le refus ne se dit pas).
 * Site unique : l'envoi (`friend-requests-core`) et `canRaise` (#14910) la lisent ici.
 */
export async function hasStandingRequest(
  prisma: Pick<PrismaClient, 'friendRequest'>,
  params: { readonly requesterId: string; readonly otherId: string },
): Promise<boolean> {
  const { requesterId, otherId } = params;
  const standing = await prisma.friendRequest.findFirst({
    where: {
      OR: [
        { status: 'pending', senderId: requesterId, receiverId: otherId },
        { status: 'pending', senderId: otherId, receiverId: requesterId },
        { status: 'rejected', senderId: requesterId, receiverId: otherId },
      ],
    },
    select: { id: true },
  });
  return standing !== null;
}

export type RaiseOutlook = { readonly canRaise: boolean; readonly raiseBlockedUntil: null };

/**
 * Puis-je demander le cran SUIVANT (#14910) ? La loi de l'envoi
 * (`evaluateRelationRequest`) sur les mêmes faits que {@link judgeRelationRequest}
 * — niveau effectif, éligibilité de la série —, plus la demande en suspens qui
 * retient l'envoi.
 *
 * Le COOL-DOWN n'entre pas ici, et `raiseBlockedUntil` vaut toujours `null` (audit
 * adversarial #14910) : le cool-down naît d'une BAISSE ou d'un REFUS de l'autre,
 * deux gestes silencieux (RG-07). Servi passivement, il dirait une baisse sans
 * effet visible et daterait un refus dès que l'émetteur annule sa demande. Il se
 * dit UNE fois, au moment de redemander (`RELATION_COOLDOWN`).
 */
export function raiseOutlookOf(params: {
  readonly currentLevel: RelationLevel;
  readonly eligibleFor: 'CLOSE' | 'BLOOD' | null;
  readonly standingRequest: boolean;
  readonly now: Date;
}): RaiseOutlook {
  const next = relationRungAfter(params.currentLevel);
  if (next === null || params.standingRequest) return { canRaise: false, raiseBlockedUntil: null };
  const verdict = evaluateRelationRequest({
    targetLevel: next, currentLevel: params.currentLevel, eligibleFor: params.eligibleFor, cooldownUntil: null, now: params.now,
  });
  return { canRaise: verdict.allowed, raiseBlockedUntil: null };
}
