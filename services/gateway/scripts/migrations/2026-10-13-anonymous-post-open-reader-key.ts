/**
 * Migration du 2026-10-13 (#10483, G11) — `AnonymousPostOpen.sessionKey` ne
 * garde plus la valeur brute de X-Session-Token : chaque clé brute devient la
 * clé de lecteur HMAC, chaque ligne reçoit `expiresAt = createdAt + 90 j`, et
 * l'index TTL est posé sur `expiresAt`.
 *
 * FAÇADE MINCE : la logique vit dans
 * `src/services/posts/anonymousPostOpenMigration.ts` (témoins :
 * `anonymousPostOpenMigration.test.ts`), et la clé vient de `readerKeyOf`, la
 * fonction même de la passerelle — le script ne peut pas dériver de ce qu'elle
 * calcule.
 *
 * `DRY_RUN=1` : compte les lignes à migrer et l'état de l'index, sans écrire.
 * Idempotent : rejouée, elle ne trouve plus rien.
 *
 * ⚠ READER_KEY_HMAC_SECRET doit être CELUI de la passerelle de l'environnement
 * visé (sinon les clés migrées ne correspondraient à aucun lecteur) : exécuter
 * DANS le conteneur de la passerelle. En autonomie sur staging ; en production
 * SEULEMENT après feu vert du porteur et sauvegarde vérifiée.
 *
 * Usage :
 *   cd services/gateway
 *   DRY_RUN=1 bunx tsx scripts/migrations/2026-10-13-anonymous-post-open-reader-key.ts
 *   bunx tsx scripts/migrations/2026-10-13-anonymous-post-open-reader-key.ts
 */
import { MongoClient, MongoServerError, ObjectId } from 'mongodb';
import {
  migrateAnonymousPostOpens,
  type AnonymousPostOpenMigrationStore,
} from '../../src/services/posts/anonymousPostOpenMigration';

const DRY_RUN = process.env.DRY_RUN === '1';
const COLLECTION = 'AnonymousPostOpen';
const TTL_INDEX_NAME = 'AnonymousPostOpen_expiresAt_idx';

type Row = { _id: ObjectId; postId: ObjectId | string; sessionKey: string; createdAt: Date; expiresAt?: Date | null };

function mongoStore(client: MongoClient): AnonymousPostOpenMigrationStore {
  const db = client.db();
  const opens = db.collection<Row>(COLLECTION);
  return {
    async legacyRows() {
      const rows = await opens.find(
        { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { sessionKey: { $not: /^[0-9a-f]{64}$/ } }] },
        { projection: { postId: 1, sessionKey: 1, createdAt: 1, expiresAt: 1 } },
      ).toArray();
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
      const guest = await db.collection('Participant').findOne(
        { sessionTokenHash: tokenHash, type: 'anonymous' },
        { projection: { _id: 1 } },
      );
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
      if (!dryRun) await opens.createIndex({ expiresAt: 1 }, { name: TTL_INDEX_NAME, expireAfterSeconds: 0 });
      return 'created';
    },
  };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const secret = process.env.READER_KEY_HMAC_SECRET;
  if (!url) throw new Error('DATABASE_URL manquante');
  if (!secret || secret.length < 32) {
    throw new Error('READER_KEY_HMAC_SECRET manquante ou trop courte — il faut CELLE de la passerelle visée');
  }

  const client = new MongoClient(url);
  console.log('Clés de lecteur des ouvertures anonymes (#10483)');
  console.log(`  mode : ${DRY_RUN ? 'À BLANC (DRY_RUN=1)' : 'ÉCRITURE'}`);
  try {
    await client.connect();
    const report = await migrateAnonymousPostOpens(mongoStore(client), { secret, dryRun: DRY_RUN });
    console.log(`  lignes à migrer          : ${report.scanned}`);
    console.log(`  clés hachées             : ${report.rekeyed}`);
    console.log(`  doublons d'un même invité retirés : ${report.merged}`);
    console.log(`  index TTL expiresAt      : ${report.ttlIndex}`);
    if (DRY_RUN) console.log("\nÀ blanc : rien n'a été écrit. Relancer sans DRY_RUN pour appliquer.");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('Échec de la migration :', error instanceof Error ? error.message : error);
  process.exit(1);
});
