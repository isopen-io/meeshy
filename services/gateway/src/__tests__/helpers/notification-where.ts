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
  row: Partial<NotificationRow>,
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
    if (key === 'AND') {
      return (condition as Array<Record<string, unknown>>).every((branch) =>
        matchesNotificationWhere(row, branch)
      );
    }
    if (key === 'createdAt') {
      // Une borne de keyset : `{ lt }` seule, ou l'égalité qui départage
      // l'ex-æquo de la seconde branche.
      if (condition instanceof Date) return row.createdAt?.getTime() === condition.getTime();
      const range = condition as { lt?: Date; gt?: Date };
      if (range.lt instanceof Date) return (row.createdAt as Date).getTime() < range.lt.getTime();
      if (range.gt instanceof Date) return (row.createdAt as Date).getTime() > range.gt.getTime();
      throw new Error(
        `double Prisma: condition createdAt non supportée ${JSON.stringify(condition)}`
      );
    }
    if (key === 'id') {
      const range = condition as { lt?: string };
      if (typeof range.lt === 'string') return (row.id as string) < range.lt;
      throw new Error(`double Prisma: condition id non supportée ${JSON.stringify(condition)}`);
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

/**
 * `findMany` d'une inbox, joué sur un tableau : filtre, TRI, puis fenêtre.
 *
 * Le tri est ce qui fait la valeur du double ici. Une pagination par offset et
 * une pagination par curseur rendent la même chose tant que le tableau ne bouge
 * pas ; leur différence n'apparaît qu'en INSÉRANT une ligne entre deux pages, et
 * seule une source qui reclasse ses lignes à chaque lecture peut la montrer.
 *
 * Le tri est fixé à `(createdAt desc, id desc)` — l'ordre total de l'inbox, et
 * la clé exacte que le curseur transporte. Un `orderBy` différent jette : une
 * page servie dans un ordre que le curseur ne sait pas reprendre saute des
 * lignes en silence, c'est précisément ce que ce double doit rendre visible.
 */
export function findManyNotifications<T extends Partial<NotificationRow>>(
  rows: readonly T[],
  args: {
    where?: Record<string, unknown>;
    orderBy?: unknown;
    take?: number;
    skip?: number;
  } = {}
): T[] {
  const orderBy = JSON.stringify(args.orderBy ?? [{ createdAt: 'desc' }, { id: 'desc' }]);
  if (orderBy !== JSON.stringify([{ createdAt: 'desc' }, { id: 'desc' }])) {
    throw new Error(`double Prisma: orderBy non supporté ${orderBy}`);
  }

  const matched = rows
    .filter((row) => matchesNotificationWhere(row, args.where))
    .sort((a, b) => {
      const delta = (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime();
      return delta !== 0 ? delta : (b.id as string).localeCompare(a.id as string);
    });

  const from = args.skip ?? 0;
  return args.take === undefined ? matched.slice(from) : matched.slice(from, from + args.take);
}
