/**
 * Trouver l'ID de conversation pour un message
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.DATABASE_URL || 'mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true';

async function getConversationId() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB\n');

    const db = client.db();
    const messages = db.collection('Message');

    // Trouver le message avec transcription
    const message = await messages.findOne({
      _id: require('mongodb').ObjectId.createFromHexString('696e4ff3acd8e6ae9461ad7d')
    });

    if (message) {
      console.log('📄 Message trouvé:');
      console.log(`   - ID: ${message._id}`);
      console.log(`   - Conversation ID: ${message.conversationId}`);
      console.log(`   - Content: ${message.content}`);
      console.log(`   - Created: ${message.createdAt}`);
    } else {
      console.log('❌ Message non trouvé');
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await client.close();
    console.log('\n✅ Connexion fermée');
  }
}

getConversationId();
