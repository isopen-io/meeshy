/**
 * Migration 003: Add recommended indexes to MessageAttachment
 *
 * Adds indexes for better query performance:
 * - createdAt: For sorting and date range queries
 * - mimeType: For filtering by file type
 * - Compound indexes for common queries
 *
 * Run with: docker exec meeshy-database mongosh meeshy --file /migrations/003_add_attachment_indexes.js
 */

print("=== Migration 003: Add Attachment Indexes ===");
print("Database: " + db.getName());
print("");

// Show existing indexes
print("--- Existing indexes ---");
const existingIndexes = db.MessageAttachment.getIndexes();
existingIndexes.forEach(idx => {
  print(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
});

// Define indexes to add
const indexesToAdd = [
  {
    name: "MessageAttachment_createdAt_idx",
    key: { createdAt: -1 },
    options: { background: true }
  },
  {
    name: "MessageAttachment_mimeType_idx",
    key: { mimeType: 1 },
    options: { background: true }
  },
  {
    name: "MessageAttachment_uploadedBy_createdAt_idx",
    key: { uploadedBy: 1, createdAt: -1 },
    options: { background: true }
  },
  {
    name: "MessageAttachment_messageId_createdAt_idx",
    key: { messageId: 1, createdAt: 1 },
    options: { background: true }
  },
  {
    name: "MessageAttachment_scanStatus_idx",
    key: { scanStatus: 1 },
    options: {
      background: true,
      partialFilterExpression: { scanStatus: { $exists: true } }
    }
  },
  {
    name: "MessageAttachment_audio_duration_idx",
    key: { mimeType: 1, duration: 1 },
    options: {
      background: true
      // Note: partialFilterExpression with regex not supported in MongoDB
      // This index covers all mimeTypes but is still useful for audio queries
    }
  }
];

print("\n--- Creating new indexes ---");

const existingNames = existingIndexes.map(idx => idx.name);

for (const index of indexesToAdd) {
  if (existingNames.includes(index.name)) {
    print(`  ${index.name}: Already exists, skipping`);
  } else {
    print(`  Creating ${index.name}...`);
    try {
      db.MessageAttachment.createIndex(index.key, {
        name: index.name,
        ...index.options
      });
      print(`    ✅ Created successfully`);
    } catch (e) {
      print(`    ❌ Error: ${e.message}`);
    }
  }
}

// Verify
print("\n--- Indexes after migration ---");
const finalIndexes = db.MessageAttachment.getIndexes();
finalIndexes.forEach(idx => {
  print(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
});

print(`\n✅ Migration 003 completed. Total indexes: ${finalIndexes.length}`);
