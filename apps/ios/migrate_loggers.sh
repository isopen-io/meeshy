#!/bin/bash

# Pino Logger Migration Script
# This script converts all Logger.log calls to appropriate PinoLogger calls
#
# Usage: ./migrate_loggers.sh
#
# Logger mappings:
# - Call files → callLogger
# - Chat/Conversation files → chatLogger
# - Auth/Security files → authLogger
# - Network files → apiLogger (API) or wsLogger (WebSocket)
# - Sync/Persistence files → syncLogger
# - Notification files → logger
# - Profile files → logger

set -e

BASE_DIR="/Users/smpceo/Documents/Services/Meeshy/ios/Meeshy"

echo "🔄 Starting Pino Logger migration..."

# Function to migrate a file
migrate_file() {
    local file=$1
    local logger_name=$2

    if [ ! -f "$file" ]; then
        echo "⚠️  File not found: $file"
        return
    fi

    echo "📝 Migrating: $(basename $file) → $logger_name"

    # Create backup
    cp "$file" "$file.bak"

    # Replace Logger.log patterns
    sed -i '' \
        -e "s/Logger\.log(\"\([^\"]*\)\", level: \.trace)/${logger_name}.trace(\"\1\")/g" \
        -e "s/Logger\.log(\"\([^\"]*\)\", level: \.debug)/${logger_name}.debug(\"\1\")/g" \
        -e "s/Logger\.log(\"\([^\"]*\)\", level: \.info)/${logger_name}.info(\"\1\")/g" \
        -e "s/Logger\.log(\"\([^\"]*\)\", level: \.warn)/${logger_name}.warn(\"\1\")/g" \
        -e "s/Logger\.log(\"\([^\"]*\)\", level: \.warning)/${logger_name}.warn(\"\1\")/g" \
        -e "s/Logger\.log(\"\([^\"]*\)\", level: \.error)/${logger_name}.error(\"\1\")/g" \
        "$file"

    # Handle error cases with error parameter
    sed -i '' \
        -e "s/Logger\.log(\"\([^\"]*\): \\\\(\([^)]*\)\)\", level: \.error)/${logger_name}.error(\"\1\", error: \2)/g" \
        -e "s/Logger\.log(\"\([^\"]*\):\\s*\\\\(\([^)]*\)\.localizedDescription\)\", level: \.error)/${logger_name}.error(\"\1\", error: \2)/g" \
        "$file"

    echo "✅ Migrated: $(basename $file)"
}

# Migrate Call-related files to callLogger
echo ""
echo "📞 Migrating Call files to callLogger..."
migrate_file "$BASE_DIR/Features/Calls/ViewModels/CallViewModel.swift" "callLogger"
migrate_file "$BASE_DIR/Features/Calls/Managers/AudioSessionManager.swift" "callLogger"
migrate_file "$BASE_DIR/Features/Calls/Managers/VideoManager.swift" "callLogger"
migrate_file "$BASE_DIR/Features/Calls/Managers/ScreenShareManager.swift" "callLogger"

# Migrate Chat/Conversation files to chatLogger
echo ""
echo "💬 Migrating Chat/Conversation files to chatLogger..."
migrate_file "$BASE_DIR/Features/Chat/ViewModels/ChatViewModel.swift" "chatLogger"
migrate_file "$BASE_DIR/Features/Conversations/ViewModels/ConversationListViewModel.swift" "chatLogger"
migrate_file "$BASE_DIR/Features/Conversations/ViewModels/SearchViewModel.swift" "chatLogger"
migrate_file "$BASE_DIR/Features/Conversations/Services/ConversationService.swift" "chatLogger"
migrate_file "$BASE_DIR/Features/Conversations/Views/ConversationInfoView.swift" "chatLogger"
migrate_file "$BASE_DIR/Features/Conversations/Views/NewConversationView.swift" "chatLogger"

# Migrate Auth/Security files to authLogger
echo ""
echo "🔐 Migrating Auth/Security files to authLogger..."
migrate_file "$BASE_DIR/Core/Services/AuthService.swift" "authLogger"
migrate_file "$BASE_DIR/Core/Security/KeychainService.swift" "authLogger"
migrate_file "$BASE_DIR/Core/Security/CertificatePinning.swift" "authLogger"

# Migrate Network files
echo ""
echo "🌐 Migrating Network files..."
migrate_file "$BASE_DIR/Core/Network/WebSocketService.swift" "wsLogger"
migrate_file "$BASE_DIR/Core/Network/NetworkMonitor.swift" "apiLogger"

# Migrate Sync/Persistence files to syncLogger
echo ""
echo "🔄 Migrating Sync/Persistence files to syncLogger..."
migrate_file "$BASE_DIR/Core/Sync/SyncManager.swift" "syncLogger"
migrate_file "$BASE_DIR/Core/Sync/OfflineQueueManager.swift" "syncLogger"
migrate_file "$BASE_DIR/Core/Sync/ConflictResolver.swift" "syncLogger"
migrate_file "$BASE_DIR/Core/Persistence/PersistenceController.swift" "syncLogger"
migrate_file "$BASE_DIR/Core/Persistence/CacheService.swift" "syncLogger"
migrate_file "$BASE_DIR/Core/Persistence/Repositories/ConversationRepository.swift" "syncLogger"
migrate_file "$BASE_DIR/Core/Persistence/Repositories/UserRepository.swift" "syncLogger"

# Migrate Notification/Profile files to logger (main logger)
echo ""
echo "🔔 Migrating Notification/Profile files to logger..."
migrate_file "$BASE_DIR/Features/Notifications/Managers/NotificationManager.swift" "logger"
migrate_file "$BASE_DIR/Features/Notifications/ViewModels/NotificationListViewModel.swift" "logger"
migrate_file "$BASE_DIR/Core/Extensions/AppDelegate+Notifications.swift" "logger"
migrate_file "$BASE_DIR/Features/Profile/ViewModels/ProfileViewModel.swift" "logger"
migrate_file "$BASE_DIR/Features/Profile/Services/UserService.swift" "logger"
migrate_file "$BASE_DIR/Features/Profile/Views/UserProfileView.swift" "logger"
migrate_file "$BASE_DIR/Features/Profile/Views/SettingsView.swift" "logger"

echo ""
echo "✨ Migration complete!"
echo ""
echo "📊 Summary:"
echo "  - Call files: 4 → callLogger"
echo "  - Chat files: 6 → chatLogger"
echo "  - Auth files: 3 → authLogger"
echo "  - Network files: 2 → wsLogger/apiLogger"
echo "  - Sync files: 7 → syncLogger"
echo "  - Other files: 7 → logger"
echo ""
echo "💾 Backups created with .bak extension"
echo "🔍 Review changes and remove .bak files when satisfied"
