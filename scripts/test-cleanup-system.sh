#!/bin/bash

###############################################################################
# Script de test du système de nettoyage
#
# Ce script teste l'ensemble du système de nettoyage en mode dry-run
# pour valider que tout fonctionne correctement.
#
# Usage:
#   bash scripts/test-cleanup-system.sh
###############################################################################

set -euo pipefail

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Vérification des prérequis
print_header "🔍 VÉRIFICATION DES PRÉREQUIS"
echo ""

MISSING_TOOLS=0

if ! command -v mongosh &> /dev/null; then
    print_error "mongosh n'est pas installé"
    echo "  Installation: brew install mongosh (macOS) ou apt-get install mongodb-mongosh (Linux)"
    MISSING_TOOLS=1
else
    print_success "mongosh installé: $(mongosh --version | head -1)"
fi

if ! command -v jq &> /dev/null; then
    print_error "jq n'est pas installé"
    echo "  Installation: brew install jq (macOS) ou apt-get install jq (Linux)"
    MISSING_TOOLS=1
else
    print_success "jq installé: $(jq --version)"
fi

if [ $MISSING_TOOLS -eq 1 ]; then
    echo ""
    print_error "Des outils manquent. Installez-les avant de continuer."
    exit 1
fi

echo ""

# Vérification de MongoDB
print_header "🗄️  VÉRIFICATION DE MONGODB"
echo ""

if ! mongosh mongodb://localhost:27017/meeshy --quiet --eval "db.stats()" &> /dev/null; then
    print_error "Impossible de se connecter à MongoDB"
    echo "  Vérifiez que MongoDB est démarré et accessible sur mongodb://localhost:27017/meeshy"
    exit 1
fi

print_success "Connexion MongoDB OK"

# Vérifier l'existence des collections
ATTACHMENTS_COUNT=$(mongosh mongodb://localhost:27017/meeshy --quiet --eval "db.MessageAttachment.countDocuments({})")
MESSAGES_COUNT=$(mongosh mongodb://localhost:27017/meeshy --quiet --eval "db.Message.countDocuments({})")

print_info "Messages: $MESSAGES_COUNT"
print_info "Attachements: $ATTACHMENTS_COUNT"
echo ""

# Vérification du dossier uploads
print_header "📁 VÉRIFICATION DU DOSSIER UPLOADS"
echo ""

UPLOADS_DIR="./gateway/uploads/attachments"

if [ ! -d "$UPLOADS_DIR" ]; then
    print_error "Dossier uploads introuvable: $UPLOADS_DIR"
    exit 1
fi

FILES_COUNT=$(find "$UPLOADS_DIR" -type f | wc -l | tr -d ' ')
UPLOADS_SIZE=$(du -sh "$UPLOADS_DIR" | cut -f1)

print_success "Dossier uploads trouvé"
print_info "Fichiers: $FILES_COUNT"
print_info "Taille: $UPLOADS_SIZE"
echo ""

# Test 1: Export des chemins
print_header "📊 TEST 1: EXPORT DES CHEMINS D'ATTACHEMENTS"
echo ""

print_info "Exécution de export-attachment-paths.js..."
if mongosh mongodb://localhost:27017/meeshy --quiet --file scripts/export-attachment-paths.js > attachment-export.json 2>&1; then
    print_success "Export réussi"

    # Vérifier que le fichier contient du JSON valide
    if jq empty attachment-export.json 2>/dev/null; then
        print_success "JSON valide"

        # Extraire des statistiques
        TOTAL_PATHS=$(jq -r '.stats.totalUniquePaths' attachment-export.json)
        ORPHAN_ATTACHMENTS=$(jq -r '.stats.orphanAttachments' attachment-export.json)
        VALID_ATTACHMENTS=$(jq -r '.stats.validAttachments' attachment-export.json)

        print_info "Chemins uniques: $TOTAL_PATHS"
        print_info "Attachements valides: $VALID_ATTACHMENTS"
        print_info "Attachements orphelins: $ORPHAN_ATTACHMENTS"
    else
        print_error "Le JSON généré n'est pas valide"
        exit 1
    fi
else
    print_error "Échec de l'export"
    exit 1
fi
echo ""

# Test 2: Extraction des chemins
print_header "📋 TEST 2: EXTRACTION DES CHEMINS"
echo ""

print_info "Extraction des chemins avec jq..."
if cat attachment-export.json | jq -r '.paths.all[]' > valid-paths.txt 2>&1; then
    print_success "Extraction réussie"

    VALID_PATHS_COUNT=$(wc -l < valid-paths.txt | tr -d ' ')
    print_info "Chemins extraits: $VALID_PATHS_COUNT"

    # Afficher quelques exemples
    echo ""
    print_info "Exemples de chemins (5 premiers):"
    head -5 valid-paths.txt | nl -w2 -s'. '
else
    print_error "Échec de l'extraction"
    exit 1
fi
echo ""

# Test 3: Analyse des fichiers orphelins
print_header "🗑️  TEST 3: ANALYSE DES FICHIERS ORPHELINS (DRY-RUN)"
echo ""

print_info "Exécution de cleanup-orphan-files.sh en mode dry-run..."
if bash scripts/cleanup-orphan-files.sh valid-paths.txt > cleanup-files-dryrun.log 2>&1; then
    print_success "Analyse réussie"

    # Extraire des statistiques du log
    if grep -q "Fichiers orphelins:" cleanup-files-dryrun.log; then
        ORPHAN_FILES=$(grep "Fichiers orphelins:" cleanup-files-dryrun.log | awk '{print $4}')
        ORPHAN_SIZE=$(grep "Espace disque orphelin:" cleanup-files-dryrun.log | awk '{print $5, $6}')

        print_info "Fichiers orphelins: $ORPHAN_FILES"
        print_info "Espace récupérable: $ORPHAN_SIZE"
    fi

    # Afficher un extrait du rapport
    echo ""
    print_info "Extrait du rapport (dernières lignes):"
    tail -15 cleanup-files-dryrun.log | sed 's/^/  /'
else
    print_error "Échec de l'analyse"
    cat cleanup-files-dryrun.log
    exit 1
fi
echo ""

# Test 4: Analyse des attachements orphelins
print_header "🗄️  TEST 4: ANALYSE DES ATTACHEMENTS ORPHELINS EN DB (DRY-RUN)"
echo ""

print_info "Exécution de cleanup-orphan-attachments.js en mode dry-run..."
if mongosh mongodb://localhost:27017/meeshy --quiet --file scripts/cleanup-orphan-attachments.js > cleanup-db-dryrun.log 2>&1; then
    print_success "Analyse réussie"

    # Extraire des statistiques
    if grep -q "Attachements orphelins:" cleanup-db-dryrun.log; then
        DB_ORPHANS=$(grep "Attachements orphelins:" cleanup-db-dryrun.log | awk '{print $4}')
        print_info "Attachements orphelins en DB: $DB_ORPHANS"
    fi

    # Afficher un extrait du rapport
    echo ""
    print_info "Extrait du rapport (dernières lignes):"
    tail -15 cleanup-db-dryrun.log | sed 's/^/  /'
else
    print_error "Échec de l'analyse"
    cat cleanup-db-dryrun.log
    exit 1
fi
echo ""

# Résumé final
print_header "✨ RÉSUMÉ DES TESTS"
echo ""

print_success "Tous les tests sont passés avec succès!"
echo ""

echo "📊 Statistiques globales:"
echo "  • Messages en DB: $MESSAGES_COUNT"
echo "  • Attachements en DB: $ATTACHMENTS_COUNT"
echo "  • Attachements valides: $VALID_ATTACHMENTS"
echo "  • Attachements orphelins (DB): $ORPHAN_ATTACHMENTS"
echo "  • Fichiers sur disque: $FILES_COUNT"
echo "  • Fichiers orphelins (disque): ${ORPHAN_FILES:-0}"
echo "  • Espace uploads: $UPLOADS_SIZE"
echo "  • Espace récupérable: ${ORPHAN_SIZE:-0 B}"
echo ""

print_info "Fichiers générés:"
echo "  • attachment-export.json - Export complet des données"
echo "  • valid-paths.txt - Liste des chemins valides"
echo "  • cleanup-files-dryrun.log - Rapport d'analyse des fichiers"
echo "  • cleanup-db-dryrun.log - Rapport d'analyse de la DB"
echo ""

if [ "${ORPHAN_FILES:-0}" -gt 0 ] || [ "${ORPHAN_ATTACHMENTS:-0}" -gt 0 ]; then
    print_header "⚠️  ACTIONS RECOMMANDÉES"
    echo ""

    if [ "${ORPHAN_FILES:-0}" -gt 0 ]; then
        echo "🗑️  Pour supprimer les fichiers orphelins:"
        echo "   bash scripts/cleanup-orphan-files.sh valid-paths.txt --delete"
        echo ""
    fi

    if [ "${ORPHAN_ATTACHMENTS:-0}" -gt 0 ]; then
        echo "🗄️  Pour supprimer les attachements orphelins en DB:"
        echo "   mongosh mongodb://localhost:27017/meeshy --eval \"var CONFIRM_DELETE=true\" --file scripts/cleanup-orphan-attachments.js"
        echo ""
    fi
else
    print_success "Aucun nettoyage nécessaire! Votre installation est propre."
fi

print_header "✅ TEST TERMINÉ"
echo ""

# Nettoyage optionnel
read -p "Supprimer les fichiers de test générés? [y/N] " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -f attachment-export.json valid-paths.txt cleanup-files-dryrun.log cleanup-db-dryrun.log
    print_success "Fichiers de test supprimés"
fi

echo ""
print_info "Pour plus d'informations, consultez scripts/CLEANUP-README.md"
