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

import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';

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
    //
    // Le TYPE ne suffit pas pour `id` (#7377) : il part dans un `where` sur une
    // colonne `@db.ObjectId`, où une chaîne qui n'est pas un ObjectId fait
    // lever P2023 « Malformed ObjectID » — un 500 sur un curseur forgé, là où
    // la route promet un refus. Tous les curseurs que `encodeCursor` produit
    // portent l'id d'une ligne Mongo : exiger un ObjectId ne refuse aucun
    // curseur légitime.
    if (
      typeof data === 'object' &&
      data !== null &&
      typeof (data as Record<string, unknown>).createdAt === 'string' &&
      typeof (data as Record<string, unknown>).id === 'string'
    ) {
      const { createdAt, id } = data as CursorData;
      if (Number.isNaN(new Date(createdAt).getTime())) return null;
      if (!isValidMongoId(id)) return null;
      return { createdAt, id };
    }
    return null;
  } catch {
    return null;
  }
}

/** Le côté d'un curseur dans l'ordre total : les valeurs plus PETITES, ou plus GRANDES. */
export type KeysetSide = 'lower' | 'higher';

/** La clé de RUPTURE de l'ordre total — l'identifiant, seul champ UNIQUE d'une ligne. */
export const KEYSET_TIE_BREAK_FIELD = 'id' as const;

export type KeysetPosition = {
  /** La colonne que la requête TRIE. `'createdAt'` pour une liste antichronologique. */
  readonly field: string;
  readonly side: KeysetSide;
  /** La valeur du curseur sur cette colonne. `null` ⇒ aucune clause (voir plus bas). */
  readonly value: Date | null;
  readonly id: string;
};

/**
 * « Strictement d'un CÔTÉ de ce curseur », dans l'ordre total `(field, id)` :
 *
 * ```
 * field < v   OU   (field = v ET id < curseur)        — côté 'lower'
 * field > v   OU   (field = v ET id > curseur)        — côté 'higher'
 * ```
 *
 * Les deux branches sont indissociables : la première avance sur la clé de tri,
 * la seconde départage les ex æquo à la milliseconde — sans elle, deux lignes
 * nées dans la même milliseconde se re-servent l'une l'autre indéfiniment, ou se
 * sautent. L'ordre `id` est celui d'un ObjectId, dont la comparaison
 * lexicographique est une comparaison chronologique.
 *
 * L'appelant DOIT trier par ce même couple : une clause de reprise posée sur un
 * ordre qu'elle ne gouverne pas saute des lignes en silence.
 *
 * ## Pourquoi la COLONNE est un paramètre depuis #16684
 *
 * La loi était écrite pour `createdAt`, la clé des listes antichronologiques —
 * et une vue peut trier sur une AUTRE colonne. `GET …/messages?view=pinned`
 * trie par date d'ÉPINGLE (`pinnedAt`) : un curseur qui borne `createdAt` n'y
 * pagine pas la collection qu'il trie, et perd des lignes **sans qu'aucune
 * égalité de milliseconde soit nécessaire**. La colonne se LIT donc dans le
 * `orderBy` de l'appelant au lieu d'être écrite ici.
 *
 * **Une valeur `null` ne rend AUCUNE clause** : un curseur qui désigne une ligne
 * sans valeur sur la clé triée (un message NON épinglé sous `view=pinned`)
 * bornerait la collection sur une valeur qu'elle ne porte pas. L'appelant sert
 * alors sa page sans fenêtre — le comportement déjà documenté d'un curseur
 * inconnu.
 */
export function keysetClause(position: KeysetPosition): KeysetWhereClause | null {
  const { field, side, value, id } = position;
  if (value === null) return null;
  const operator = side === 'lower' ? 'lt' : 'gt';
  return {
    OR: [{ [field]: { [operator]: value } }, { [field]: value, [KEYSET_TIE_BREAK_FIELD]: { [operator]: id } }],
  };
}

/** La forme que Prisma reçoit — une branche par moitié de l'ordre total. */
export type KeysetWhereClause = {
  readonly OR: ReadonlyArray<Record<string, unknown>>;
};

/**
 * « Strictement APRÈS ce curseur » dans l'ordre `(createdAt desc, id desc)` — la
 * PROJECTION de {@link keysetClause} pour les listes antichronologiques, qui
 * sont la majorité. Son type de retour reste exact pour ses appelants.
 */
export function keysetBeforeClause(cursor: CursorData): {
  OR: Array<{ createdAt: { lt: Date } } | { createdAt: Date; id: { lt: string } }>;
} {
  const createdAt = new Date(cursor.createdAt);
  return keysetClause({ field: 'createdAt', side: 'lower', value: createdAt, id: cursor.id }) as {
    OR: Array<{ createdAt: { lt: Date } } | { createdAt: Date; id: { lt: string } }>;
  };
}
