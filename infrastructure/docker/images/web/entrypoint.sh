#!/bin/sh
# =============================================================================
# MEESHY WEB - Runtime Environment Variable Injection
# =============================================================================
# This script replaces placeholder URLs in the built Next.js bundle with
# values from runtime environment variables.
#
# This allows the same Docker image to work in different environments
# without rebuilding.
#
# Compatible with BusyBox (Alpine) - uses find+grep instead of grep --include
# =============================================================================

set -e

# Placeholder values used during build (unique identifiers)
PLACEHOLDER_API_URL="__MEESHY_API_URL__"
PLACEHOLDER_WS_URL="__MEESHY_WS_URL__"
PLACEHOLDER_BACKEND_URL="__MEESHY_BACKEND_URL__"
PLACEHOLDER_FRONTEND_URL="__MEESHY_FRONTEND_URL__"
PLACEHOLDER_TRANSLATION_URL="__MEESHY_TRANSLATION_URL__"
PLACEHOLDER_STATIC_URL="__MEESHY_STATIC_URL__"

# Default production values (fallback if env vars not set)
DEFAULT_API_URL="https://gate.meeshy.me"
DEFAULT_WS_URL="wss://gate.meeshy.me"
DEFAULT_BACKEND_URL="https://gate.meeshy.me"
DEFAULT_FRONTEND_URL="https://meeshy.me"
DEFAULT_TRANSLATION_URL="https://ml.meeshy.me"
DEFAULT_STATIC_URL="https://static.meeshy.me"

# Runtime values from environment (with defaults)
RUNTIME_API_URL="${NEXT_PUBLIC_API_URL:-$DEFAULT_API_URL}"
RUNTIME_WS_URL="${NEXT_PUBLIC_WS_URL:-$DEFAULT_WS_URL}"
RUNTIME_BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-$DEFAULT_BACKEND_URL}"
RUNTIME_FRONTEND_URL="${NEXT_PUBLIC_FRONTEND_URL:-$DEFAULT_FRONTEND_URL}"
RUNTIME_TRANSLATION_URL="${NEXT_PUBLIC_TRANSLATION_URL:-$DEFAULT_TRANSLATION_URL}"
RUNTIME_STATIC_URL="${NEXT_PUBLIC_STATIC_URL:-$DEFAULT_STATIC_URL}"

echo "=== Meeshy Web - Runtime Environment Variable Injection ==="
echo "API URL:         $RUNTIME_API_URL"
echo "WebSocket URL:   $RUNTIME_WS_URL"
echo "Backend URL:     $RUNTIME_BACKEND_URL"
echo "Frontend URL:    $RUNTIME_FRONTEND_URL"
echo "Translation URL: $RUNTIME_TRANSLATION_URL"
echo "Static URL:      $RUNTIME_STATIC_URL"

# Function to count occurrences (BusyBox compatible)
count_occurrences() {
    pattern="$1"
    # Use find + xargs + grep for BusyBox compatibility
    find .next -type f \( -name "*.js" -o -name "*.json" \) -print0 2>/dev/null | \
        xargs -0 grep -l "$pattern" 2>/dev/null | wc -l || echo "0"
}

# Function to replace a placeholder with runtime value
replace_placeholder() {
    placeholder="$1"
    runtime_value="$2"
    label="$3"

    if [ -d ".next" ]; then
        # Count occurrences before replacement (BusyBox compatible)
        count_before=$(count_occurrences "$placeholder")

        if [ "$count_before" -gt 0 ]; then
            echo "  Replacing $label: $count_before files"

            # Use find + sed for reliable replacement
            find .next -type f \( -name "*.js" -o -name "*.json" \) -exec \
                sed -i "s|${placeholder}|${runtime_value}|g" {} \; 2>/dev/null || true

            # Verify replacement
            count_after=$(count_occurrences "$placeholder")

            if [ "$count_after" -eq 0 ]; then
                echo "    ✅ Success: All occurrences replaced"
            else
                echo "    ⚠️  Warning: $count_after files still contain placeholder"
            fi
        else
            echo "  Skipping $label: No occurrences found"
        fi
    fi
}

# Check if .next directory exists
if [ ! -d ".next" ]; then
    echo "⚠️  Warning: .next directory not found, skipping URL replacements"
    exec "$@"
fi

echo "=== Performing URL replacements in JavaScript bundles ==="

# Replace all placeholders with runtime values
replace_placeholder "$PLACEHOLDER_API_URL" "$RUNTIME_API_URL" "API URL"
replace_placeholder "$PLACEHOLDER_WS_URL" "$RUNTIME_WS_URL" "WebSocket URL"
replace_placeholder "$PLACEHOLDER_BACKEND_URL" "$RUNTIME_BACKEND_URL" "Backend URL"
replace_placeholder "$PLACEHOLDER_FRONTEND_URL" "$RUNTIME_FRONTEND_URL" "Frontend URL"
replace_placeholder "$PLACEHOLDER_TRANSLATION_URL" "$RUNTIME_TRANSLATION_URL" "Translation URL"
replace_placeholder "$PLACEHOLDER_STATIC_URL" "$RUNTIME_STATIC_URL" "Static URL"

# Count remaining placeholders for verification (BusyBox compatible)
REMAINING=$(count_occurrences "__MEESHY_")

echo ""
if [ "$REMAINING" -gt 0 ]; then
    echo "⚠️  Warning: $REMAINING files still contain unreplaced placeholders"
    echo "    This may indicate missing environment variables"
else
    echo "✅ All placeholders replaced successfully"
fi

echo ""
echo "=== Starting Next.js server ==="

# Execute the main command (node server.js)
exec "$@"
