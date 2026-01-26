// Script MongoDB pour ajouter les index d'optimisation
// Usage: mongosh mongodb://...meeshy < add-indexes.js

print("📊 Ajout des index d'optimisation getUserStats...");

// 1. Index composite sur ConversationMember(userId, isActive)
print("\n1. Index userId_isActive_compound sur ConversationMember...");
try {
  const result1 = db.ConversationMember.createIndex(
    { userId: 1, isActive: 1 },
    { name: "userId_isActive_compound", background: true }
  );
  print("✅ " + result1);
} catch (e) {
  if (e.code === 85 || e.codeName === "IndexAlreadyExists") {
    print("ℹ️  Index déjà présent, skip");
  } else {
    print("❌ Erreur: " + e);
  }
}

// 2. Index sur Conversation(type)
print("\n2. Index type_1 sur Conversation...");
try {
  const result2 = db.Conversation.createIndex(
    { type: 1 },
    { name: "type_1", background: true }
  );
  print("✅ " + result2);
} catch (e) {
  if (e.code === 85 || e.codeName === "IndexAlreadyExists") {
    print("ℹ️  Index déjà présent, skip");
  } else {
    print("❌ Erreur: " + e);
  }
}

print("\n📈 Statistiques:");
print("  ConversationMember: " + db.ConversationMember.countDocuments() + " documents");
print("  Conversation: " + db.Conversation.countDocuments() + " documents");

print("\n✅ Migration terminée !");
