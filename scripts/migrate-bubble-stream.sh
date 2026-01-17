#!/bin/bash

# Script de migration BubbleStreamPage
# Bascule entre l'ancienne et la nouvelle version de manière sécurisée

set -e

LEGACY_FILE="apps/web/components/common/bubble-stream-page.legacy.tsx"
CURRENT_FILE="apps/web/components/common/bubble-stream-page.tsx"
REFACTORED_FILE="apps/web/components/common/bubble-stream-page-refactored.tsx"

echo "🔄 Migration BubbleStreamPage"
echo ""

# Vérifier que le fichier refactorisé existe
if [ ! -f "$REFACTORED_FILE" ]; then
  echo "❌ Erreur: $REFACTORED_FILE n'existe pas"
  exit 1
fi

# Demander confirmation
read -p "⚠️  Cette opération va remplacer le fichier actuel par la version refactorisée. Continuer? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Opération annulée"
  exit 1
fi

# Créer un backup de l'ancienne version
echo "📦 Création du backup..."
cp "$CURRENT_FILE" "$LEGACY_FILE"
echo "✅ Backup créé: $LEGACY_FILE"

# Remplacer par la nouvelle version
echo "🔄 Remplacement par la version refactorisée..."
cp "$REFACTORED_FILE" "$CURRENT_FILE"
echo "✅ Fichier remplacé"

# Vérifier la compilation
echo ""
echo "🔍 Vérification de la compilation..."
if pnpm run build:web > /dev/null 2>&1; then
  echo "✅ Compilation réussie"
else
  echo "❌ Erreur de compilation - restauration du backup"
  cp "$LEGACY_FILE" "$CURRENT_FILE"
  echo "🔙 Fichier restauré"
  exit 1
fi

echo ""
echo "✨ Migration terminée avec succès!"
echo ""
echo "📋 Prochaines étapes:"
echo "  1. Tester l'application en local"
echo "  2. Exécuter les tests: pnpm test"
echo "  3. Vérifier le BubbleStream dans le navigateur"
echo "  4. Si tout fonctionne, supprimer $LEGACY_FILE"
echo ""
echo "🔙 Pour revenir en arrière:"
echo "  cp $LEGACY_FILE $CURRENT_FILE"
