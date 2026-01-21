/**
 * Tester l'API Gateway pour voir ce qu'elle retourne pour les transcriptions
 */

const fetch = require('node-fetch');

const GATEWAY_URL = 'http://localhost:3000';
const CONVERSATION_ID = '696e4fb1acd8e6ae9461ad73'; // Conversation contenant le message avec transcription

async function testApiTranscription() {
  try {
    console.log(`🔍 Test de l'API Gateway: GET /conversations/${CONVERSATION_ID}/messages\n`);

    const response = await fetch(
      `${GATEWAY_URL}/conversations/${CONVERSATION_ID}/messages?limit=50`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );

    if (!response.ok) {
      console.error(`❌ Erreur HTTP ${response.status}: ${response.statusText}`);
      const errorText = await response.text();
      console.error('Réponse:', errorText);
      return;
    }

    const data = await response.json();

    console.log('✅ Réponse reçue:\n');
    console.log(`📊 Total de messages: ${data.data?.length || 0}`);

    // Chercher le message avec l'ID spécifique
    const targetMessageId = '696e4ff3acd8e6ae9461ad7d';
    const targetMessage = data.data?.find(m => m.id === targetMessageId);

    if (targetMessage) {
      console.log('\n📄 Message avec transcription attendue:');
      console.log(JSON.stringify(targetMessage, null, 2).substring(0, 2000));

      if (targetMessage.attachments && targetMessage.attachments.length > 0) {
        console.log('\n📎 Détails des attachments:');
        targetMessage.attachments.forEach((att, i) => {
          console.log(`\n  Attachment ${i + 1}:`);
          console.log(`    - ID: ${att.id}`);
          console.log(`    - Fichier: ${att.fileName}`);
          console.log(`    - Type: ${att.mimeType}`);
          console.log(`    - Transcription type: ${typeof att.transcription}`);
          console.log(`    - Transcription value: ${att.transcription ? 'PRÉSENTE' : 'NULL/UNDEFINED'}`);
          if (att.transcription) {
            console.log(`    - Transcription text: ${att.transcription.text?.substring(0, 100)}`);
            console.log(`    - Language: ${att.transcription.language}`);
            console.log(`    - Confidence: ${att.transcription.confidence}`);
          }
        });
      }
    } else {
      console.log(`\n❌ Message ${targetMessageId} non trouvé dans la réponse`);
      console.log('\nIDs des messages retournés:');
      data.data?.forEach((msg, i) => {
        console.log(`  ${i + 1}. ${msg.id} - ${msg.content?.substring(0, 50)}`);
      });
    }

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

testApiTranscription();
