#!/bin/sh
# =============================================================================
# Meeshy Web - Runtime Environment Variable Injection
# =============================================================================
# This script replaces placeholder values in the built Next.js files
# with actual environment variable values at container startup.
# =============================================================================

set -e

echo "[Meeshy] Injecting runtime environment variables..."

# Define the directory containing the built files
NEXTJS_DIR="/app/.next"

# Function to replace a placeholder with an environment variable value
replace_placeholder() {
    local placeholder="$1"
    local env_var_name="$2"
    local default_value="$3"

    # Get the actual value from environment or use default
    eval "local actual_value=\${$env_var_name:-$default_value}"

    if [ -n "$actual_value" ]; then
        echo "[Meeshy] Setting $env_var_name = $actual_value"

        # Replace in all JS files (standalone server and static chunks)
        find /app -type f \( -name "*.js" -o -name "*.json" \) -exec \
            sed -i "s|$placeholder|$actual_value|g" {} + 2>/dev/null || true
    fi
}

# Replace all runtime placeholders
# If env var is not set, the placeholder stays and lib/config.ts will derive URL dynamically
replace_placeholder "__RUNTIME_BACKEND_URL__" "NEXT_PUBLIC_BACKEND_URL" ""
replace_placeholder "__RUNTIME_API_URL__" "NEXT_PUBLIC_API_URL" ""
replace_placeholder "__RUNTIME_WS_URL__" "NEXT_PUBLIC_WS_URL" ""
replace_placeholder "__RUNTIME_FRONTEND_URL__" "NEXT_PUBLIC_FRONTEND_URL" ""
replace_placeholder "__RUNTIME_TRANSLATION_URL__" "NEXT_PUBLIC_TRANSLATION_URL" ""
replace_placeholder "__RUNTIME_STATIC_URL__" "NEXT_PUBLIC_STATIC_URL" ""

# Firebase configuration (for push notifications)
replace_placeholder "__RUNTIME_FIREBASE_API_KEY__" "NEXT_PUBLIC_FIREBASE_API_KEY" ""
replace_placeholder "__RUNTIME_FIREBASE_AUTH_DOMAIN__" "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" ""
replace_placeholder "__RUNTIME_FIREBASE_PROJECT_ID__" "NEXT_PUBLIC_FIREBASE_PROJECT_ID" ""
replace_placeholder "__RUNTIME_FIREBASE_STORAGE_BUCKET__" "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET" ""
replace_placeholder "__RUNTIME_FIREBASE_MESSAGING_SENDER_ID__" "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID" ""
replace_placeholder "__RUNTIME_FIREBASE_APP_ID__" "NEXT_PUBLIC_FIREBASE_APP_ID" ""
replace_placeholder "__RUNTIME_FIREBASE_MEASUREMENT_ID__" "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID" ""
replace_placeholder "__RUNTIME_FIREBASE_VAPID_KEY__" "NEXT_PUBLIC_FIREBASE_VAPID_KEY" ""

echo "[Meeshy] Runtime environment injection complete!"
echo "[Meeshy] Starting Next.js server..."

# Execute the main command
exec "$@"
