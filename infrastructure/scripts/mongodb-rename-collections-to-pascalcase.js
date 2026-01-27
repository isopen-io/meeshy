/**
 * Script MongoDB pour renommer les collections snake_case en PascalCase
 * Compatible avec Prisma sans @@map
 *
 * Exécution: mongosh meeshy < mongodb-rename-collections-to-pascalcase.js
 */

print("=== Renommage des collections vers PascalCase ===\n");

// user_conversation_categories → UserConversationCategory
print("1. Renommage user_conversation_categories → UserConversationCategory...");
try {
  const oldCount = db.user_conversation_categories.countDocuments();
  if (oldCount > 0) {
    // Supprimer la collection PascalCase si elle existe (probablement vide)
    db.UserConversationCategory.drop();
    // Renommer
    db.user_conversation_categories.renameCollection("UserConversationCategory");
    const newCount = db.UserConversationCategory.countDocuments();
    print(`   ✅ ${newCount} documents renommés\n`);
  } else {
    print("   ⚠️  Collection source vide ou inexistante\n");
  }
} catch (e) {
  if (e.code === 26) {
    print("   ⚠️  Collection source n'existe pas (normal si déjà renommée)\n");
  } else {
    print("   ❌ Erreur: " + e.message + "\n");
  }
}

// user_conversation_preferences → UserConversationPreferences
print("2. Renommage user_conversation_preferences → UserConversationPreferences...");
try {
  const oldCount = db.user_conversation_preferences.countDocuments();
  if (oldCount > 0) {
    // Supprimer la collection PascalCase si elle existe
    db.UserConversationPreferences.drop();
    // Renommer
    db.user_conversation_preferences.renameCollection("UserConversationPreferences");
    const newCount = db.UserConversationPreferences.countDocuments();
    print(`   ✅ ${newCount} documents renommés\n`);
  } else {
    print("   ⚠️  Collection source vide ou inexistante\n");
  }
} catch (e) {
  if (e.code === 26) {
    print("   ⚠️  Collection source n'existe pas (normal si déjà renommée)\n");
  } else {
    print("   ❌ Erreur: " + e.message + "\n");
  }
}

// Vérification finale
print("\n=== Vérification ===\n");
print("UserConversationCategory: " + db.UserConversationCategory.countDocuments() + " documents");
print("UserConversationPreferences: " + db.UserConversationPreferences.countDocuments() + " documents");

print("\n✅ Renommage terminé !");
