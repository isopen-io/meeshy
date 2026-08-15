/**
 * Migration 011: multikey index on User.blockedUserIds
 *
 * Why : the presence broadcast has to answer "who blocked this person?" on
 * every presence transition — each connect, each disconnect, and in bursts for
 * every account the maintenance sweep (`updateOfflineUsers`) marks offline at
 * once. It used to answer that by handing the ENTIRE connected population to
 * `getBlockedUserIdsAmong` as a candidate list, so the query carried an `$in`
 * sized by the whole gateway and the cost of one connect grew with the number
 * of people already connected.
 *
 * `getBlockRelatedUserIds` (services/gateway/src/utils/blocking.ts) drops the
 * candidate list entirely and asks the question directly:
 *
 *   db.User.find({ blockedUserIds: <userId> }, { _id: 1 })
 *
 * Without this index that predicate is a COLLSCAN over every user — the cost
 * would be moved rather than removed. `blockedUserIds` is an array, so a plain
 * single-field index is MULTIKEY: one entry per blocked id, and the lookup
 * becomes an index range bounded by how many people actually blocked this
 * account, which is zero for almost everyone.
 *
 * Additive: no existing index is a prefix of this one and none becomes
 * redundant, so nothing is dropped. Write cost is one index entry per blocked
 * id, touched only when a block is added or removed.
 *
 * Mirrors `@@index([blockedUserIds])` in
 * packages/shared/prisma/schema.prisma — `prisma db push` produces the same
 * shape on a fresh database, so this script is only needed for existing ones.
 * It is idempotent: re-running it after a push is a no-op.
 *
 * Run with:
 *   docker exec meeshy-database mongosh meeshy --file /migrations/011_user_blocked_user_ids_index.js
 */

print("=== Migration 011: User.blockedUserIds multikey index ===");
print("Database: " + db.getName());
print("");

print("--- Existing User indexes ---");
db.User.getIndexes().forEach(idx => {
  print(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
});

const key = { blockedUserIds: 1 };
const name = "blockedUserIds_1";

const alreadyThere = db.User
  .getIndexes()
  .find(idx => JSON.stringify(idx.key) === JSON.stringify(key));

print("\n--- Migration plan ---");

if (alreadyThere) {
  print(`  ${alreadyThere.name} already present — nothing to do.`);
  print("✅ Migration 011 is a no-op (already applied).");
  quit();
}

print(`  Creating ${name}...`);
try {
  db.User.createIndex(key, { name, background: true });
  print("    ✅ Created successfully");
} catch (e) {
  print(`    ❌ Create failed: ${e.message}`);
  print("Aborting — no index was dropped, presence keeps its current plan.");
  quit(1);
}

print("\n--- User indexes after migration ---");
db.User.getIndexes().forEach(idx => {
  print(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
});

print("\n✅ Migration 011 completed.");
