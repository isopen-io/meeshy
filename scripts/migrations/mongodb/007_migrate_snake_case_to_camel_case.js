/**
 * Migration 007: Migrate snake_case collections to CamelCase
 *
 * This migration:
 * 1. Copies data from snake_case collections to CamelCase collections
 * 2. Verifies data integrity
 * 3. Drops old snake_case collections
 *
 * Collections migrated:
 * - call_sessions -> CallSession
 * - call_participants -> CallParticipant
 * - user_conversation_categories -> UserConversationCategory
 * - user_conversation_preferences -> UserConversationPreferences
 * - user_voice_models -> UserVoiceModel
 *
 * Collections deleted (backups):
 * - MessageAttachment_backup_urls
 * - old_message_status
 */

print("=== Migration 007: Migrate snake_case to CamelCase ===");
print("Database: " + db.getName());
print("");

// Migration mappings
const migrations = [
  { old: "call_sessions", new: "CallSession" },
  { old: "call_participants", new: "CallParticipant" },
  { old: "user_conversation_categories", new: "UserConversationCategory" },
  { old: "user_conversation_preferences", new: "UserConversationPreferences" },
  { old: "user_voice_models", new: "UserVoiceModel" }
];

// Backup collections to delete
const backupsToDelete = [
  "MessageAttachment_backup_urls",
  "old_message_status"
];

let totalMigrated = 0;
let totalDeleted = 0;

print("--- Phase 1: Migrate data ---");
print("");

for (const mapping of migrations) {
  const oldColl = db.getCollection(mapping.old);
  const newColl = db.getCollection(mapping.new);

  // Check if old collection exists
  if (!db.getCollectionNames().includes(mapping.old)) {
    print(`  ${mapping.old}: Collection does not exist, skipping`);
    continue;
  }

  const oldCount = oldColl.countDocuments();

  if (oldCount === 0) {
    print(`  ${mapping.old}: Empty collection, will be dropped`);
    continue;
  }

  print(`  ${mapping.old} (${oldCount} docs) -> ${mapping.new}`);

  // Get existing count in new collection
  const existingNewCount = newColl.countDocuments();

  // Get all documents from old collection
  const documents = oldColl.find().toArray();

  // Insert into new collection (avoiding duplicates by _id)
  let inserted = 0;
  let skipped = 0;

  for (const doc of documents) {
    try {
      // Check if document already exists in new collection
      const exists = newColl.findOne({ _id: doc._id });
      if (exists) {
        skipped++;
        continue;
      }

      newColl.insertOne(doc);
      inserted++;
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate key error - document already exists
        skipped++;
      } else {
        print(`    ERROR inserting document ${doc._id}: ${err.message}`);
      }
    }
  }

  const newCount = newColl.countDocuments();
  print(`    Inserted: ${inserted}, Skipped (duplicates): ${skipped}`);
  print(`    ${mapping.new} now has ${newCount} documents`);

  totalMigrated += inserted;
}

print("");
print("--- Phase 2: Verify data integrity ---");
print("");

let verificationPassed = true;

for (const mapping of migrations) {
  if (!db.getCollectionNames().includes(mapping.old)) {
    continue;
  }

  const oldCount = db.getCollection(mapping.old).countDocuments();
  const newCount = db.getCollection(mapping.new).countDocuments();

  if (oldCount === 0) {
    print(`  ${mapping.old}: Empty, OK`);
    continue;
  }

  // Verify all documents from old collection exist in new
  const oldDocs = db.getCollection(mapping.old).find({}, { _id: 1 }).toArray();
  let missingCount = 0;

  for (const doc of oldDocs) {
    const exists = db.getCollection(mapping.new).findOne({ _id: doc._id });
    if (!exists) {
      missingCount++;
    }
  }

  if (missingCount === 0) {
    print(`  ${mapping.old} -> ${mapping.new}: All ${oldCount} documents verified`);
  } else {
    print(`  ${mapping.old} -> ${mapping.new}: MISSING ${missingCount}/${oldCount} documents`);
    verificationPassed = false;
  }
}

if (!verificationPassed) {
  print("");
  print("VERIFICATION FAILED! Aborting migration.");
  print("Old collections will NOT be dropped.");
  quit(1);
}

print("");
print("--- Phase 3: Drop old snake_case collections ---");
print("");

for (const mapping of migrations) {
  if (!db.getCollectionNames().includes(mapping.old)) {
    continue;
  }

  const oldCount = db.getCollection(mapping.old).countDocuments();

  print(`  Dropping ${mapping.old} (${oldCount} documents)...`);
  db.getCollection(mapping.old).drop();
  totalDeleted++;
  print(`    Dropped`);
}

print("");
print("--- Phase 4: Drop backup collections ---");
print("");

for (const backup of backupsToDelete) {
  if (!db.getCollectionNames().includes(backup)) {
    print(`  ${backup}: Does not exist, skipping`);
    continue;
  }

  const count = db.getCollection(backup).countDocuments();
  print(`  Dropping ${backup} (${count} documents)...`);
  db.getCollection(backup).drop();
  totalDeleted++;
  print(`    Dropped`);
}

print("");
print("=== Migration 007 Summary ===");
print(`  Documents migrated: ${totalMigrated}`);
print(`  Collections dropped: ${totalDeleted}`);
print("");

// Final collection list
print("--- Final collection list ---");
const finalCollections = db.getCollectionNames().sort();
const snakeCaseRemaining = finalCollections.filter(c => c.includes("_"));

print(`  Total collections: ${finalCollections.length}`);
print(`  snake_case remaining: ${snakeCaseRemaining.length}`);

if (snakeCaseRemaining.length > 0) {
  print("  Remaining snake_case:");
  snakeCaseRemaining.forEach(c => print(`    - ${c}`));
}

print("");
print("Migration 007 completed!");
