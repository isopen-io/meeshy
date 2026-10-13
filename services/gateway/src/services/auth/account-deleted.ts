import type { FastifyReply } from 'fastify';
import { sendError } from '../../utils/response';
import { AUTH_ERROR_CODES } from '../../utils/auth-error-codes';

/**
 * « Ce compte a été supprimé » — le seul refus d'authentification qui dise
 * quelque chose du COMPTE plutôt que du jeton (#10264).
 *
 * Un appareil qui l'apprend purge les données locales de CE compte (le carnet
 * du jeu, #10237) — des données parfois UNIQUES. Il ne doit donc jamais
 * l'apprendre d'un compte qui peut encore revenir. D'où une règle à deux
 * bornes :
 *
 *  - la PREUVE : une `AccountDeletionRequest` au statut `COMPLETED` — la purge
 *    confirmée (`routes/account-deletion.ts`, action `purge`), état terminal
 *    qu'aucune action n'annule — sur une ligne qui n'est pas redevenue active.
 *    Les colonnes `isActive: false` + `deletedAt` ne prouvent RIEN : la
 *    suppression de MODÉRATION (`UserManagementService.deleteUser`) les écrit
 *    aussi et `restoreUser` l'annule, et la fin de grâce
 *    (`GRACE_PERIOD_EXPIRED`) les écrit alors que l'annulation rend encore le
 *    compte.
 *  - le DESTINATAIRE : le code ne se dit qu'au porteur d'un jeton dont la
 *    SIGNATURE a été vérifiée pour ce compte. Les sites appelants lisent après
 *    cette vérification, jamais avant : un tiers qui forge un jeton au nom d'un
 *    identifiant n'apprend pas que le compte a existé.
 *
 * La lecture n'a lieu que sur un chemin d'ÉCHEC, déjà rare. Elle échoue vers
 * le refus générique : une lecture qui lève ne prouve rien, et un faux
 * « supprimé » coûterait des données locales irréversibles.
 *
 * La réponse NOMME le compte (`accountId`, l'identifiant du jeton signé) : un
 * appareil qui a basculé de compte entre-temps purge le bon.
 */

export class AccountDeletedError extends Error {
  readonly accountId: string;

  constructor(accountId: string) {
    super('Account deleted');
    this.name = 'AccountDeletedError';
    this.accountId = accountId;
  }
}

export type DeletedAccountReader = {
  readonly accountDeletionRequest: {
    findFirst(args: {
      where: { userId: string; status: 'COMPLETED' };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  readonly user: {
    findUnique(args: { where: { id: string }; select: { isActive: true } }): Promise<{ isActive: boolean | null } | null>;
  };
};

export async function accountIsDeleted(prisma: DeletedAccountReader, userId: string): Promise<boolean> {
  try {
    const purge = await prisma.accountDeletionRequest.findFirst({
      where: { userId, status: 'COMPLETED' },
      select: { id: true },
    });
    if (!purge) return false;
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
    return row?.isActive !== true;
  } catch {
    return false;
  }
}

/**
 * Le refus d'un compte inactif, atteint seulement APRÈS `jwt.verify` : la
 * signature prouve que le porteur détenait un jeton de CE compte, seul
 * destinataire légitime de « supprimé ». Tout autre compte inactif garde le
 * refus générique.
 */
export async function inactiveAccountRefusal(prisma: DeletedAccountReader, userId: string): Promise<Error> {
  if (await accountIsDeleted(prisma, userId)) return new AccountDeletedError(userId);
  return new Error('User not found or inactive');
}

/**
 * Même statut que le 401 générique (un ancien client ne lit que lui) ; le code
 * permet à l'appareil de purger les données de CE compte.
 */
export function sendAccountDeleted(reply: FastifyReply, accountId: string): void {
  sendError(reply, 401, 'Ce compte a été supprimé', {
    code: AUTH_ERROR_CODES.ACCOUNT_DELETED,
    accountId,
  });
}
