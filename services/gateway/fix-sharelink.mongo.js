// Script MongoDB Shell pour corriger les ConversationShareLink sans identifier
// Usage: mongosh meeshy < fix-sharelink.mongo.js

// Fonction pour générer un identifier
function generateIdentifier(conversationIdentifier, linkId) {
  const randomSuffix = linkId.substring(0, 6);
  return `mshy_${conversationIdentifier}_${randomSuffix}`;
}

print('🔍 Recherche des ConversationShareLink sans identifier...\n');

// Connexion à la base de données
const db = db.getSiblingDB('meeshy');

// Trouver tous les liens sans identifier
const linksWithoutIdentifier = db.ConversationShareLink.find({
  $or: [
    { identifier: null },
    { identifier: { $exists: false } },
    { identifier: '' }
  ]
}).toArray();

print(`📊 Liens sans identifier trouvés: ${linksWithoutIdentifier.length}\n`);

if (linksWithoutIdentifier.length === 0) {
  print('✨ Aucune correction nécessaire - tout est en ordre !');
} else {
  let fixedCount = 0;
  let errorCount = 0;
  
  linksWithoutIdentifier.forEach(link => {
    try {
      print(`🔧 Correction du lien ${link._id}`);
      print(`   linkId: ${link.linkId}`);
      
      // Récupérer la conversation
      const conversation = db.Conversation.findOne({ _id: link.conversationId });
      
      if (!conversation) {
        print(`   ⚠️  Conversation non trouvée: ${link.conversationId}`);
        errorCount++;
        return;
      }
      
      print(`   Conversation: ${conversation.identifier}`);
      
      // Générer le nouvel identifier
      let newIdentifier = generateIdentifier(conversation.identifier, link.linkId);
      
      // Vérifier l'unicité et ajuster si nécessaire
      let counter = 1;
      while (db.ConversationShareLink.findOne({ identifier: newIdentifier })) {
        newIdentifier = generateIdentifier(conversation.identifier, link.linkId) + `_${counter}`;
        counter++;
      }
      
      print(`   Nouvel identifier: ${newIdentifier}`);
      
      // Mettre à jour le document
      db.ConversationShareLink.updateOne(
        { _id: link._id },
        { $set: { identifier: newIdentifier } }
      );
      
      print(`   ✅ Lien mis à jour\n`);
      fixedCount++;
      
    } catch (error) {
      print(`   ❌ Erreur: ${error.message}`);
      errorCount++;
    }
  });
  
  print('\n═══════════════════════════════════════════════');
  print('📊 RÉSUMÉ');
  print('═══════════════════════════════════════════════');
  print(`✅ Liens corrigés: ${fixedCount}`);
  print(`❌ Erreurs: ${errorCount}`);
  print(`📋 Total trouvés: ${linksWithoutIdentifier.length}`);
  print('═══════════════════════════════════════════════\n');
  
  if (fixedCount > 0) {
    print('🎉 Base de données nettoyée avec succès !');
  }
}

print('\n✅ Script terminé\n');
