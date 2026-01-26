// Script MongoDB pour ajouter les index d'optimisation de la requête /conversations
// Usage: mongosh mongodb://...meeshy < add-conversations-optimization-indexes-mongo.js

print("📊 Ajout des index d'optimisation de la requête /conversations...");

// ===================================================================
// 1. Index sur Conversation(isActive)
// ===================================================================
print("\n1. Index isActive_1 sur Conversation...");
try {
  const result1 = db.Conversation.createIndex(
    { isActive: 1 },
    { name: "isActive_1", background: true }
  );
  print("✅ " + result1);
} catch (e) {
  if (e.code === 85 || e.codeName === "IndexAlreadyExists") {
    print("ℹ️  Index déjà présent, skip");
  } else {
    print("❌ Erreur: " + e);
  }
}

// ===================================================================
// 2. Index sur Conversation(lastMessageAt)
// ===================================================================
print("\n2. Index lastMessageAt_1 sur Conversation...");
try {
  const result2 = db.Conversation.createIndex(
    { lastMessageAt: 1 },
    { name: "lastMessageAt_1", background: true }
  );
  print("✅ " + result2);
} catch (e) {
  if (e.code === 85 || e.codeName === "IndexAlreadyExists") {
    print("ℹ️  Index déjà présent, skip");
  } else {
    print("❌ Erreur: " + e);
  }
}

// ===================================================================
// 3. Index composite sur Message(conversationId, isDeleted, createdAt)
// ===================================================================
print("\n3. Index composite conversationId_isDeleted_createdAt sur Message...");
try {
  const result3 = db.Message.createIndex(
    { conversationId: 1, isDeleted: 1, createdAt: 1 },
    { name: "conversationId_isDeleted_createdAt_compound", background: true }
  );
  print("✅ " + result3);
} catch (e) {
  if (e.code === 85 || e.codeName === "IndexAlreadyExists") {
    print("ℹ️  Index déjà présent, skip");
  } else {
    print("❌ Erreur: " + e);
  }
}

print("\n📈 Statistiques:");
print("  Conversation: " + db.Conversation.countDocuments() + " documents");
print("  Message: " + db.Message.countDocuments() + " documents");

print("\n✅ Migration terminée !");
print("\n📊 Index créés :");
print("  1. Conversation(isActive) - Filtre conversations actives");
print("  2. Conversation(lastMessageAt) - Tri par activité récente");
print("  3. Message(conversationId, isDeleted, createdAt) - Requête lastMessage optimisée");
