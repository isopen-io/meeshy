# MongoDB Migrations for Meeshy

Scripts to migrate and normalize MessageAttachment data in MongoDB.

## Quick Start

```bash
# Copy migrations to server
scp -r scripts/migrations/mongodb root@meeshy.me:/tmp/migrations

# SSH to server
ssh root@meeshy.me

# Run all migrations
cd /tmp/migrations
chmod +x *.sh
./run_migrations.sh

# Or run specific migration
./run_migrations.sh --migration 001
```

## Migrations

### 001_add_missing_attachment_fields.js

Adds default values for fields from Prisma schema not yet in MongoDB:

| Field | Default | Description |
|-------|---------|-------------|
| `isForwarded` | `false` | Forwarding status |
| `isViewOnce` | `false` | View-once message |
| `isBlurred` | `false` | Blurred attachment |
| `scanStatus` | `"pending"` | Virus scan status |
| `moderationStatus` | `"pending"` | Content moderation |
| `isEncrypted` | `false` | E2E encryption |
| `viewedCount` | `0` | View count |
| `downloadedCount` | `0` | Download count |
| `title`, `alt`, `caption` | `null` | User metadata |

**Safe:** Only adds fields that don't exist.

### 002_normalize_audio_codec.js

Standardizes codec values:

| From | To |
|------|-----|
| `MP4`, `mp4`, `AAC`, `m4a` | `aac` |
| `WEBM`, `webm`, `OGG`, `ogg` | `opus` |

### 003_add_attachment_indexes.js

Creates performance indexes:

```javascript
{ createdAt: -1 }
{ mimeType: 1 }
{ uploadedBy: 1, createdAt: -1 }
{ messageId: 1, createdAt: 1 }
{ scanStatus: 1 }
{ mimeType: 1, duration: 1 }
```

### 004_report_missing_audio_duration.js

Reports audio files with `duration = 0` or missing duration.
Outputs JSON for use with extraction script.

### 005_extract_audio_duration.sh

Shell script to extract duration using `ffprobe` and update MongoDB.

```bash
# Dry run first
./005_extract_audio_duration.sh --dry-run --limit 5

# Apply changes
./005_extract_audio_duration.sh --limit 100
```

**Requires:** `ffprobe`, `jq`, `bc`

### 006_remove_encryptionMode_from_message_attachment.js

Removes the `encryptionMode` field from `Message` and `MessageAttachment` documents.

**Reason:** `encryptionMode` should only exist at the `Conversation` level.
The encryption mode is inherited by all messages and attachments in that conversation.

**Safe:** Only removes the field, does not affect other data.

### 007_migrate_snake_case_to_camel_case.js

Migrates data from snake_case collections to CamelCase collections and drops old collections.

| From (snake_case) | To (CamelCase) |
|-------------------|----------------|
| `call_sessions` | `CallSession` |
| `call_participants` | `CallParticipant` |
| `user_conversation_categories` | `UserConversationCategory` |
| `user_conversation_preferences` | `UserConversationPreferences` |
| `user_voice_models` | `UserVoiceModel` |

Also removes backup collections:
- `MessageAttachment_backup_urls`
- `old_message_status`

**Safe:** Verifies all data is migrated before dropping old collections.

## Verification

```bash
# Copy and run verification
docker cp verify_attachments.js meeshy-database:/tmp/
docker exec meeshy-database mongosh meeshy --file /tmp/verify_attachments.js
```

## Manual Execution

Run individual migration directly:

```bash
# Copy to container
docker cp 001_add_missing_attachment_fields.js meeshy-database:/tmp/

# Execute
docker exec meeshy-database mongosh meeshy --file /tmp/001_add_missing_attachment_fields.js

# Cleanup
docker exec meeshy-database rm /tmp/001_add_missing_attachment_fields.js
```

## Rollback

Migrations add fields with default values. To rollback:

```javascript
// Remove added fields (CAREFUL!)
db.MessageAttachment.updateMany({}, {
  $unset: {
    isForwarded: "",
    isViewOnce: "",
    isBlurred: "",
    scanStatus: "",
    moderationStatus: "",
    // ... etc
  }
});
```

## Pre-Migration Backup

Always backup before running migrations:

```bash
# Export collection
docker exec meeshy-database mongodump \
  --db meeshy \
  --collection MessageAttachment \
  --out /tmp/backup

# Copy backup locally
docker cp meeshy-database:/tmp/backup ./mongodb_backup_$(date +%Y%m%d)
```

## Files

```
scripts/migrations/mongodb/
├── README.md                                            # This file
├── run_migrations.sh                                    # Master runner script
├── verify_attachments.js                                # Verification report
├── 001_add_missing_attachment_fields.js                 # Add Prisma schema fields
├── 002_normalize_audio_codec.js                         # Standardize codecs
├── 003_add_attachment_indexes.js                        # Create indexes
├── 004_report_missing_audio_duration.js                 # Report missing duration
├── 005_extract_audio_duration.sh                        # Extract duration with ffprobe
├── 006_remove_encryptionMode_from_message_attachment.js # Remove encryptionMode from Message/Attachment
├── 007_migrate_snake_case_to_camel_case.js              # Migrate snake_case to CamelCase collections
├── 008_add_email_verification_code.js                   # Add email verification code fields
├── 009_partial_index_post_originalRepostOfId.js         # Partial-filter index on reposts
├── 010_notification_expiry_index.js                     # Notification [userId, isRead, expiresAt]
├── 011_user_blocked_user_ids_index.js                   # User.blockedUserIds multikey
└── 012_backfill_attachment_capturedInApp.js             # MessageAttachment.capturedInApp = false
```

### 010_notification_expiry_index.js

Replaces `Notification[userId, isRead]` with `[userId, isRead, expiresAt]`
(the old key is a prefix of the new one, so nothing loses its plan).

Inbox reads now hide notifications whose `expiresAt` has passed — a
notification must not outlive the ephemeral message it announces. Without
`expiresAt` in the index that filter forces a document fetch per candidate on
`emitCountsUpdate`, which runs once per recipient of every message; with it,
the counts stay index-only. Idempotent, and a no-op on a database created by
`prisma db push` from the current schema.

### 011_user_blocked_user_ids_index.js

Adds the multikey index `User[blockedUserIds]`.

The presence broadcast answers "who blocked this person?" on every presence
transition. It used to do so by handing the entire connected population to
`getBlockedUserIdsAmong` as candidates, so one connect carried an `$in` sized
by the whole gateway. `getBlockRelatedUserIds` asks the question directly
(`{ blockedUserIds: <userId> }`), which without this index would be a COLLSCAN
over every user — the cost moved rather than removed. As a multikey index the
lookup is bounded by how many people actually blocked that account. Additive
(nothing is dropped), idempotent, and a no-op on a database created by
`prisma db push` from the current schema.

### 012_backfill_attachment_capturedInApp.js

Sets `capturedInApp = false` on every `MessageAttachment` that does not carry
the field.

**This one is not optional.** `capturedInApp` is a non-nullable scalar, and a
non-nullable scalar missing from a document makes the Prisma *read* fail
("Field capturedInApp is required to return data, got null") — on the very
query that serves the message list. Without this backfill, any conversation
holding an attachment older than the field stops loading. The schema's
`@default(false)` applies on WRITE; it does not reconstitute an absent field on
read. Same reason as step 4 of `scripts/migrate-effect-flags.js`.

Every pre-existing attachment gets `false`, with no heuristic: provenance is
knowable only at capture time, by the client that opened the camera or the
microphone. Nothing in a file, a MIME type or a name distinguishes a photo just
taken from a photo imported, so any catch-up rule would manufacture a claim
nobody made. Idempotent — it only touches documents where the field is absent,
so a re-run never overwrites a declaration a client made in the meantime.

## Expected Results After Migration

```javascript
{
  totalAttachments: 686,
  withIsForwarded: 686,        // 100%
  withScanStatus: 686,         // 100%
  audioWithDuration: 170,      // May need ffprobe extraction
  indexes: 8                   // +5 new indexes
}
```
