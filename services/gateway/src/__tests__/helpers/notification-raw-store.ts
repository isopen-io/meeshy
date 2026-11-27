/**
 * Une collection `Notification` en mémoire qui répond aux deux formes que la passerelle lui adresse
 * pour retirer des lignes : la commande brute `{ delete: 'Notification', deletes: [{ q, limit: 0 }] }`
 * (chemin JSON `actor.id`, que Prisma ne filtre pas sur MongoDB) et `notification.deleteMany` (jugé
 * par `matchesMongoWhere`, la sémantique mesurée contre mongo:8).
 *
 * Le filtre brut est JUGÉ sur les documents, pas comparé à une copie de lui-même : égalité de champ
 * (chemin pointé compris), `{ $oid }`, `$or`, `$and`. Toute autre forme LÈVE — un témoin ne passe
 * jamais au vert sur un opérateur qu'il ne sait pas lire.
 */
import { matchesMongoWhere, type MongoDocument } from './mongo-where';

export type StoredNotification = {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly actor?: { readonly id: string } | null;
  readonly expiresAt?: Date | null;
};

const valueAt = (row: MongoDocument, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (value !== null && typeof value === 'object' ? (value as MongoDocument)[key] : undefined), row);

function matchesRaw(row: MongoDocument, filter: MongoDocument): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return (expected as MongoDocument[]).some((branch) => matchesRaw(row, branch));
    if (key === '$and') return (expected as MongoDocument[]).every((branch) => matchesRaw(row, branch));
    if (key.startsWith('$')) throw new Error(`notification-raw-store: opérateur non jugé ${key}`);
    if (expected !== null && typeof expected === 'object') {
      const keys = Object.keys(expected);
      if (keys.length === 1 && keys[0] === '$oid') return valueAt(row, key) === (expected as { $oid: string }).$oid;
      throw new Error(`notification-raw-store: forme non jugée sur ${key}`);
    }
    return valueAt(row, key) === expected;
  });
}

export function notificationRawStore(initial: readonly StoredNotification[] = []) {
  let rows: StoredNotification[] = [...initial];
  const commands: MongoDocument[] = [];
  const keep = (predicate: (row: MongoDocument) => boolean): number => {
    const before = rows.length;
    rows = rows.filter((row) => !predicate(row as unknown as MongoDocument));
    return before - rows.length;
  };
  return {
    rows: () => rows,
    commands,
    prisma: {
      $runCommandRaw: async (command: MongoDocument) => {
        commands.push(command);
        if (command.delete !== 'Notification') throw new Error('notification-raw-store: commande non jugée');
        const deletes = command.deletes as ReadonlyArray<{ q: MongoDocument; limit: number }>;
        const n = deletes.reduce((total, entry) => {
          if (entry.limit !== 0) throw new Error('notification-raw-store: limit attendu à 0');
          return total + keep((row) => matchesRaw(row, entry.q));
        }, 0);
        return { n, ok: 1 };
      },
      notification: {
        deleteMany: async (args: { where: MongoDocument }) => ({ count: keep((row) => matchesMongoWhere(row, args.where)) }),
      },
    },
  };
}
