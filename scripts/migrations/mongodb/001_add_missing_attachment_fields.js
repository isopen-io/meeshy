/**
 * Migration 001: Add missing fields to MessageAttachment
 *
 * This migration adds default values for fields that exist in the Prisma schema
 * but are not yet present in MongoDB documents.
 *
 * Run with: docker exec meeshy-database mongosh meeshy --file /migrations/001_add_missing_attachment_fields.js
 *
 * SAFE: This script only adds fields that don't exist, never overwrites existing values.
 */

print("=== Migration 001: Add Missing Attachment Fields ===");
print("Database: " + db.getName());
print("Collection: MessageAttachment");
print("");

// Count before migration
const totalBefore = db.MessageAttachment.countDocuments();
print(`Total attachments: ${totalBefore}`);

// Fields to add with default values
const fieldsToAdd = {
  // User metadata
  title: null,
  alt: null,
  caption: null,

  // Forwarding
  forwardedFromAttachmentId: null,
  isForwarded: false,

  // View-once / Blur
  isViewOnce: false,
  maxViewOnceCount: null,
  viewOnceCount: 0,
  isBlurred: false,

  // Security & Moderation
  scanStatus: "pending",
  scanCompletedAt: null,
  moderationStatus: "pending",
  moderationReason: null,

  // Delivery status
  deliveredToAllAt: null,
  viewedByAllAt: null,
  downloadedByAllAt: null,
  listenedByAllAt: null,
  watchedByAllAt: null,
  viewedCount: 0,
  downloadedCount: 0,
  consumedCount: 0,

  // Encryption (encryptionMode is only on Conversation, not Attachment)
  isEncrypted: false,
  encryptionIv: null,
  encryptionAuthTag: null,
  encryptionHmac: null,
  originalFileHash: null,
  encryptedFileHash: null,
  originalFileSize: null,
  serverKeyId: null,
  thumbnailEncryptionIv: null,
  thumbnailEncryptionAuthTag: null,

  // Audio processing (hybrid mode)
  serverCopyUrl: null,
  transcriptionText: null,
  translationsJson: null
};

// Check which fields are missing
print("\n--- Analyzing missing fields ---");
const sampleDoc = db.MessageAttachment.findOne();
const missingFields = [];

for (const [field, defaultValue] of Object.entries(fieldsToAdd)) {
  const countWithField = db.MessageAttachment.countDocuments({ [field]: { $exists: true } });
  const countWithout = totalBefore - countWithField;

  if (countWithout > 0) {
    missingFields.push({ field, defaultValue, count: countWithout });
    print(`  ${field}: ${countWithout} documents missing (will add: ${JSON.stringify(defaultValue)})`);
  } else {
    print(`  ${field}: OK (all documents have this field)`);
  }
}

if (missingFields.length === 0) {
  print("\n✅ All fields already present. No migration needed.");
} else {
  print(`\n--- Applying migration for ${missingFields.length} fields ---`);

  // Build $set object for fields that don't exist
  for (const { field, defaultValue, count } of missingFields) {
    print(`\nAdding '${field}' to ${count} documents...`);

    const result = db.MessageAttachment.updateMany(
      { [field]: { $exists: false } },
      { $set: { [field]: defaultValue } }
    );

    print(`  Modified: ${result.modifiedCount} documents`);
  }

  print("\n✅ Migration 001 completed successfully!");
}

// Verify
print("\n--- Verification ---");
const sampleAfter = db.MessageAttachment.findOne({}, {
  _id: 1,
  isForwarded: 1,
  isViewOnce: 1,
  scanStatus: 1,
  isEncrypted: 1
});
print("Sample document after migration:");
printjson(sampleAfter);
