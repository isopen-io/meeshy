#!/bin/bash

###############################################################################
# Script de nettoyage des fichiers orphelins dans le dossier uploads
#
# Ce script compare les fichiers présents dans le dossier uploads avec les
# chemins référencés dans la base de données et supprime les fichiers orphelins.
#
# ATTENTION: Cette opération est IRRÉVERSIBLE!
#
# Prérequis:
# 1. Exporter les chemins valides depuis MongoDB:
#    mongosh mongodb://localhost:27017/meeshy --quiet --file scripts/export-attachment-paths.js > attachment-export.json
#
# 2. Extraire les chemins dans un fichier texte:
#    cat attachment-export.json | jq -r '.paths.all[]' > valid-paths.txt
#
# Utilisation:
#   # Mode dry-run (affichage seulement)
#   bash scripts/cleanup-orphan-files.sh valid-paths.txt
#
#   # Mode suppression réelle
#   bash scripts/cleanup-orphan-files.sh valid-paths.txt --delete
#
###############################################################################

set -euo pipefail

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VALID_PATHS_FILE="${1:-}"
DELETE_MODE="${2:-}"
UPLOADS_DIR="./gateway/uploads/attachments"
TEMP_DIR="./tmp"

# Fonction d'affichage avec couleurs
print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Fonction pour formater la taille
format_size() {
    local size=$1
    if [ "$size" -lt 1024 ]; then
        echo "${size} B"
    elif [ "$size" -lt 1048576 ]; then
        echo "$(awk "BEGIN {printf \"%.2f\", $size/1024}") KB"
    elif [ "$size" -lt 1073741824 ]; then
        echo "$(awk "BEGIN {printf \"%.2f\", $size/1048576}") MB"
    else
        echo "$(awk "BEGIN {printf \"%.2f\", $size/1073741824}") GB"
    fi
}

# Vérification des arguments
if [ -z "$VALID_PATHS_FILE" ]; then
    print_error "Fichier de chemins valides non spécifié!"
    echo ""
    echo "Utilisation:"
    echo "  bash scripts/cleanup-orphan-files.sh valid-paths.txt [--delete]"
    echo ""
    echo "Étapes préalables:"
    echo "  1. mongosh mongodb://localhost:27017/meeshy --quiet --file scripts/export-attachment-paths.js > attachment-export.json"
    echo "  2. cat attachment-export.json | jq -r '.paths.all[]' > valid-paths.txt"
    echo "  3. bash scripts/cleanup-orphan-files.sh valid-paths.txt"
    exit 1
fi

if [ ! -f "$VALID_PATHS_FILE" ]; then
    print_error "Fichier $VALID_PATHS_FILE introuvable!"
    exit 1
fi

if [ ! -d "$UPLOADS_DIR" ]; then
    print_error "Dossier uploads introuvable: $UPLOADS_DIR"
    exit 1
fi

# Déterminer le mode
if [ "$DELETE_MODE" == "--delete" ] || [ "$DELETE_MODE" == "-d" ]; then
    DRY_RUN=false
    print_warning "MODE SUPPRESSION ACTIVÉ"
else
    DRY_RUN=true
    print_info "MODE DRY-RUN (aucune suppression)"
fi

echo ""
print_header "🧹 NETTOYAGE DES FICHIERS ORPHELINS"
echo ""

# Créer le dossier temporaire
mkdir -p "$TEMP_DIR"

# Fichiers temporaires
VALID_PATHS_NORMALIZED="$TEMP_DIR/valid-paths-normalized.txt"
ALL_FILES_LIST="$TEMP_DIR/all-files.txt"
ORPHAN_FILES_LIST="$TEMP_DIR/orphan-files.txt"

# Normaliser les chemins valides (enlever /api/attachments/file/ et /api/attachments/thumbnail/)
print_info "Normalisation des chemins de la base de données..."
sed -e 's|^/api/attachments/file/||' \
    -e 's|^/api/attachments/thumbnail/||' \
    "$VALID_PATHS_FILE" | sort -u > "$VALID_PATHS_NORMALIZED"

VALID_COUNT=$(wc -l < "$VALID_PATHS_NORMALIZED" | tr -d ' ')
print_success "Chemins valides: $VALID_COUNT"
echo ""

# Lister tous les fichiers dans uploads
print_info "Scan du dossier uploads..."
find "$UPLOADS_DIR" -type f | while read -r file; do
    # Extraire le chemin relatif (année/mois/userId/filename)
    relative_path="${file#$UPLOADS_DIR/}"
    echo "$relative_path"
done | sort > "$ALL_FILES_LIST"

TOTAL_FILES=$(wc -l < "$ALL_FILES_LIST" | tr -d ' ')
print_success "Fichiers trouvés: $TOTAL_FILES"
echo ""

# Trouver les fichiers orphelins (présents sur disque mais pas en DB)
print_info "Recherche des fichiers orphelins..."
comm -23 "$ALL_FILES_LIST" "$VALID_PATHS_NORMALIZED" > "$ORPHAN_FILES_LIST"

ORPHAN_COUNT=$(wc -l < "$ORPHAN_FILES_LIST" | tr -d ' ')

if [ "$ORPHAN_COUNT" -eq 0 ]; then
    print_success "Aucun fichier orphelin trouvé! Le dossier est propre."
    echo ""
    rm -rf "$TEMP_DIR"
    exit 0
fi

print_warning "Fichiers orphelins trouvés: $ORPHAN_COUNT"
echo ""

# Calculer la taille totale des fichiers orphelins
print_info "Calcul de l'espace disque..."
TOTAL_SIZE=0
while IFS= read -r relative_path; do
    full_path="$UPLOADS_DIR/$relative_path"
    if [ -f "$full_path" ]; then
        file_size=$(stat -f%z "$full_path" 2>/dev/null || stat -c%s "$full_path" 2>/dev/null || echo 0)
        TOTAL_SIZE=$((TOTAL_SIZE + file_size))
    fi
done < "$ORPHAN_FILES_LIST"

FORMATTED_SIZE=$(format_size "$TOTAL_SIZE")
echo ""

# Afficher les statistiques
print_header "📊 STATISTIQUES"
echo ""
echo "  📁 Dossier scannés: $UPLOADS_DIR"
echo "  📄 Total fichiers sur disque: $TOTAL_FILES"
echo "  ✅ Fichiers référencés en DB: $VALID_COUNT"
echo "  🗑️  Fichiers orphelins: $ORPHAN_COUNT"
echo "  💾 Espace disque orphelin: $FORMATTED_SIZE"
echo ""

# Grouper par type de fichier
print_header "📋 RÉPARTITION PAR EXTENSION"
echo ""
awk -F. '{if (NF>1) print $NF; else print "no-extension"}' "$ORPHAN_FILES_LIST" | \
    sort | uniq -c | sort -rn | head -20 | while read count ext; do
    echo "  .$ext: $count fichiers"
done
echo ""

# Afficher quelques exemples
print_header "📋 EXEMPLES DE FICHIERS ORPHELINS (10 premiers)"
echo ""
head -10 "$ORPHAN_FILES_LIST" | nl -w2 -s'. '
echo ""

if [ "$ORPHAN_COUNT" -gt 10 ]; then
    print_info "... et $(($ORPHAN_COUNT - 10)) autres fichiers"
    echo ""
fi

# Suppression ou dry-run
if [ "$DRY_RUN" = true ]; then
    print_header "💡 MODE DRY-RUN"
    echo ""
    print_warning "Aucune suppression n'a été effectuée."
    print_info "Ces $ORPHAN_COUNT fichiers orphelins occupent $FORMATTED_SIZE d'espace disque."
    echo ""
    print_info "Pour supprimer réellement ces fichiers, exécutez:"
    echo "  bash scripts/cleanup-orphan-files.sh $VALID_PATHS_FILE --delete"
    echo ""
else
    print_header "🔴 SUPPRESSION EN COURS"
    echo ""
    print_warning "ATTENTION: Cette opération est IRRÉVERSIBLE!"
    echo ""
    read -p "Êtes-vous sûr de vouloir supprimer $ORPHAN_COUNT fichiers ($FORMATTED_SIZE)? [y/N] " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Suppression annulée."
        rm -rf "$TEMP_DIR"
        exit 0
    fi

    echo ""
    print_info "Suppression des fichiers orphelins..."

    DELETED_COUNT=0
    ERROR_COUNT=0

    while IFS= read -r relative_path; do
        full_path="$UPLOADS_DIR/$relative_path"
        if [ -f "$full_path" ]; then
            if rm "$full_path" 2>/dev/null; then
                DELETED_COUNT=$((DELETED_COUNT + 1))
                if [ $((DELETED_COUNT % 100)) -eq 0 ]; then
                    echo "  Supprimés: $DELETED_COUNT/$ORPHAN_COUNT..."
                fi
            else
                ERROR_COUNT=$((ERROR_COUNT + 1))
                print_error "Impossible de supprimer: $relative_path"
            fi
        fi
    done < "$ORPHAN_FILES_LIST"

    echo ""
    print_header "✅ SUPPRESSION TERMINÉE"
    echo ""
    echo "  🗑️  Fichiers supprimés: $DELETED_COUNT"
    echo "  ❌ Erreurs: $ERROR_COUNT"
    echo "  💾 Espace libéré: $FORMATTED_SIZE"
    echo ""

    # Nettoyer les dossiers vides
    print_info "Nettoyage des dossiers vides..."
    find "$UPLOADS_DIR" -type d -empty -delete 2>/dev/null || true
    print_success "Dossiers vides supprimés"
    echo ""
fi

# Nettoyage
rm -rf "$TEMP_DIR"

print_header "✨ SCRIPT TERMINÉ"
echo ""

if [ "$DRY_RUN" = true ]; then
    print_info "Prochaines étapes:"
    echo "  1. Vérifiez la liste des fichiers orphelins"
    echo "  2. Exécutez avec --delete pour supprimer"
    echo "  3. Nettoyez aussi les attachements orphelins en DB:"
    echo "     mongosh mongodb://localhost:27017/meeshy --eval \"var CONFIRM_DELETE=true\" --file scripts/cleanup-orphan-attachments.js"
    echo ""
fi
