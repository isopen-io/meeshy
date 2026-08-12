/**
 * Migration 010: [userId, isRead] → [userId, isRead, expiresAt] on Notification
 *
 * Why : the notification inbox now hides rows whose `expiresAt` has passed —
 * a notification must not outlive the ephemeral message it announces (see
 * `services/gateway/src/services/notifications/visibleNotificationsWhere.ts`).
 * Every inbox read therefore carries `{ $or: [ {expiresAt: null},
 * {expiresAt: {$gt: now}} ] }` on top of its `userId` (+ `isRead`) equality.
 *
 * Without `expiresAt` in the index, that $or is a residual filter: MongoDB must
 * FETCH every candidate document to evaluate it. That lands on
 * `emitCountsUpdate`, which runs on EVERY notification created — i.e. once per
 * recipient of every message. With `expiresAt` as the third key, both branches
 * of the $or are index ranges and the counts stay covered (index-only).
 *
 * This REPLACES the index rather than adding one: `[userId, isRead]` is a
 * prefix of `[userId, isRead, expiresAt]`, so every query the old index served
 * is still served. No extra index to maintain on write.
 *
 * Mirrors `@@index([userId, isRead, expiresAt])` in
 * packages/shared/prisma/schema.prisma — `prisma db push` produces the same
 * shape on a fresh database, so this script is only needed for existing ones.
 * It is idempotent: re-running it after a push is a no-op.
 *
 * Run with:
 *   docker exec meeshy-database mongosh meeshy --file /migrations/010_notification_expiry_index.js
 */

print("=== Migration 010: Notification [userId, isRead, expiresAt] index ===");
print("Database: " + db.getName());
print("");

print("--- Existing Notification indexes ---");
db.Notification.getIndexes().forEach(idx => {
  print(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
});

const oldName = "userId_1_isRead_1";
const newKey = { userId: 1, isRead: 1, expiresAt: 1 };
const newName = "userId_1_isRead_1_expiresAt_1";

const indexes = db.Notification.getIndexes();
const alreadyThere = indexes.find(idx => JSON.stringify(idx.key) === JSON.stringify(newKey));
const old = indexes.find(idx => idx.name === oldName);

print("\n--- Migration plan ---");

if (alreadyThere && !old) {
  print(`  ${alreadyThere.name} already present and ${oldName} already gone — nothing to do.`);
  print("✅ Migration 010 is a no-op (already applied).");
  quit();
}

// Create FIRST, drop second: a window without either index would make every
// inbox read a collection scan. A window with both only costs write overhead.
if (!alreadyThere) {
  print(`  Creating ${newName}...`);
  try {
    db.Notification.createIndex(newKey, { name: newName, background: true });
    print("    ✅ Created successfully");
  } catch (e) {
    print(`    ❌ Create failed: ${e.message}`);
    print("Aborting — the existing index is untouched, reads keep their current plan.");
    quit(1);
  }
} else {
  print(`  ${alreadyThere.name} already present — skipping creation.`);
}

if (old) {
  print(`\n  Dropping ${oldName} (now a prefix of ${newName})...`);
  try {
    db.Notification.dropIndex(oldName);
    print("    ✅ Dropped successfully");
  } catch (e) {
    print(`    ❌ Drop failed: ${e.message}`);
    print("Not fatal: the new index serves every read, the old one only costs write overhead.");
    print(`To finish by hand: db.Notification.dropIndex('${oldName}')`);
  }
} else {
  print(`\n  No ${oldName} to drop.`);
}

print("\n--- Notification indexes after migration ---");
db.Notification.getIndexes().forEach(idx => {
  print(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
});

print("\n✅ Migration 010 completed.");
