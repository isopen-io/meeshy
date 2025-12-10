#!/usr/bin/env node
/**
 * Script MongoDB pour corriger les ConversationShareLink sans identifier
 * Utilise MongoDB directement pour bypasser Prisma
 */

const { MongoClient } = require('mongodb');

// Générer un identifier unique
function generateIdentifier(conversationIdentifier, linkId) {
  const randomSuffix = linkId.substring(0, 6);
  return `mshy_${conversationIdentifier}_${randomSuffix}`;
}

async function fixShareLinkIdentifiers() {
  const mongoUrl = process.env.DATABASE_URL || 'mongodb://meeshy-database:27017/meeshy?replicaSet=rs0';
  const client = new MongoClient(mongoUrl);
  
  try {
    await client.connect();
    
    const db = client.db();
    const shareLinksColl = db.collection('ConversationShareLink');
    const conversationsColl = db.collection('Conversation');
    
    
    // Trouver tous les liens sans identifier (null, undefined ou vide)
    const linksWithoutIdentifier = await shareLinksColl.find({
      $or: [
        { identifier: null },
        { identifier: { $exists: false } },
        { identifier: '' }
      ]
    }).toArray();
    
    
    if (linksWithoutIdentifier.length === 0) {
      return;
    }
    
    let fixedCount = 0;
    let errorCount = 0;
    
    for (const link of linksWithoutIdentifier) {
      try {
        
        // Récupérer la conversation
        const conversation = await conversationsColl.findOne({
          _id: link.conversationId
        });
        
        if (!conversation) {
          errorCount++;
          continue;
        }
        
        
        // Générer le nouvel identifier
        let newIdentifier = generateIdentifier(conversation.identifier, link.linkId);
        
        // Vérifier l'unicité et ajuster si nécessaire
        let counter = 1;
        while (true) {
          const existing = await shareLinksColl.findOne({ identifier: newIdentifier });
          if (!existing) break;
          
          newIdentifier = generateIdentifier(conversation.identifier, link.linkId) + `_${counter}`;
          counter++;
        }
        
        
        // Mettre à jour le document
        await shareLinksColl.updateOne(
          { _id: link._id },
          { $set: { identifier: newIdentifier } }
        );
        
        fixedCount++;
        
      } catch (error) {
        console.error(`   ❌ Erreur pour le lien ${link._id}:`, error.message);
        errorCount++;
      }
    }
    
    
    if (fixedCount > 0) {
    }
    
  } catch (error) {
    console.error('❌ Erreur fatale:', error);
    throw error;
  } finally {
    await client.close();
  }
}

// Exécuter le script
fixShareLinkIdentifiers()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erreur:', error);
    process.exit(1);
  });
