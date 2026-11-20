/**
 * Un `participant.findMany` PAGINÉ joué sur des lignes NUES — le double que
 * `loadLiveAudience` (#20007) exige, et que les doubles ordinaires ne peuvent
 * pas remplacer.
 *
 * ## Pourquoi un double qui PAGINE
 *
 * Un double qui ignore `take` / `cursor` / `skip` rend la MÊME chose à chaque
 * page : une lecture paginée y tient dans une seule page, et le témoin ne
 * vérifie alors que sa propre copie. C'est la forme la plus discrète du
 * mensonge d'un double — il ne mentit pas par ce qu'il RÉPOND mais par ce qu'il
 * ACCEPTE (cycle 185 sur un `orderBy` TABLEAU lu comme un objet, cycle 188 sur
 * un `to(room: string)` qui rangeait un TABLEAU sous une clé innommable). Ici,
 * le `where` est APPLIQUÉ (par `matchesMongoWhere`, donc un champ ABSENT n'est
 * pas un champ à `null` — c'est ce qui rend la clause `bannedAt` de
 * `PARTICIPATION_VIVANTE` observable), le tri est REJOUÉ et la page est
 * DÉCOUPÉE.
 *
 * ## Toute forme non modélisée JETTE
 *
 * Un argument dont ce double ne sait rien doit faire échouer le témoin, jamais
 * passer en l'ignorant : c'est la seule façon qu'un futur `orderBy` composite
 * ou un `skip` sans curseur ne traversent pas une suite verte.
 */
import { matchesMongoWhere, type MongoDocument } from './mongo-where';

const MODELLED_ARGS = new Set(['where', 'select', 'orderBy', 'take', 'cursor', 'skip']);

export type ParticipantFindManyArgs = {
  readonly where?: MongoDocument;
  readonly select?: Record<string, boolean>;
  readonly orderBy?: { readonly id?: 'asc' | 'desc' };
  readonly take?: number;
  readonly cursor?: { readonly id: string };
  readonly skip?: number;
};

export type LiveParticipantTableHooks = {
  /**
   * Appelé AVANT chaque page (1-indexée). Un témoin y fait LEVER la lecture
   * d'une page précise — la seule façon de distinguer « la lecture n'a rien
   * prouvé » de « elle a prouvé une partie ».
   */
  readonly onPage?: (page: number) => void;
};

export type LiveParticipantTable = {
  readonly findMany: (args?: ParticipantFindManyArgs) => Promise<MongoDocument[]>;
  /** Combien de pages la production a réellement demandées. */
  readonly pagesRead: () => number;
};

export function liveParticipantTable(
  rows: readonly MongoDocument[],
  hooks?: LiveParticipantTableHooks,
): LiveParticipantTable {
  let pages = 0;

  const findMany = async (args: ParticipantFindManyArgs = {}): Promise<MongoDocument[]> => {
    for (const key of Object.keys(args)) {
      if (!MODELLED_ARGS.has(key)) throw new Error(`double participant : argument non modélisé « ${key} »`);
    }
    if (args.orderBy !== undefined && args.orderBy.id !== 'asc') {
      throw new Error('double participant : seul `orderBy: { id: "asc" }` est modélisé');
    }
    if (args.skip !== undefined && args.cursor === undefined) {
      throw new Error('double participant : un `skip` sans `cursor` n’est pas une page au curseur');
    }

    pages += 1;
    hooks?.onPage?.(pages);

    const matching = rows
      .filter((row) => matchesMongoWhere(row, args.where ?? {}))
      .slice()
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));

    let from = 0;
    if (args.cursor !== undefined) {
      const at = matching.findIndex((row) => row.id === args.cursor?.id);
      if (at < 0) throw new Error(`double participant : curseur introuvable « ${args.cursor.id} »`);
      from = at + (args.skip ?? 0);
    }

    return args.take === undefined ? matching.slice(from) : matching.slice(from, from + args.take);
  };

  return { findMany, pagesRead: () => pages };
}
