#!/bin/bash

# Script d'analyse des fichiers non utilisés dans le projet Meeshy
# Ce script génère un rapport détaillé des fichiers potentiellement inutilisés

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_FILE="$PROJECT_ROOT/ANALYSE_FICHIERS_INUTILISES.md"

echo -e "${CYAN}🔍 Analyse des fichiers non utilisés - Projet Meeshy${NC}"
echo ""
echo -e "${BLUE}Génération du rapport: $REPORT_FILE${NC}"
echo ""

# Créer le rapport
cat > "$REPORT_FILE" << 'HEADER'
# Rapport d'Analyse - Fichiers Potentiellement Inutilisés

**Date de génération**: $(date)  
**Projet**: Meeshy  
**Version**: 0.6.30-alpha

---

## 📋 Résumé Exécutif

Ce rapport identifie les fichiers potentiellement inutilisés ou obsolètes dans le projet Meeshy.

---

## 🗂️ Fichiers de Test à la Racine

Les fichiers suivants sont des scripts de test situés à la racine du projet et pourraient être déplacés ou supprimés après validation:

HEADER

# Lister les fichiers de test JS
echo "### Fichiers JavaScript de test" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
cd "$PROJECT_ROOT"
find . -maxdepth 1 -name "test-*.js" -o -name "cleanup-*.js" -o -name "fix-*.js" | sort >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Lister les fichiers de test HTML
echo "### Fichiers HTML de test" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
find . -maxdepth 1 -name "test-*.html" 2>/dev/null | sort >> "$REPORT_FILE" || echo "Aucun fichier HTML de test trouvé" >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Scripts shell à la racine
echo "### Scripts Shell à la Racine" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "Ces scripts devraient probablement être dans le dossier /scripts/:" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
find . -maxdepth 1 -name "*.sh" 2>/dev/null | sort >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Analyse du Frontend
cat >> "$REPORT_FILE" << 'FRONTEND'

---

## 🎨 Frontend - Analyse

### Statistiques
FRONTEND

echo "" >> "$REPORT_FILE"
echo "- **Composants totaux**: $(find frontend/components -type f \( -name "*.tsx" -o -name "*.ts" \) 2>/dev/null | wc -l | tr -d ' ')" >> "$REPORT_FILE"
echo "- **Pages totales**: $(find frontend/app -type f -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')" >> "$REPORT_FILE"
echo "- **Hooks**: $(find frontend/hooks -type f -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')" >> "$REPORT_FILE"
echo "- **Services**: $(find frontend/services -type f -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')" >> "$REPORT_FILE"
echo "- **Stores**: $(find frontend/stores -type f \( -name "*.ts" -o -name "*.tsx" \) 2>/dev/null | wc -l | tr -d ' ')" >> "$REPORT_FILE"
echo "- **Utils**: $(find frontend/utils -type f -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Fichiers de log
cat >> "$REPORT_FILE" << 'LOGS'

### Fichiers de logs à ignorer par Git

LOGS

echo '```' >> "$REPORT_FILE"
find . -name "*.log" -type f 2>/dev/null | sort >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Analyse du Gateway
cat >> "$REPORT_FILE" << 'GATEWAY'

---

## 🌐 Gateway - Analyse

### Statistiques
GATEWAY

echo "" >> "$REPORT_FILE"
echo "- **Fichiers source**: $(find gateway/src -type f -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')" >> "$REPORT_FILE"
echo "- **Tests**: $(find gateway/__tests__ -type f -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Scripts de test dans Gateway
echo "### Scripts de test dans /gateway/" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
find gateway -maxdepth 1 -name "test-*.js" -o -name "test-*.ts" 2>/dev/null | sort >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Analyse du Translator
cat >> "$REPORT_FILE" << 'TRANSLATOR'

---

## 🔤 Translator - Analyse

### Statistiques
TRANSLATOR

echo "" >> "$REPORT_FILE"
echo "- **Fichiers Python**: $(find translator -type f -name "*.py" 2>/dev/null | wc -l | tr -d ' ')" >> "$REPORT_FILE"
echo "- **Scripts shell**: $(find translator -type f -name "*.sh" 2>/dev/null | wc -l | tr -d ' ')" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Dockerfiles multiples
cat >> "$REPORT_FILE" << 'DOCKER'

---

## 🐳 Configuration Docker

### Dockerfiles
DOCKER

echo '```' >> "$REPORT_FILE"
find . -maxdepth 2 -name "Dockerfile*" 2>/dev/null | sort >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### Docker Compose" >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
find . -maxdepth 1 -name "docker-compose*.yml" 2>/dev/null | sort >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Fichiers de configuration
cat >> "$REPORT_FILE" << 'CONFIG'

---

## ⚙️ Fichiers de Configuration

### Fichiers .env
CONFIG

echo '```' >> "$REPORT_FILE"
find . -maxdepth 2 -name "env.*" -o -name ".env*" 2>/dev/null | grep -v node_modules | sort >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# node_modules et caches
cat >> "$REPORT_FILE" << 'CACHE'

---

## 🗑️ Dossiers à Nettoyer (Safe to Delete)

### Cache et node_modules
CACHE

echo '```bash' >> "$REPORT_FILE"
echo "# Commandes de nettoyage recommandées:" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "# Nettoyer tous les node_modules" >> "$REPORT_FILE"
echo "find . -name 'node_modules' -type d -prune -exec rm -rf '{}' +" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "# Nettoyer les builds" >> "$REPORT_FILE"
echo "rm -rf frontend/.next" >> "$REPORT_FILE"
echo "rm -rf gateway/dist" >> "$REPORT_FILE"
echo "rm -rf gateway/cache" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "# Nettoyer les logs" >> "$REPORT_FILE"
echo "find . -name '*.log' -type f -delete" >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Recommandations
cat >> "$REPORT_FILE" << 'RECOMMENDATIONS'

---

## 📌 Recommandations

### 1. Fichiers de Test à Déplacer

**Action recommandée**: Déplacer les fichiers `test-*.js` de la racine vers `/scripts/testing/`

```bash
mkdir -p scripts/testing
mv test-*.js scripts/testing/
mv cleanup-*.js scripts/testing/
```

### 2. Scripts Shell à Organiser

**Action recommandée**: Déplacer les scripts shell de la racine vers `/scripts/maintenance/`

```bash
mkdir -p scripts/maintenance
mv fix-*.sh scripts/maintenance/
mv demo-*.sh scripts/maintenance/
```

### 3. Logs à Ignorer

**Action recommandée**: Vérifier que `.gitignore` contient:

```gitignore
# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Build outputs
.next
dist
build
cache

# Dependencies
node_modules
venv
__pycache__
```

### 4. Fichiers de Configuration

**Action recommandée**: S'assurer que tous les `.env` locaux sont ignorés et que seul `.env.example` est versionné.

### 5. Scripts de Développement

**Action recommandée**: Utiliser le nouveau script:
```bash
./scripts/meeshy.sh dev start
```

---

## ✅ Checklist de Nettoyage

- [ ] Déplacer les fichiers de test de la racine
- [ ] Déplacer les scripts shell de maintenance
- [ ] Nettoyer les `node_modules` inutilisés
- [ ] Nettoyer les fichiers de build (`.next`, `dist`, `cache`)
- [ ] Supprimer les fichiers `.log`
- [ ] Vérifier le `.gitignore`
- [ ] Supprimer les anciens Dockerfiles inutilisés
- [ ] Valider que tous les fichiers conservés sont nécessaires

---

## 🎯 Prochaines Étapes

1. **Réviser ce rapport** et valider les fichiers à supprimer
2. **Créer une sauvegarde** avant toute suppression
3. **Exécuter les commandes** de nettoyage une par une
4. **Tester le build** après chaque nettoyage majeur
5. **Mettre à jour** le `.gitignore` si nécessaire

---

**Rapport généré automatiquement par**: `scripts/analyze-unused-files.sh`
RECOMMENDATIONS

echo -e "${GREEN}✅ Rapport généré avec succès !${NC}"
echo ""
echo -e "${CYAN}📄 Voir le rapport: ${REPORT_FILE}${NC}"
echo ""
echo -e "${YELLOW}💡 Pour voir le rapport:${NC}"
echo -e "   ${BLUE}cat ${REPORT_FILE}${NC}"
echo ""

