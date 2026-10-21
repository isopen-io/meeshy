import { MongoServerError, ObjectId, type Db } from 'mongodb';
import {
  ANONYMOUS_POST_OPEN_TTL_INDEX,
  migrateAnonymousPostOpens,
  type AnonymousPostOpenMigrationStore,
} from '../../services/posts/anonymousPostOpenMigration';
import type { NamedMigration } from './types';

const COLLECTION = 'AnonymousPostOpen';

type Row = { _id: ObjectId; postId: ObjectId | string; sessionKey: string; createdAt: Date; expiresAt?: Date | null };

function mongoStore(db: Db): AnonymousPostOpenMigrationStore {
  const opens = db.collection<Row>(COLLECTION);
  return {
    async legacyRows() {
      const rows = await opens
        .find(
          { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { sessionKey: { $not: /^[0-9a-f]{64}$/ } }] },
          { projection: { postId: 1, sessionKey: 1, createdAt: 1, expiresAt: 1 } },
        )
        .toArray();
      return rows.map((row) => ({
        id: row._id.toHexString(),
        postId: String(row.postId),
        sessionKey: row.sessionKey,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt ?? null,
      }));
    },
    async rekey(id, next) {
      try {
        await opens.updateOne({ _id: new ObjectId(id) }, { $set: { sessionKey: next.sessionKey, expiresAt: next.expiresAt } });
        return 'updated';
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) return 'duplicate';
        throw error;
      }
    },
    async remove(id) {
      await opens.deleteOne({ _id: new ObjectId(id) });
    },
    async guestIdByTokenHash(tokenHash) {
      const guest = await db
        .collection('Participant')
        .findOne({ sessionTokenHash: tokenHash, type: 'anonymous' }, { projection: { _id: 1 } });
      return guest ? String(guest._id) : undefined;
    },
    async ensureTtlIndex(dryRun) {
      const collections = await db.listCollections({ name: COLLECTION }).toArray();
      const indexes = collections.length > 0 ? await opens.listIndexes().toArray() : [];
      const existing = indexes.find((index) => JSON.stringify(index.key) === JSON.stringify({ expiresAt: 1 }));
      if (existing && typeof existing.expireAfterSeconds === 'number') return 'present';
      if (existing) {
        if (!dryRun) {
          await db.command({ collMod: COLLECTION, index: { keyPattern: { expiresAt: 1 }, expireAfterSeconds: 0 } });
        }
        return 'converted';
      }
      if (!dryRun) await opens.createIndex({ expiresAt: 1 }, { name: ANONYMOUS_POST_OPEN_TTL_INDEX, expireAfterSeconds: 0 });
      return 'created';
    },
  };
}

/**
 * `AnonymousPostOpen.sessionKey` ne garde plus la valeur brute de
 * X-Session-Token (#10483, G11). La logique et ses témoins vivent dans
 * `services/posts/anonymousPostOpenMigration.ts` ; la clé vient de
 * `readerKeyOf`, la fonction même de la passerelle.
 *
 * READER_KEY_HMAC_SECRET doit être CELUI de la passerelle visée : c'est
 * pourquoi la migration s'exécute dans son conteneur, qui le porte déjà.
 */
export const anonymousPostOpenReaderKey: NamedMigration = {
  name: '2026-10-13-anonymous-post-open-reader-key',
  issue: '#10483',
  summary: "clés de lecteur HMAC des ouvertures anonymes, échéance à 90 j, index TTL",
  async run({ db, dryRun, env, log }) {
    const secret = env.READER_KEY_HMAC_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('READER_KEY_HMAC_SECRET manquante ou trop courte — il faut CELLE de la passerelle visée');
    }
    const report = await migrateAnonymousPostOpens(mongoStore(db), { secret, dryRun });
    log(`  lignes à migrer          : ${report.scanned}`);
    log(`  clés hachées             : ${report.rekeyed}`);
    log(`  doublons d'un même invité retirés : ${report.merged}`);
    log(`  index TTL expiresAt      : ${report.ttlIndex}`);
  },
};
