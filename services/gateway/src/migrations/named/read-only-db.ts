import type { Collection, Db, Document } from 'mongodb';

/**
 * La garde du mode À BLANC des migrations nommées (#10865) : la base qu'une
 * migration reçoit sans `--apply` REFUSE toute écriture avant qu'elle parte.
 * Les migrations ont aussi leur propre branche à blanc ; celle-ci tient même
 * si l'une d'elles l'oublie — le défaut d'une migration à blanc ne doit
 * jamais être une écriture en production.
 */
export class DryRunWriteRefused extends Error {
  constructor(operation: string) {
    super(`À blanc : écriture refusée (${operation}). Relancer avec --apply pour écrire.`);
    this.name = 'DryRunWriteRefused';
  }
}

const COLLECTION_WRITES: ReadonlySet<string> = new Set([
  'insertOne',
  'insertMany',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'bulkWrite',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
  'createIndex',
  'createIndexes',
  'createSearchIndex',
  'createSearchIndexes',
  'dropIndex',
  'dropIndexes',
  'dropSearchIndex',
  'updateSearchIndex',
  'drop',
  'rename',
  'initializeOrderedBulkOp',
  'initializeUnorderedBulkOp',
]);

const DB_WRITES: ReadonlySet<string> = new Set([
  'command',
  'runCursorCommand',
  'createCollection',
  'dropCollection',
  'dropDatabase',
  'renameCollection',
  'createIndex',
]);

const WRITING_STAGES = ['$out', '$merge'] as const;

const writesThroughPipeline = (pipeline: unknown): boolean =>
  Array.isArray(pipeline) &&
  pipeline.some(
    (stage) => typeof stage === 'object' && stage !== null && WRITING_STAGES.some((key) => key in stage),
  );

const refusal = (operation: string) => () => Promise.reject(new DryRunWriteRefused(operation));

function readOnlyCollection<T extends Document>(collection: Collection<T>): Collection<T> {
  return new Proxy(collection, {
    get(target, property) {
      if (typeof property === 'string' && COLLECTION_WRITES.has(property)) {
        return refusal(`${target.collectionName}.${property}`);
      }
      if (property === 'aggregate') {
        return (pipeline?: unknown, options?: unknown) => {
          if (writesThroughPipeline(pipeline)) {
            throw new DryRunWriteRefused(`${target.collectionName}.aggregate ($out/$merge)`);
          }
          return target.aggregate(pipeline as Document[], options as never);
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export function readOnlyDb(db: Db): Db {
  return new Proxy(db, {
    get(target, property) {
      if (property === 'collection') {
        return (name: string, options?: unknown) => readOnlyCollection(target.collection(name, options as never));
      }
      if (typeof property === 'string' && DB_WRITES.has(property)) {
        return refusal(`db.${property}`);
      }
      if (property === 'aggregate') {
        return (pipeline?: unknown, options?: unknown) => {
          if (writesThroughPipeline(pipeline)) throw new DryRunWriteRefused('db.aggregate ($out/$merge)');
          return target.aggregate(pipeline as Document[], options as never);
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
