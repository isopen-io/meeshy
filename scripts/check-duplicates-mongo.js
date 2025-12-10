// Script pour vérifier les doublons de traductions dans MongoDB
const { MongoClient } = require('mongodb');

async function checkDuplicates() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    await client.connect();
    const db = client.db('meeshy');
    
    console.log('🔍 Recherche de doublons de traductions...\n');
    
    // Trouver les doublons
    const duplicates = await db.collection('MessageTranslation').aggregate([
      {
        $group: {
          _id: {
            messageId: '$messageId',
            targetLanguage: '$targetLanguage'
          },
          count: { $sum: 1 },
          docs: {
            $push: {
              id: '$_id',
              createdAt: '$createdAt',
              translatedContent: '$translatedContent'
            }
          }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      },
      {
        $limit: 20
      }
    ]).toArray();
    
    if (duplicates.length === 0) {
      console.log('✅ Aucun doublon trouvé!\n');
      return;
    }
    
    console.log(`❌ ${duplicates.length} groupe(s) de doublons trouvés:\n`);
    
    let totalDuplicates = 0;
    duplicates.forEach((dup, idx) => {
      console.log(`${idx + 1}. Message: ${dup._id.messageId.substring(0, 8)}...`);
      console.log(`   Langue: ${dup._id.targetLanguage}`);
      console.log(`   Nombre de traductions: ${dup.count}`);
      console.log(`   Doublons:`);
      
      dup.docs.forEach((doc, docIdx) => {
        console.log(`     [${docIdx + 1}] ID: ${doc.id.toString().substring(0, 8)}... - ${doc.createdAt.toISOString()}`);
        console.log(`         Contenu: "${doc.translatedContent.substring(0, 50)}..."`);
      });
      console.log('');
      
      totalDuplicates += (dup.count - 1);
    });
    
    console.log(`📊 Total de traductions en trop: ${totalDuplicates}\n`);
    
    // Compter le total de traductions
    const total = await db.collection('MessageTranslation').countDocuments();
    console.log(`📊 Total de traductions en base: ${total}\n`);
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

checkDuplicates();

