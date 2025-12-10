#!/bin/bash

# Script de suppression des composants non utilisés
# Date: 23 octobre 2025

echo "🗑️  Suppression des composants non utilisés"
echo "==========================================="
echo ""

DELETED_COUNT=0
FILES_TO_DELETE=(
  # UI Components
  "components/ui/code.tsx"
  "components/ui/calendar.tsx"
  
  # Settings
  "components/settings/enhanced-system-test.tsx"
  
  # Chat
  "components/chat/anonymous-chat.tsx"
  "components/chat/anonymous-chat-error-handler.tsx"
  
  # Translation
  "components/translation/translation-status-indicator.tsx"
  "components/translation-dashboard.tsx"
  
  # Groups
  "components/groups/groups-layout-wrapper.tsx"
  
  # Common
  "components/common/share-button.tsx"
  "components/common/share-preview.tsx"
  "components/common/font-initializer.tsx"
  
  # Conversations
  "components/conversations/ConversationComposerV2.tsx"
  "components/conversations/ConversationComposer.tsx"
  "components/conversations/link-copy-modal.tsx"
  
  # Attachments
  "components/attachments/TextAttachmentDialog.tsx"
  "components/attachments/AttachmentList.tsx"
  "components/attachments/AttachmentPreview.tsx"
  
  # Notifications & Others (confirmés non utilisés)
  "components/notifications/NotificationProvider.tsx"
  "components/WebVitalsReporter.tsx"
  "components/LanguageDetectionNotification.tsx"
)

# Fonction pour supprimer un fichier
delete_file() {
  local file="$1"
  if [ -f "$file" ]; then
    rm "$file"
    echo "  ✅ Supprimé: $file"
    ((DELETED_COUNT++))
  else
    echo "  ⚠️  Fichier déjà supprimé ou introuvable: $file"
  fi
}

# Supprimer tous les fichiers
echo "📂 Suppression des fichiers..."
echo ""

for file in "${FILES_TO_DELETE[@]}"; do
  delete_file "$file"
done

echo ""
echo "==========================================="
echo "✅ Suppression terminée"
echo "📊 Fichiers supprimés: $DELETED_COUNT/${#FILES_TO_DELETE[@]}"
echo ""
echo "🔄 Prochaines étapes:"
echo "  1. Vérifier que tout fonctionne: yarn dev"
echo "  2. Commit les changements: git add -A && git commit"
echo ""
