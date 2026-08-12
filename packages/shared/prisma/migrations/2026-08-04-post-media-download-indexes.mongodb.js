/**
 * Migration MongoDB — index de `PostMediaDownload`.
 *
 * POURQUOI CE SCRIPT EXISTE : l'entrypoint de production ne joue AUCUNE
 * migration. Les `@@index` déclarés dans le schéma Prisma ne sont jamais créés
 * sur la base de production par un déploiement. Sans ce script, la collection
 * écrit parfaitement et toute lecture analytique fait un COLLSCAN — exactement
 * ce que l'architecture à deux étages cherche à éviter.
 *
 * Les quatre index et ce qu'ils servent (ne pas en supprimer un en le croyant
 * inutile — chacun répond à une requête identifiée) :
 *
 *   postId_userId      → téléchargeurs uniques d'un poste ; « cet utilisateur
 *                        a-t-il déjà téléchargé ce poste ? »
 *   mediaId_createdAt  → grain média sur une fenêtre temporelle ; « quel média
 *                        a été le plus repris ces 30 jours ? »
 *   userId_createdAt   → historique de téléchargement d'un utilisateur.
 *   createdAt          → balayage par période, rollups futurs, et support d'un
 *                        index TTL si une rétention est décidée plus tard.
 *
 * `surface` n'est volontairement PAS indexé : trois valeurs possibles, le
 * planner ne choisirait jamais un index aussi peu sélectif. Le filtre par
 * surface s'applique après le filtre temporel.
 *
 * Rappel de conception : les totaux ne se lisent JAMAIS par agrégation sur
 * cette collection. Ils vivent dans `Post.downloadCount` (une action) et
 * `PostMedia.downloadCount` (un média). Ces index servent l'analyse fine.
 *
 * Idempotent : un index déjà présent avec la même spec est un no-op ; présent
 * avec une spec divergente, il est droppé puis recréé.
 *
 * Exécution :
 *   mongosh "$DATABASE_URL" < 2026-08-04-post-media-download-indexes.mongodb.js
 */

const COLLECTION = 'PostMediaDownload';

const WANTED = [
  { name: 'postId_userId', key: { postId: 1, userId: 1 } },
  { name: 'mediaId_createdAt', key: { mediaId: 1, createdAt: -1 } },
  { name: 'userId_createdAt', key: { userId: 1, createdAt: -1 } },
  { name: 'createdAt', key: { createdAt: -1 } },
];

function sameKey(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => kb[i] === k && a[k] === b[k]);
}

const names = db.getCollectionNames();
if (!names.includes(COLLECTION)) {
  print(`[migration] collection ${COLLECTION} absente — création explicite`);
  db.createCollection(COLLECTION);
}

const coll = db.getCollection(COLLECTION);
const existing = coll.getIndexes();

for (const wanted of WANTED) {
  const found = existing.find((idx) => idx.name === wanted.name);

  if (found && sameKey(found.key, wanted.key)) {
    print(`[migration] ${wanted.name} — déjà conforme, no-op`);
    continue;
  }

  if (found) {
    print(`[migration] ${wanted.name} — spec divergente, drop puis recréation`);
    coll.dropIndex(wanted.name);
  }

  coll.createIndex(wanted.key, { name: wanted.name });
  print(`[migration] ${wanted.name} — créé`);
}

print('[migration] index PostMediaDownload à jour');
