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
replace_placeholder "__RUNTIME_API_URL__" "NEXT_PUBLIC_API_URL" "https://gate.meeshy.me"
replace_placeholder "__RUNTIME_WS_URL__" "NEXT_PUBLIC_WS_URL" "wss://gate.meeshy.me"
replace_placeholder "__RUNTIME_BACKEND_URL__" "NEXT_PUBLIC_BACKEND_URL" "https://gate.meeshy.me"
replace_placeholder "__RUNTIME_FRONTEND_URL__" "NEXT_PUBLIC_FRONTEND_URL" "https://meeshy.me"
replace_placeholder "__RUNTIME_TRANSLATION_URL__" "NEXT_PUBLIC_TRANSLATION_URL" "https://ml.meeshy.me"
replace_placeholder "__RUNTIME_STATIC_URL__" "NEXT_PUBLIC_STATIC_URL" "https://static.meeshy.me"

echo "[Meeshy] Runtime environment injection complete!"
echo "[Meeshy] Starting Next.js server..."

# Execute the main command
exec "$@"
