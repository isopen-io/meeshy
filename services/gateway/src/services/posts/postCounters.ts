/**
 * Le site UNIQUE d'incrément des compteurs de lecture d'un `Post` (#10402).
 *
 * ## Pourquoi une commande brute et non `{ increment: n }`
 *
 * Prisma sur MongoDB n'envoie pas `$inc` : il traduit `{ increment: n }` en
 * pipeline `$set: { champ: { $add: ['$champ', n] } }`, et `$add` rend `null`
 * dès qu'un opérande est absent ou `null`. L'écriture RÉUSSIT, sans erreur, et
 * la lecture rend `0` :
 *
 *     champ ABSENT + increment  ->  null en base, relu 0
 *     champ NULL   + increment  ->  null en base, relu 0
 *     champ 0      + increment  ->  1
 *
 * `@default(0)` ne vaut qu'à la création : tout post antérieur à la colonne
 * garde son compteur à `null` POUR TOUJOURS pendant que ses lignes
 * `PostImpression`, `PostEngagement` et `PostView` s'accumulent. Mesuré en
 * production le 2026-10-12 : un post à 4 likes et 67 impressions servait
 * `impressionCount: 0`. C'est la cause racine d'une partie des « N likes,
 * 0 impression, 0 vue » (même loi que #5742 et #6428,
 * `EngagementService.updateEngagementScore`, `shareLinkVisits.ts`).
 *
 * Le pipeline `$ifNull` traite `null` ET l'absence comme zéro, en UNE écriture
 * atomique. Les arguments gardent le vocabulaire de Prisma
 * (`{ impressionCount: { increment: 1 } }`) : un site d'appel se lit comme
 * avant, seul le transport change.
 */

export const POST_COUNTERS = [
  'viewCount',
  'impressionCount',
  'postOpenCount',
  'qualifiedViewCount',
  'playCount',
  'anonymousViewCount',
  'anonymousImpressionCount',
  'uniqueViewCount',
  'anonymousUniqueViewCount',
] as const;

export type PostCounter = (typeof POST_COUNTERS)[number];

export type PostCounterIncrements = Readonly<Partial<Record<PostCounter, { readonly increment: number }>>>;

type RawCommandRunner = {
  $runCommandRaw(command: Record<string, unknown>): Promise<unknown>;
};

/** `@@map` absent du modèle : la collection porte le nom du modèle. */
const POST_COLLECTION = 'Post';

const COUNTER_NAMES: ReadonlySet<string> = new Set(POST_COUNTERS);

export type PostCounterScope = {
  /** N'incrémente que les posts non supprimés (crédit d'une racine de repost). */
  readonly liveOnly?: boolean;
};

/**
 * La commande brute, exposée pour que les témoins puissent nommer ce qu'un
 * site envoie sans recopier la forme du pipeline. `null` quand il n'y a rien
 * à écrire (aucun id, ou aucun incrément non nul).
 */
export function postCounterIncrementCommand(
  postIds: readonly string[],
  increments: PostCounterIncrements,
  scope: PostCounterScope = {},
): Record<string, unknown> | null {
  const champs = Object.entries(increments)
    .filter((entree): entree is [PostCounter, { readonly increment: number }] =>
      COUNTER_NAMES.has(entree[0]) && Number.isFinite(entree[1]?.increment) && entree[1]?.increment !== 0);
  const ids = [...new Set(postIds)];
  if (ids.length === 0 || champs.length === 0) return null;

  const set = Object.fromEntries(champs.map(([champ, { increment }]) =>
    [champ, { $add: [{ $ifNull: [`$${champ}`, 0] }, increment] }]));

  return {
    update: POST_COLLECTION,
    updates: [{
      q: {
        _id: { $in: ids.map((id) => ({ $oid: id })) },
        ...(scope.liveOnly ? { deletedAt: null } : {}),
      },
      u: [{ $set: set }],
      multi: true,
    }],
  };
}

/** Incrémente les compteurs nommés des posts donnés — un champ `null` ou absent repart de zéro. */
export async function incrementPostCounters(
  prisma: RawCommandRunner,
  postIds: readonly string[],
  increments: PostCounterIncrements,
  scope: PostCounterScope = {},
): Promise<void> {
  const command = postCounterIncrementCommand(postIds, increments, scope);
  if (!command) return;
  await prisma.$runCommandRaw(command);
}
