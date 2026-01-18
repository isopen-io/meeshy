#!/bin/bash
# Script de migration des imports ZmqTranslationClient
# Remplace les anciens imports par les nouveaux

set -e

GATEWAY_SRC="/Users/smpceo/Documents/v2_meeshy/services/gateway/src"

echo "🔄 Migration des imports ZmqTranslationClient..."

# Trouver tous les fichiers TypeScript important ZmqTranslationClient
FILES=$(grep -rl "from.*ZmqTranslationClient" "$GATEWAY_SRC" \
  --include="*.ts" \
  --exclude-dir=node_modules \
  --exclude-dir=zmq-translation \
  2>/dev/null || true)

if [ -z "$FILES" ]; then
  echo "✅ Aucun fichier à migrer trouvé"
  exit 0
fi

echo "📝 Fichiers à migrer:"
echo "$FILES"
echo ""

# Compteurs
UPDATED=0
SKIPPED=0

for FILE in $FILES; do
  echo "🔍 Traitement: $FILE"

  # Vérifier si le fichier contient les anciens imports
  if grep -q "from ['\"].*\/ZmqTranslationClient['\"]" "$FILE" || \
     grep -q "from ['\"]\.\.\/ZmqTranslationClient['\"]" "$FILE" || \
     grep -q "from ['\"]\.\/ZmqTranslationClient['\"]" "$FILE"; then

    # Déterminer le chemin relatif correct
    REL_PATH=$(realpath --relative-to="$(dirname "$FILE")" "$GATEWAY_SRC/services/zmq-translation")

    # Nettoyer le chemin (enlever ./ si présent)
    if [[ "$REL_PATH" == "./"* ]]; then
      REL_PATH="${REL_PATH:2}"
    fi

    # Si le fichier est dans le même dossier que zmq-translation
    if [[ "$REL_PATH" == "zmq-translation" ]]; then
      NEW_IMPORT="./zmq-translation"
    else
      NEW_IMPORT="$REL_PATH"
    fi

    echo "  → Nouveau chemin: $NEW_IMPORT"

    # Backup
    cp "$FILE" "$FILE.bak"

    # Remplacer les imports
    sed -i.tmp \
      -e "s|from ['\"].*\/ZmqTranslationClient['\"]|from '$NEW_IMPORT'|g" \
      -e "s|from ['\"]\.\.\/ZmqTranslationClient['\"]|from '$NEW_IMPORT'|g" \
      -e "s|from ['\"]\.\/ZmqTranslationClient['\"]|from '$NEW_IMPORT'|g" \
      "$FILE"

    rm -f "$FILE.tmp"

    echo "  ✅ Mis à jour"
    UPDATED=$((UPDATED + 1))
  else
    echo "  ⏭️  Déjà à jour ou pas d'import direct"
    SKIPPED=$((SKIPPED + 1))
  fi

  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Migration terminée"
echo "   Fichiers mis à jour: $UPDATED"
echo "   Fichiers ignorés: $SKIPPED"
echo ""
echo "📦 Fichiers de backup créés avec extension .bak"
echo "   Pour les supprimer: find $GATEWAY_SRC -name '*.bak' -delete"
echo ""
echo "🧪 Prochaines étapes:"
echo "   1. Vérifier que le code compile: bun run build"
echo "   2. Lancer les tests: bun test"
echo "   3. Si OK, supprimer l'ancien fichier: rm src/services/ZmqTranslationClient.ts"
echo "   4. Supprimer les backups: find src -name '*.bak' -delete"
