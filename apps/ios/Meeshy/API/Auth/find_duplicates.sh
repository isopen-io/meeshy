#!/bin/bash

# Find Duplicate Models Script
# This script helps you find duplicate type definitions in your Swift project

echo "🔍 Searching for Duplicate Type Definitions..."
echo "================================================"
echo ""

# Function to search for a type and count occurrences
search_type() {
    local type_name=$1
    local search_pattern=$2
    
    echo "Searching for: $type_name"
    echo "----------------------------------------"
    
    # Find all occurrences
    results=$(grep -r "$search_pattern" --include="*.swift" . 2>/dev/null | grep -v "BUILD_FIX_SUMMARY\|FIX_INSTRUCTIONS\|FINAL_FIX_REPORT\|PROJECT_CLEANUP_GUIDE")
    
    if [ -z "$results" ]; then
        echo "✅ Not found (okay if not needed)"
    else
        count=$(echo "$results" | wc -l | tr -d ' ')
        if [ "$count" -eq 1 ]; then
            echo "✅ Found 1 definition (GOOD)"
            echo "$results"
        else
            echo "❌ Found $count definitions (DUPLICATE - FIX NEEDED!)"
            echo "$results"
        fi
    fi
    echo ""
}

# Auth Models
echo "=== Authentication Models ==="
search_type "LoginRequest" "struct LoginRequest"
search_type "RegisterRequest" "struct RegisterRequest"
search_type "AuthResponse" "struct AuthResponse"
search_type "RefreshTokenRequest" "struct RefreshTokenRequest"
search_type "LogoutRequest" "struct LogoutRequest"
search_type "TwoFactorVerifyRequest" "struct TwoFactorVerifyRequest"
search_type "TwoFactorSetupResponse" "struct TwoFactorSetupResponse"
search_type "EmptyResponse" "struct EmptyResponse"

echo ""
echo "=== User Models ==="
search_type "User" "struct User.*Codable"
search_type "UserRole" "enum UserRole"

echo ""
echo "=== Translation Models ==="
search_type "Language" "enum Language.*String.*Codable"
search_type "TranslationQuality" "enum TranslationQuality"
search_type "Translation" "struct Translation.*Codable"
search_type "CachedTranslation" "struct CachedTranslation"

echo ""
echo "=== Conversation Models ==="
search_type "ConversationType" "enum ConversationType"
search_type "ConversationMemberRole" "enum ConversationMemberRole"
search_type "Conversation" "struct Conversation.*Codable"
search_type "ConversationMember" "struct ConversationMember"

echo ""
echo "=== Message Models ==="
search_type "Message" "struct Message.*Codable"
search_type "MessageStatus" "enum MessageStatus"
search_type "MessageType" "enum MessageType"
search_type "MessageAttachment" "struct MessageAttachment"

echo ""
echo "=== Notification Models ==="
search_type "MeeshyNotification" "struct MeeshyNotification"
search_type "NotificationType" "enum NotificationType"

echo ""
echo "=== Call Models ==="
search_type "CallSession" "struct CallSession"
search_type "CallParticipant" "struct CallParticipant"
search_type "CallStatus" "enum CallStatus"
search_type "ConnectionQuality" "enum ConnectionQuality"

echo ""
echo "=== Logging Models ==="
search_type "LogLevel" "enum LogLevel"
search_type "LogEntry" "struct LogEntry"

echo ""
echo "=== Security Models ==="
search_type "SecurityEvent" "struct SecurityEvent"
search_type "SecurityEventType" "enum SecurityEventType"

echo ""
echo "=== Shared Models ==="
search_type "AnyCodable" "struct AnyCodable"

echo ""
echo "================================================"
echo "✅ = Good (single definition or not found)"
echo "❌ = Bad (duplicate definitions found)"
echo ""
echo "Next Steps:"
echo "1. For each ❌ duplicate, choose which file to KEEP"
echo "2. Delete the duplicate files from Xcode"
echo "3. Clean build folder (Cmd+Shift+K)"
echo "4. Build (Cmd+B)"
echo "================================================"
