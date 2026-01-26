// Script MongoDB pour migrer MessageTranslation vers Message.translations (JSON)
// Usage: mongosh mongodb://...meeshy < migrate-translations-to-json.js

print("🔄 Migration des traductions vers format JSON intégré...");

// =============================================================================
// 1. Récupérer toutes les traductions
// =============================================================================
print("\n1. Comptage des traductions...");
const translationCount = db.MessageTranslation.countDocuments();
print(`   📊 Total traductions: ${translationCount}`);

if (translationCount === 0) {
  print("ℹ️  Aucune traduction à migrer");
  quit(0);
}

// =============================================================================
// 2. Grouper les traductions par messageId
// =============================================================================
print("\n2. Groupement par message...");
const translationsByMessage = db.MessageTranslation.aggregate([
  {
    $group: {
      _id: "$messageId",
      translations: {
        $push: {
          targetLanguage: "$targetLanguage",
          text: "$translatedContent",
          translationModel: "$translationModel",
          confidenceScore: "$confidenceScore",
          isEncrypted: "$isEncrypted",
          encryptionKeyId: "$encryptionKeyId",
          encryptionIv: "$encryptionIv",
          encryptionAuthTag: "$encryptionAuthTag",
          createdAt: "$createdAt",
          updatedAt: "$updatedAt"
        }
      }
    }
  }
]).toArray();

print(`   📊 Messages avec traductions: ${translationsByMessage.length}`);

// =============================================================================
// 3. Migrer vers Message.translations (JSON)
// =============================================================================
print("\n3. Migration vers Message.translations...");
let migratedCount = 0;
let errorCount = 0;

for (const group of translationsByMessage) {
  try {
    const messageId = group._id;

    // Transformer le tableau en objet indexé par langue
    const translationsObject = {};
    for (const t of group.translations) {
      translationsObject[t.targetLanguage] = {
        text: t.text,
        translationModel: t.translationModel,
        confidenceScore: t.confidenceScore || null,
        isEncrypted: t.isEncrypted || false,
        encryptionKeyId: t.encryptionKeyId || null,
        encryptionIv: t.encryptionIv || null,
        encryptionAuthTag: t.encryptionAuthTag || null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt || t.createdAt
      };
    }

    // Mettre à jour le message
    const result = db.Message.updateOne(
      { _id: messageId },
      { $set: { translations: translationsObject } }
    );

    if (result.modifiedCount > 0) {
      migratedCount++;
    } else {
      print(`   ⚠️  Message non trouvé: ${messageId}`);
      errorCount++;
    }

  } catch (e) {
    print(`   ❌ Erreur pour message ${group._id}: ${e}`);
    errorCount++;
  }
}

print(`   ✅ Messages migrés: ${migratedCount}`);
if (errorCount > 0) {
  print(`   ⚠️  Erreurs: ${errorCount}`);
}

// =============================================================================
// 4. Vérification
// =============================================================================
print("\n4. Vérification...");
const messagesWithTranslations = db.Message.countDocuments({ translations: { $exists: true, $ne: null } });
print(`   📊 Messages avec translations (JSON): ${messagesWithTranslations}`);

// =============================================================================
// 5. Backup et suppression de MessageTranslation (optionnel)
// =============================================================================
print("\n5. Nettoyage de l'ancienne collection...");
print("   ⚠️  La collection MessageTranslation peut maintenant être supprimée");
print("   💡 Commande: db.MessageTranslation.drop()");
print("   💡 Ou conserver comme backup temporaire");

print("\n✅ Migration terminée !");
print(`   - ${migratedCount} messages migrés`);
print(`   - ${messagesWithTranslations} messages avec traductions JSON`);
