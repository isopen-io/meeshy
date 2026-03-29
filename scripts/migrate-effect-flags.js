// Migration: Compute effectFlags from legacy isBlurred/isViewOnce/expiresAt fields
// 
// Usage:
//   Local:   docker exec meeshy-database mongosh meeshy scripts/migrate-effect-flags.js
//   Staging: mongosh "mongodb://staging-host/meeshy" scripts/migrate-effect-flags.js
//   Prod:    ssh root@meeshy.me "docker exec meeshy-database mongosh meeshy" < scripts/migrate-effect-flags.js

const EPHEMERAL = 1 << 0; // 1
const BLURRED   = 1 << 1; // 2
const VIEW_ONCE = 1 << 2; // 4

const col = db.getCollection("Message");

print("--- Migration: effectFlags from legacy fields ---");

// 1. Blurred messages
const r1 = col.updateMany(
  { isBlurred: true, $or: [{ effectFlags: { $exists: false } }, { effectFlags: 0 }] },
  [{ $set: { effectFlags: { $bitOr: [{ $ifNull: ["$effectFlags", 0] }, BLURRED] } } }]
);
print("Blurred: " + r1.modifiedCount + " updated");

// 2. ViewOnce messages
const r2 = col.updateMany(
  { isViewOnce: true, $or: [{ effectFlags: { $exists: false } }, { effectFlags: 0 }] },
  [{ $set: { effectFlags: { $bitOr: [{ $ifNull: ["$effectFlags", 0] }, VIEW_ONCE] } } }]
);
print("ViewOnce: " + r2.modifiedCount + " updated");

// 3. Ephemeral messages (have expiresAt)
const r3 = col.updateMany(
  { expiresAt: { $ne: null }, $or: [{ effectFlags: { $exists: false } }, { effectFlags: 0 }] },
  [{ $set: { effectFlags: { $bitOr: [{ $ifNull: ["$effectFlags", 0] }, EPHEMERAL] } } }]
);
print("Ephemeral: " + r3.modifiedCount + " updated");

// 4. Initialize effectFlags=0 for all messages without it
const r4 = col.updateMany(
  { effectFlags: { $exists: false } },
  { $set: { effectFlags: 0 } }
);
print("Default (0): " + r4.modifiedCount + " initialized");

// Summary
const withEffects = col.countDocuments({ effectFlags: { $gt: 0 } });
const total = col.estimatedDocumentCount();
print("\nDone. " + withEffects + "/" + total + " messages have effects.");
