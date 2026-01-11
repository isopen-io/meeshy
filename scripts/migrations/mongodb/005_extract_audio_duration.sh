#!/bin/bash
#
# Migration 005: Extract audio duration using ffprobe
#
# This script extracts duration from audio files and updates MongoDB.
# Requires: ffprobe (from ffmpeg), jq, mongosh
#
# Usage:
#   ./005_extract_audio_duration.sh [--dry-run] [--limit N]
#
# Run this on the server where files are stored.

set -e

# Configuration
STORAGE_BASE="/data/uploads"  # Adjust to your storage path
MONGO_CONTAINER="meeshy-database"
MONGO_DB="meeshy"
DRY_RUN=false
LIMIT=0

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "=== Migration 005: Extract Audio Duration ==="
echo "Storage base: $STORAGE_BASE"
echo "Dry run: $DRY_RUN"
echo "Limit: $LIMIT (0 = no limit)"
echo ""

# Check dependencies
if ! command -v ffprobe &> /dev/null; then
    echo "❌ ffprobe not found. Install ffmpeg first."
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "❌ jq not found. Install jq first."
    exit 1
fi

# Get list of audio files without duration
echo "Fetching audio files without duration..."

QUERY='
db.MessageAttachment.find({
  mimeType: /^audio/,
  $or: [
    { duration: { $exists: false } },
    { duration: 0 },
    { duration: null }
  ]
}, {
  _id: 1,
  filePath: 1,
  mimeType: 1
}).limit('$LIMIT').toArray()
'

FILES=$(docker exec $MONGO_CONTAINER mongosh $MONGO_DB --quiet --eval "$QUERY" | jq -c '.[]')

if [ -z "$FILES" ]; then
    echo "✅ No audio files need duration extraction."
    exit 0
fi

COUNT=$(echo "$FILES" | wc -l | tr -d ' ')
echo "Found $COUNT files to process"
echo ""

PROCESSED=0
UPDATED=0
ERRORS=0

echo "$FILES" | while IFS= read -r file; do
    ID=$(echo "$file" | jq -r '._id."$oid" // ._id')
    FILE_PATH=$(echo "$file" | jq -r '.filePath')
    MIME_TYPE=$(echo "$file" | jq -r '.mimeType')

    FULL_PATH="$STORAGE_BASE/$FILE_PATH"

    if [ ! -f "$FULL_PATH" ]; then
        echo "⚠️  File not found: $FULL_PATH"
        ((ERRORS++)) || true
        continue
    fi

    # Extract duration using ffprobe
    DURATION_SEC=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$FULL_PATH" 2>/dev/null)

    if [ -z "$DURATION_SEC" ] || [ "$DURATION_SEC" = "N/A" ]; then
        echo "⚠️  Could not extract duration: $FILE_PATH"
        ((ERRORS++)) || true
        continue
    fi

    # Convert to milliseconds (integer)
    DURATION_MS=$(echo "$DURATION_SEC * 1000" | bc | cut -d. -f1)

    echo "📁 $FILE_PATH"
    echo "   Duration: ${DURATION_SEC}s (${DURATION_MS}ms)"

    if [ "$DRY_RUN" = true ]; then
        echo "   [DRY RUN] Would update MongoDB"
    else
        # Update MongoDB
        UPDATE_RESULT=$(docker exec $MONGO_CONTAINER mongosh $MONGO_DB --quiet --eval "
            db.MessageAttachment.updateOne(
                { _id: ObjectId('$ID') },
                { \$set: { duration: NumberLong($DURATION_MS) } }
            ).modifiedCount
        ")

        if [ "$UPDATE_RESULT" = "1" ]; then
            echo "   ✅ Updated"
            ((UPDATED++)) || true
        else
            echo "   ⚠️  No update (modifiedCount: $UPDATE_RESULT)"
        fi
    fi

    ((PROCESSED++)) || true
done

echo ""
echo "=== Summary ==="
echo "Processed: $PROCESSED"
echo "Updated: $UPDATED"
echo "Errors: $ERRORS"

if [ "$DRY_RUN" = true ]; then
    echo ""
    echo "This was a DRY RUN. No changes were made."
    echo "Run without --dry-run to apply changes."
fi
