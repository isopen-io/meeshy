#!/bin/bash

# Script pour trouver les composants non utilisés dans le frontend

echo "🔍 Analyse des composants non utilisés dans frontend/"
echo "=================================================="
echo ""

FRONTEND_DIR="."
UNUSED_FILES=()

# Fonction pour extraire le nom du fichier sans extension
get_filename_without_ext() {
    basename "$1" | sed 's/\.[^.]*$//'
}

# Fonction pour vérifier si un fichier est importé quelque part
is_file_imported() {
    local file="$1"
    local filename=$(get_filename_without_ext "$file")
    local filepath=$(echo "$file" | sed 's|^\./||')
    
    # Patterns de recherche d'imports
    local patterns=(
        "from ['\"].*/${filename}['\"]"
        "from ['\"]@/.*/${filename}['\"]"
        "import.*['\"].*/${filename}['\"]"
        "export.*from ['\"].*/${filename}['\"]"
    )
    
    for pattern in "${patterns[@]}"; do
        # Chercher dans tous les fichiers sauf le fichier lui-même
        if grep -r -l --include="*.tsx" --include="*.ts" --include="*.jsx" --include="*.js" \
            --exclude-dir=node_modules \
            --exclude-dir=.next \
            -E "$pattern" . | grep -v "$filepath" > /dev/null 2>&1; then
            return 0
        fi
    done
    
    return 1
}

# Analyser tous les fichiers .tsx et .ts dans components/
echo "📂 Analyse des fichiers dans components/..."
echo ""

while IFS= read -r file; do
    filename=$(basename "$file")
    
    # Ignorer les fichiers spéciaux
    if [[ "$filename" == "index.ts" ]] || \
       [[ "$filename" == "index.tsx" ]] || \
       [[ "$filename" == "types.ts" ]] || \
       [[ "$filename" == "types.tsx" ]]; then
        continue
    fi
    
    # Vérifier si le fichier est importé
    if ! is_file_imported "$file"; then
        UNUSED_FILES+=("$file")
    fi
done < <(find components -type f \( -name "*.tsx" -o -name "*.ts" \) 2>/dev/null)

# Afficher les résultats
if [ ${#UNUSED_FILES[@]} -eq 0 ]; then
    echo "✅ Tous les composants sont utilisés !"
else
    echo "⚠️  Composants potentiellement non utilisés (${#UNUSED_FILES[@]}):"
    echo ""
    for file in "${UNUSED_FILES[@]}"; do
        echo "  • $file"
    done
fi

echo ""
echo "=================================================="
echo "✅ Analyse terminée"
