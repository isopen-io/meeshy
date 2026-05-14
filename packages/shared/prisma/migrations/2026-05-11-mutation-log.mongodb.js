/**
 * Migration MongoDB — Wave 1 Task 3.3 (offline-queue clientMutationId dedup)
 *
 * Crée la collection `mutation_logs` et ses index pour la table
 * `MutationLog` (schema.prisma). Cette table généralise le pattern dedup
 * `Message.clientMessageId` (Phase 4 §6.2) à toutes les mutations
 * non-message persistées dans l'outbox iOS : friend request, block,
 * profile update, settings update, post create/like, comment, repost, etc.
 *
 * Pattern dedup (côté gateway, Task 3.5+) :
 *   1. Le client envoie une mutation avec un `clientMutationId`
 *      (`cmid_<uuid>`, voir `ClientMutationId.swift` côté iOS).
 *   2. Le handler tente `prisma.mutationLog.create(...)` avec la clé
 *      `(userId, clientMutationId)`.
 *   3. Sur P2002 (violation d'unicité), il lit la row existante et
 *      renvoie son `resultId` au lieu de réappliquer le side-effect.
 *
 * Index principal :
 *   `mutation_logs_userId_clientMutationId_unique`
 *      unique sur (userId, clientMutationId) — la clé de dedup.
 *      Prisma génère ce nom par défaut via `@@unique`, on aligne
 *      manuellement pour idempotence avec ce script.
 *
 * Index secondaire :
 *   `mutation_logs_createdAt_idx`
 *      sur createdAt — supporte la passe TTL (cron 30j, Task 3.8).
 *      MongoDB ne pose pas le `expireAfterSeconds` ici (on prune via
 *      cron applicatif, pas via TTL natif, pour pouvoir logger le
 *      nombre de rows supprimées et observer les anomalies).
 *
 * Idempotent : `createIndex` ne fait rien si l'index existe déjà avec la
 * même spec.
 *
 * Exécution :
 *   mongosh "$DATABASE_URL" < 2026-05-11-mutation-log.mongodb.js
 *
 * Référence : Wave 1 Task 3.3 — generalize offline-queue idempotency.
 */

// Utiliser la base de données appropriée
use('meeshy');  // Remplacer par le nom de votre base si différent

print('===== Wave 1 Task 3.3 — mutation_logs collection + indexes =====');
print('');

// ===== ÉTAPE 1 : ÉTAT ACTUEL =====
const exists = db.getCollectionNames().includes('mutation_logs');
print(`📊 État actuel :`);
print(`   Collection mutation_logs : ${exists ? 'PRÉSENTE' : 'ABSENTE (sera créée)'}`);
if (exists) {
  const count = db.mutation_logs.countDocuments({});
  print(`   Rows existantes          : ${count}`);
}
print('');

// ===== ÉTAPE 2 : CRÉATION DE L'INDEX UNIQUE =====
print('🔧 Création de l\'index unique (userId, clientMutationId)...');

const uniqueIndexName = 'mutation_logs_userId_clientMutationId_unique';
const existingUnique = exists
  ? db.mutation_logs.getIndexes().find(idx => idx.name === uniqueIndexName)
  : null;

if (existingUnique) {
  print(`   ℹ️  L'index "${uniqueIndexName}" existe déjà.`);
  print(`      Spec actuelle : ${JSON.stringify(existingUnique)}`);
  print('   ✅ Migration idempotente — aucune action nécessaire.');
} else {
  const result = db.mutation_logs.createIndex(
    { userId: 1, clientMutationId: 1 },
    {
      unique: true,
      name: uniqueIndexName,
    }
  );
  print(`   ✅ Index créé : ${result}`);
}
print('');

// ===== ÉTAPE 3 : CRÉATION DE L'INDEX createdAt =====
print('🔧 Création de l\'index secondaire (createdAt) pour la TTL...');

const createdAtIndexName = 'mutation_logs_createdAt_idx';
const existingCreatedAt = db.mutation_logs.getIndexes().find(
  idx => idx.name === createdAtIndexName
);

if (existingCreatedAt) {
  print(`   ℹ️  L'index "${createdAtIndexName}" existe déjà.`);
  print('   ✅ Migration idempotente — aucune action nécessaire.');
} else {
  const result = db.mutation_logs.createIndex(
    { createdAt: 1 },
    { name: createdAtIndexName }
  );
  print(`   ✅ Index créé : ${result}`);
}
print('');

// ===== ÉTAPE 4 : VÉRIFICATION POST-MIGRATION =====
print('🔍 Vérification post-migration...');
const finalUnique = db.mutation_logs.getIndexes().find(
  idx => idx.name === uniqueIndexName
);
const finalCreatedAt = db.mutation_logs.getIndexes().find(
  idx => idx.name === createdAtIndexName
);

if (finalUnique && finalCreatedAt) {
  print(`   ✅ Index "${uniqueIndexName}" présent`);
  print(`      Keys                   : ${JSON.stringify(finalUnique.key)}`);
  print(`      Unique                 : ${finalUnique.unique}`);
  print(`   ✅ Index "${createdAtIndexName}" présent`);
  print(`      Keys                   : ${JSON.stringify(finalCreatedAt.key)}`);
} else {
  print(`   ❌ ERREUR : index manquant après création.`);
  print(`      Unique trouvé    : ${!!finalUnique}`);
  print(`      CreatedAt trouvé : ${!!finalCreatedAt}`);
  quit(1);
}
print('');

print('✅ Migration Wave 1 Task 3.3 terminée avec succès.');
print('');
print('Prochaines étapes :');
print('  1. `pnpm prisma generate` depuis packages/shared/ pour régénérer');
print('     le client TypeScript avec le modèle MutationLog.');
print('  2. Côté gateway : MutationLog dedup helper (Task 3.4) wrappera');
print('     `prisma.mutationLog.create` + catch-P2002 → lookup → resultId.');
print('  3. Côté client iOS : Tier B/C migrera les ViewModels et queues');
print('     vers OutboxKind + clientMutationId.');
print('');
