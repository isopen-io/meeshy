/**
 * LES RECORDS DE NIVEAU NE FONT QUE MONTER (#10905) — l'unique écriture de `User.levelRecord` (record du CYCLE, remis à 1
 * par le Prestige) et de `User.levelMaxLifetime` (max À VIE, qui survit au Prestige) vers le haut.
 *
 * Une écriture CONDITIONNELLE, l'équivalent d'un `$max` : elle ne touche le compte que si la colonne est absente, nulle
 * ou plus basse — rejouée, concurrente ou en retard, elle ne fait jamais baisser un record et une seule montée gagne.
 * Le record du cycle ne s'écrit que sous les étoiles lues avec le niveau (#10895) : un niveau lu avant un Prestige ne
 * relève pas le record du cycle neuf. Le max à vie, lui, ne dépend d'aucun cycle.
 *
 * Elle n'ANNONCE rien : c'est à l'appelant de décider si la montée mérite « Niveau N atteint » (`GloryService`, quand
 * un crédit la gagne) — une lecture qui rattrape un record en retard ne pousse rien.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

type LevelRecordDb = Pick<PrismaClient, 'user'>;

/** Le compte porte encore `stars` étoiles — zéro couvre aussi le champ absent ou `null` (leçon 318). */
export const sameStars = (stars: number | null) =>
  (stars ?? 0) === 0 ? { OR: [{ prestige: null }, { prestige: { isSet: false } }, { prestige: 0 }] } : { prestige: stars };

/**
 * `isSet: false` : sur MongoDB, `{ champ: null }` n'atteint PAS un champ ABSENT — celui de tous les comptes d'avant le
 * jeu (leçon 318).
 */
const below = (field: 'levelRecord' | 'levelMaxLifetime', value: number) => ({
  OR: [{ [field]: null }, { [field]: { isSet: false } }, { [field]: { lt: value } }],
});

export async function raiseLevelRecords(
  prisma: LevelRecordDb,
  params: {
    readonly userId: string;
    readonly record: number;
    /** Absent : le max à vie n'est ni lu ni écrit (appelant d'avant les étincelles). */
    readonly maxLifetime?: number;
    /** Les étoiles lues AVEC le niveau (#10895). Absentes : non vérifiées. */
    readonly prestige?: number | null;
  },
): Promise<{ readonly recordRaised: boolean }> {
  const raised = await prisma.user.updateMany({
    where: {
      id: params.userId,
      AND: [below('levelRecord', params.record), ...(params.prestige === undefined ? [] : [sameStars(params.prestige)])],
    },
    data: { levelRecord: params.record },
  });
  if (params.maxLifetime !== undefined) {
    const maxLifetime = Math.max(params.maxLifetime, params.record);
    await prisma.user.updateMany({
      where: { id: params.userId, ...below('levelMaxLifetime', maxLifetime) },
      data: { levelMaxLifetime: maxLifetime },
    });
  }
  return { recordRaised: raised.count > 0 };
}
