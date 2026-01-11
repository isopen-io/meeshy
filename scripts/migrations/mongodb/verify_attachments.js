/**
 * Verification Script: Check MessageAttachment collection health
 *
 * Run with: docker exec meeshy-database mongosh meeshy --file /migrations/verify_attachments.js
 */

print("╔════════════════════════════════════════════════════════════╗");
print("║         MessageAttachment Verification Report              ║");
print("╚════════════════════════════════════════════════════════════╝");
print("");

const collection = db.MessageAttachment;
const total = collection.countDocuments();

print(`Database: ${db.getName()}`);
print(`Collection: MessageAttachment`);
print(`Total documents: ${total}`);
print("");

// ============================================================================
// 1. FIELD PRESENCE CHECK
// ============================================================================
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
print("1. FIELD PRESENCE CHECK");
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const requiredFields = [
  // Core fields
  "_id", "messageId", "fileName", "originalName", "mimeType", "fileSize",
  "filePath", "fileUrl", "uploadedBy", "isAnonymous", "createdAt",
  // New fields
  "isForwarded", "isViewOnce", "isBlurred", "scanStatus", "moderationStatus",
  "isEncrypted", "viewedCount", "downloadedCount", "consumedCount"
];

for (const field of requiredFields) {
  const withField = collection.countDocuments({ [field]: { $exists: true } });
  const percentage = ((withField / total) * 100).toFixed(1);
  const status = withField === total ? "✅" : withField === 0 ? "❌" : "⚠️";
  print(`  ${status} ${field}: ${withField}/${total} (${percentage}%)`);
}

// ============================================================================
// 2. DATA TYPE VALIDATION
// ============================================================================
print("");
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
print("2. DATA TYPE VALIDATION");
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// Check boolean fields have boolean values
const booleanFields = ["isAnonymous", "isForwarded", "isViewOnce", "isBlurred", "isEncrypted"];
for (const field of booleanFields) {
  const validBool = collection.countDocuments({
    [field]: { $in: [true, false] }
  });
  const status = validBool === total ? "✅" : "⚠️";
  print(`  ${status} ${field} (boolean): ${validBool}/${total} valid`);
}

// Check integer fields
const intFields = ["viewedCount", "downloadedCount", "consumedCount", "viewOnceCount"];
for (const field of intFields) {
  const validInt = collection.countDocuments({
    $or: [
      { [field]: { $type: "int" } },
      { [field]: { $type: "long" } },
      { [field]: { $type: "double" } }
    ]
  });
  const status = validInt === total ? "✅" : "⚠️";
  print(`  ${status} ${field} (integer): ${validInt}/${total} valid`);
}

// ============================================================================
// 3. MEDIA-SPECIFIC CHECKS
// ============================================================================
print("");
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
print("3. MEDIA-SPECIFIC CHECKS");
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// Images
const imageCount = collection.countDocuments({ mimeType: /^image/ });
const imagesWithDims = collection.countDocuments({
  mimeType: /^image/,
  width: { $gt: 0 },
  height: { $gt: 0 }
});
const imagesWithThumb = collection.countDocuments({
  mimeType: /^image/,
  thumbnailUrl: { $exists: true, $ne: null }
});
print(`  Images: ${imageCount}`);
print(`    ✅ With dimensions: ${imagesWithDims}/${imageCount}`);
print(`    ✅ With thumbnail: ${imagesWithThumb}/${imageCount}`);

// Videos
const videoCount = collection.countDocuments({ mimeType: /^video/ });
const videosWithMeta = collection.countDocuments({
  mimeType: /^video/,
  duration: { $gt: 0 },
  width: { $gt: 0 }
});
print(`  Videos: ${videoCount}`);
print(`    ${videosWithMeta === videoCount ? "✅" : "⚠️"} With metadata: ${videosWithMeta}/${videoCount}`);

// Audio
const audioCount = collection.countDocuments({ mimeType: /^audio/ });
const audioWithDuration = collection.countDocuments({
  mimeType: /^audio/,
  duration: { $gt: 0 }
});
const audioWithEffects = collection.countDocuments({
  mimeType: /^audio/,
  "metadata.audioEffectsTimeline": { $exists: true }
});
print(`  Audio: ${audioCount}`);
print(`    ${audioWithDuration === audioCount ? "✅" : "⚠️"} With duration: ${audioWithDuration}/${audioCount}`);
print(`    ℹ️  With effects: ${audioWithEffects}/${audioCount}`);

// ============================================================================
// 4. CODEC DISTRIBUTION
// ============================================================================
print("");
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
print("4. CODEC DISTRIBUTION");
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const codecStats = collection.aggregate([
  { $match: { mimeType: /^(audio|video)/ } },
  { $group: { _id: { type: { $substr: ["$mimeType", 0, 5] }, codec: "$codec" }, count: { $sum: 1 } } },
  { $sort: { "_id.type": 1, count: -1 } }
]).toArray();

codecStats.forEach(stat => {
  print(`  ${stat._id.type}/${stat._id.codec || "null"}: ${stat.count}`);
});

// ============================================================================
// 5. INDEX CHECK
// ============================================================================
print("");
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
print("5. INDEXES");
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const indexes = collection.getIndexes();
print(`  Total indexes: ${indexes.length}`);
indexes.forEach(idx => {
  print(`    - ${idx.name}: ${JSON.stringify(idx.key)}`);
});

// ============================================================================
// 6. ISSUES SUMMARY
// ============================================================================
print("");
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
print("6. ISSUES SUMMARY");
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const issues = [];

// Missing audio duration
const missingAudioDuration = audioCount - audioWithDuration;
if (missingAudioDuration > 0) {
  issues.push(`${missingAudioDuration} audio files missing duration`);
}

// Missing video metadata
const missingVideoMeta = videoCount - videosWithMeta;
if (missingVideoMeta > 0) {
  issues.push(`${missingVideoMeta} video files missing metadata`);
}

// Missing new fields
const missingIsForwarded = total - collection.countDocuments({ isForwarded: { $exists: true } });
if (missingIsForwarded > 0) {
  issues.push(`${missingIsForwarded} documents missing isForwarded field`);
}

if (issues.length === 0) {
  print("  ✅ No issues found!");
} else {
  issues.forEach(issue => {
    print(`  ⚠️  ${issue}`);
  });
}

print("");
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
print("Verification completed");
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
