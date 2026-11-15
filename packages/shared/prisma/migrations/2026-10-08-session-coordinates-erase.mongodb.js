/**
 * Migration MongoDB — efface les coordonnées tirées de l'adresse IP (#9609).
 *
 * Jusqu'à #9609, la géolocalisation (ip-api.com) rendait une latitude et une
 * longitude, écrites sur chaque session (`UserSession.latitude` / `longitude`)
 * et sur les jetons de lien magique et de réinitialisation (`geoCoordinates`,
 * « lat,lon »). Elles ne sont plus écrites ni servies : une coordonnée tirée
 * d'une adresse IP affirme une précision qu'elle n'a pas. Ce script efface les
 * copies écrites AVANT :
 *
 *   UserSession        : `$unset` de `latitude` et `longitude`
 *   MagicLinkToken     : `$unset` de `geoCoordinates`
 *   PasswordResetToken : `$unset` de `geoCoordinates`
 *
 * Rien d'autre n'est lu ni écrit : ni l'adresse, ni le pays, ni la ville, ni
 * les dates — seules ces clés quittent les lignes.
 *
 * ⚠️  PRODUCTION : ce script SUPPRIME des données. Il ne s'exécute qu'avec le
 *     feu vert du porteur, après une sauvegarde VÉRIFIÉE des trois collections
 *     (#9223). Il n'a été exécuté NULLE PART à sa livraison — ni en staging,
 *     ni en production.
 *
 * Régime (celui de #9035 et de 2026-10-04-anonymous-session-ip-purge) :
 * - À BLANC par défaut : compte ce qui serait effacé, n'écrit rien. `APPLY=1` écrit.
 * - Lots bornés (`BATCH_SIZE`, 500 par défaut, 5000 au plus), par `_id` croissant.
 * - Idempotent : une seconde exécution ne trouve rien (attendu : 0 à effacer).
 * - Aucun champ `Int` n'est écrit ; les compteurs passent par `Number()`.
 * - Le journal ne cite jamais une coordonnée : il compte.
 *
 * Exécution — staging d'abord, production ensuite, chacune à blanc puis pour
 * de vrai, après sauvegarde (depuis la racine du dépôt). La sauvegarde
 * CONTIENT les coordonnées effacées : elle se détruit dès que l'effacement est
 * vérifié, sinon il n'a rien effacé.
 *
 *   F=packages/shared/prisma/migrations/2026-10-08-session-coordinates-erase.mongodb.js
 *   B=/opt/meeshy/backups/2026-10-08-session-coordinates-erase
 *   C="UserSession MagicLinkToken PasswordResetToken"
 *
 *   # staging
 *   ssh root@meeshy.me "mkdir -p $B && for c in $C; do docker exec meeshy-database-staging mongodump --db meeshy --collection \$c --archive --gzip > $B/staging-\$c.archive.gz; done"
 *   ssh root@meeshy.me 'docker exec -i meeshy-database-staging mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i -e APPLY=1 meeshy-database-staging mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i meeshy-database-staging mongosh meeshy --quiet' < $F   # attendu : 0 à effacer
 *
 *   # production (feu vert du porteur)
 *   ssh root@meeshy.me "mkdir -p $B && for c in $C; do docker exec meeshy-database mongodump --db meeshy --collection \$c --archive --gzip > $B/production-\$c.archive.gz; done"
 *   ssh root@meeshy.me 'docker exec -i meeshy-database mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i -e APPLY=1 meeshy-database mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i meeshy-database mongosh meeshy --quiet' < $F           # attendu : 0 à effacer
 *
 *   # une fois l'effacement vérifié
 *   ssh root@meeshy.me "rm -rf $B"
 *
 * Témoin : `services/gateway/src/__tests__/unit/migrations/session-coordinates-erase-migration.test.ts`.
 */

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 5000;

const TARGETS = [
  { collection: 'UserSession', fields: ['latitude', 'longitude'] },
  { collection: 'MagicLinkToken', fields: ['geoCoordinates'] },
  { collection: 'PasswordResetToken', fields: ['geoCoordinates'] },
];

function readOptions(env) {
  const parsed = Number.parseInt(String(env.BATCH_SIZE ?? ''), 10);
  const batchSize = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
  return { apply: env.APPLY === '1', batchSize };
}

function candidateFilter(fields) {
  return { $or: fields.map((field) => ({ [field]: { $exists: true } })) };
}

function eraseTarget(database, target, options) {
  const collection = database.getCollection(target.collection);
  const filter = candidateFilter(target.fields);
  const unset = Object.fromEntries(target.fields.map((field) => [field, '']));
  const report = { toErase: 0, erased: 0, batches: 0 };
  let lastId = null;

  for (;;) {
    const page = collection
      .find(lastId === null ? filter : { $and: [filter, { _id: { $gt: lastId } }] }, { _id: 1 })
      .sort({ _id: 1 })
      .limit(options.batchSize)
      .toArray();
    if (page.length === 0) break;

    report.batches = Number(report.batches) + 1;
    report.toErase = Number(report.toErase) + page.length;

    if (options.apply) {
      const result = collection.updateMany(
        { $and: [{ _id: { $in: page.map((row) => row._id) } }, filter] },
        { $unset: unset },
      );
      report.erased = Number(report.erased) + Number(result.modifiedCount);
    }

    lastId = page[page.length - 1]._id;
    if (page.length < options.batchSize) break;
  }
  return report;
}

function runCoordinatesErase(database, options) {
  return TARGETS.map((target) => ({ collection: target.collection, ...eraseTarget(database, target, options) }));
}

function printEraseReport(reports, options) {
  print(options.apply
    ? '===== Coordonnées tirées de l’adresse IP (#9609) — ÉCRITURE ====='
    : '===== Coordonnées tirées de l’adresse IP (#9609) — À BLANC, rien n’est écrit =====');
  reports.forEach((report) => {
    print(`${report.collection} — lots de ${options.batchSize} : ${report.batches}, à effacer : ${report.toErase}, effacées : ${report.erased}`);
  });
  if (!options.apply) print('Relancer avec APPLY=1 pour écrire (production : feu vert du porteur et sauvegarde vérifiée).');
}

const eraseOptions = readOptions(process.env);
printEraseReport(runCoordinatesErase(db, eraseOptions), eraseOptions);
