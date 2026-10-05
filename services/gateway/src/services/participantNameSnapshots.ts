import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * **UN NOM DE COMPTE NE SE FIGE DANS AUCUNE CONVERSATION** (#8890), jumelle de
 * `participantAvatarSnapshots.ts` (#8886).
 *
 * `Participant.displayName` est une COPIE du nom du compte, posée à l'ajout
 * (`routes/conversations/participants-writes.ts`, `link-admission.ts`,
 * `sharing.ts`, l'adhésion à la conversation globale), et la loi de lecture la
 * fait passer AVANT le nom du compte (`resolveParticipantDisplayName`,
 * `packages/shared/utils/participant-helpers.ts`) — c'est aussi le titre d'une
 * conversation directe chez le pair. Après un renommage, chaque conversation
 * servait l'ANCIEN nom, à tout le monde, jusqu'au porteur lui-même.
 *
 * La colonne est REQUISE : on ne peut pas la libérer comme la photo. Le
 * changement de nom la RÉÉCRIT avec le nom que le compte porte désormais,
 * composé comme les clients le composent (`displayName > « Prénom Nom » >
 * username`). Le surnom par conversation vit ailleurs (`nickname`) et n'est
 * pas touché ; seules les lignes d'un INSCRIT qui portent un autre nom sont
 * écrites.
 */

export type AccountNameFields = {
  readonly displayName: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly username: string;
};

const nonBlank = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
};

export function accountDisplayName(account: AccountNameFields): string {
  const fullName = nonBlank([account.firstName, account.lastName].map((part) => part?.trim() ?? '').filter(Boolean).join(' '));
  return nonBlank(account.displayName) ?? fullName ?? account.username;
}

export async function refreshParticipantNameSnapshots(
  prisma: Pick<PrismaClient, 'participant'>,
  userId: string,
  account: AccountNameFields,
): Promise<number> {
  const displayName = accountDisplayName(account);
  const { count } = await prisma.participant.updateMany({
    where: { userId, type: 'user', displayName: { not: displayName } },
    data: { displayName },
  });
  return count;
}
