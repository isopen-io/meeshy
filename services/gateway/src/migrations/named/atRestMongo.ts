import { ObjectId, type Db, type Document } from 'mongodb';
import { readMasterKey } from '../../services/messaging/serverAtRest';
import { unwrapDataKey } from '../../services/ServerKeyVault';
import type { AtRestFileKeyring, AtRestFileRecord, AtRestFileStore } from '../../services/attachments/atRest/atRestFiles';
import type { AtRestBackfillDeps } from '../../services/attachments/atRest/atRestBackfill';
import type { MigrationEnv } from './types';

/**
 * #13100 — les adaptateurs Mongo des migrations du scellement au repos : les
 * lignes de pièces, les lignes de scellement et le coffre de clés, lus et
 * écrits par la base `db` que l'exécuteur remet (à blanc sous `readOnlyDb`).
 */

export const AT_REST = 'AttachmentFileAtRest';
export const AT_REST_INDEXES = [
  { key: { storageKey: 1 }, options: { name: 'AttachmentFileAtRest_storageKey_key', unique: true } },
  { key: { attachmentId: 1 }, options: { name: 'AttachmentFileAtRest_attachmentId_idx' } },
  { key: { createdAt: 1 }, options: { name: 'AttachmentFileAtRest_createdAt_idx' } },
  { key: { replacedKey: 1 }, options: { name: 'AttachmentFileAtRest_replacedKey_idx' } },
] as const;

type Hexable = string | { toHexString(): string };
const hex = (value: unknown): string => (typeof value === 'string' ? value : (value as { toHexString(): string }).toHexString());
const oid = (value: string): ObjectId => new ObjectId(value);
const asRow = (doc: Document) => ({ ...doc, id: hex(doc._id as Hexable), messageId: doc.messageId ? hex(doc.messageId as Hexable) : null });

type Where = { id?: string; filePath?: string; messageId?: { in: string[] }; conversationId?: string; encryptionMode?: { in: string[] } };

function mongoWhere(where: Where): Document {
  return {
    ...(where.id !== undefined ? { _id: oid(where.id) } : {}),
    ...(where.filePath !== undefined ? { filePath: where.filePath } : {}),
    ...(where.messageId !== undefined ? { messageId: { $in: where.messageId.in.map(oid) } } : {}),
    ...(where.conversationId !== undefined ? { conversationId: oid(where.conversationId) } : {}),
    ...(where.encryptionMode !== undefined ? { encryptionMode: { $in: where.encryptionMode.in } } : {}),
  };
}

/** Les trois collections que le rattrapage lit et écrit, sous la forme Prisma qu'il attend. */
export function mongoPrisma(db: Db): AtRestBackfillDeps['prisma'] {
  const delegate = (name: string) => ({
    findUnique: async ({ where }: { where: Where }) => {
      const doc = await db.collection(name).findOne(mongoWhere(where));
      return doc ? asRow(doc) : null;
    },
    findMany: async ({ where }: { where: Where }) => (await db.collection(name).find(mongoWhere(where)).toArray()).map(asRow),
    updateMany: async ({ where, data }: { where: Where; data: Document }) => {
      const result = await db.collection(name).updateMany(mongoWhere(where), { $set: data });
      return { count: result.modifiedCount };
    },
  });
  return { messageAttachment: delegate('MessageAttachment'), message: delegate('Message'), conversation: delegate('Conversation') } as never;
}

export function mongoAtRestStore(db: Db): AtRestFileStore {
  const records = db.collection(AT_REST);
  const store: AtRestFileStore = {
    find: async (storageKey) => {
      const doc = await records.findOne({ storageKey });
      if (!doc) return null;
      return {
        storageKey: String(doc.storageKey),
        conversationId: hex(doc.conversationId as Hexable),
        attachmentId: hex(doc.attachmentId as Hexable),
        keyId: String(doc.keyId),
        role: String(doc.role),
        plaintextSize: Number(doc.plaintextSize),
        format: String(doc.format),
        segmentSize: Number(doc.segmentSize),
        replacedKey: typeof doc.replacedKey === 'string' ? doc.replacedKey : null,
      } satisfies AtRestFileRecord;
    },
    ofAttachment: async (attachmentId) =>
      (await records.find({ attachmentId: oid(attachmentId) }).toArray()).map((doc) => ({
        storageKey: String(doc.storageKey),
        conversationId: hex(doc.conversationId as Hexable),
        attachmentId: hex(doc.attachmentId as Hexable),
        keyId: String(doc.keyId),
        role: String(doc.role),
        plaintextSize: Number(doc.plaintextSize),
        format: String(doc.format),
        segmentSize: Number(doc.segmentSize),
        replacedKey: typeof doc.replacedKey === 'string' ? doc.replacedKey : null,
      })),
    byReplacedKey: async (replacedKey) => {
      const doc = await records.findOne({ replacedKey, role: 'original' }, { projection: { storageKey: 1 } });
      return doc && typeof doc.storageKey === 'string' ? store.find(doc.storageKey) : null;
    },
    replacingSince: async (since) =>
      [...new Set((await records.find({ createdAt: { $gte: since }, role: 'original', replacedKey: { $type: 'string' } }).toArray()).map((doc) => hex(doc.attachmentId as Hexable)))],
    save: async (record) => {
      await records.updateOne(
        { storageKey: record.storageKey },
        { $set: { ...record, conversationId: oid(record.conversationId), attachmentId: oid(record.attachmentId) }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
    },
    remove: async (storageKey) => {
      await records.deleteMany({ storageKey });
    },
  };
  return store;
}

/**
 * La clé que la conversation DÉSIGNE, désenveloppée sous la clé maîtresse —
 * jamais une clé rattachée à une autre conversation, jamais une clé neuve.
 * La migration ne fait que sceller : elle n'ouvre aucun fichier.
 */
export function designatedKeyring(db: Db, env: MigrationEnv): AtRestFileKeyring {
  const master = readMasterKey(env.ENCRYPTION_MASTER_KEY);
  const unwrap = async (keyId: string): Promise<{ key: Buffer; owner: string | null }> => {
    if (!('key' in master)) throw new Error('ENCRYPTION_MASTER_KEY absente ou invalide');
    const row = await db.collection('ServerEncryptionKey').findOne({ _id: keyId as never });
    if (!row) throw new Error('clé absente');
    const key = unwrapDataKey(master.key, { encryptedKey: String(row.encryptedKey), iv: String(row.iv), authTag: String(row.authTag) });
    if (!key) throw new Error('clé illisible sous la clé maîtresse présente');
    return { key, owner: row.conversationId ? hex(row.conversationId as Hexable) : null };
  };
  const designated = async (conversationId: string): Promise<string | null> => {
    const conversation = await db.collection('Conversation').findOne({ _id: oid(conversationId) }, { projection: { serverEncryptionKeyId: 1 } });
    return typeof conversation?.serverEncryptionKeyId === 'string' ? conversation.serverEncryptionKeyId : null;
  };
  return {
    // Sceller : la clé que la conversation DÉSIGNE, jamais une clé neuve, jamais celle d'une autre conversation.
    fileSealingKey: async (conversationId) => {
      const keyId = await designated(conversationId);
      if (!keyId) throw new Error('conversation sans clé désignée');
      const { key, owner } = await unwrap(keyId);
      if (owner && owner !== conversationId) throw new Error('clé rattachée à une autre conversation');
      return { keyId, key };
    },
    // Rouvrir (retour arrière) : la règle de `ServerKeyVault.getKeyFor` — rattachée à la conversation, ou désignée par elle.
    fileOpeningKey: async (keyId, conversationId) => {
      const { key, owner } = await unwrap(keyId);
      if (owner === conversationId || (await designated(conversationId)) === keyId) return key;
      throw new Error('clé refusée : elle n’appartient pas à cette conversation');
    },
  };
}

/** Toutes les lignes de scellement (retour arrière). */
export async function allAtRestRecords(db: Db): Promise<readonly AtRestFileRecord[]> {
  const store = mongoAtRestStore(db);
  const docs = await db.collection(AT_REST).find({}, { projection: { storageKey: 1 } }).toArray();
  const records = await Promise.all(docs.map((doc) => (typeof doc.storageKey === 'string' ? store.find(doc.storageKey) : Promise.resolve(null))));
  return records.filter((record): record is AtRestFileRecord => record !== null);
}

export async function ensureAtRestIndexes(db: Db, dryRun: boolean, log: (line: string) => void): Promise<boolean> {
  const exists = (await db.listCollections({ name: AT_REST }).toArray()).length > 0;
  const present = exists ? await db.collection(AT_REST).listIndexes().toArray() : [];
  let complete = true;
  for (const index of AT_REST_INDEXES) {
    const found = present.some((existing) => JSON.stringify(existing.key) === JSON.stringify(index.key) && (!('unique' in index.options) || existing.unique === true));
    if (found) continue;
    complete = false;
    if (!dryRun) await db.collection(AT_REST).createIndex(index.key, index.options);
    log(`  index ${index.options.name} : ${dryRun ? 'à créer' : 'créé'}`);
  }
  return complete || !dryRun;
}

