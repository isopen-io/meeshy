#!/bin/sh
# =============================================================================
# MEESHY WEB - Runtime Environment Variable Injection
# =============================================================================
# This script replaces placeholder URLs in the built Next.js bundle with
# values from runtime environment variables.
#
# This allows the same Docker image to work in different environments
# without rebuilding.
# =============================================================================

set -e

# Default placeholder values (what was used during build)
DEFAULT_BACKEND_URL="https://gate.meeshy.me"
DEFAULT_WS_URL="wss://gate.meeshy.me"
DEFAULT_FRONTEND_URL="https://meeshy.me"
DEFAULT_TRANSLATION_URL="https://ml.meeshy.me"
DEFAULT_STATIC_URL="https://static.meeshy.me"
DEFAULT_API_URL="https://gate.meeshy.me"

# Target runtime values from environment variables
RUNTIME_BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-$DEFAULT_BACKEND_URL}"
RUNTIME_WS_URL="${NEXT_PUBLIC_WS_URL:-$DEFAULT_WS_URL}"
RUNTIME_FRONTEND_URL="${NEXT_PUBLIC_FRONTEND_URL:-$DEFAULT_FRONTEND_URL}"
RUNTIME_TRANSLATION_URL="${NEXT_PUBLIC_TRANSLATION_URL:-$DEFAULT_TRANSLATION_URL}"
RUNTIME_STATIC_URL="${NEXT_PUBLIC_STATIC_URL:-$DEFAULT_STATIC_URL}"
RUNTIME_API_URL="${NEXT_PUBLIC_API_URL:-$DEFAULT_API_URL}"

echo "=== Meeshy Web - Runtime Environment Variable Injection ==="
echo "Backend URL:     $RUNTIME_BACKEND_URL"
echo "WebSocket URL:   $RUNTIME_WS_URL"
echo "Frontend URL:    $RUNTIME_FRONTEND_URL"
echo "Translation URL: $RUNTIME_TRANSLATION_URL"
echo "Static URL:      $RUNTIME_STATIC_URL"
echo "API URL:         $RUNTIME_API_URL"

# Function to replace URLs in a file
replace_urls() {
    file="$1"

    # Only process if file exists
    if [ -f "$file" ]; then
        # Backend URL
        if [ "$RUNTIME_BACKEND_URL" != "$DEFAULT_BACKEND_URL" ]; then
            sed -i "s|$DEFAULT_BACKEND_URL|$RUNTIME_BACKEND_URL|g" "$file" 2>/dev/null || true
        fi

        # WebSocket URL
        if [ "$RUNTIME_WS_URL" != "$DEFAULT_WS_URL" ]; then
            sed -i "s|$DEFAULT_WS_URL|$RUNTIME_WS_URL|g" "$file" 2>/dev/null || true
        fi

        # Frontend URL
        if [ "$RUNTIME_FRONTEND_URL" != "$DEFAULT_FRONTEND_URL" ]; then
            sed -i "s|$DEFAULT_FRONTEND_URL|$RUNTIME_FRONTEND_URL|g" "$file" 2>/dev/null || true
        fi

        # Translation URL
        if [ "$RUNTIME_TRANSLATION_URL" != "$DEFAULT_TRANSLATION_URL" ]; then
            sed -i "s|$DEFAULT_TRANSLATION_URL|$RUNTIME_TRANSLATION_URL|g" "$file" 2>/dev/null || true
        fi

        # Static URL
        if [ "$RUNTIME_STATIC_URL" != "$DEFAULT_STATIC_URL" ]; then
            sed -i "s|$DEFAULT_STATIC_URL|$RUNTIME_STATIC_URL|g" "$file" 2>/dev/null || true
        fi

        # API URL (same as backend but explicit)
        if [ "$RUNTIME_API_URL" != "$DEFAULT_API_URL" ]; then
            sed -i "s|$DEFAULT_API_URL|$RUNTIME_API_URL|g" "$file" 2>/dev/null || true
        fi
    fi
}

# Check if we need to do any replacements
needs_replacement=false

if [ "$RUNTIME_BACKEND_URL" != "$DEFAULT_BACKEND_URL" ] || \
   [ "$RUNTIME_WS_URL" != "$DEFAULT_WS_URL" ] || \
   [ "$RUNTIME_FRONTEND_URL" != "$DEFAULT_FRONTEND_URL" ] || \
   [ "$RUNTIME_TRANSLATION_URL" != "$DEFAULT_TRANSLATION_URL" ] || \
   [ "$RUNTIME_STATIC_URL" != "$DEFAULT_STATIC_URL" ] || \
   [ "$RUNTIME_API_URL" != "$DEFAULT_API_URL" ]; then
    needs_replacement=true
fi

if [ "$needs_replacement" = true ]; then
    echo "=== Performing URL replacements in JavaScript bundles ==="

    # Replace in all JavaScript files in .next directory
    if [ -d ".next" ]; then
        find .next -type f \( -name "*.js" -o -name "*.json" \) | while read file; do
            replace_urls "$file"
        done
        echo "=== URL replacement complete ==="
    else
        echo "Warning: .next directory not found"
    fi
else
    echo "=== No URL replacements needed (using default production URLs) ==="
fi

# Execute the main command (node server.js)
exec "$@"
