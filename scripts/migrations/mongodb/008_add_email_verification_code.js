/**
 * Migration 008: Add emailVerificationCode field to User collection
 *
 * Context: iOS app now supports OTP code-based email verification (6-digit code)
 * alongside the existing token-based link verification (web flow).
 * The field emailVerificationCode was added to the Prisma schema.
 *
 * MongoDB is schema-less, so existing documents without this field naturally
 * return null. This migration:
 * 1. Reports how many users have/don't have the field
 * 2. Ensures users with pending verification (emailVerificationToken set,
 *    emailVerifiedAt null) get an explicit null emailVerificationCode
 *    so queries on this field work correctly with indexes
 *
 * Idempotent: safe to run multiple times.
 */

const db = db.getSiblingDB("meeshy");

print("=== Migration 008: Add emailVerificationCode field ===\n");

// Report current state
const totalUsers = db.User.countDocuments();
const withCode = db.User.countDocuments({ emailVerificationCode: { $exists: true } });
const withoutCode = db.User.countDocuments({ emailVerificationCode: { $exists: false } });
const verified = db.User.countDocuments({ emailVerifiedAt: { $ne: null } });
const unverified = db.User.countDocuments({ emailVerifiedAt: null });
const pendingVerification = db.User.countDocuments({
  emailVerificationToken: { $ne: null },
  emailVerifiedAt: null
});

print(`Total users: ${totalUsers}`);
print(`With emailVerificationCode field: ${withCode}`);
print(`Without emailVerificationCode field: ${withoutCode}`);
print(`Email verified: ${verified}`);
print(`Email not verified: ${unverified}`);
print(`Pending verification (token set, not verified): ${pendingVerification}`);
print("");

// Set emailVerificationCode to null for users that don't have it
// This ensures the field exists for consistent querying
if (withoutCode > 0) {
  const result = db.User.updateMany(
    { emailVerificationCode: { $exists: false } },
    { $set: { emailVerificationCode: null } }
  );
  print(`Set emailVerificationCode=null for ${result.modifiedCount} users`);
} else {
  print("All users already have emailVerificationCode field");
}

print("\n=== Migration 008 complete ===");
