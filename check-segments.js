/**
 * Vérifier les segments dans les transcriptions
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.DATABASE_URL || 'mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true';

async function checkSegments() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB\n');

    const db = client.db();
    const attachments = db.collection('MessageAttachment');

    // Vérifier les deux messages
    const messageIds = [
      '696e919b066d60252d4ef4ec', // Message actuel (sans segments ?)
      '696e4ff3acd8e6ae9461ad7d'  // Message ancien (avec segments)
    ];

    for (const messageId of messageIds) {
      console.log(`\n🔍 Message: ${messageId}`);

      const attachment = await attachments.findOne({
        messageId: require('mongodb').ObjectId.createFromHexString(messageId)
      });

      if (attachment && attachment.transcription) {
        console.log(`   ✅ Transcription présente`);
        console.log(`   - Text: ${attachment.transcription.text?.substring(0, 60)}...`);
        console.log(`   - Segments field exists: ${attachment.transcription.segments !== undefined ? 'OUI' : 'NON'}`);
        console.log(`   - Segments count: ${attachment.transcription.segments?.length || 0}`);

        if (attachment.transcription.segments && attachment.transcription.segments.length > 0) {
          console.log(`   - Premier segment:`, attachment.transcription.segments[0]);
        } else {
          console.log(`   ⚠️  Pas de segments (array vide ou absent)`);
        }
      } else {
        console.log(`   ❌ Pas de transcription`);
      }
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await client.close();
    console.log('\n✅ Connexion fermée');
  }
}

checkSegments();
