/**
 * Un double Prisma qui ÉVALUE le `where` d'une lecture de notifications, au
 * lieu de l'enregistrer.
 *
 * Un test qui compare la clause reçue à celle qu'il attend passe aussi bien
 * avec une clause juste qu'avec une clause fausse — il ne vérifie que sa propre
 * copie. En l'appliquant à des lignes, c'est le RÉSULTAT qui parle : une clause
 * qui oublie de filtrer rend la ligne expirée, et le test le voit.
 *
 * Le sous-ensemble supporté est exactement celui que les lectures d'inbox
 * emploient. Toute autre clé jette : un filtre dont ce double ne sait rien doit
 * faire échouer le test, jamais passer en ignorant ce qu'il ne comprend pas.
 */
export interface NotificationRow {
  readonly id: string;
  readonly userId: string;
  readonly isRead: boolean;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
}

export function matchesNotificationWhere(
  row: Pick<NotificationRow, 'userId' | 'isRead' | 'expiresAt'>,
  where: Record<string, unknown> | undefined
): boolean {
  if (!where) return true;

  return Object.entries(where).every(([key, condition]) => {
    if (key === 'userId') return row.userId === condition;
    if (key === 'isRead') return row.isRead === condition;
    if (key === 'OR') {
      return (condition as Array<Record<string, unknown>>).some((branch) =>
        matchesNotificationWhere(row, branch)
      );
    }
    if (key === 'expiresAt') {
      if (condition === null) return row.expiresAt === null;
      const range = condition as { gt?: Date };
      if (range.gt instanceof Date) {
        return row.expiresAt !== null && row.expiresAt.getTime() > range.gt.getTime();
      }
      throw new Error(
        `double Prisma: condition expiresAt non supportée ${JSON.stringify(condition)}`
      );
    }
    throw new Error(`double Prisma: clé de filtre non supportée « ${key} »`);
  });
}
