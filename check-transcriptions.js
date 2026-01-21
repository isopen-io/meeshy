/**
 * Script pour vérifier les transcriptions dans MongoDB
 * Exécuter avec: node check-transcriptions.js
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.DATABASE_URL || 'mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true';

async function checkTranscriptions() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB');

    const db = client.db();
    const attachments = db.collection('MessageAttachment');

    // Compter tous les attachments audio
    const totalAudios = await attachments.countDocuments({
      mimeType: { $regex: /^audio\// }
    });

    console.log(`\n📊 Total d'attachments audio: ${totalAudios}`);

    // Compter les audios avec transcription
    const withTranscription = await attachments.countDocuments({
      mimeType: { $regex: /^audio\// },
      transcription: { $ne: null, $exists: true }
    });

    console.log(`✅ Avec transcription: ${withTranscription}`);
    console.log(`❌ Sans transcription: ${totalAudios - withTranscription}`);

    // Compter les audios avec translations
    const withTranslations = await attachments.countDocuments({
      mimeType: { $regex: /^audio\// },
      translations: { $ne: null, $exists: true }
    });

    console.log(`\n🌐 Avec translations: ${withTranslations}`);

    // Afficher quelques exemples
    console.log('\n📄 Exemples d\'attachments audio:');
    const samples = await attachments.find({
      mimeType: { $regex: /^audio\// }
    }).limit(3).toArray();

    samples.forEach((att, i) => {
      console.log(`\n${i + 1}. Attachment ID: ${att._id}`);
      console.log(`   - Fichier: ${att.originalName}`);
      console.log(`   - Transcription: ${att.transcription ? 'OUI' : 'NON'}`);
      console.log(`   - Translations: ${att.translations ? 'OUI' : 'NON'}`);

      if (att.transcription) {
        console.log(`   - Texte transcrit: ${JSON.stringify(att.transcription).substring(0, 100)}...`);
      }

      if (att.translations) {
        console.log(`   - Traductions: ${JSON.stringify(att.translations).substring(0, 100)}...`);
      }
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await client.close();
    console.log('\n✅ Connexion fermée');
  }
}

checkTranscriptions();
