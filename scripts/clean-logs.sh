#!/bin/bash

# Script de réduction massive des logs - Meeshy Frontend
# Supprime les console.log inutiles tout en conservant console.error et console.warn

echo "🧹 Nettoyage des logs en cours..."

cd "$(dirname "$0")/../frontend" || exit 1

# Fonction pour compter les occurrences
count_logs() {
  echo "📊 Statistiques avant nettoyage:"
  echo "  console.log: $(grep -r "console\.log" services/ components/ app/ 2>/dev/null | wc -l | tr -d ' ')"
  echo "  console.error: $(grep -r "console\.error" services/ components/ app/ 2>/dev/null | wc -l | tr -d ' ')"
  echo "  console.warn: $(grep -r "console\.warn" services/ components/ app/ 2>/dev/null | wc -l | tr -d ' ')"
}

count_logs

echo ""
echo "🔧 Suppression des logs décoratifs..."

# Supprimer les bordures ASCII
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*═══/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*╔═══/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*╚═══/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*║/d' {} \;

# Supprimer les logs vides
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' "/console\.log\(''\);/d" {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log("");/d' {} \;

echo "✅ Bordures ASCII supprimées"

echo ""
echo "🔧 Suppression des logs avec emojis verbeux..."

# Supprimer les logs avec emojis spécifiques (très verbeux)
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*📨.*MeeshySocketIOService.*Nouveau message/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*🔄.*Broadcasting message/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*⌨️.*MeeshySocketIOService.*Frappe/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*🔄.*\[SOCKETIO-SERVICE\].*Mise en cache/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*📡.*\[SOCKETIO-SERVICE\].*Notification/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*🌐.*\[BubbleStreamPage\].*Traductions reçues/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*📜.*Scroll vers/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*🔧.*Popover/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*🖱️.*Souris/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*🎉.*\[AUTO-TRANSLATION\]/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*🎯.*\[AUTO-TRANSLATION\]/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*🔍.*\[BUBBLE\]/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*📖.*\[BUBBLE-MESSAGE/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*✅.*\[BUBBLE-MESSAGE/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*⚠️.*\[BUBBLE-MESSAGE/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*🔄.*\[BUBBLE-MESSAGE/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*📊.*\[LANGUAGE SWITCH\]/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*🔄.*\[LANGUAGE SWITCH\]/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*🔄.*\[FORCE TRANSLATION\]/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*🔄.*Utilisation du cache/d' {} \;
find services components app -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' '/console\.log.*🔧.*Configuration Meeshy/d' {} \;

echo "✅ Logs avec emojis verbeux supprimés"

echo ""
echo "📊 Statistiques après nettoyage:"
count_logs

echo ""
echo "✅ Nettoyage terminé !"
echo ""
echo "⚠️  Note: Les console.error et console.warn ont été conservés"
echo "💡 Conseil: Utilisez NEXT_PUBLIC_DEBUG=true pour activer les logs de debug"
