/**
 * Migration MongoDB — LOT 6 (partage tracé : TrackingLink.targetType/targetId)
 *
 * Backfill + dédoublonnage + index unique partiel pour le pattern « un partageur =
 * un lien réutilisé par cible » (catch-P2002 côté gateway dans
 * PostService.shareWithTrackingLink).
 *
 * ÉTAPES :
 *   1. Backfill `targetType = EXTERNAL` sur TOUS les liens existants (default
 *      schema déjà EXTERNAL, mais les documents pré-migration n'ont pas le champ).
 *   2. Pour les liens dont `originalUrl` matche `/feeds/post/<24hex>` : poser
 *      `targetType = POST` + `targetId = ObjectId(<24hex>)` (BSON ObjectId, PAS
 *      une string — l'index partiel filtre sur `$type: 'objectId'`).
 *   3. Dédupliquer les liens legacy `(targetId, createdBy)` non-null : garder le
 *      plus ancien (createdAt asc), désactiver (`isActive=false`) les autres —
 *      AVANT de créer l'index unique, sinon `createIndex` échoue sur doublons.
 *   4. Créer l'index unique PARTIEL `{ targetId: 1, createdBy: 1 }` filtré sur
 *      `targetId/createdBy` de type objectId (ignore EXTERNAL/anonyme où ces
 *      champs sont null/absents — même précédent que clientMessageId).
 *
 * Idempotent : ré-exécutable sans effet de bord (les $set re-posent la même
 * valeur, le dédoublonnage ne retrouve plus de doublons actifs, createIndex
 * est un no-op si la spec est identique).
 *
 * Exécution :
 *   mongosh "$DATABASE_URL" < 2026-06-14-tracking-link-target.mongodb.js
 *
 * Référence : LOT 6 du chantier engagement-capture.
 */

use('meeshy');

print('===== LOT 6 — TrackingLink targetType/targetId =====');
print('');

// Résolution robuste du nom de collection : Prisma (sans @@map) écrit en
// PascalCase `TrackingLink`, mais des déploiements historiques peuvent porter
// une variante (`trackingLinks`, `trackinglinks`). On choisit la première qui
// existe et contient des documents, sinon `TrackingLink` par défaut.
const COLL_CANDIDATES = ['TrackingLink', 'trackingLinks', 'trackinglinks', 'tracking_links'];
const existingNames = db.getCollectionNames();
let collName = COLL_CANDIDATES.find((n) => existingNames.includes(n)) || 'TrackingLink';
print(`ℹ️  Collection cible : ${collName}`);
const coll = db.getCollection(collName);
const POST_URL_RE = /\/feeds\/post\/([0-9a-fA-F]{24})(?:[/?#]|$)/;

// ===== ÉTAPE 1 : BACKFILL targetType = EXTERNAL (champ absent) =====
print('🔧 Étape 1 — backfill targetType=EXTERNAL...');
const backfillRes = coll.updateMany(
  { targetType: { $exists: false } },
  { $set: { targetType: 'EXTERNAL' } }
);
print(`   ✅ ${backfillRes.modifiedCount} lien(s) backfillé(s) à EXTERNAL`);
print('');

// ===== ÉTAPE 2 : TYPER LES LIENS DE POST (originalUrl → POST + ObjectId) =====
print('🔧 Étape 2 — typage des liens /feeds/post/<24hex>...');
let typed = 0;
const postCursor = coll.find({ originalUrl: { $regex: POST_URL_RE } });
while (postCursor.hasNext()) {
  const link = postCursor.next();
  const match = POST_URL_RE.exec(link.originalUrl || '');
  if (!match) continue;
  const hex = match[1];
  coll.updateOne(
    { _id: link._id },
    { $set: { targetType: 'POST', targetId: ObjectId(hex) } }   // BSON ObjectId
  );
  typed += 1;
}
print(`   ✅ ${typed} lien(s) de post typé(s) (targetType=POST, targetId=ObjectId)`);
print('');

// ===== ÉTAPE 3 : DÉDOUBLONNAGE (targetId, createdBy) AVANT INDEX =====
print('🔧 Étape 3 — dédoublonnage des liens legacy (targetId, createdBy)...');
let deactivated = 0;
const dupGroups = coll.aggregate([
  {
    $match: {
      targetId: { $type: 'objectId' },
      createdBy: { $type: 'objectId' },
    },
  },
  {
    $group: {
      _id: { targetId: '$targetId', createdBy: '$createdBy' },
      ids: { $push: { id: '$_id', createdAt: '$createdAt' } },
      count: { $sum: 1 },
    },
  },
  { $match: { count: { $gt: 1 } } },
]).toArray();

for (const group of dupGroups) {
  // Garder le plus ancien (createdAt asc) ; désactiver les autres.
  const sorted = group.ids.slice().sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
  const losers = sorted.slice(1).map((x) => x.id);
  if (losers.length > 0) {
    const res = coll.updateMany(
      { _id: { $in: losers } },
      { $set: { isActive: false } }
    );
    deactivated += res.modifiedCount;
  }
}
print(`   ✅ ${dupGroups.length} groupe(s) en doublon, ${deactivated} lien(s) désactivé(s)`);
print('');

// ===== ÉTAPE 3b : NEUTRALISER targetId DES DOUBLONS DÉSACTIVÉS =====
// L'index partiel filtre sur le TYPE objectId, pas sur isActive — deux liens
// désactivés gardant le même (targetId, createdBy) violeraient toujours l'unicité.
// On retire targetId des perdants pour qu'ils sortent du filtre partiel.
print('🔧 Étape 3b — sortie des doublons désactivés du filtre partiel...');
let cleared = 0;
for (const group of dupGroups) {
  const sorted = group.ids.slice().sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
  const losers = sorted.slice(1).map((x) => x.id);
  if (losers.length > 0) {
    const res = coll.updateMany(
      { _id: { $in: losers } },
      { $unset: { targetId: '' } }
    );
    cleared += res.modifiedCount;
  }
}
print(`   ✅ ${cleared} doublon(s) sorti(s) du filtre (targetId unset)`);
print('');

// ===== ÉTAPE 4 : INDEX UNIQUE PARTIEL =====
print('🔧 Étape 4 — création de l\'index unique partiel (targetId, createdBy)...');
const indexName = 'TrackingLink_targetId_createdBy_unique';
const existing = coll.getIndexes().find((idx) => idx.name === indexName);
if (existing) {
  print(`   ℹ️  L'index "${indexName}" existe déjà.`);
  print(`      Spec actuelle : ${JSON.stringify(existing)}`);
  print('   ✅ Migration idempotente — aucune action nécessaire.');
} else {
  const result = coll.createIndex(
    { targetId: 1, createdBy: 1 },
    {
      unique: true,
      name: indexName,
      partialFilterExpression: {
        targetId: { $type: 'objectId' },
        createdBy: { $type: 'objectId' },
      },
    }
  );
  print(`   ✅ Index créé : ${result}`);
}
print('');

// ===== VÉRIFICATION POST-MIGRATION =====
print('🔍 Vérification post-migration...');
const finalIndex = coll.getIndexes().find((idx) => idx.name === indexName);
if (finalIndex) {
  print(`   ✅ Index "${indexName}" présent`);
  print(`      Keys           : ${JSON.stringify(finalIndex.key)}`);
  print(`      Unique         : ${finalIndex.unique}`);
  print(`      Partial filter : ${JSON.stringify(finalIndex.partialFilterExpression)}`);
} else {
  print(`   ❌ ERREUR : index "${indexName}" non trouvé après création.`);
  quit(1);
}
const externalCount = coll.countDocuments({ targetType: 'EXTERNAL' });
const postCount = coll.countDocuments({ targetType: 'POST' });
print(`   targetType EXTERNAL : ${externalCount}`);
print(`   targetType POST     : ${postCount}`);
print('');

print('✅ Migration LOT 6 terminée avec succès.');
