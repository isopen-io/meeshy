/**
 * Migration 006: Remove encryptionMode from Message and MessageAttachment
 *
 * encryptionMode should only exist on Conversation, not on Message or MessageAttachment.
 * This migration removes the field from documents where it was incorrectly added.
 *
 * Run with: docker exec meeshy-database mongosh meeshy --file /migrations/006_remove_encryptionMode_from_message_attachment.js
 *
 * SAFE: This only removes the encryptionMode field, does not affect other data.
 */

print("=== Migration 006: Remove encryptionMode from Message & MessageAttachment ===");
print("Database: " + db.getName());
print("");
print("Reason: encryptionMode should only exist on Conversation level.");
print("");

// ============================================================================
// 1. Remove from MessageAttachment
// ============================================================================
print("--- MessageAttachment ---");

const attachmentsWithField = db.MessageAttachment.countDocuments({ encryptionMode: { $exists: true } });
print(`  Documents with encryptionMode: ${attachmentsWithField}`);

if (attachmentsWithField > 0) {
  // Show current values distribution
  const attachmentModes = db.MessageAttachment.aggregate([
    { $match: { encryptionMode: { $exists: true } } },
    { $group: { _id: "$encryptionMode", count: { $sum: 1 } } }
  ]).toArray();

  print("  Current values:");
  attachmentModes.forEach(m => {
    print(`    - ${m._id === null ? 'null' : `"${m._id}"`}: ${m.count}`);
  });

  // Remove the field
  const attachmentResult = db.MessageAttachment.updateMany(
    { encryptionMode: { $exists: true } },
    { $unset: { encryptionMode: "" } }
  );

  print(`  ✅ Removed from ${attachmentResult.modifiedCount} documents`);
} else {
  print("  ✅ No documents have encryptionMode field");
}

// ============================================================================
// 2. Remove from Message
// ============================================================================
print("");
print("--- Message ---");

const messagesWithField = db.Message.countDocuments({ encryptionMode: { $exists: true } });
print(`  Documents with encryptionMode: ${messagesWithField}`);

if (messagesWithField > 0) {
  // Show current values distribution
  const messageModes = db.Message.aggregate([
    { $match: { encryptionMode: { $exists: true } } },
    { $group: { _id: "$encryptionMode", count: { $sum: 1 } } }
  ]).toArray();

  print("  Current values:");
  messageModes.forEach(m => {
    print(`    - ${m._id === null ? 'null' : `"${m._id}"`}: ${m.count}`);
  });

  // Remove the field
  const messageResult = db.Message.updateMany(
    { encryptionMode: { $exists: true } },
    { $unset: { encryptionMode: "" } }
  );

  print(`  ✅ Removed from ${messageResult.modifiedCount} documents`);
} else {
  print("  ✅ No documents have encryptionMode field");
}

// ============================================================================
// 3. Verify Conversation still has encryptionMode (should not be removed)
// ============================================================================
print("");
print("--- Conversation (verification only) ---");

const conversationsWithField = db.Conversation.countDocuments({ encryptionMode: { $exists: true } });
const totalConversations = db.Conversation.countDocuments();
print(`  Conversations with encryptionMode: ${conversationsWithField}/${totalConversations}`);

if (conversationsWithField > 0) {
  const convModes = db.Conversation.aggregate([
    { $match: { encryptionMode: { $exists: true } } },
    { $group: { _id: "$encryptionMode", count: { $sum: 1 } } }
  ]).toArray();

  print("  Distribution:");
  convModes.forEach(m => {
    print(`    - ${m._id === null ? 'null' : `"${m._id}"`}: ${m.count}`);
  });
}
print("  (encryptionMode on Conversation is correct, not removed)");

print("");
print("✅ Migration 006 completed!");
