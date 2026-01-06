#!/bin/bash

# Add API Integration Layer files to Xcode project
echo "Adding API Integration Layer files to Xcode..."

# Open the project and add files
# We'll use xed to add files to the project

# API files
API_FILES=(
    "Meeshy/API/Auth/AuthenticationManager.swift"
    "Meeshy/API/Auth/KeychainManager.swift"
    "Meeshy/API/Core/APIClient.swift"
    "Meeshy/API/Core/NetworkMonitor.swift"
    "Meeshy/API/Core/RequestLogger.swift"
    "Meeshy/API/Endpoints/APIService.swift"
    "Meeshy/API/Endpoints/AttachmentEndpoints.swift"
    "Meeshy/API/Endpoints/AuthEndpoints.swift"
    "Meeshy/API/Endpoints/ConversationEndpoints.swift"
    "Meeshy/API/Endpoints/MessageEndpoints.swift"
    "Meeshy/API/Endpoints/NotificationEndpoints.swift"
    "Meeshy/API/Endpoints/UserEndpoints.swift"
    "Meeshy/API/Errors/MeeshyError.swift"
    "Meeshy/API/Storage/CacheManager.swift"
    "Meeshy/API/Storage/OfflineQueueManager.swift"
    "Meeshy/API/Utils/PerformanceOptimizer.swift"
    "Meeshy/API/WebSocket/WebSocketManager.swift"
)

# Model files
MODEL_FILES=(
    "Meeshy/Core/Models/AnonymousParticipant.swift"
    "Meeshy/Core/Models/CallSession.swift"
    "Meeshy/Core/Models/Community.swift"
    "Meeshy/Core/Models/ConversationShareLink.swift"
    "Meeshy/Core/Models/Mention.swift"
    "Meeshy/Core/Models/Reaction.swift"
    "Meeshy/Core/Models/Report.swift"
    "Meeshy/Core/Models/UserStats.swift"
)

# Open all files in Xcode (this will add them to the project if not already added)
for file in "${API_FILES[@]}" "${MODEL_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "Opening: $file"
        xed "$file"
    else
        echo "File not found: $file"
    fi
done

echo ""
echo "Files opened in Xcode. Please:"
echo "1. In Xcode, use File > Add Files to 'Meeshy'..."
echo "2. Select the Meeshy/API directory"
echo "3. Make sure 'Copy items if needed' is UNCHECKED"
echo "4. Make sure 'Create groups' is selected"
echo "5. Click 'Add'"
echo ""
echo "Then repeat for the new model files in Meeshy/Core/Models/"
