#!/bin/bash
#
# MongoDB Migration Runner
#
# Runs all MongoDB migrations in order.
# Migrations are idempotent - safe to run multiple times.
#
# Usage:
#   ./run_migrations.sh                    # Run all migrations
#   ./run_migrations.sh --dry-run          # Show what would be done
#   ./run_migrations.sh --migration 001    # Run specific migration
#
# Remote usage:
#   scp -r scripts/migrations/mongodb root@meeshy.me:/tmp/migrations
#   ssh root@meeshy.me "cd /tmp/migrations && ./run_migrations.sh"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONGO_CONTAINER="${MONGO_CONTAINER:-meeshy-database}"  # Use env var or default
MONGO_DB="meeshy"
DRY_RUN=false
SPECIFIC_MIGRATION=""

# Auto-detect local container if production not found
if ! docker ps | grep -q "$MONGO_CONTAINER"; then
    if docker ps | grep -q "meeshy-local-database"; then
        MONGO_CONTAINER="meeshy-local-database"
    fi
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --migration)
      SPECIFIC_MIGRATION="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--dry-run] [--migration NNN]"
      exit 1
      ;;
  esac
done

echo "╔════════════════════════════════════════════════════════════╗"
echo "║           MongoDB Migration Runner for Meeshy              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check Docker is available
if ! command -v docker &> /dev/null; then
    print_error "Docker not found. This script must run on a machine with Docker."
    exit 1
fi

# Check MongoDB container is running
if ! docker ps | grep -q "$MONGO_CONTAINER"; then
    print_error "MongoDB container '$MONGO_CONTAINER' is not running."
    exit 1
fi

print_success "MongoDB container is running"

# Test connection
print_info "Testing MongoDB connection..."
DB_LIST=$(docker exec $MONGO_CONTAINER mongosh --quiet --eval "db.adminCommand('listDatabases').databases.map(d => d.name)")
if echo "$DB_LIST" | grep -q "$MONGO_DB"; then
    print_success "Connected to database: $MONGO_DB"
else
    print_error "Database '$MONGO_DB' not found"
    exit 1
fi

echo ""

# List available migrations
MIGRATIONS=(
    "001_add_missing_attachment_fields.js"
    "002_normalize_audio_codec.js"
    "003_add_attachment_indexes.js"
    "004_report_missing_audio_duration.js"
    "006_remove_encryptionMode_from_message_attachment.js"
)

# Filter to specific migration if requested
if [ -n "$SPECIFIC_MIGRATION" ]; then
    MIGRATIONS=($(printf '%s\n' "${MIGRATIONS[@]}" | grep "^${SPECIFIC_MIGRATION}"))
    if [ ${#MIGRATIONS[@]} -eq 0 ]; then
        print_error "Migration $SPECIFIC_MIGRATION not found"
        exit 1
    fi
fi

echo "Migrations to run: ${#MIGRATIONS[@]}"
for m in "${MIGRATIONS[@]}"; do
    echo "  - $m"
done
echo ""

if [ "$DRY_RUN" = true ]; then
    print_warning "DRY RUN MODE - No changes will be made"
    echo ""
fi

# Run migrations
for migration in "${MIGRATIONS[@]}"; do
    MIGRATION_PATH="$SCRIPT_DIR/$migration"

    if [ ! -f "$MIGRATION_PATH" ]; then
        print_warning "Migration file not found: $migration"
        continue
    fi

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_info "Running: $migration"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ "$DRY_RUN" = true ]; then
        echo "[DRY RUN] Would execute: $migration"
    else
        # Copy migration to container and run
        docker cp "$MIGRATION_PATH" "$MONGO_CONTAINER:/tmp/$migration"
        docker exec $MONGO_CONTAINER mongosh $MONGO_DB --file "/tmp/$migration"

        # Cleanup
        docker exec $MONGO_CONTAINER rm -f "/tmp/$migration"
    fi

    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_success "All migrations completed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Run verification
echo ""
print_info "Running verification..."
docker exec $MONGO_CONTAINER mongosh $MONGO_DB --quiet --eval "
printjson({
  totalAttachments: db.MessageAttachment.countDocuments(),
  withIsForwarded: db.MessageAttachment.countDocuments({isForwarded: {\$exists: true}}),
  withScanStatus: db.MessageAttachment.countDocuments({scanStatus: {\$exists: true}}),
  audioWithDuration: db.MessageAttachment.countDocuments({mimeType: /^audio/, duration: {\$gt: 0}}),
  indexes: db.MessageAttachment.getIndexes().length
})
"
