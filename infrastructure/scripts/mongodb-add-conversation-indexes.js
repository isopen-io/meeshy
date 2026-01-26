/**
 * Script MongoDB pour ajouter les index critiques de performance
 * sur les collections conversations
 *
 * Exécution:
 * mongosh mongodb://localhost:27017/meeshy < mongodb-add-conversation-indexes.js
 *
 * Ou dans MongoDB Compass: copier-coller ce code
 */

// ============================================
// P0 - INDEX CRITIQUES (exécuter immédiatement)
// ============================================

print("=== Ajout des index critiques pour performances conversations ===\n");

// INDEX 1: ConversationMember - Recherche rapide des conversations d'un utilisateur
print("1. Création index ConversationMember [userId, isActive, conversationId]...");
try {
  db.ConversationMember.createIndex(
    { "userId": 1, "isActive": 1, "conversationId": 1 },
    { name: "idx_member_user_active_conv", background: true }
  );
  print("   ✅ Index créé avec succès\n");
} catch (e) {
  if (e.code === 85 || e.code === 86) {
    print("   ⚠️  Index existe déjà (normal)\n");
  } else {
    print("   ❌ Erreur: " + e.message + "\n");
  }
}

// INDEX 2: Message - Recherche rapide du dernier message d'une conversation
print("2. Création index Message [conversationId, isDeleted, createdAt]...");
try {
  db.Message.createIndex(
    { "conversationId": 1, "isDeleted": 1, "createdAt": -1 },
    { name: "idx_message_conv_notdeleted_created", background: true }
  );
  print("   ✅ Index créé avec succès\n");
} catch (e) {
  if (e.code === 85 || e.code === 86) {
    print("   ⚠️  Index existe déjà (normal)\n");
  } else {
    print("   ❌ Erreur: " + e.message + "\n");
  }
}

// ============================================
// P1 - INDEX IMPORTANTS
// ============================================

// INDEX 3: Conversation - Tri et filtre sur isActive + lastMessageAt
print("3. Création index Conversation [isActive, lastMessageAt]...");
try {
  db.Conversation.createIndex(
    { "isActive": 1, "lastMessageAt": -1 },
    { name: "idx_conversation_active_lastmsg", background: true }
  );
  print("   ✅ Index créé avec succès\n");
} catch (e) {
  if (e.code === 85 || e.code === 86) {
    print("   ⚠️  Index existe déjà (normal)\n");
  } else {
    print("   ❌ Erreur: " + e.message + "\n");
  }
}

// INDEX 4: ConversationReadCursor - Recherche rapide des curseurs de lecture
print("4. Création index ConversationReadCursor [userId, conversationId]...");
try {
  db.ConversationReadCursor.createIndex(
    { "userId": 1, "conversationId": 1 },
    { name: "idx_cursor_user_conv", background: true }
  );
  print("   ✅ Index créé avec succès\n");
} catch (e) {
  if (e.code === 85 || e.code === 86) {
    print("   ⚠️  Index existe déjà (normal)\n");
  } else {
    print("   ❌ Erreur: " + e.message + "\n");
  }
}

// INDEX 5: UserConversationPreferences - Recherche rapide des préférences utilisateur
print("5. Création index UserConversationPreferences [userId, conversationId]...");
try {
  db.UserConversationPreferences.createIndex(
    { "userId": 1, "conversationId": 1 },
    { name: "idx_userprefs_user_conv", background: true }
  );
  print("   ✅ Index créé avec succès\n");
} catch (e) {
  if (e.code === 85 || e.code === 86) {
    print("   ⚠️  Index existe déjà (normal)\n");
  } else {
    print("   ❌ Erreur: " + e.message + "\n");
  }
}

// ============================================
// P2 - INDEX OPTIONNELS
// ============================================

// INDEX 6: Conversation - Filtre par type + tri
print("6. Création index Conversation [type, isActive, lastMessageAt]...");
try {
  db.Conversation.createIndex(
    { "type": 1, "isActive": 1, "lastMessageAt": -1 },
    { name: "idx_conversation_type_active_lastmsg", background: true }
  );
  print("   ✅ Index créé avec succès\n");
} catch (e) {
  if (e.code === 85 || e.code === 86) {
    print("   ⚠️  Index existe déjà (normal)\n");
  } else {
    print("   ❌ Erreur: " + e.message + "\n");
  }
}

// ============================================
// VÉRIFICATION DES INDEX
// ============================================

print("\n=== Vérification des index créés ===\n");

print("ConversationMember indexes:");
db.ConversationMember.getIndexes().forEach(idx => {
  print("  - " + idx.name + ": " + JSON.stringify(idx.key));
});

print("\nMessage indexes:");
db.Message.getIndexes().forEach(idx => {
  print("  - " + idx.name + ": " + JSON.stringify(idx.key));
});

print("\nConversation indexes:");
db.Conversation.getIndexes().forEach(idx => {
  print("  - " + idx.name + ": " + JSON.stringify(idx.key));
});

print("\nConversationReadCursor indexes:");
db.ConversationReadCursor.getIndexes().forEach(idx => {
  print("  - " + idx.name + ": " + JSON.stringify(idx.key));
});

print("\nUserConversationPreferences indexes:");
db.UserConversationPreferences.getIndexes().forEach(idx => {
  print("  - " + idx.name + ": " + JSON.stringify(idx.key));
});

print("\n✅ Script d'index terminé !");
print("\nEstimation amélioration performances:");
print("  - conversationsQuery: 2.5-6.3s → 0.2-0.5s");
print("  - countQuery: 1.8-5.4s → inclus dans ci-dessus");
print("  - TOTAL: 6-11s → 0.25-0.9s (10-40x plus rapide)");
