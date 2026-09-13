/**
 * **Rattrapage des droits de pièce jointe d'un membre NOMMÉ (#6080).**
 *
 * Trois portes de création écrivaient une table née fermée sur
 * `canSendVideos`/`canSendAudios` ; elles écrivent désormais celle du site
 * unique (`services/participantRights.ts`). Une table n'est pas rétroactive :
 * les lignes `Participant` déjà écrites gardent leurs droits fermés, et depuis
 * #5151 un droit de type explicitement `false` REFUSE la pièce jointe
 * correspondante. Ce module les rouvre.
 *
 * ## La seule question difficile : « né fermé » ou « fermé par un hôte » ?
 *
 * Les deux produisent un `false` que rien ne distingue dans la ligne. La
 * réponse est la SIGNATURE : la table héritée est un objet EXACT, champ par
 * champ, y compris ses droits à `true`. Un hôte qui a retiré `canSendImages`
 * produit une table qui ressemble à celle-ci sur six champs sur sept — rouvrir
 * sur une correspondance partielle effacerait sa décision. C'est
 * `wasBornWithClosedMemberTable` qui tranche, et rien d'autre : la boucle
 * ci-dessous ne connaît pas la règle.
 *
 * ## Ce qui est REÉCRIT, et ce qui ne l'est pas
 *
 * Les sept droits d'ÉMISSION, depuis `NEW_MEMBER_PERMISSIONS`. `canViewHistory`
 * est PRÉSERVÉ tel que la ligne le porte : le défaut écrit une visibilité
 * OUVERTE sur ces lignes (les trois portes ne posaient pas le champ, le schéma
 * vaut `true`), et le remplacer par le `false` de la table déplacerait le
 * plancher de `historyFloorFor` de `null` à `joinedAt` — c'est-à-dire ferait
 * DISPARAÎTRE du contenu que ces membres voient aujourd'hui, sur les lignes
 * migrées d'une `ConversationMember` ancienne en particulier. Le rattrapage
 * rouvre ce que #6080 a fermé, rien de plus.
 *
 * Sans écriture par défaut : `apply` est OBLIGATOIRE pour corriger.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ParticipantPermissions } from '@meeshy/shared/types/participant';
import {
  NEW_MEMBER_PERMISSIONS,
  wasBornWithClosedMemberTable,
  type ClosedBirthCandidate,
} from '../participantRights';

/**
 * Le filtre COARSE remis à la base : les deux droits que les quatre sites
 * écrivaient à `false`. Il ne décide de rien — `wasBornWithClosedMemberTable`
 * décide — il évite seulement de rapatrier toute la collection `Participant`
 * d'une base de production pour en écarter la quasi-totalité en mémoire.
 *
 * Une ligne dont ces champs seraient ABSENTS n'est pas ramenée, et c'est juste :
 * les quatre sites visés les écrivaient EXPLICITEMENT.
 */
export const CLOSED_BIRTH_CANDIDATE_WHERE = {
  permissions: { is: { canSendVideos: { equals: false }, canSendAudios: { equals: false } } },
} as const;

export type NamedMemberRightsBackfillReport = {
  /** Lignes examinées — celles que le filtre coarse a ramenées. */
  readonly scanned: number;
  /** Lignes que la SIGNATURE reconnaît : ce que `--apply` écrirait. */
  readonly reopenable: number;
  /** Lignes effectivement réécrites — toujours `0` à blanc. */
  readonly reopened: number;
};

export type NamedMemberRightsBackfillOptions = {
  readonly apply?: boolean;
  readonly batchSize?: number;
  readonly onReopen?: (row: { readonly participantId: string; readonly conversationId: string }) => void;
};

const DEFAULT_BATCH_SIZE = 200;

/** La projection minimale dont `wasBornWithClosedMemberTable` a besoin, plus l'identité. */
const SCANNED_SELECT = {
  id: true,
  conversationId: true,
  permissions: true,
  anonymousSession: true,
  shareLinkId: true,
} as const;

/**
 * La table à écrire pour une ligne donnée — `canViewHistory` venant de la LIGNE,
 * jamais de la table. Pure, pour que le choix se lise et se teste seul.
 */
export function reopenedPermissionsFor(row: ClosedBirthCandidate): ParticipantPermissions {
  const frozenHistory = row.permissions?.canViewHistory;

  return {
    ...NEW_MEMBER_PERMISSIONS,
    ...(typeof frozenHistory === 'boolean' ? { canViewHistory: frozenHistory } : {}),
  };
}

export async function backfillNamedMemberAttachmentRights(
  prisma: Pick<PrismaClient, 'participant'>,
  options: NamedMemberRightsBackfillOptions = {},
): Promise<NamedMemberRightsBackfillReport> {
  const apply = options.apply === true;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  let scanned = 0;
  let reopenable = 0;
  let reopened = 0;
  let cursor: string | undefined;

  for (;;) {
    const pageArgs = {
      where: CLOSED_BIRTH_CANDIDATE_WHERE,
      select: SCANNED_SELECT,
      orderBy: { id: 'asc' as const },
      take: batchSize,
    };
    const page = cursor
      ? await prisma.participant.findMany({ ...pageArgs, cursor: { id: cursor }, skip: 1 })
      : await prisma.participant.findMany(pageArgs);

    if (page.length === 0) break;

    for (const row of page) {
      scanned += 1;
      if (!wasBornWithClosedMemberTable(row)) continue;

      reopenable += 1;
      options.onReopen?.({ participantId: row.id, conversationId: row.conversationId });
      if (!apply) continue;

      await prisma.participant.update({
        where: { id: row.id },
        data: { permissions: reopenedPermissionsFor(row) },
      });
      reopened += 1;
    }

    if (page.length < batchSize) break;
    cursor = page[page.length - 1].id;
  }

  return { scanned, reopenable, reopened };
}
