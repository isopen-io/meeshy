#!/bin/bash

# Script to automatically migrate remaining i18n files
# This script updates namespace imports and translation keys

FRONTEND_DIR="/Users/smpceo/Documents/Services/Meeshy/meeshy/frontend"
LOG_FILE="i18n_migration_$(date +%Y%m%d_%H%M%S).log"

echo "=== I18n Migration Script ===" | tee "$LOG_FILE"
echo "Started: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Counter
TOTAL=0
SUCCESS=0
FAILED=0

# Function to migrate a file
migrate_file() {
    local file=$1
    local old_namespace=$2
    local new_namespace=$3
    local section_prefix=$4
    
    echo "Processing: $file" | tee -a "$LOG_FILE"
    echo "  Old namespace: $old_namespace" | tee -a "$LOG_FILE"
    echo "  New namespace: $new_namespace" | tee -a "$LOG_FILE"
    echo "  Section prefix: $section_prefix" | tee -a "$LOG_FILE"
    
    if [ ! -f "$file" ]; then
        echo "  ❌ File not found" | tee -a "$LOG_FILE"
        ((FAILED++))
        return 1
    fi
    
    # Create backup
    cp "$file" "${file}.bak"
    
    # Step 1: Replace namespace in useTranslations
    if grep -q "useTranslations('$old_namespace')" "$file"; then
        sed -i "" "s/useTranslations('$old_namespace')/useTranslations('$new_namespace')/g" "$file"
        echo "  ✓ Updated namespace import" | tee -a "$LOG_FILE"
    else
        echo "  ⚠ Namespace not found (might already be migrated)" | tee -a "$LOG_FILE"
    fi
    
    # Step 2: If section_prefix is provided, update translation keys
    # This is more complex and requires manual review
    # For now, we'll just report what needs to be done
    if [ -n "$section_prefix" ]; then
        local key_count=$(grep -o "t(['\"]" "$file" | wc -l | tr -d ' ')
        echo "  ℹ Found $key_count translation keys that may need prefix: $section_prefix" | tee -a "$LOG_FILE"
        echo "  → Manual review recommended for key updates" | tee -a "$LOG_FILE"
    fi
    
    ((TOTAL++))
    ((SUCCESS++))
    echo "  ✅ Migration completed" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
    return 0
}

# Modal Components - Change to 'modals' namespace
echo "=== Migrating Modal Components ===" | tee -a "$LOG_FILE"
migrate_file "$FRONTEND_DIR/components/conversations/create-link-modal.tsx" "createLinkModal" "modals" "createLinkModal"
migrate_file "$FRONTEND_DIR/components/conversations/link-copy-modal.tsx" "createLinkButton" "modals" "createLinkButton"
migrate_file "$FRONTEND_DIR/components/conversations/link-summary-modal.tsx" "linkSummaryModal" "modals" "linkSummaryModal"
migrate_file "$FRONTEND_DIR/components/conversations/create-conversation-modal.tsx" "createConversationModal" "modals" "createConversationModal"

# Conversation Components - Change to 'conversations' namespace
echo "=== Migrating Conversation Components ===" | tee -a "$LOG_FILE"
migrate_file "$FRONTEND_DIR/components/conversations/invite-user-modal.tsx" "conversation" "conversations" "conversation"
migrate_file "$FRONTEND_DIR/components/conversations/conversation-details-sidebar.tsx" "conversationDetails" "conversations" "conversationDetails"
migrate_file "$FRONTEND_DIR/components/conversations/conversation-participants.tsx" "conversationParticipants" "conversations" "conversationParticipants"
migrate_file "$FRONTEND_DIR/components/conversations/conversation-participants-popover.tsx" "conversationSearch" "conversations" "conversationSearch"
migrate_file "$FRONTEND_DIR/components/conversations/conversation-participants-popover.tsx" "conversationUI" "conversations" "conversationUI"

# Common Components - Change to 'conversations' namespace
echo "=== Migrating Common Components ===" | tee -a "$LOG_FILE"
migrate_file "$FRONTEND_DIR/components/common/bubble-message.tsx" "bubbleStream" "conversations" "bubbleStream"
migrate_file "$FRONTEND_DIR/components/common/bubble-stream-page.tsx" "bubbleStream" "conversations" "bubbleStream"
migrate_file "$FRONTEND_DIR/components/common/message-composer.tsx" "conversationSearch" "conversations" "conversationSearch"
migrate_file "$FRONTEND_DIR/components/common/user-selector.tsx" "conversationUI" "conversations" "conversationUI"

# Layout Components
echo "=== Migrating Layout Components ===" | tee -a "$LOG_FILE"
migrate_file "$FRONTEND_DIR/components/layout/Navigation.tsx" "conversationSearch" "conversations" "conversationSearch"

# Pages - Each uses its own JSON file
echo "=== Migrating Page Components ===" | tee -a "$LOG_FILE"
# Note: Pages like chat, groups, links, contacts, joinPage already have dedicated JSON files
# They just need to ensure they're using the correct namespace

echo "" | tee -a "$LOG_FILE"
echo "=== Migration Summary ===" | tee -a "$LOG_FILE"
echo "Total files processed: $TOTAL" | tee -a "$LOG_FILE"
echo "Successful: $SUCCESS" | tee -a "$LOG_FILE"
echo "Failed: $FAILED" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "⚠ IMPORTANT: Translation key updates require manual review!" | tee -a "$LOG_FILE"
echo "   Check each file and update t('key') to t('section.key') as needed" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "Backup files created with .bak extension" | tee -a "$LOG_FILE"
echo "Log saved to: $LOG_FILE" | tee -a "$LOG_FILE"
echo "Completed: $(date)" | tee -a "$LOG_FILE"

