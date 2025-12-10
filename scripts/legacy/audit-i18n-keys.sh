#!/bin/bash

# Script to audit all i18n keys usage across the frontend
# This will create a comprehensive mapping of namespaces to keys

OUTPUT_FILE="I18N_AUDIT_KEYS.md"
cd "$(dirname "$0")/.."

echo "# I18n Keys Audit Report" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "Generated: $(date)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Function to extract keys from a file
extract_keys() {
    local file=$1
    local namespace=$(grep -o "useTranslations(['\"][^'\"]*['\"])" "$file" | sed "s/useTranslations(['\"]//g" | sed "s/['\"])//g" | sort -u)
    
    if [ -n "$namespace" ]; then
        echo "## File: $file"
        echo ""
        echo "**Namespaces used:**"
        echo "\`\`\`"
        echo "$namespace"
        echo "\`\`\`"
        echo ""
        echo "**Translation keys:**"
        echo "\`\`\`"
        # Extract t('key') and t("key") patterns
        grep -o "t(['\"][^'\"]*['\"])" "$file" | sed "s/t(['\"]//g" | sed "s/['\"])//g" | sort -u
        # Also extract tArray and other variants
        grep -o "tArray(['\"][^'\"]*['\"])" "$file" | sed "s/tArray(['\"]//g" | sed "s/['\"])//g" | sort -u | sed 's/^/[ARRAY] /'
        echo "\`\`\`"
        echo ""
    fi
}

# Find all files using useTranslations
FILES=$(find frontend/app frontend/components frontend/hooks -type f \( -name "*.tsx" -o -name "*.ts" \) -exec grep -l "useTranslations" {} \;)

for file in $FILES; do
    extract_keys "$file" >> "$OUTPUT_FILE"
done

echo "Audit complete! Report saved to: $OUTPUT_FILE"
echo ""
echo "Summary:"
echo "- Total files audited: $(echo "$FILES" | wc -l)"
echo "- Namespaces found: $(grep "useTranslations" frontend/app frontend/components frontend/hooks -r 2>/dev/null | grep -o "useTranslations(['\"][^'\"]*['\"])" | sed "s/useTranslations(['\"]//g" | sed "s/['\"])//g" | sort -u | wc -l)"

