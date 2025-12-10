#!/bin/bash

# Script pour supprimer/conditionner tous les console.log en production
# Usage: ./remove-console-logs.sh

echo "🧹 Nettoyage des console.log dans le frontend..."

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Compteur
TOTAL_FILES=0
TOTAL_LOGS=0

# Fichiers à exclure
EXCLUDE_PATTERNS=(
  "node_modules"
  ".next"
  "dist"
  "build"
  "*.test.ts"
  "*.test.tsx"
  "*.spec.ts"
  "*.spec.tsx"
  "scripts/"
  "*.sh"
  "*.md"
  "*.js" # JavaScript plain (gardé pour compatibilité)
)

# Construire les exclusions pour find
FIND_EXCLUDES=""
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
  FIND_EXCLUDES="$FIND_EXCLUDES -not -path '*/$pattern/*'"
done

# Chercher tous les fichiers TypeScript/TSX
FILES=$(find ../. -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -not -path "*/scripts/*" \
  -not -name "*.test.*" \
  -not -name "*.spec.*")

echo -e "${YELLOW}Analyse des fichiers...${NC}"

for file in $FILES; do
  # Compter les console.log dans le fichier
  COUNT=$(grep -c "console\.log" "$file" 2>/dev/null || echo "0")
  
  if [ "$COUNT" -gt 0 ]; then
    echo -e "${RED}  📝 $file: $COUNT console.log trouvés${NC}"
    TOTAL_FILES=$((TOTAL_FILES + 1))
    TOTAL_LOGS=$((TOTAL_LOGS + COUNT))
  fi
done

echo ""
echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${RED}📊 Total: $TOTAL_LOGS console.log dans $TOTAL_FILES fichiers${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo ""

if [ "$TOTAL_LOGS" -gt 0 ]; then
  echo -e "${YELLOW}💡 Recommandations:${NC}"
  echo "  1. Utiliser le logger centralisé: import { logger } from '@/utils/logger'"
  echo "  2. Conditionner avec: if (process.env.NODE_ENV === 'development') { ... }"
  echo "  3. Garder uniquement console.error pour les erreurs critiques"
  echo ""
  echo -e "${GREEN}📖 Documentation: docs/OPTIMIZE_LOGS_REDUCTION.md${NC}"
else
  echo -e "${GREEN}✅ Aucun console.log trouvé! Objectif 0 log atteint!${NC}"
fi

