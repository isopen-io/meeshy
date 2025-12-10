#!/bin/bash

echo "🔍 Recherche des clés i18n potentiellement manquantes..."
echo ""

# Fichiers à vérifier
PAGES=(
  "frontend/app/page.tsx"
  "frontend/app/login/page.tsx"
  "frontend/app/signin/page.tsx"
  "frontend/app/dashboard/page.tsx"
  "frontend/app/settings/page.tsx"
  "frontend/app/notifications/page.tsx"
  "frontend/app/conversations/[[...id]]/page.tsx"
  "frontend/app/chat/[conversationShareLinkId]/page.tsx"
  "frontend/app/groups/page.tsx"
  "frontend/app/links/page.tsx"
  "frontend/app/contacts/page.tsx"
  "frontend/app/join/[linkId]/page.tsx"
)

echo "📄 Pages à vérifier: ${#PAGES[@]}"
echo ""

# Pour chaque page, chercher les appels t('xxx') sans préfixe de namespace
for page in "${PAGES[@]}"; do
  if [ -f "$page" ]; then
    echo "Vérification de: $page"
    
    # Chercher les patterns problématiques:
    # 1. t('xxx') où xxx ne contient pas de point (pas de namespace.key)
    # 2. Exclure les cas où c'est dans un commentaire
    
    grep -n "t(['\"]" "$page" | grep -v "^[[:space:]]*//\|^[[:space:]]*\*" | while read -r line; do
      # Extraire juste la partie t('xxx')
      key=$(echo "$line" | grep -o "t(['\"][^'\"]*['\"]" | sed "s/t(['\"]//g" | sed "s/['\"])//g")
      
      # Si la clé ne contient pas de point, c'est potentiellement un problème
      if [[ -n "$key" && ! "$key" =~ \. ]]; then
        echo "  ⚠️  Ligne ${line%%:*}: t('$key') - Pas de namespace"
      fi
    done
    echo ""
  fi
done

echo "✅ Vérification terminée"

