/**
 * Script détaillé pour vérifier les transcriptions dans MongoDB
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.DATABASE_URL || 'mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true';

async function checkTranscriptionsDetail() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB\n');

    const db = client.db();
    const attachments = db.collection('MessageAttachment');

    // Trouver des attachments avec transcription
    console.log('🔍 Recherche d\'attachments AVEC transcription...\n');
    const withTranscription = await attachments.find({
      mimeType: { $regex: /^audio\// },
      transcription: { $ne: null, $exists: true }
    }).limit(3).toArray();

    console.log(`✅ Trouvé ${withTranscription.length} attachments avec transcription:\n`);

    withTranscription.forEach((att, i) => {
      console.log(`${i + 1}. Attachment ID: ${att._id}`);
      console.log(`   - Message ID: ${att.messageId}`);
      console.log(`   - Fichier: ${att.originalName}`);
      console.log(`   - Transcription type: ${typeof att.transcription}`);
      console.log(`   - Transcription keys:`, Object.keys(att.transcription || {}));
      console.log(`   - Transcription complète:`);
      console.log(JSON.stringify(att.transcription, null, 2));
      console.log('\n');
    });

    // Trouver des attachments SANS transcription (récents)
    console.log('🔍 Recherche d\'attachments SANS transcription (3 plus récents)...\n');
    const withoutTranscription = await attachments.find({
      mimeType: { $regex: /^audio\// },
      $or: [
        { transcription: null },
        { transcription: { $exists: false } }
      ]
    }).sort({ createdAt: -1 }).limit(3).toArray();

    console.log(`❌ Trouvé ${withoutTranscription.length} attachments sans transcription:\n`);

    withoutTranscription.forEach((att, i) => {
      console.log(`${i + 1}. Attachment ID: ${att._id}`);
      console.log(`   - Message ID: ${att.messageId}`);
      console.log(`   - Fichier: ${att.originalName}`);
      console.log(`   - Créé le: ${att.createdAt}`);
      console.log(`   - Transcription: ${att.transcription}`);
      console.log('\n');
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await client.close();
    console.log('✅ Connexion fermée');
  }
}

checkTranscriptionsDetail();
