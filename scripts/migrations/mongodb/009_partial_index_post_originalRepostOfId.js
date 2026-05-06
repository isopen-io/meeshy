/**
 * Migration 009: Partial-filter index on Post.originalRepostOfId
 *
 * Drops the default Prisma-generated normal index on Post.originalRepostOfId
 * and recreates it with a partialFilterExpression that only indexes documents
 * where originalRepostOfId is an actual ObjectId (i.e. the post is a repost).
 *
 * Why : Prisma's `@@index([originalRepostOfId])` on a nullable `String? @db.ObjectId`
 * generates a normal MongoDB index that includes a key entry for every Post
 * document — including the ~99% non-repost majority where the value is null.
 * On large collections this wastes RAM in the index working set.
 *
 * A partialFilterExpression `{ $type: "objectId" }` skips the null entries
 * and shrinks the index to the actual repost subset (typically 5-10% of posts),
 * yielding ~70-90% RAM reduction on the index without changing query semantics
 * (queries like `{ originalRepostOfId: <id> }` still hit the index).
 *
 * Reference : SOTA audit Pilier 2 — see
 * docs/superpowers/specs/2026-05-06-composer-based-story-repost-sota-audit.md
 *
 * Run with:
 *   docker exec meeshy-database mongosh meeshy --file /migrations/009_partial_index_post_originalRepostOfId.js
 */

print("=== Migration 009: Partial-filter index on Post.originalRepostOfId ===");
print("Database: " + db.getName());
print("");

// Show existing indexes
print("--- Existing Post indexes ---");
const existingIndexes = db.Post.getIndexes();
existingIndexes.forEach(idx => {
  const filterStr = idx.partialFilterExpression
    ? ` partial: ${JSON.stringify(idx.partialFilterExpression)}`
    : "";
  print(`  ${idx.name}: ${JSON.stringify(idx.key)}${filterStr}`);
});

const indexName = "originalRepostOfId_1";
const partialFilter = { originalRepostOfId: { $type: "objectId" } };

const existing = existingIndexes.find(idx => idx.name === indexName);

print("\n--- Migration plan ---");

if (!existing) {
  print(`  No existing '${indexName}' — will create with partialFilterExpression directly.`);
} else if (existing.partialFilterExpression
  && JSON.stringify(existing.partialFilterExpression) === JSON.stringify(partialFilter)) {
  print(`  ${indexName} already has the expected partialFilterExpression — nothing to do.`);
  print("✅ Migration 009 is a no-op (already applied).");
  quit();
} else {
  print(`  ${indexName} exists${existing.partialFilterExpression
    ? ` with different partialFilterExpression: ${JSON.stringify(existing.partialFilterExpression)}`
    : " (normal index, no partial filter)"} — will drop and recreate.`);
}

// Drop existing index if needed
if (existing) {
  print(`\n  Dropping ${indexName}...`);
  try {
    db.Post.dropIndex(indexName);
    print("    ✅ Dropped successfully");
  } catch (e) {
    print(`    ❌ Drop failed: ${e.message}`);
    print("Aborting migration to avoid leaving the collection in a broken state.");
    quit(1);
  }
}

// Create the partial index
print(`\n  Creating ${indexName} with partialFilterExpression...`);
try {
  db.Post.createIndex(
    { originalRepostOfId: 1 },
    {
      name: indexName,
      partialFilterExpression: partialFilter,
      background: true,
    }
  );
  print("    ✅ Created successfully");
} catch (e) {
  print(`    ❌ Create failed: ${e.message}`);
  print("WARNING: index was dropped but new partial index could not be created.");
  print("To restore the previous behavior, run:");
  print(`  db.Post.createIndex({ originalRepostOfId: 1 }, { name: '${indexName}', background: true })`);
  quit(1);
}

// Verify
print("\n--- Post indexes after migration ---");
const finalIndexes = db.Post.getIndexes();
finalIndexes.forEach(idx => {
  const filterStr = idx.partialFilterExpression
    ? ` partial: ${JSON.stringify(idx.partialFilterExpression)}`
    : "";
  print(`  ${idx.name}: ${JSON.stringify(idx.key)}${filterStr}`);
});

print(`\n✅ Migration 009 completed.`);
print("");
print("NOTE: Prisma's `@@index([originalRepostOfId])` continues to be the");
print("contract in packages/shared/prisma/schema.prisma. On a fresh database");
print("Prisma will recreate the normal (non-partial) variant. Either:");
print("  (a) re-run this migration after `prisma db push` / fresh deploy");
print("  (b) drop and recreate via Atlas Search index (when v6.x supports");
print("      partialFilterExpression in @@index — currently pre-prod).");
