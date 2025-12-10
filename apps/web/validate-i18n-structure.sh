#!/bin/bash

# Script de validation de la structure i18n
# Vérifie que tous les fichiers de langue ont la même structure

echo "🔍 Validation de la structure i18n..."
echo ""

LANGUAGES=("fr" "en" "es" "pt" "zh")
ERRORS=0

# Vérifier la structure de base
echo "📋 Vérification de la structure de base..."
for lang in "${LANGUAGES[@]}"; do
  FILE="locales/$lang/conversations.json"
  
  # Vérifier que le fichier existe
  if [ ! -f "$FILE" ]; then
    echo "❌ [$lang] Fichier manquant: $FILE"
    ERRORS=$((ERRORS + 1))
    continue
  fi
  
  # Vérifier la structure JSON
  if ! node -e "JSON.parse(require('fs').readFileSync('$FILE', 'utf8'))" 2>/dev/null; then
    echo "❌ [$lang] JSON invalide"
    ERRORS=$((ERRORS + 1))
    continue
  fi
  
  # Vérifier la présence de la clé "conversations"
  HAS_CONVERSATIONS=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$FILE', 'utf8')).conversations ? 'yes' : 'no')")
  if [ "$HAS_CONVERSATIONS" != "yes" ]; then
    echo "❌ [$lang] Manque la clé 'conversations' au premier niveau"
    ERRORS=$((ERRORS + 1))
  else
    echo "✅ [$lang] Structure correcte"
  fi
done

echo ""
echo "📋 Vérification des clés bubbleStream critiques..."

CRITICAL_KEYS=(
  "edit"
  "delete"
  "originalBadge"
  "improveQuality"
  "filterLanguages"
  "addFavorite"
  "copyMessage"
  "realTimeMessages"
  "emptyStateMessage"
  "emptyStateDescription"
  "activeLanguages"
  "hoursAgo"
  "originalLanguage"
  "viewTranslations"
  "translations"
  "translateTo"
)

for lang in "${LANGUAGES[@]}"; do
  FILE="locales/$lang/conversations.json"
  MISSING_KEYS=()
  
  for key in "${CRITICAL_KEYS[@]}"; do
    HAS_KEY=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$FILE', 'utf8')).bubbleStream?.$key ? 'yes' : 'no')")
    if [ "$HAS_KEY" != "yes" ]; then
      MISSING_KEYS+=("$key")
    fi
  done
  
  if [ ${#MISSING_KEYS[@]} -eq 0 ]; then
    echo "✅ [$lang] Toutes les clés bubbleStream présentes (${#CRITICAL_KEYS[@]} clés)"
  else
    echo "❌ [$lang] Clés manquantes: ${MISSING_KEYS[*]}"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
echo "📋 Vérification de conversationSearch.shareMessage..."

for lang in "${LANGUAGES[@]}"; do
  FILE="locales/$lang/conversations.json"
  HAS_KEY=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$FILE', 'utf8')).conversationSearch?.shareMessage ? 'yes' : 'no')")
  if [ "$HAS_KEY" != "yes" ]; then
    echo "❌ [$lang] Manque conversationSearch.shareMessage"
    ERRORS=$((ERRORS + 1))
  else
    echo "✅ [$lang] conversationSearch.shareMessage présent"
  fi
done

echo ""
echo "📊 Statistiques des clés par langue..."
for lang in "${LANGUAGES[@]}"; do
  FILE="locales/$lang/conversations.json"
  TOTAL_KEYS=$(node -e "function countKeys(obj) { let count = 0; for (let key in obj) { count++; if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) { count += countKeys(obj[key]); } } return count; } console.log(countKeys(JSON.parse(require('fs').readFileSync('$FILE', 'utf8'))));" 2>/dev/null)
  echo "[$lang] Total de clés: $TOTAL_KEYS"
done

echo ""
if [ $ERRORS -eq 0 ]; then
  echo "✅ Validation réussie ! Aucune erreur détectée."
  exit 0
else
  echo "❌ Validation échouée avec $ERRORS erreur(s)."
  exit 1
fi
