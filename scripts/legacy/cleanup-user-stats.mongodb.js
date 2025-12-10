// Script MongoDB pour nettoyer les doublons dans UserStats

const duplicates = db.UserStats.aggregate([
  {
    $group: {
      _id: { userId: "$userId" },
      docs: { $push: { _id: "$_id", createdAt: "$createdAt" } },
      count: { $sum: 1 }
    }
  },
  {
    $match: { count: { $gt: 1 } }
  }
]).toArray();

print('🔍 Trouvé ' + duplicates.length + ' groupes de doublons dans UserStats\n');

let totalDeleted = 0;
duplicates.forEach(dup => {
  // Trier par date de création décroissante
  const sorted = dup.docs.sort((a, b) => {
    const dateA = a.createdAt || new Date(0);
    const dateB = b.createdAt || new Date(0);
    return dateB - dateA;
  });
  
  // Garder le premier (plus récent), supprimer les autres
  const toDelete = sorted.slice(1);
  toDelete.forEach(doc => {
    db.UserStats.deleteOne({ _id: doc._id });
    totalDeleted++;
    print('🗑️  Supprimé doublon UserStats: ' + doc._id);
  });
});

print('\n✅ ' + totalDeleted + ' doublons supprimés dans UserStats');
