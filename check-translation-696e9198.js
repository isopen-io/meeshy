/**
 * Vérifier les traductions pour l'attachment 696e9198066d60252d4ef4eb
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.DATABASE_URL || 'mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true';

async function checkTranslations() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB\n');

    const db = client.db();
    const attachments = db.collection('MessageAttachment');

    const attachmentId = '696e9198066d60252d4ef4eb';

    console.log(`🔍 Recherche attachment: ${attachmentId}\n`);

    const attachment = await attachments.findOne({
      _id: require('mongodb').ObjectId.createFromHexString(attachmentId)
    });

    if (!attachment) {
      console.log('❌ Attachment non trouvé');
      return;
    }

    console.log('📄 Attachment trouvé:');
    console.log(`   - ID: ${attachment._id}`);
    console.log(`   - Message ID: ${attachment.messageId}`);
    console.log(`   - Type: ${attachment.mimeType}`);
    console.log(`   - Durée: ${attachment.duration}ms`);

    // Vérifier transcription
    console.log('\n📝 Transcription:');
    if (attachment.transcription) {
      console.log(`   ✅ Présente`);
      console.log(`   - Text: "${attachment.transcription.text?.substring(0, 60)}..."`);
      console.log(`   - Language: ${attachment.transcription.language}`);
      console.log(`   - Source: ${attachment.transcription.source}`);
      console.log(`   - Confidence: ${attachment.transcription.confidence}`);
      console.log(`   - Segments: ${attachment.transcription.segments?.length || 0}`);
    } else {
      console.log(`   ❌ Absente`);
    }

    // Vérifier translations
    console.log('\n🌍 Translations (JSON):');
    if (attachment.translations) {
      console.log(`   ✅ Présentes`);
      console.log(`   - Type: ${typeof attachment.translations}`);
      console.log(`   - Langues: ${Object.keys(attachment.translations).join(', ')}`);

      for (const [lang, translation] of Object.entries(attachment.translations)) {
        console.log(`\n   🔹 ${lang}:`);
        console.log(`      - Type: ${translation.type}`);
        console.log(`      - Transcription: "${translation.transcription?.substring(0, 50)}..."`);
        console.log(`      - URL: ${translation.url || 'N/A'}`);
        console.log(`      - Path: ${translation.path || 'N/A'}`);
        console.log(`      - Duration: ${translation.durationMs || 0}ms`);
        console.log(`      - Cloned: ${translation.cloned || false}`);
        console.log(`      - Quality: ${translation.quality || 0}`);
        console.log(`      - DeletedAt: ${translation.deletedAt || 'null'}`);
      }
    } else {
      console.log(`   ❌ Absentes`);
    }

    // Vérifier si le champ translations existe mais est vide
    console.log('\n🔍 Structure complète du champ translations:');
    console.log(JSON.stringify(attachment.translations, null, 2));

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await client.close();
    console.log('\n✅ Connexion fermée');
  }
}

checkTranslations();
