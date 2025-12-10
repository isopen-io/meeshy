#!/bin/bash

# Script pour ajouter le support du dark mode à toutes les pages

echo "🌙 Application du support Dark Mode..."
echo ""

# Liste des fichiers à corriger
FILES=(
    "frontend/app/page.tsx"
    "frontend/app/login/page.tsx"
    "frontend/app/signin/page.tsx"
    "frontend/app/settings/page.tsx"
    "frontend/app/contacts/page.tsx"
    "frontend/app/join/[linkId]/page.tsx"
    "frontend/app/chat/[conversationShareLinkId]/page.tsx"
)

NAMES=(
    "Landing Page"
    "Login Page"
    "Signin Page"
    "Settings Page"
    "Contacts Page"
    "Join Page"
    "Chat Page"
)

# Fonction pour appliquer les transformations dark mode
apply_dark_mode() {
    local file=$1
    local name=$2
    
    if [ ! -f "$file" ]; then
        echo "⚠️  $name: Fichier non trouvé - $file"
        return
    fi
    
    echo "🔧 Traitement: $name"
    
    # 1. Backgrounds principaux avec gradients
    sed -i '' 's/className="\([^"]*\)min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100/className="\1min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800/g' "$file"
    sed -i '' 's/className="\([^"]*\)min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50/className="\1min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900/g' "$file"
    sed -i '' 's/className="\([^"]*\)min-h-screen bg-gradient-to-br from-emerald-50 via-blue-50 to-indigo-100/className="\1min-h-screen bg-gradient-to-br from-emerald-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900/g' "$file"
    
    # 2. Backgrounds simples
    sed -i '' 's/className="\([^"]*\)min-h-screen bg-gray-50 /className="\1min-h-screen bg-gray-50 dark:bg-gray-900 /g' "$file"
    sed -i '' 's/className="\([^"]*\)min-h-screen bg-gray-50"/className="\1min-h-screen bg-gray-50 dark:bg-gray-900"/g' "$file"
    
    # 3. Backgrounds de sections
    sed -i '' 's/className="\([^"]*\)bg-gradient-to-r from-blue-50 to-indigo-50 /className="\1bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 /g' "$file"
    sed -i '' 's/className="\([^"]*\)bg-white /className="\1bg-white dark:bg-gray-800 /g' "$file"
    sed -i '' 's/className="\([^"]*\)bg-white"/className="\1bg-white dark:bg-gray-800"/g' "$file"
    
    # 4. Cards avec backdrop
    sed -i '' 's/bg-white\/80 backdrop-blur-sm/bg-white\/80 dark:bg-gray-800\/80 backdrop-blur-sm/g' "$file"
    
    # 5. Textes principaux
    sed -i '' 's/text-gray-900 /text-gray-900 dark:text-white /g' "$file"
    sed -i '' 's/text-gray-900"/text-gray-900 dark:text-white"/g' "$file"
    sed -i '' 's/text-gray-800 /text-gray-800 dark:text-gray-100 /g' "$file"
    sed -i '' 's/text-gray-800"/text-gray-800 dark:text-gray-100"/g' "$file"
    
    # 6. Textes secondaires
    sed -i '' 's/text-gray-700 /text-gray-700 dark:text-gray-300 /g' "$file"
    sed -i '' 's/text-gray-700"/text-gray-700 dark:text-gray-300"/g' "$file"
    sed -i '' 's/text-gray-600 /text-gray-600 dark:text-gray-400 /g' "$file"
    sed -i '' 's/text-gray-600"/text-gray-600 dark:text-gray-400"/g' "$file"
    
    # 7. Textes de couleur spéciale
    sed -i '' 's/text-blue-100 /text-blue-100 dark:text-blue-200 /g' "$file"
    sed -i '' 's/text-green-700 /text-green-700 dark:text-green-300 /g' "$file"
    sed -i '' 's/text-green-800 /text-green-800 dark:text-green-200 /g' "$file"
    sed -i '' 's/text-purple-600 /text-purple-600 dark:text-purple-400 /g' "$file"
    sed -i '' 's/text-red-600 /text-red-600 dark:text-red-400 /g' "$file"
    
    # 8. Backgrounds colorés (info boxes)
    sed -i '' 's/bg-green-50 /bg-green-50 dark:bg-green-900\/20 /g' "$file"
    sed -i '' 's/bg-purple-50 /bg-purple-50 dark:bg-purple-900\/20 /g' "$file"
    sed -i '' 's/bg-indigo-50 /bg-indigo-50 dark:bg-indigo-900\/20 /g' "$file"
    sed -i '' 's/bg-red-50 /bg-red-50 dark:bg-red-900\/20 /g' "$file"
    sed -i '' 's/bg-gray-50 /bg-gray-50 dark:bg-gray-800 /g' "$file"
    sed -i '' 's/bg-gray-100 /bg-gray-100 dark:bg-gray-700 /g' "$file"
    
    # 9. Bordures
    sed -i '' 's/border-gray-300 /border-gray-300 dark:border-gray-600 /g' "$file"
    sed -i '' 's/border-gray-200 /border-gray-200 dark:border-gray-700 /g' "$file"
    sed -i '' 's/border-green-200 /border-green-200 dark:border-green-800 /g' "$file"
    sed -i '' 's/border-purple-200 /border-purple-200 dark:border-purple-800 /g' "$file"
    sed -i '' 's/border-red-200 /border-red-200 dark:border-red-800 /g' "$file"
    
    # 10. Focus states
    sed -i '' 's/focus:ring-blue-500 /focus:ring-blue-500 dark:focus:ring-blue-400 /g' "$file"
    
    # 11. Hover states pour les liens
    sed -i '' 's/hover:text-gray-900 /hover:text-gray-900 dark:hover:text-white /g' "$file"
    sed -i '' 's/hover:text-gray-900"/hover:text-gray-900 dark:hover:text-white"/g' "$file"
    
    echo "  ✅ $name modifié avec succès"
}

# Appliquer les transformations à chaque fichier
for i in "${!FILES[@]}"; do
    apply_dark_mode "${FILES[$i]}" "${NAMES[$i]}"
done

echo ""
echo "✨ Terminé! Support Dark Mode appliqué à toutes les pages."
echo ""
echo "📋 Pages mises à jour:"
for name in "${NAMES[@]}"; do
    echo "  - $name"
done
