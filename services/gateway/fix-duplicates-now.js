// Script pour fixer les doublons IMMÉDIATEMENT
const { PrismaClient } = require('./shared/prisma/client');
const { MongoClient } = require('mongodb');

const prisma = new PrismaClient();

async function fixDuplicatesNow() {
  let mongoClient;
  
  try {
    
    // Étape 1: Se connecter directement à MongoDB
    
    // Lire l'URL depuis .env
    require('dotenv').config({ path: '.env' });
    const dbUrl = process.env.DATABASE_URL;
    
    if (!dbUrl) {
      throw new Error('DATABASE_URL non trouvée dans .env');
    }
    
    
    mongoClient = new MongoClient(dbUrl);
    await mongoClient.connect();
    const db = mongoClient.db('meeshy');
    
    // Étape 2: Vérifier les index existants
    const indexes = await db.collection('MessageTranslation').indexes();
    const hasUniqueIndex = indexes.some(idx => idx.name === 'message_target_language_unique');
    
    if (hasUniqueIndex) {
    } else {
    }
    
    // Étape 3: Trouver les doublons
    const duplicates = await db.collection('MessageTranslation').aggregate([
      {
        $group: {
          _id: { messageId: '$messageId', targetLanguage: '$targetLanguage' },
          count: { $sum: 1 },
          docs: { $push: { id: '$_id', createdAt: '$createdAt' } }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();
    
    
    if (duplicates.length > 0) {
      // Étape 4: Supprimer les doublons (garder le plus récent)
      let deletedCount = 0;
      
      for (const dup of duplicates) {
        // Trier par date (le plus récent en premier)
        dup.docs.sort((a, b) => b.createdAt - a.createdAt);
        
        // Garder le premier, supprimer les autres
        const toDelete = dup.docs.slice(1).map(d => d.id);
        
        if (toDelete.length > 0) {
          const result = await db.collection('MessageTranslation').deleteMany({
            _id: { $in: toDelete }
          });
          deletedCount += result.deletedCount;
        }
      }
      
    } else {
    }
    
    // Étape 5: Créer l'index unique
    
    if (hasUniqueIndex) {
      await db.collection('MessageTranslation').dropIndex('message_target_language_unique');
    }
    
    try {
      await db.collection('MessageTranslation').createIndex(
        { messageId: 1, targetLanguage: 1 },
        { unique: true, name: 'message_target_language_unique' }
      );
    } catch (error) {
      console.error('❌ Erreur création index:', error.message);
    }
    
    // Étape 6: Vérification finale
    const remainingDuplicates = await db.collection('MessageTranslation').aggregate([
      {
        $group: {
          _id: { messageId: '$messageId', targetLanguage: '$targetLanguage' },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();
    
    if (remainingDuplicates.length === 0) {
    } else {
    }
    
    // Étape 7: Compter les traductions
    const totalCount = await db.collection('MessageTranslation').countDocuments();
    
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
    }
    await prisma.$disconnect();
  }
}

fixDuplicatesNow();

