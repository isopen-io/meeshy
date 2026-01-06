#!/bin/bash
# Script pour nettoyer les références de fichiers supprimés du project.pbxproj

PROJECT_FILE="./Meeshy.xcodeproj/project.pbxproj"
BACKUP_FILE="./Meeshy.xcodeproj/project.pbxproj.backup"

# Backup
cp "$PROJECT_FILE" "$BACKUP_FILE"
echo "✅ Backup créé: $BACKUP_FILE"

# Fichiers à supprimer
FILES_TO_REMOVE=(
    "SocketService.swift"
    "OnboardingView.swift"
    "EnhancedChatView.swift"
    "ConversationViewModel.swift"
)

for file in "${FILES_TO_REMOVE[@]}"; do
    echo "🗑️  Suppression des références à: $file"
    # Supprimer les lignes contenant le nom du fichier
    sed -i '' "/$file/d" "$PROJECT_FILE"
done

echo "✅ Nettoyage terminé!"
echo "📝 Pour restaurer: cp $BACKUP_FILE $PROJECT_FILE"
