/**
 * Un `participant.findMany` BORNÉ joué sur des lignes NUES — le double que
 * `loadLiveAudience` (#20007) exige, et que les doubles ordinaires ne peuvent
 * pas remplacer.
 *
 * ## Il EXIGE `take`, il ne se contente pas de l'honorer
 *
 * Un double qui ignore `take` rend toute la table : retirer la borne de la
 * production laisse alors les témoins VERTS, et la seule garde de mémoire du
 * chemin disparaît sans qu'un seul rougisse. C'est la forme la plus discrète du
 * mensonge d'un double — il ne mentit pas par ce qu'il RÉPOND mais par ce qu'il
 * ACCEPTE (cycle 185, un `orderBy` TABLEAU lu comme un objet ; cycle 188, un
 * `to(room: string)` qui rangeait un TABLEAU sous une clé innommable). Ici,
 * `take` est REQUIS, et toute forme non modélisée — `cursor`, `skip`, un
 * `orderBy` quelconque — **jette** : la pagination au curseur a été écrite puis
 * retirée de ce chemin (aucun index ne servait son tri), et un double qui
 * l'accepterait en silence laisserait revenir ce qu'un audit a retiré.
 *
 * Le `where`, lui, est APPLIQUÉ (par `matchesMongoWhere`, donc un champ ABSENT
 * n'est pas un champ à `null`) : c'est ce qui rend la clause `bannedAt` de
 * `PARTICIPATION_VIVANTE` observable par un témoin.
 */
import { matchesMongoWhere, type MongoDocument } from './mongo-where';

const MODELLED_ARGS = new Set(['where', 'select', 'take']);

export type ParticipantFindManyArgs = {
  readonly where?: MongoDocument;
  readonly select?: Record<string, boolean>;
  readonly take?: number;
};

export type LiveParticipantTableHooks = {
  /** Appelé AVANT la lecture. Un témoin y fait LEVER la requête. */
  readonly onRead?: (read: number) => void;
};

export type LiveParticipantTable = {
  readonly findMany: (args?: ParticipantFindManyArgs) => Promise<MongoDocument[]>;
  /** Combien de lectures la production a réellement demandées. */
  readonly reads: () => number;
  /** Les arguments de la dernière lecture — pour asserter la BORNE elle-même. */
  readonly lastArgs: () => ParticipantFindManyArgs | null;
};

export function liveParticipantTable(
  rows: readonly MongoDocument[],
  hooks?: LiveParticipantTableHooks,
): LiveParticipantTable {
  let reads = 0;
  let last: ParticipantFindManyArgs | null = null;

  const findMany = async (args: ParticipantFindManyArgs = {}): Promise<MongoDocument[]> => {
    for (const key of Object.keys(args)) {
      if (!MODELLED_ARGS.has(key)) throw new Error(`double participant : argument non modélisé « ${key} »`);
    }
    if (typeof args.take !== 'number') {
      throw new Error('double participant : une lecture de participants sans `take` est un `findMany` NU (#4165)');
    }

    reads += 1;
    last = args;
    hooks?.onRead?.(reads);

    return rows.filter((row) => matchesMongoWhere(row, args.where ?? {})).slice(0, args.take);
  };

  return { findMany, reads: () => reads, lastArgs: () => last };
}
