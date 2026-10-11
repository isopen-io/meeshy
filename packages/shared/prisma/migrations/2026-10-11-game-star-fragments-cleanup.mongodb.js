/**
 * Migration MongoDB — retire les fragments de Meesh de #10013, garde les fragments d'étoile (#10011).
 *
 * La décision du porteur du 2026-10-10 (3e et dernière précision) supprime toute frappe par fragments et ne garde
 * qu'un fragment : le fragment d'étoile, objet de collection. #10013 avait écrit deux champs que le schéma ne
 * porte plus :
 *
 *   MeeshLedger.fragmentsSpent      : les fragments consommés par une frappe GRATUITE (5 sur sa ligne `mint`) ;
 *   GameDay.chestMeeshFragments     : les fragments de Meesh d'un coffre ouvert (1 à 4).
 *
 * Ce script :
 *
 *  1. COMPTE et LISTE (identifiants de ligne seulement) les frappes payées en fragments
 *     (`MeeshLedger.fragmentsSpent > 0`). Il ne supprime AUCUNE Meesh et ne touche à AUCUN solde : la ligne `mint`
 *     reste, son `meta.paidWith = "fragments"` aussi (la mémoire de ce qui a été frappé sans débit). Seul le champ
 *     `fragmentsSpent` quitte la ligne.
 *  2. NE TOUCHE PAS `GameDay.chestFragment` : sous #10013 il portait déjà le tirage à une chance sur six, et
 *     c'est lui que la décision désigne pour reconstituer l'existant (« à partir des `GameDay.chestFragment =
 *     true` »). Faire compter `chestMeeshFragments > 0` en ferait un fragment d'étoile par coffre (1 sur 1, pas
 *     1 sur 6) et réécrirait le `fragment` que lisent les anciens clients. Le total se LIT sur `chestFragment`
 *     (`StarFragments.ts`) ; le script compte seulement les coffres qui portent `chestMeeshFragments`.
 *  3. Retire `GameDay.chestMeeshFragments`.
 *
 * AVANT toute écriture, l'état d'origine de chaque ligne touchée est copié dans la collection
 * `_migration_2026_10_11_star_fragments` (une entrée par ligne, `upsert` : une seconde exécution ne la double
 * pas, et ne réécrit jamais un état d'origine déjà gardé). `ROLLBACK=1` le rejoue : il remet chaque champ tel
 * qu'il était, puis vide cette collection.
 *
 * Régime (celui de 2026-10-08-session-coordinates-erase) :
 * - À BLANC par défaut : compte et liste, n'écrit rien. `APPLY=1` écrit ; `ROLLBACK=1` revient en arrière.
 * - Lots bornés (`BATCH_SIZE`, 500 par défaut, 5000 au plus), par `_id` croissant.
 * - Idempotent : une seconde exécution ne trouve rien (attendu : 0 partout).
 * - Le journal ne cite ni utilisateur ni montant de solde : il compte, et liste les `_id` de ligne `MeeshLedger`.
 *
 * État constaté le 2026-10-11 : staging — 0 frappe par fragments, 0 `GameDay` ni `MeeshLedger` portant ces
 * champs ; production — #10013 n'y a jamais été promu (absent de `main`), aucune ligne ne peut les porter.
 *
 * Exécution (depuis la racine du dépôt) — staging d'abord, à blanc puis pour de vrai, après sauvegarde :
 *
 *   F=packages/shared/prisma/migrations/2026-10-11-game-star-fragments-cleanup.mongodb.js
 *   B=/opt/meeshy/backups/2026-10-11-game-star-fragments-cleanup
 *   U='$(docker exec meeshy-gateway-staging printenv DATABASE_URL)'
 *   ssh root@meeshy.me "mkdir -p $B && for c in GameDay MeeshLedger; do docker exec meeshy-database-staging mongodump --uri=\"$U\" --collection \$c --archive --gzip > $B/staging-\$c.archive.gz; done"
 *   ssh root@meeshy.me "docker exec -i meeshy-database-staging mongosh \"$U\" --quiet" < $F
 *   ssh root@meeshy.me "docker exec -i -e APPLY=1 meeshy-database-staging mongosh \"$U\" --quiet" < $F
 *   ssh root@meeshy.me "docker exec -i meeshy-database-staging mongosh \"$U\" --quiet" < $F      # attendu : 0 partout
 *   # retour arrière : ROLLBACK=1 (ou mongorestore des archives de $B)
 *   ssh root@meeshy.me "docker exec -i -e ROLLBACK=1 meeshy-database-staging mongosh \"$U\" --quiet" < $F
 *
 * Production : uniquement avec le feu vert du porteur et une sauvegarde vérifiée (#9223) — et seulement si un
 * jour #10013 y avait été promu, ce qui n'est pas le cas à la livraison de ce script.
 *
 * Témoin : `services/gateway/src/__tests__/unit/migrations/game-star-fragments-cleanup-migration.test.ts`.
 */

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 5000;
const BACKUP = '_migration_2026_10_11_star_fragments';

function readOptions(env) {
  const parsed = Number.parseInt(String(env.BATCH_SIZE ?? ''), 10);
  const batchSize = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
  return { apply: env.APPLY === '1', rollback: env.ROLLBACK === '1', batchSize };
}

/** Les lignes qui portent `field`, par lots d'`_id` croissants. */
function eachBatch(collection, filter, projection, batchSize, visit) {
  let lastId = null;
  for (;;) {
    const page = collection
      .find(lastId === null ? filter : { $and: [filter, { _id: { $gt: lastId } }] }, projection)
      .sort({ _id: 1 })
      .limit(batchSize)
      .toArray();
    if (page.length === 0) return;
    visit(page);
    lastId = page[page.length - 1]._id;
    if (page.length < batchSize) return;
  }
}

/** Garde l'état d'origine d'une ligne — jamais réécrit s'il est déjà gardé. */
function keep(database, collectionName, row, fields) {
  const before = {};
  fields.forEach((field) => {
    before[field] = field in row ? { present: true, value: row[field] } : { present: false };
  });
  database.getCollection(BACKUP).updateOne(
    { _id: `${collectionName}:${String(row._id)}` },
    { $setOnInsert: { collection: collectionName, docId: row._id, before } },
    { upsert: true },
  );
}

function cleanLedger(database, options) {
  const ledger = database.getCollection('MeeshLedger');
  const report = { fragmentMints: 0, fragmentMintIds: [], fieldRows: 0, unset: 0 };
  eachBatch(ledger, { fragmentsSpent: { $exists: true } }, { _id: 1, fragmentsSpent: 1 }, options.batchSize, (page) => {
    report.fieldRows = Number(report.fieldRows) + page.length;
    page.forEach((row) => {
      if (Number(row.fragmentsSpent) > 0) {
        report.fragmentMints = Number(report.fragmentMints) + 1;
        report.fragmentMintIds.push(String(row._id));
      }
    });
    if (!options.apply) return;
    page.forEach((row) => keep(database, 'MeeshLedger', row, ['fragmentsSpent']));
    const result = ledger.updateMany(
      { $and: [{ _id: { $in: page.map((row) => row._id) } }, { fragmentsSpent: { $exists: true } }] },
      { $unset: { fragmentsSpent: '' } },
    );
    report.unset = Number(report.unset) + Number(result.modifiedCount);
  });
  return report;
}

function cleanDays(database, options) {
  const days = database.getCollection('GameDay');
  const report = { fieldRows: 0, starFragments: 0, unset: 0 };
  eachBatch(days, { chestMeeshFragments: { $exists: true } }, { _id: 1, chestMeeshFragments: 1, chestFragment: 1 }, options.batchSize, (page) => {
    report.fieldRows = Number(report.fieldRows) + page.length;
    report.starFragments = Number(report.starFragments) + page.filter((row) => row.chestFragment === true).length;
    if (!options.apply) return;
    page.forEach((row) => keep(database, 'GameDay', row, ['chestMeeshFragments']));
    const result = days.updateMany(
      { $and: [{ _id: { $in: page.map((row) => row._id) } }, { chestMeeshFragments: { $exists: true } }] },
      { $unset: { chestMeeshFragments: '' } },
    );
    report.unset = Number(report.unset) + Number(result.modifiedCount);
  });
  return report;
}

/** Remet chaque champ gardé tel qu'il était, puis vide la collection de garde. */
function rollback(database) {
  const backup = database.getCollection(BACKUP);
  const entries = backup.find({}).toArray();
  let restored = 0;
  entries.forEach((entry) => {
    const set = {};
    const unset = {};
    Object.entries(entry.before ?? {}).forEach(([field, state]) => {
      if (state && state.present) set[field] = state.value;
      else unset[field] = '';
    });
    const update = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(unset).length > 0) update.$unset = unset;
    if (Object.keys(update).length === 0) return;
    const result = database.getCollection(entry.collection).updateMany({ _id: entry.docId }, update);
    restored = Number(restored) + Number(result.matchedCount);
  });
  backup.deleteMany({});
  return { entries: entries.length, restored };
}

function runStarFragmentsCleanup(database, options) {
  if (options.rollback) {
    const report = rollback(database);
    print('===== Fragments de Meesh (#10011) — RETOUR ARRIÈRE =====');
    print(`lignes gardées : ${report.entries}, remises dans leur état d'origine : ${report.restored}`);
    return;
  }
  const ledger = cleanLedger(database, options);
  const days = cleanDays(database, options);
  print(options.apply
    ? '===== Fragments de Meesh (#10011) — ÉCRITURE ====='
    : '===== Fragments de Meesh (#10011) — À BLANC, rien n’est écrit =====');
  print(`MeeshLedger — frappes payées en fragments : ${ledger.fragmentMints} (aucune Meesh supprimée, aucun solde touché)`);
  if (ledger.fragmentMintIds.length > 0) print(`MeeshLedger — lignes : ${ledger.fragmentMintIds.join(', ')}`);
  print(`MeeshLedger — lignes portant fragmentsSpent : ${ledger.fieldRows}, champ retiré : ${ledger.unset}`);
  print(`GameDay — lignes portant chestMeeshFragments : ${days.fieldRows}, dont fragment d'étoile déjà gravé (chestFragment, inchangé) : ${days.starFragments}, champ retiré : ${days.unset}`);
  if (!options.apply) print('Relancer avec APPLY=1 pour écrire, ROLLBACK=1 pour revenir en arrière (production : feu vert du porteur et sauvegarde vérifiée).');
}

runStarFragmentsCleanup(db, readOptions(process.env));
