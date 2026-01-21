/**
 * Vérifier les traductions audio en détail
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.DATABASE_URL || 'mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true';

async function checkTranslationsDetailed() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB\n');

    const db = client.db();
    const attachments = db.collection('MessageAttachment');

    // Attachment ID du message avec traduction selon les logs
    const attachmentId = '696e9198066d60252d4ef4eb';

    console.log('🔍 Recherche de l\'attachment:', attachmentId);
    const attachment = await attachments.findOne({
      _id: require('mongodb').ObjectId.createFromHexString(attachmentId)
    });

    if (attachment) {
      console.log('✅ Attachment trouvé:\n');
      console.log(`   - ID: ${attachment._id}`);
      console.log(`   - Fichier: ${attachment.originalName}`);
      console.log(`   - Type: ${attachment.mimeType}`);
      console.log(`   - Message ID: ${attachment.messageId}`);

      console.log('\n📝 TRANSCRIPTION ORIGINALE:');
      console.log(`   - Présente: ${attachment.transcription ? 'OUI ✅' : 'NON ❌'}`);

      if (attachment.transcription) {
        console.log(`   - Text: "${attachment.transcription.text}"`);
        console.log(`   - Language: ${attachment.transcription.language}`);
        console.log(`   - Confidence: ${attachment.transcription.confidence}`);
        console.log(`   - Source: ${attachment.transcription.source}`);
        console.log(`   - Model: ${attachment.transcription.model}`);
        console.log(`   - Duration: ${attachment.transcription.durationMs}ms`);
        console.log(`   - Segments: ${attachment.transcription.segments?.length || 0}`);
      }

      console.log('\n🌍 TRADUCTIONS:');
      console.log(`   - Field 'translations' présent: ${attachment.translations ? 'OUI ✅' : 'NON ❌'}`);
      console.log(`   - Type: ${typeof attachment.translations}`);

      if (attachment.translations) {
        console.log(`   - Structure: ${JSON.stringify(attachment.translations, null, 2).substring(0, 500)}`);
        console.log('\n   📋 Détails par langue:');

        for (const [lang, translation] of Object.entries(attachment.translations)) {
          console.log(`\n   🔹 Langue: ${lang}`);
          console.log(`      - Type: ${translation.type || 'N/A'}`);
          console.log(`      - Transcription traduite: "${translation.transcription?.substring(0, 100) || 'N/A'}..."`);
          console.log(`      - Audio URL: ${translation.audioUrl || translation.url || 'N/A'}`);
          console.log(`      - Path: ${translation.path || 'N/A'}`);
          console.log(`      - Duration: ${translation.durationMs || 'N/A'}ms`);
          console.log(`      - Voice cloned: ${translation.voiceCloned !== undefined ? translation.voiceCloned : 'N/A'}`);
          console.log(`      - Voice quality: ${translation.voiceQuality || 'N/A'}`);
          console.log(`      - Format: ${translation.format || 'N/A'}`);
          console.log(`      - TTS Model: ${translation.ttsModel || 'N/A'}`);
        }
      }

      // Vérifier si le fichier audio traduit existe
      if (attachment.translations) {
        console.log('\n📁 Vérification des fichiers audio traduits:');
        const fs = require('fs');
        const path = require('path');

        for (const [lang, translation] of Object.entries(attachment.translations)) {
          if (translation.path) {
            const fullPath = path.join('/Users/smpceo/Documents/v2_meeshy/services/gateway', translation.path);
            const exists = fs.existsSync(fullPath);
            console.log(`   - ${lang}: ${exists ? '✅ EXISTS' : '❌ NOT FOUND'} (${fullPath})`);
          } else if (translation.audioUrl) {
            console.log(`   - ${lang}: URL présente (${translation.audioUrl})`);
          }
        }
      }

    } else {
      console.log('❌ Attachment non trouvé');
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await client.close();
    console.log('\n✅ Connexion fermée');
  }
}

checkTranslationsDetailed();
