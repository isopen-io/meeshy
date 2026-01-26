// Script MongoDB pour renommer les collections user_conversation_* vers PascalCase
// Usage: mongosh mongodb://...meeshy < rename-conversation-collections.js

print("🔄 Renommage des collections UserConversation*...");

// =============================================================================
// 1. Renommer user_conversation_categories → UserConversationCategory
// =============================================================================
print("\n1. Renommage user_conversation_categories...");
try {
  const oldCatExists = db.getCollectionNames().includes('user_conversation_categories');
  const newCatExists = db.getCollectionNames().includes('UserConversationCategory');

  if (oldCatExists && !newCatExists) {
    db.user_conversation_categories.renameCollection('UserConversationCategory');
    print("✅ user_conversation_categories → UserConversationCategory");
  } else if (newCatExists && !oldCatExists) {
    print("ℹ️  Collection déjà renommée en UserConversationCategory");
  } else if (oldCatExists && newCatExists) {
    const oldCount = db.user_conversation_categories.countDocuments();
    const newCount = db.UserConversationCategory.countDocuments();
    print("⚠️  Les deux collections existent:");
    print("   user_conversation_categories: " + oldCount + " documents");
    print("   UserConversationCategory: " + newCount + " documents");
    if (oldCount === 0) {
      db.user_conversation_categories.drop();
      print("✅ Ancienne collection vide supprimée");
    } else {
      print("❌ Impossible de renommer: les deux collections contiennent des données");
      print("   Action manuelle requise!");
    }
  } else {
    print("ℹ️  Aucune collection trouvée");
  }
} catch (e) {
  print("❌ Erreur: " + e);
}

// =============================================================================
// 2. Renommer user_conversation_preferences → UserConversationPreferences
// =============================================================================
print("\n2. Renommage user_conversation_preferences...");
try {
  const oldPrefExists = db.getCollectionNames().includes('user_conversation_preferences');
  const newPrefExists = db.getCollectionNames().includes('UserConversationPreferences');

  if (oldPrefExists && !newPrefExists) {
    db.user_conversation_preferences.renameCollection('UserConversationPreferences');
    print("✅ user_conversation_preferences → UserConversationPreferences");
  } else if (newPrefExists && !oldPrefExists) {
    print("ℹ️  Collection déjà renommée en UserConversationPreferences");
  } else if (oldPrefExists && newPrefExists) {
    const oldCount = db.user_conversation_preferences.countDocuments();
    const newCount = db.UserConversationPreferences.countDocuments();
    print("⚠️  Les deux collections existent:");
    print("   user_conversation_preferences: " + oldCount + " documents");
    print("   UserConversationPreferences: " + newCount + " documents");
    if (oldCount === 0) {
      db.user_conversation_preferences.drop();
      print("✅ Ancienne collection vide supprimée");
    } else {
      print("❌ Impossible de renommer: les deux collections contiennent des données");
      print("   Action manuelle requise!");
    }
  } else {
    print("ℹ️  Aucune collection trouvée");
  }
} catch (e) {
  print("❌ Erreur: " + e);
}

// =============================================================================
// 3. Vérification finale
// =============================================================================
print("\n📊 État final:");
const finalCatCount = db.UserConversationCategory.countDocuments();
const finalPrefCount = db.UserConversationPreferences.countDocuments();

print("  UserConversationCategory: " + finalCatCount + " documents");
print("  UserConversationPreferences: " + finalPrefCount + " documents");

print("\n✅ Migration terminée !");
