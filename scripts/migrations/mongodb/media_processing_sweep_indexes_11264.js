/**
 * Index du balayage de la file de médias (#11264, contre-audit S9 N4).
 *
 * Le worker de médias remet en file, toutes les 5 min, les pièces `pending`
 * plus vieilles que 10 min (`services/gateway/src/services/attachments/
 * media-processing/sweep.ts`) : `processingState = 'pending' AND createdAt < …`
 * sur `MessageAttachment` et `PostMedia`. Sans index, chaque passage parcourt
 * la collection entière. `schema.prisma` déclare `@@index([processingState,
 * createdAt])` sur les deux modèles ; un index déclaré n'existe en base que si
 * quelqu'un le crée (migration 019).
 *
 * Nom non numéroté, à dessein : un numéro s'alloue, donc se dispute entre
 * lots ouverts en parallèle (#5102) ; le numéro du lot ne se dispute pas.
 *
 * Idempotent (un index déjà présent sous ce nom n'est pas recréé), sans
 * effacement, rétrocompatible : aucune donnée ne change.
 *
 * La base est celle de la connexion (`<uri>/<base>`), ou `DB_NAME` s'il est
 * passé : le staging lit `${MONGODB_DATABASE:-meeshy}`, la production `meeshy`.
 * Le script imprime la base qu'il vise AVANT toute écriture.
 *
 * Usage :
 *   mongosh <uri> --eval 'var DB_NAME="meeshy_staging"' --file media_processing_sweep_indexes_11264.js   # SIMULATION
 *   mongosh <uri> --eval 'var DB_NAME="meeshy_staging"; var APPLIQUER=true' --file media_processing_sweep_indexes_11264.js
 *
 * Staging : sur décision de Claude (#9226). Production : feu vert du porteur (#9223).
 */
const appliquer = typeof APPLIQUER !== 'undefined' && APPLIQUER === true;
const base = typeof DB_NAME !== 'undefined' && DB_NAME ? db.getSiblingDB(DB_NAME) : db;
print(`Base visée : ${base.getName()}`);
const NAME = 'processingState_1_createdAt_1';
const KEY = { processingState: 1, createdAt: 1 };

['MessageAttachment', 'PostMedia'].forEach((collection) => {
  const present = base[collection].getIndexes().some((index) => index.name === NAME);
  print(`${collection} : index ${NAME} ${present ? 'déjà présent' : 'absent'}`);
  if (present || !appliquer) return;
  base[collection].createIndex(KEY, { name: NAME, background: true });
  print(`${collection} : index ${NAME} créé`);
});

if (!appliquer) print('SIMULATION — rien n\'a été créé (passer APPLIQUER=true).');
