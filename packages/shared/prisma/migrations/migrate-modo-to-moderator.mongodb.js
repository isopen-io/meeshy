/**
 * Migration MongoDB : MODO → MODERATOR
 *
 * Cette migration met à jour tous les utilisateurs ayant le rôle "MODO"
 * vers le nouveau rôle explicite "MODERATOR".
 *
 * Exécution :
 * mongosh "$DATABASE_URL" < migrate-modo-to-moderator.mongodb.js
 *
 * Ou via script Node.js :
 * node migrate-user-roles.ts
 */

// Utiliser la base de données appropriée
use('meeshy');  // Remplacer par le nom de votre base

// ===== ÉTAPE 1 : AFFICHER L'ÉTAT ACTUEL =====
print('📊 État actuel des rôles utilisateur :');
print('');

const currentStats = db.users.aggregate([
  {
    $group: {
      _id: '$role',
      count: { $sum: 1 }
    }
  },
  {
    $sort: { count: -1 }
  }
]);

currentStats.forEach(stat => {
  print(`   ${stat._id}: ${stat.count} utilisateurs`);
});
print('');

// ===== ÉTAPE 2 : COMPTER LES UTILISATEURS MODO =====
const modoCount = db.users.countDocuments({ role: 'MODO' });

if (modoCount > 0) {
  print(`🔧 Migration de ${modoCount} utilisateurs MODO → MODERATOR...`);
  print('');

  // ===== ÉTAPE 3 : EFFECTUER LA MIGRATION =====
  const result = db.users.updateMany(
    { role: 'MODO' },
    {
      $set: {
        role: 'MODERATOR',
        updatedAt: new Date()
      }
    }
  );

  print(`   ✅ ${result.modifiedCount} utilisateurs migrés`);
  print('');
} else {
  print('✅ Aucun utilisateur avec rôle "MODO" trouvé');
  print('');
}

// ===== ÉTAPE 4 : VÉRIFIER LES RÔLES INVALIDES =====
const validRoles = ['USER', 'ADMIN', 'MODERATOR', 'BIGBOSS', 'AUDIT', 'ANALYST'];

const invalidUsers = db.users.find(
  {
    role: { $nin: validRoles }
  },
  {
    _id: 1,
    username: 1,
    role: 1
  }
).toArray();

if (invalidUsers.length > 0) {
  print('⚠️  Utilisateurs avec rôles non-standard détectés :');
  print('');
  invalidUsers.forEach(user => {
    print(`   - ${user.username} (${user._id}): "${user.role}"`);
  });
  print('');
  print('❌ Veuillez corriger ces rôles manuellement.');
  print('');
} else {
  print('✅ Tous les rôles sont conformes');
  print('');
}

// ===== ÉTAPE 5 : AFFICHER L'ÉTAT FINAL =====
print('📊 État final des rôles utilisateur :');
print('');

const finalStats = db.users.aggregate([
  {
    $group: {
      _id: '$role',
      count: { $sum: 1 }
    }
  },
  {
    $sort: { count: -1 }
  }
]);

finalStats.forEach(stat => {
  print(`   ${stat._id}: ${stat.count} utilisateurs`);
});
print('');

print('✅ Migration terminée avec succès !');
