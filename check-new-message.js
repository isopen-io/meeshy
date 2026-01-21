/**
 * Vérifier le nouveau message avec transcription depuis les logs
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.DATABASE_URL || 'mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true';

async function checkNewMessage() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB\n');

    const db = client.db();
    const attachments = db.collection('MessageAttachment');
    const messages = db.collection('Message');

    // Message ID et Attachment ID depuis les logs
    const messageId = '696e919b066d60252d4ef4ec';
    const attachmentId = '696e9198066d60252d4ef4eb';

    console.log('🔍 Recherche du message:', messageId);
    const message = await messages.findOne({
      _id: require('mongodb').ObjectId.createFromHexString(messageId)
    });

    if (message) {
      console.log('✅ Message trouvé:');
      console.log(`   - ID: ${message._id}`);
      console.log(`   - Conversation: ${message.conversationId}`);
      console.log(`   - Content: ${message.content}`);
      console.log(`   - Created: ${message.createdAt}`);
    } else {
      console.log('❌ Message non trouvé');
    }

    console.log('\n🔍 Recherche de l\'attachment:', attachmentId);
    const attachment = await attachments.findOne({
      _id: require('mongodb').ObjectId.createFromHexString(attachmentId)
    });

    if (attachment) {
      console.log('✅ Attachment trouvé:');
      console.log(`   - ID: ${attachment._id}`);
      console.log(`   - Fichier: ${attachment.originalName}`);
      console.log(`   - Type: ${attachment.mimeType}`);
      console.log(`   - Message ID: ${attachment.messageId}`);
      console.log(`   - Transcription présente: ${attachment.transcription ? 'OUI ✅' : 'NON ❌'}`);

      if (attachment.transcription) {
        console.log('\n📝 Transcription:');
        console.log(`   - Text: ${attachment.transcription.text?.substring(0, 100)}...`);
        console.log(`   - Language: ${attachment.transcription.language}`);
        console.log(`   - Confidence: ${attachment.transcription.confidence}`);
        console.log(`   - Source: ${attachment.transcription.source}`);
        console.log(`   - Model: ${attachment.transcription.model}`);
        console.log(`   - Duration: ${attachment.transcription.durationMs}ms`);
        console.log(`   - Segments: ${attachment.transcription.segments?.length || 0}`);
      }

      console.log(`\n🌍 Translations présentes: ${attachment.translations ? 'OUI ✅' : 'NON ❌'}`);
      if (attachment.translations) {
        console.log('   - Langues:', Object.keys(attachment.translations));
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

checkNewMessage();
