#!/bin/bash

# Script pour ajouter le support du mode sombre aux pages statiques
# Correction des classes Tailwind pour dark mode

echo "🌙 Ajout du support dark mode aux pages statiques..."

# Fonction pour ajouter dark mode classes
add_dark_mode() {
    local file=$1
    echo "Processing: $file"
    
    # Background colors
    sed -i '' 's/className="min-h-screen bg-gray-50"/className="min-h-screen bg-gray-50 dark:bg-gray-900"/g' "$file"
    sed -i '' 's/className="bg-white border-b"/className="bg-white dark:bg-gray-800 border-b dark:border-gray-700"/g' "$file"
    sed -i '' 's/className="bg-white rounded/className="bg-white dark:bg-gray-800 rounded/g' "$file"
    sed -i '' 's/className="bg-white shadow/className="bg-white dark:bg-gray-800 shadow/g' "$file"
    sed -i '' 's/className="bg-white py-/className="bg-white dark:bg-gray-800 py-/g' "$file"
    
    # Text colors - headers
    sed -i '' 's/text-gray-900 /text-gray-900 dark:text-white /g' "$file"
    
    # Text colors - body
    sed -i '' 's/text-gray-700 /text-gray-700 dark:text-gray-300 /g' "$file"
    sed -i '' 's/text-gray-600 /text-gray-600 dark:text-gray-400 /g' "$file"
    
    # Links
    sed -i '' 's/text-gray-600 hover:text-gray-900/text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white/g' "$file"
    
    # Backgrounds with color
    sed -i '' 's/bg-blue-50 /bg-blue-50 dark:bg-blue-900\/20 /g' "$file"
    sed -i '' 's/bg-blue-100 /bg-blue-100 dark:bg-blue-800\/30 /g' "$file"
    sed -i '' 's/bg-green-50 /bg-green-50 dark:bg-green-900\/20 /g' "$file"
    sed -i '' 's/bg-green-100 /bg-green-100 dark:bg-green-800\/30 /g' "$file"
    sed -i '' 's/bg-gray-100 /bg-gray-100 dark:bg-gray-700 /g' "$file"
    
    # Borders
    sed -i '' 's/border-gray-200/border-gray-200 dark:border-gray-700/g' "$file"
    sed -i '' 's/border-l-4 border-l-blue-600/border-l-4 border-l-blue-600 dark:border-l-blue-400/g' "$file"
    sed -i '' 's/border-l-4 border-l-green-600/border-l-4 border-l-green-600 dark:border-l-green-400/g' "$file"
    sed -i '' 's/border-l-4 border-l-purple-600/border-l-4 border-l-purple-600 dark:border-l-purple-400/g' "$file"
    
    echo "✅ $file updated"
}

# Pages à corriger
PAGES=(
    "frontend/app/about/page.tsx"
    "frontend/app/privacy/page.tsx"
    "frontend/app/terms/page.tsx"
    "frontend/app/contact/page.tsx"
    "frontend/app/partners/page.tsx"
    "frontend/app/page.tsx"
)

# Traiter chaque page
for page in "${PAGES[@]}"; do
    if [ -f "$page" ]; then
        add_dark_mode "$page"
    else
        echo "⚠️  File not found: $page"
    fi
done

echo ""
echo "✅ Dark mode support added to all static pages!"
echo ""
echo "🧪 Test with:"
echo "  1. Open http://localhost:3100"
echo "  2. Toggle dark mode in settings"
echo "  3. Visit /about, /privacy, /contact, /partners"
