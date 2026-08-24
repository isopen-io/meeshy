/**
 * Le curseur keyset `(createdAt, id)` — une seule définition pour toutes les
 * listes antichronologiques de la gateway.
 *
 * Pourquoi ici plutôt que dans `routes/posts/types.ts`, où il vivait : trois
 * services l'y importaient déjà depuis un module de ROUTES, et l'inbox des
 * notifications est le quatrième lecteur, hors du domaine posts. Un curseur
 * recopié serait un curseur qui peut diverger de son décodeur ; le décalage se
 * lirait à l'écran en lignes sautées, jamais en erreur.
 *
 * `routes/posts/types.ts` ré-exporte ces symboles : les appelants existants ne
 * changent pas d'import, et il n'existe toujours qu'une implémentation.
 */

export interface CursorData {
  createdAt: string;
  id: string;
}

export function encodeCursor(createdAt: Date | string, id: string): string {
  const data: CursorData = {
    createdAt: typeof createdAt === 'string' ? createdAt : createdAt.toISOString(),
    id,
  };
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

export function decodeCursor(cursor: string): CursorData | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const data: unknown = JSON.parse(json);
    // Le curseur est un paramètre de requête ATTAQUABLE : `data` est un JSON
    // arbitraire. On ne le rend qu'après avoir prouvé, champ par champ, qu'il a
    // exactement la forme sûre attendue en aval — vérifier la seule VÉRACITÉ
    // (`data.createdAt && data.id`) laissait passer un `id` objet ou un
    // `createdAt` non-datable jusqu'à `keysetBeforeClause`, qui le remet à Prisma
    // sous `{ lt: <non-chaîne> }` / `{ lt: Invalid Date }` — soit un 500 sur une
    // entrée contrôlée par l'appelant. On RECONSTRUIT `{ createdAt, id }` plutôt
    // que de renvoyer `data` tel quel, pour ne jamais laisser filer une clé
    // excédentaire vers un consommateur en aval.
    if (
      typeof data === 'object' &&
      data !== null &&
      typeof (data as Record<string, unknown>).createdAt === 'string' &&
      typeof (data as Record<string, unknown>).id === 'string'
    ) {
      const { createdAt, id } = data as CursorData;
      if (Number.isNaN(new Date(createdAt).getTime())) return null;
      return { createdAt, id };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * « Strictement APRÈS ce curseur », dans l'ordre `(createdAt desc, id desc)`.
 *
 * Les deux branches sont indissociables : la première avance sur le temps, la
 * seconde départage les ex æquo à la milliseconde — sans elle, deux lignes nées
 * dans la même milliseconde se re-servent l'une l'autre indéfiniment, ou se
 * sautent. L'ordre `id desc` est celui d'un ObjectId, dont la comparaison
 * lexicographique est une comparaison chronologique.
 *
 * L'appelant DOIT trier par ce même couple : une clause de reprise posée sur un
 * ordre qu'elle ne gouverne pas saute des lignes en silence.
 */
export function keysetBeforeClause(cursor: CursorData): {
  OR: Array<{ createdAt: { lt: Date } } | { createdAt: Date; id: { lt: string } }>;
} {
  const createdAt = new Date(cursor.createdAt);
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }],
  };
}
