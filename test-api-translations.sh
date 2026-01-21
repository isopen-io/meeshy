#!/bin/bash

# Test API Gateway - Vérifier les traductions dans la réponse

CONVERSATION_ID="696e4fb1acd8e6ae9461ad73"
MESSAGE_ID="696e919b066d60252d4ef4ec"
ATTACHMENT_ID="696e9198066d60252d4ef4eb"

echo "🔍 Test API Gateway - Traductions Audio"
echo "========================================"
echo ""
echo "Conversation ID: $CONVERSATION_ID"
echo "Message ID: $MESSAGE_ID"
echo "Attachment ID: $ATTACHMENT_ID"
echo ""

# Appeler l'API
echo "📡 Appel API..."
RESPONSE=$(curl -s "http://localhost:4001/api/v1/conversations/$CONVERSATION_ID/messages?limit=20")

# Vérifier si la requête a réussi
if [ -z "$RESPONSE" ]; then
    echo "❌ Pas de réponse de l'API"
    exit 1
fi

echo "✅ Réponse reçue"
echo ""

# Extraire et afficher les informations du message
echo "📄 Message:"
echo "$RESPONSE" | jq -r ".data[] | select(.id == \"$MESSAGE_ID\") | {
  id: .id,
  content: .content[0:60]
}"

echo ""
echo "📎 Attachment:"
echo "$RESPONSE" | jq -r ".data[] | select(.id == \"$MESSAGE_ID\") | .attachments[] | select(.id == \"$ATTACHMENT_ID\") | {
  id: .id,
  mimeType: .mimeType,
  duration: .duration
}"

echo ""
echo "📝 Transcription:"
echo "$RESPONSE" | jq -r ".data[] | select(.id == \"$MESSAGE_ID\") | .attachments[] | select(.id == \"$ATTACHMENT_ID\") | .transcription | {
  text: .text[0:60],
  language: .language,
  source: .source,
  segments: (.segments | length)
}"

echo ""
echo "🌍 Translations:"
echo "$RESPONSE" | jq -r ".data[] | select(.id == \"$MESSAGE_ID\") | .attachments[] | select(.id == \"$ATTACHMENT_ID\") | .translations"

echo ""
echo "🔍 Détail traduction EN:"
echo "$RESPONSE" | jq -r ".data[] | select(.id == \"$MESSAGE_ID\") | .attachments[] | select(.id == \"$ATTACHMENT_ID\") | .translations.en"

echo ""
echo "📊 Résumé:"
HAS_TRANSCRIPTION=$(echo "$RESPONSE" | jq -r ".data[] | select(.id == \"$MESSAGE_ID\") | .attachments[] | select(.id == \"$ATTACHMENT_ID\") | .transcription != null")
HAS_TRANSLATIONS=$(echo "$RESPONSE" | jq -r ".data[] | select(.id == \"$MESSAGE_ID\") | .attachments[] | select(.id == \"$ATTACHMENT_ID\") | .translations != null")
TRANSLATION_LANGS=$(echo "$RESPONSE" | jq -r ".data[] | select(.id == \"$MESSAGE_ID\") | .attachments[] | select(.id == \"$ATTACHMENT_ID\") | .translations | keys | join(\", \")")

echo "  ✅ Transcription présente: $HAS_TRANSCRIPTION"
echo "  ✅ Translations présentes: $HAS_TRANSLATIONS"
echo "  ✅ Langues disponibles: $TRANSLATION_LANGS"
