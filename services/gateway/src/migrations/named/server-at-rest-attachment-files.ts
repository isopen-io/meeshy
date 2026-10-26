import { ObjectId, type Db, type Document } from 'mongodb';
import { readMasterKey } from '../../services/messaging/serverAtRest';
import { unwrapDataKey } from '../../services/ServerKeyVault';
import type { AtRestFileKeyring, AtRestFileRecord, AtRestFileStore } from '../../services/attachments/atRest/atRestFiles';
import { backfillAtRestAttachments, type AtRestBackfillDeps } from '../../services/attachments/atRest/atRestBackfill';
import { eraseMirroredCopy } from '../../services/storage/objects/mirroredErasure';
import type { MigrationEnv, NamedMigration } from './types';

/**
 * #13100 — scelle au repos les pièces jointes des conversations `server` /
 * `hybrid` déposées en clair avant le scellement. La logique et ses témoins
 * vivent dans `services/attachments/atRest/atRestBackfill.ts` ; le scellement
 * est celui de l'envoi (`sealAttachmentFiles`), sous la clé que chaque
 * conversation DÉSIGNE (`serverEncryptionKeyId`) — la migration n'en crée
 * aucune : une conversation sans clé lisible est comptée en échec.
 *
 * Elle lit et écrit par la base `db` que l'exécuteur lui remet, donc À BLANC
 * sous `readOnlyDb` : à blanc, elle compte (pièces, fichiers à sceller, déjà
 * scellées) sans écrire ni la base ni le disque. Avec `--apply`, elle pose
 * d'abord les index de `AttachmentFileAtRest` (unique sur `storageKey`), puis
 * scelle. Idempotente : rejouée, elle ne rescelle rien.
 *
 * Elle s'exécute DANS le conteneur passerelle, qui porte `ENCRYPTION_MASTER_KEY`
 * et le volume des dépôts (`UPLOAD_PATH`). En production : feu vert du porteur
 * et sauvegarde vérifiée (volume des dépôts ET collection `MessageAttachment`)
 * AVANT --apply.
 */

const AT_REST = 'AttachmentFileAtRest';
const INDEXES = [
  { key: { storageKey: 1 }, options: { name: 'AttachmentFileAtRest_storageKey_key', unique: true } },
  { key: { attachmentId: 1 }, options: { name: 'AttachmentFileAtRest_attachmentId_idx' } },
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
function mongoPrisma(db: Db): AtRestBackfillDeps['prisma'] {
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

function mongoAtRestStore(db: Db): AtRestFileStore {
  const records = db.collection(AT_REST);
  return {
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
      } satisfies AtRestFileRecord;
    },
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
}

/**
 * La clé que la conversation DÉSIGNE, désenveloppée sous la clé maîtresse —
 * jamais une clé rattachée à une autre conversation, jamais une clé neuve.
 * La migration ne fait que sceller : elle n'ouvre aucun fichier.
 */
function designatedKeyring(db: Db, env: MigrationEnv): AtRestFileKeyring {
  const master = readMasterKey(env.ENCRYPTION_MASTER_KEY);
  return {
    fileSealingKey: async (conversationId) => {
      if (!('key' in master)) throw new Error('ENCRYPTION_MASTER_KEY absente ou invalide');
      const conversation = await db.collection('Conversation').findOne({ _id: oid(conversationId) }, { projection: { serverEncryptionKeyId: 1 } });
      const keyId = typeof conversation?.serverEncryptionKeyId === 'string' ? conversation.serverEncryptionKeyId : null;
      if (!keyId) throw new Error('conversation sans clé désignée');
      const row = await db.collection('ServerEncryptionKey').findOne({ _id: keyId as never });
      if (!row) throw new Error('clé désignée absente');
      if (row.conversationId && hex(row.conversationId as Hexable) !== conversationId) throw new Error('clé rattachée à une autre conversation');
      const key = unwrapDataKey(master.key, { encryptedKey: String(row.encryptedKey), iv: String(row.iv), authTag: String(row.authTag) });
      if (!key) throw new Error('clé désignée illisible sous la clé maîtresse présente');
      return { keyId, key };
    },
    fileOpeningKey: async () => {
      throw new Error('la migration de rattrapage n’ouvre aucun fichier');
    },
  };
}

async function ensureIndexes(db: Db, dryRun: boolean, log: (line: string) => void): Promise<void> {
  const exists = (await db.listCollections({ name: AT_REST }).toArray()).length > 0;
  const present = exists ? await db.collection(AT_REST).listIndexes().toArray() : [];
  for (const index of INDEXES) {
    const found = present.some((existing) => JSON.stringify(existing.key) === JSON.stringify(index.key));
    if (found) continue;
    if (!dryRun) await db.collection(AT_REST).createIndex(index.key, index.options);
    log(`  index ${index.options.name} : ${dryRun ? 'à créer' : 'créé'}`);
  }
}

export const serverAtRestAttachmentFiles: NamedMigration = {
  name: '2026-10-26-server-at-rest-attachment-files',
  issue: '#13100',
  summary: 'scelle au repos les fichiers des pièces jointes server/hybrid encore en clair (original, vignette, variantes, rendus, pistes TTS)',
  async run({ db, dryRun, env, log }) {
    const uploadRoot = env.UPLOAD_PATH || '/app/uploads';
    await ensureIndexes(db, dryRun, log);
    await backfillAtRestAttachments(
      {
        prisma: mongoPrisma(db),
        uploadRoot,
        access: { store: mongoAtRestStore(db), keyring: designatedKeyring(db, env) },
        eraseMirrored: (absolute) => eraseMirroredCopy(absolute, uploadRoot),
      },
      { dryRun, log }
    );
  },
};
