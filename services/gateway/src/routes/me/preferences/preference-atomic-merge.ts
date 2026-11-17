import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { PreferenceCategory, PreferenceDocument } from './preference-registry';

/**
 * LA fusion d'un `PATCH` de réglages, faite DANS la base (#18910).
 *
 * « Lire la catégorie, la fusionner côté serveur, réécrire la colonne ENTIÈRE »
 * perd une écriture dès que deux gestes se recouvrent : les deux lectures
 * précèdent les deux écritures, et la dernière efface la clé de l'autre. Sur
 * un réseau lent, couper « Son » puis « Jeu » 300 ms plus tard laissait l'écran
 * sur deux coupures et le serveur sur une seule.
 *
 * Un pipeline de mise à jour s'applique d'un seul tenant au document : chaque
 * catégorie devient `défauts ← stocké ← clés nommées`, exactement la fusion que
 * la route faisait en mémoire (les défauts comblent, le stocké gagne sur eux,
 * le corps gagne sur tout). Deux gestes s'enchaînent sur la valeur de l'autre.
 *
 * Deux précautions de l'évaluateur de Mongo :
 *  - `$literal` : un réglage dont la valeur est une chaîne commençant par `$`
 *    serait lu comme un chemin de champ ;
 *  - `$type` : une colonne qui n'est pas un objet (`null`, absente, héritée)
 *    vaut `{}` — `$mergeObjects` lèverait sur une chaîne.
 *
 * Réservé aux catégories SANS rangement propre (`storage`) : `privacy` fusionne
 * encore des lignes héritées que seul un `readStored` côté serveur sait lire.
 */

export type AtomicCategoryMerge = {
  readonly category: PreferenceCategory;
  readonly defaults: PreferenceDocument;
  /** Ce que le corps NOMME, et rien d'autre. */
  readonly submitted: PreferenceDocument;
};

/** La collection Mongo de `UserPreferences` (`@@map("user_preferences")`). */
const COLLECTION = 'user_preferences';

const objectOrEmpty = (field: string) => ({
  $cond: [{ $eq: [{ $type: `$${field}` }, 'object'] }, `$${field}`, {}],
});

export function atomicMergeCommand(userId: string, merges: readonly AtomicCategoryMerge[]): Record<string, unknown> {
  const set = Object.fromEntries(
    merges.map(({ category, defaults, submitted }) => [
      category,
      { $mergeObjects: [{ $literal: defaults }, objectOrEmpty(category), { $literal: submitted }] },
    ])
  );
  return {
    update: COLLECTION,
    updates: [{ q: { userId: { $oid: userId } }, u: [{ $set: { ...set, updatedAt: '$$NOW' } }] }],
  };
}

/** La ligne relue : `id` et les catégories que le `select` a demandées. */
export type PreferenceRow = { readonly id: string } & { readonly [category: string]: unknown };

type WriteOutcome = { readonly n?: number; readonly writeErrors?: readonly unknown[] };

/**
 * Applique la fusion et rend la ligne RELUE sous le `select` de l'appelant, la
 * même forme que l'`upsert` qu'elle remplace.
 *
 * La ligne naît ici si elle manque : `UserPreferences` n'a pas de créateur à
 * l'inscription. Le `upsert` à `update` vide ne réécrit aucune colonne. Une
 * mise à jour qui ne touche aucune ligne, ou qui rend une erreur d'écriture,
 * LÈVE : le client reçoit un 500 et retente, jamais un 200 sur une valeur perdue.
 */
export async function mergeCategoriesAtomically(
  prisma: PrismaClient,
  userId: string,
  merges: readonly AtomicCategoryMerge[],
  select: Readonly<Record<string, boolean>>
): Promise<PreferenceRow> {
  await prisma.userPreferences.upsert({ where: { userId }, create: { userId }, update: {}, select: { id: true } });

  const outcome = (await prisma.$runCommandRaw(atomicMergeCommand(userId, merges) as never)) as WriteOutcome;
  if ((outcome.writeErrors?.length ?? 0) > 0 || outcome.n === 0) {
    throw new Error(`Fusion atomique des préférences refusée (userId=${userId})`);
  }

  const row = await prisma.userPreferences.findUnique({ where: { userId }, select });
  if (!row) throw new Error(`Préférences introuvables après fusion (userId=${userId})`);
  // Prisma type une ligne sous un `select` dynamique par `never` : la forme
  // est celle que `select` vient de demander, `id` compris.
  return row as unknown as PreferenceRow;
}
