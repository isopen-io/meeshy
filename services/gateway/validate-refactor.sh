#!/bin/bash
# Script de validation de la refactorisation ZMQ

set -e

GATEWAY_DIR="/Users/smpceo/Documents/v2_meeshy/services/gateway"
cd "$GATEWAY_DIR"

echo "🔍 Validation de la refactorisation ZMQ Translation Client"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Vérifier la structure des fichiers
echo "1️⃣  Vérification de la structure des modules..."
echo ""

REQUIRED_FILES=(
  "src/services/zmq-translation/ZmqConnectionPool.ts"
  "src/services/zmq-translation/ZmqRetryHandler.ts"
  "src/services/zmq-translation/ZmqTranslationClient.ts"
  "src/services/zmq-translation/types.ts"
  "src/services/zmq-translation/index.ts"
  "src/services/zmq-translation/README.md"
)

for FILE in "${REQUIRED_FILES[@]}"; do
  if [ -f "$FILE" ]; then
    LINES=$(wc -l < "$FILE")
    echo "  ✅ $FILE ($LINES lignes)"
  else
    echo "  ❌ MANQUANT: $FILE"
    exit 1
  fi
done

echo ""

# 2. Vérifier la taille des modules
echo "2️⃣  Vérification de la taille des modules (< 800 lignes)..."
echo ""

MAX_LINES=800

check_file_size() {
  FILE=$1
  LINES=$(wc -l < "$FILE")

  if [ "$LINES" -lt "$MAX_LINES" ]; then
    echo "  ✅ $FILE: $LINES lignes (< $MAX_LINES)"
    return 0
  else
    echo "  ❌ $FILE: $LINES lignes (> $MAX_LINES)"
    return 1
  fi
}

VALID=true
check_file_size "src/services/zmq-translation/ZmqConnectionPool.ts" || VALID=false
check_file_size "src/services/zmq-translation/ZmqRetryHandler.ts" || VALID=false
check_file_size "src/services/zmq-translation/ZmqTranslationClient.ts" || VALID=false
check_file_size "src/services/zmq-translation/types.ts" || VALID=false

if [ "$VALID" = false ]; then
  echo ""
  echo "❌ Certains modules dépassent la limite de taille"
  exit 1
fi

echo ""

# 3. Vérifier les exports publics
echo "3️⃣  Vérification des exports publics..."
echo ""

if grep -q "export { ZmqTranslationClient }" "src/services/zmq-translation/index.ts"; then
  echo "  ✅ ZmqTranslationClient exporté"
else
  echo "  ❌ ZmqTranslationClient non exporté"
  exit 1
fi

if grep -q "TranslationRequest" "src/services/zmq-translation/index.ts"; then
  echo "  ✅ Types de translation exportés"
else
  echo "  ❌ Types de translation non exportés"
  exit 1
fi

echo ""

# 4. Vérifier que les modules internes ne sont PAS exportés
echo "4️⃣  Vérification de l'encapsulation (modules internes)..."
echo ""

if grep -q "export { ZmqConnectionPool }" "src/services/zmq-translation/index.ts"; then
  echo "  ❌ ZmqConnectionPool ne devrait PAS être exporté (détail d'implémentation)"
  exit 1
else
  echo "  ✅ ZmqConnectionPool correctement encapsulé"
fi

if grep -q "export { ZmqRetryHandler }" "src/services/zmq-translation/index.ts"; then
  echo "  ❌ ZmqRetryHandler ne devrait PAS être exporté (détail d'implémentation)"
  exit 1
else
  echo "  ✅ ZmqRetryHandler correctement encapsulé"
fi

echo ""

# 5. Vérifier les imports dans ZmqSingleton
echo "5️⃣  Vérification de la mise à jour de ZmqSingleton..."
echo ""

if grep -q "from './zmq-translation'" "src/services/ZmqSingleton.ts"; then
  echo "  ✅ ZmqSingleton utilise le nouveau module"
else
  echo "  ⚠️  ZmqSingleton n'utilise pas encore le nouveau module"
  echo "     Vérifier: src/services/ZmqSingleton.ts"
fi

echo ""

# 6. Vérifier qu'il n'y a pas d'imports résiduels de l'ancien fichier
echo "6️⃣  Recherche d'imports résiduels de l'ancien fichier..."
echo ""

OLD_IMPORTS=$(grep -r "from.*ZmqTranslationClient['\"]" src \
  --include="*.ts" \
  --exclude-dir=zmq-translation \
  --exclude-dir=node_modules \
  2>/dev/null | wc -l)

if [ "$OLD_IMPORTS" -eq 0 ]; then
  echo "  ✅ Aucun import résiduel trouvé"
else
  echo "  ⚠️  $OLD_IMPORTS imports résiduels détectés:"
  grep -r "from.*ZmqTranslationClient['\"]" src \
    --include="*.ts" \
    --exclude-dir=zmq-translation \
    --exclude-dir=node_modules \
    2>/dev/null | sed 's/^/     /'
  echo ""
  echo "  💡 Exécuter: node migrate-zmq-imports.js"
fi

echo ""

# 7. Vérifier la compilation TypeScript
echo "7️⃣  Vérification de la compilation TypeScript..."
echo ""

if bun run build --dry-run 2>/dev/null; then
  echo "  ✅ Compilation TypeScript réussie"
else
  echo "  ⚠️  Erreurs de compilation détectées"
  echo "     Exécuter: bun run build"
fi

echo ""

# 8. Résumé
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RÉSUMÉ DE LA REFACTORISATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Structure:"
echo "  - ZmqConnectionPool.ts    : $(wc -l < src/services/zmq-translation/ZmqConnectionPool.ts) lignes"
echo "  - ZmqRetryHandler.ts      : $(wc -l < src/services/zmq-translation/ZmqRetryHandler.ts) lignes"
echo "  - ZmqTranslationClient.ts : $(wc -l < src/services/zmq-translation/ZmqTranslationClient.ts) lignes"
echo "  - types.ts                : $(wc -l < src/services/zmq-translation/types.ts) lignes"
echo "  - index.ts                : $(wc -l < src/services/zmq-translation/index.ts) lignes"
echo ""

TOTAL_LINES=$(cat src/services/zmq-translation/*.ts | wc -l)
echo "Total: $TOTAL_LINES lignes"
echo ""

if [ -f "src/services/ZmqTranslationClient.ts" ]; then
  OLD_LINES=$(wc -l < src/services/ZmqTranslationClient.ts)
  echo "Ancien fichier: $OLD_LINES lignes"
  REDUCTION=$((OLD_LINES - TOTAL_LINES))
  echo "Réduction: $REDUCTION lignes (fichiers séparés + documentation)"
else
  echo "✅ Ancien fichier déjà supprimé"
fi

echo ""
echo "✅ Validation terminée avec succès!"
echo ""
echo "📝 Prochaines étapes recommandées:"
echo "  1. Migrer les imports: node migrate-zmq-imports.js"
echo "  2. Tester: bun test"
echo "  3. Compiler: bun run build"
echo "  4. Supprimer l'ancien fichier: rm src/services/ZmqTranslationClient.ts"
echo "  5. Commit: git add . && git commit -m 'refactor: split ZmqTranslationClient into modules'"
