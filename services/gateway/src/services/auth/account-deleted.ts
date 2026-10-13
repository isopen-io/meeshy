/**
 * « Ce compte a été supprimé » — le seul refus d'authentification qui dise
 * quelque chose du COMPTE plutôt que du jeton (#10264).
 *
 * Un appareil qui l'apprend peut purger les données locales de CE compte (le
 * carnet du jeu, #10237) ; il ne doit jamais le confondre avec un jeton expiré
 * ou une session révoquée, après lesquels le compte existe toujours. D'où une
 * règle à deux bornes :
 *
 *  - la PREUVE : la ligne porte `isActive: false` ET `deletedAt` non nul — la
 *    bascule de fin de grâce (`MaintenanceService`) et la purge immédiate
 *    (`routes/account-deletion.ts`) sont les deux écrivains. Un compte
 *    seulement DÉSACTIVÉ (`deletedAt` nul) n'est pas supprimé.
 *  - le DESTINATAIRE : le code ne se dit qu'au porteur d'un jeton dont la
 *    SIGNATURE a été vérifiée pour ce compte. Les sites appelants lisent la
 *    ligne après cette vérification, jamais avant : un tiers qui forge un
 *    jeton au nom d'un identifiant n'apprend pas que le compte a existé.
 *
 * La lecture n'a lieu que sur un chemin d'ÉCHEC, déjà rare. Elle échoue vers
 * le refus générique : une lecture qui lève ne prouve rien, et un faux
 * « supprimé » coûterait des données locales irréversibles.
 */

export class AccountDeletedError extends Error {
  readonly accountId: string;

  constructor(accountId: string) {
    super('Account deleted');
    this.name = 'AccountDeletedError';
    this.accountId = accountId;
  }
}

type DeletionColumns = { readonly isActive: boolean | null; readonly deletedAt: Date | null };

export type DeletedAccountReader = {
  readonly user: {
    findUnique(args: {
      where: { id: string };
      select: { isActive: true; deletedAt: true };
    }): Promise<DeletionColumns | null>;
  };
};

export function isDeletedAccountRow(row: Partial<DeletionColumns> | null | undefined): boolean {
  return row?.isActive === false && row.deletedAt != null;
}

export async function accountIsDeleted(prisma: DeletedAccountReader, userId: string): Promise<boolean> {
  try {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, deletedAt: true } });
    return isDeletedAccountRow(row);
  } catch {
    return false;
  }
}
