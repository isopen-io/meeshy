/**
 * Migration MongoDB — les index de `MythicSeat` (les cent places du Mythe) et de `MythicEdition` (le registre
 * des émissions), #9636, sans `prisma db push` (#9035).
 *
 * Collections NEUVES : aucune donnée existante n'est lue ni modifiée, aucun backfill. La Gloire déjà gagnée
 * reste telle quelle (aucune reconversion) ; `GameProfile.mythicAt`, l'ancien drapeau « top 100 du moment »,
 * n'est plus lu ni écrit — il n'est PAS effacé ici (une purge de données de production attend le porteur).
 *
 * Quatre index uniques :
 * - MythicSeat (number)  — une place n'a qu'un occupant ;
 * - MythicSeat (userId)  — un compte n'a qu'une place ;
 * - MythicSeat (edition) — une émission ne sert qu'une fois ;
 * - MythicEdition (edition) — un numéro d'émission ne se tire qu'une fois.
 *
 * L'ordre avec le déploiement : les uniques sur la PLACE et sur l'ÉMISSION ne sont pas indispensables à la
 * justesse — chaque ligne naît avec un `_id` DÉRIVÉ de son numéro (`mythicSeatId`, `mythicEditionId`), et
 * l'index `_id`, qui existe toujours, refuse un second exemplaire. L'unique sur le COMPTE, lui, est ce qui
 * refuse une seconde place au même compte quand deux attributions le servent au même instant : à jouer AVANT
 * qu'un compte n'approche 1 000 000 de Gloire (aucun ne l'approche au moment du lot).
 *
 * Même forme et mêmes règles que `2026-10-07-engagement-post-points-indexes.mongodb.js` : un index se reconnaît
 * à sa CLÉ ; rien ne se passe s'il existe ; un unique bloqué par des doublons est SIGNALÉ, jamais forcé.
 * Idempotente — la rejouer ne change rien. Un « bloqué » ne peut venir que d'une ligne écrite à la main :
 * examiner avec le porteur avant toute écriture.
 *
 * À JOUER SUR LE STAGING D'ABORD ; en production, avec le feu vert du porteur (#9223), sauvegarde vérifiée
 * d'abord.
 *
 * Exécution (DRY_RUN=1 pour simuler), puis relecture :
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-10-07-mythic-seat-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-10-07-mythic-seat-indexes.mongodb.js
 *   docker exec -i meeshy-database mongosh meeshy --quiet --eval 'printjson(db.MythicSeat.getIndexes()); printjson(db.MythicEdition.getIndexes())'
 */

const dryRun = process.env.DRY_RUN === '1';

const specs = [
  { collection: 'MythicSeat', name: 'MythicSeat_number_key', key: { number: 1 }, unique: true },
  { collection: 'MythicSeat', name: 'MythicSeat_userId_key', key: { userId: 1 }, unique: true },
  { collection: 'MythicSeat', name: 'MythicSeat_edition_key', key: { edition: 1 }, unique: true },
  { collection: 'MythicEdition', name: 'MythicEdition_edition_key', key: { edition: 1 }, unique: true },
];

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const duplicateGroups = (collection, key) => {
  const id = Object.fromEntries(Object.keys(key).map((field) => [field, `$${field}`]));
  const [row] = db.getCollection(collection).aggregate([
    { $group: { _id: id, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $count: 'groups' },
  ]).toArray();
  return row ? row.groups : 0;
};

const report = { created: [], present: [], blocked: [] };
const collections = db.getCollectionNames();

for (const spec of specs) {
  const existing = collections.includes(spec.collection)
    ? db.getCollection(spec.collection).getIndexes()
    : [];
  const match = existing.find((index) => sameKey(index.key, spec.key));

  if (match && (match.unique || !spec.unique)) {
    report.present.push(`${spec.collection}.${match.name}`);
    continue;
  }

  if (spec.unique && collections.includes(spec.collection)) {
    const groups = duplicateGroups(spec.collection, spec.key);
    if (groups > 0) {
      report.blocked.push(`${spec.collection}.${spec.name} — ${groups} groupe(s) en doublon`);
      continue;
    }
  }

  const options = { name: spec.name };
  if (spec.unique) options.unique = true;

  if (!dryRun) {
    if (match) db.getCollection(spec.collection).dropIndex(match.name);
    db.getCollection(spec.collection).createIndex(spec.key, options);
  }
  report.created.push(`${spec.collection}.${spec.name}${match ? ` (remplace ${match.name}, non unique)` : ''}`);
}

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index de MythicSeat et MythicEdition =====');
print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length})`);
print(`Bloqués par des doublons (${report.blocked.length}) :`);
report.blocked.forEach((line) => print(`  ! ${line}`));
if (report.blocked.length > 0) quit(2);
