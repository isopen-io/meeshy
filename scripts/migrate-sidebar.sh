#!/bin/bash

# Migration script for ConversationDetailsSidebar refactoring
# This script updates all imports to use the refactored version

set -e

echo "🚀 Starting ConversationDetailsSidebar migration..."
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Backup original files
echo "📦 Creating backup..."
BACKUP_DIR="backup_sidebar_migration_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

FILES_TO_UPDATE=(
  "apps/web/components/conversations/ConversationLayout.tsx"
  "apps/web/components/conversations/index.ts"
  "apps/web/lib/lazy-components.tsx"
)

for file in "${FILES_TO_UPDATE[@]}"; do
  if [ -f "$file" ]; then
    cp "$file" "$BACKUP_DIR/"
    echo "  ✓ Backed up $file"
  fi
done

echo ""
echo "📝 Updating imports..."

# Function to update imports in a file
update_imports() {
  local file=$1

  if [ ! -f "$file" ]; then
    echo -e "  ${YELLOW}⚠ File not found: $file${NC}"
    return
  fi

  # Check if file contains the old import
  if grep -q "conversation-details-sidebar" "$file"; then
    # Update the import
    if [[ "$OSTYPE" == "darwin"* ]]; then
      # macOS
      sed -i '' "s|from './conversation-details-sidebar'|from './ConversationDetailsSidebarRefactored'|g" "$file"
      sed -i '' "s|from '@/components/conversations/conversation-details-sidebar'|from '@/components/conversations/ConversationDetailsSidebarRefactored'|g" "$file"
    else
      # Linux
      sed -i "s|from './conversation-details-sidebar'|from './ConversationDetailsSidebarRefactored'|g" "$file"
      sed -i "s|from '@/components/conversations/conversation-details-sidebar'|from '@/components/conversations/ConversationDetailsSidebarRefactored'|g" "$file"
    fi
    echo -e "  ${GREEN}✓ Updated $file${NC}"
  else
    echo -e "  ${YELLOW}⊘ No changes needed for $file${NC}"
  fi
}

# Update each file
for file in "${FILES_TO_UPDATE[@]}"; do
  update_imports "$file"
done

echo ""
echo "🧪 Running tests..."

# Run tests
if npm test -- --passWithNoTests conversation-details 2>/dev/null; then
  echo -e "${GREEN}✓ Tests passed${NC}"
else
  echo -e "${RED}✗ Tests failed. Rolling back changes...${NC}"

  # Rollback
  for file in "${FILES_TO_UPDATE[@]}"; do
    if [ -f "$BACKUP_DIR/$(basename $file)" ]; then
      cp "$BACKUP_DIR/$(basename $file)" "$file"
      echo "  ✓ Restored $file"
    fi
  done

  echo -e "${RED}Migration aborted. Original files restored.${NC}"
  exit 1
fi

echo ""
echo "🎉 Migration completed successfully!"
echo ""
echo "Backup location: $BACKUP_DIR"
echo ""
echo "Next steps:"
echo "  1. Test the application manually"
echo "  2. Run e2e tests: npm run test:e2e"
echo "  3. If everything works, delete backup: rm -rf $BACKUP_DIR"
echo "  4. Consider deprecating the original file"
echo ""
echo "To rollback:"
echo "  cp $BACKUP_DIR/* apps/web/components/conversations/"
