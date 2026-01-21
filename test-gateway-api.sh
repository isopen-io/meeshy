#!/bin/bash

# Tester l'API Gateway pour le message 696e919b066d60252d4ef4ec

MESSAGE_ID="696e919b066d60252d4ef4ec"
CONVERSATION_ID="696e4fb1acd8e6ae9461ad73"

echo "🔍 Test API Gateway - Message avec traductions"
echo ""
echo "Message ID: $MESSAGE_ID"
echo "Conversation ID: $CONVERSATION_ID"
echo ""

# Appeler l'API Gateway pour récupérer les messages de la conversation
echo "📡 Appel API: GET /api/v1/conversations/$CONVERSATION_ID/messages"
echo ""

curl -s "http://localhost:4001/api/v1/conversations/$CONVERSATION_ID/messages?limit=10" \
  -H "Content-Type: application/json" \
  | jq ".data[] | select(.id == \"$MESSAGE_ID\") | {
      id: .id,
      content: .content[0:50],
      attachments: .attachments | map({
        id: .id,
        mimeType: .mimeType,
        duration: .duration,
        hasTranscription: (.transcription != null),
        transcriptionLanguage: .transcription.language,
        transcriptionSegments: (.transcription.segments | length),
        hasTranslations: (.translations != null),
        translationsType: (.translations | type),
        translationLanguages: (.translations | keys),
        translationsDetail: .translations
      })
    }"
