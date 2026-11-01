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
import { relationLevelIfAtLeast, relationPairKey, type RelationLevel, type RelationRequestLevel } from '@meeshy/shared/types/relation';
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
