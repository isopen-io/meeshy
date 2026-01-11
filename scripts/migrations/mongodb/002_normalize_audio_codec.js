/**
 * Migration 002: Normalize audio codec values
 *
 * Standardizes codec values across iOS and Webapp uploads:
 * - 'MP4' -> 'aac' (webapp uploads)
 * - 'mp4' -> 'aac'
 * - 'AAC' -> 'aac'
 * - 'm4a' -> 'aac'
 *
 * Run with: docker exec meeshy-database mongosh meeshy --file /migrations/002_normalize_audio_codec.js
 */

print("=== Migration 002: Normalize Audio Codec Values ===");
print("Database: " + db.getName());
print("");

// Analyze current codec distribution
print("--- Current codec distribution for audio files ---");
const codecStats = db.MessageAttachment.aggregate([
  { $match: { mimeType: /^audio/ } },
  { $group: { _id: "$codec", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]).toArray();

codecStats.forEach(stat => {
  print(`  '${stat._id}': ${stat.count} files`);
});

// Define codec mappings
const codecMappings = [
  { from: "MP4", to: "aac" },
  { from: "mp4", to: "aac" },
  { from: "AAC", to: "aac" },
  { from: "m4a", to: "aac" },
  { from: "WEBM", to: "opus" },
  { from: "webm", to: "opus" },
  { from: "OGG", to: "opus" },
  { from: "ogg", to: "opus" }
];

print("\n--- Applying codec normalization ---");

let totalModified = 0;

for (const mapping of codecMappings) {
  const count = db.MessageAttachment.countDocuments({
    mimeType: /^audio/,
    codec: mapping.from
  });

  if (count > 0) {
    print(`\nNormalizing '${mapping.from}' -> '${mapping.to}' (${count} files)...`);

    const result = db.MessageAttachment.updateMany(
      { mimeType: /^audio/, codec: mapping.from },
      { $set: { codec: mapping.to } }
    );

    print(`  Modified: ${result.modifiedCount} documents`);
    totalModified += result.modifiedCount;
  }
}

if (totalModified === 0) {
  print("\n✅ All codecs already normalized. No changes needed.");
} else {
  print(`\n✅ Migration 002 completed. Total modified: ${totalModified} documents`);
}

// Verify
print("\n--- Codec distribution after migration ---");
const codecStatsAfter = db.MessageAttachment.aggregate([
  { $match: { mimeType: /^audio/ } },
  { $group: { _id: "$codec", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]).toArray();

codecStatsAfter.forEach(stat => {
  print(`  '${stat._id}': ${stat.count} files`);
});
