#!/bin/bash

echo "🔍 Validation des traductions Meeshy"
echo "===================================="
echo ""

# Clés à vérifier dans conversations.json
CONV_KEYS=(
  "hoursAgo"
  "originalLanguage"
  "viewTranslations"
  "translations"
  "translateTo"
  "filterLanguages"
  "originalBadge"
  "improveQuality"
  "removeFavorite"
  "copyMessage"
  "edit"
  "delete"
  "activeLanguages"
  "realTimeMessages"
)

# Clés à vérifier dans common.json
COMMON_KEYS=(
  "\"home\""
  "searchPlaceholder"
  "communities"
  "admin"
  "checking"
)

LANGS=("fr" "en" "es" "pt" "zh")

echo "📊 Vérification de conversations.json"
echo "-------------------------------------"
for lang in "${LANGS[@]}"; do
  missing=0
  for key in "${CONV_KEYS[@]}"; do
    if ! grep -q "\"$key\":" "locales/$lang/conversations.json"; then
      echo "❌ [$lang] Clé manquante: $key"
      missing=$((missing + 1))
    fi
  done
  if [ $missing -eq 0 ]; then
    echo "✅ [$lang] Toutes les clés présentes (${#CONV_KEYS[@]} clés)"
  fi
done

echo ""
echo "📊 Vérification de common.json"
echo "------------------------------"
for lang in "${LANGS[@]}"; do
  missing=0
  for key in "${COMMON_KEYS[@]}"; do
    if ! grep -q "$key:" "locales/$lang/common.json"; then
      echo "❌ [$lang] Clé manquante: $key"
      missing=$((missing + 1))
    fi
  done
  if [ $missing -eq 0 ]; then
    echo "✅ [$lang] Toutes les clés présentes (${#COMMON_KEYS[@]} clés)"
  fi
done

echo ""
echo "📈 Statistiques globales"
echo "-----------------------"
for lang in "${LANGS[@]}"; do
  conv_count=$(cat "locales/$lang/conversations.json" | grep -o '"[a-zA-Z]*":' | wc -l | xargs)
  common_count=$(cat "locales/$lang/common.json" | grep -o '"[a-zA-Z]*":' | wc -l | xargs)
  echo "[$lang] conversations.json: $conv_count clés | common.json: $common_count clés"
done

echo ""
echo "✨ Validation terminée !"
