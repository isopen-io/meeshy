/**
 * Migration 004: Report audio files with missing duration
 *
 * This script identifies audio attachments that need duration extraction.
 * It outputs a JSON file that can be used by the extraction script.
 *
 * Run with: docker exec meeshy-database mongosh meeshy --file /migrations/004_report_missing_audio_duration.js
 */

print("=== Migration 004: Report Missing Audio Duration ===");
print("Database: " + db.getName());
print("");

// Find all audio files with duration = 0 or missing
const audioWithoutDuration = db.MessageAttachment.find({
  mimeType: /^audio/,
  $or: [
    { duration: { $exists: false } },
    { duration: 0 },
    { duration: null }
  ]
}, {
  _id: 1,
  fileName: 1,
  filePath: 1,
  fileUrl: 1,
  mimeType: 1,
  fileSize: 1,
  createdAt: 1
}).sort({ createdAt: -1 }).toArray();

print(`Found ${audioWithoutDuration.length} audio files without valid duration`);

if (audioWithoutDuration.length > 0) {
  print("\n--- Files needing duration extraction ---");

  // Group by month for easier processing
  const byMonth = {};
  audioWithoutDuration.forEach(doc => {
    const month = doc.createdAt.toISOString().substring(0, 7);
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push({
      id: doc._id.toString(),
      fileName: doc.fileName,
      filePath: doc.filePath,
      mimeType: doc.mimeType,
      fileSize: Number(doc.fileSize)
    });
  });

  for (const [month, files] of Object.entries(byMonth)) {
    print(`\n${month}: ${files.length} files`);
    files.slice(0, 3).forEach(f => {
      print(`  - ${f.fileName} (${(f.fileSize / 1024).toFixed(1)} KB)`);
    });
    if (files.length > 3) {
      print(`  ... and ${files.length - 3} more`);
    }
  }

  // Output JSON for extraction script
  print("\n--- JSON output for extraction script ---");
  print("Copy this to a file and run the extraction script:");
  print("");
  print(JSON.stringify(audioWithoutDuration.map(doc => ({
    id: doc._id.toString(),
    filePath: doc.filePath,
    mimeType: doc.mimeType
  })), null, 2));
}

// Statistics
print("\n--- Audio Duration Statistics ---");
const stats = db.MessageAttachment.aggregate([
  { $match: { mimeType: /^audio/ } },
  {
    $group: {
      _id: null,
      total: { $sum: 1 },
      withDuration: {
        $sum: { $cond: [{ $gt: ["$duration", 0] }, 1, 0] }
      },
      avgDuration: {
        $avg: { $cond: [{ $gt: ["$duration", 0] }, "$duration", null] }
      },
      maxDuration: { $max: "$duration" },
      minDurationNonZero: {
        $min: { $cond: [{ $gt: ["$duration", 0] }, "$duration", null] }
      }
    }
  }
]).toArray()[0];

if (stats) {
  print(`Total audio files: ${stats.total}`);
  print(`With valid duration: ${stats.withDuration} (${((stats.withDuration / stats.total) * 100).toFixed(1)}%)`);
  print(`Without duration: ${stats.total - stats.withDuration}`);
  print(`Average duration: ${(stats.avgDuration / 1000).toFixed(1)}s`);
  print(`Max duration: ${(stats.maxDuration / 1000).toFixed(1)}s`);
  print(`Min duration (non-zero): ${(stats.minDurationNonZero / 1000).toFixed(2)}s`);
}

print("\n✅ Report completed.");
