#!/bin/bash

# 🎯 Script Git pour commiter le nettoyage des hooks
# Ce script crée un commit propre avec tous les changements

set -e

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}🎯 GIT COMMIT - NETTOYAGE DES HOOKS${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo ""

# Vérifier qu'on est dans le bon répertoire
cd /Users/smpceo/Documents/Services/Meeshy/meeshy/frontend

echo -e "${BLUE}📊 État actuel du repository:${NC}"
echo ""
git status --short
echo ""

# Demander confirmation
echo -e "${YELLOW}Voulez-vous commiter ces changements? [y/N]${NC}"
read -r response

if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}❌ Opération annulée${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}📝 Ajout des fichiers modifiés...${NC}"

# Ajouter les hooks modifiés et supprimés
git add hooks/

# Ajouter les scripts d'analyse
git add scripts/analyze-hooks-detailed.ts

# Ajouter les rapports de documentation
git add docs/HOOKS_DETAILED_ANALYSIS.md
git add docs/HOOKS_CLEANUP_REPORT.md
git add docs/HOOKS_CLEANUP_SUMMARY.md
git add docs/GIT_STATUS_CLEANUP.md

echo -e "${GREEN}✅ Fichiers ajoutés${NC}"
echo ""

# Créer le commit avec un message détaillé
echo -e "${BLUE}💾 Création du commit...${NC}"

git commit -m "🧹 Clean: Remove unused hooks and functions

## Summary
- Remove 2 completely unused hooks
- Remove 4 unused functions from existing hooks
- Achieve 100% hooks utilization rate (up from 75%)
- Remove ~150 lines of dead code

## Changes

### Deleted Files (2)
- hooks/use-advanced-message-loader.ts (0 calls)
- hooks/use-message-loader.ts (0 calls)

### Cleaned Files (2)
- hooks/compatibility-hooks.ts
  - Removed: useAppContext(), useConversation(), useTranslationCache()
  - Kept: useUser() (23 calls), useLanguage() (2 calls)
  - Result: 40% → 100% utilization

- hooks/use-translation-performance.ts
  - Removed: useTranslationBatch()
  - Kept: useTranslationPerformance() (1 call)
  - Result: 50% → 100% utilization

### New Files (4)
- scripts/analyze-hooks-detailed.ts - Advanced hook analysis script
- docs/HOOKS_DETAILED_ANALYSIS.md - Detailed analysis report
- docs/HOOKS_CLEANUP_REPORT.md - Cleanup report
- docs/HOOKS_CLEANUP_SUMMARY.md - Executive summary
- docs/GIT_STATUS_CLEANUP.md - Git status documentation

## Metrics
- Hooks before: 16 (75% utilization)
- Hooks after: 14 (100% utilization)
- Code removed: ~150 lines
- Files deleted: 2
- Functions removed: 4

## Validation
- ✅ TypeScript compilation: OK
- ✅ All hooks: 100% used
- ✅ No regressions detected

Co-authored-by: GitHub Copilot <copilot@github.com>"

echo ""
echo -e "${GREEN}✅ Commit créé avec succès !${NC}"
echo ""

# Afficher le commit
echo -e "${BLUE}📋 Détails du commit:${NC}"
echo ""
git log -1 --stat
echo ""

echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}🎉 COMMIT CRÉÉ AVEC SUCCÈS !${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${BLUE}Prochaines étapes:${NC}"
echo ""
echo -e "${GREEN}1. Vérifier le commit:${NC}"
echo -e "   ${CYAN}git show${NC}"
echo ""
echo -e "${GREEN}2. Pousser vers GitHub:${NC}"
echo -e "   ${CYAN}git push origin feature/selective-improvements${NC}"
echo ""
echo -e "${GREEN}3. Créer une Pull Request${NC}"
echo ""
