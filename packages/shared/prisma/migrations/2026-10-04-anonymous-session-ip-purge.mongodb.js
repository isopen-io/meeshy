/**
 * Migration MongoDB — purge l'adresse IP conservée dans la session d'un
 * invité arrivé par un lien (#9342).
 *
 * Jusqu'à #9342, l'admission d'un invité (`joinAsGuest`,
 * `services/gateway/src/routes/conversations/link-admission.ts`) écrivait
 * l'IP de la requête dans `Participant.anonymousSession.session.ipAddress`,
 * alors que #7797 promet un pays d'arrivée « dérivé de l'IP sans la stocker ».
 * Aucun lecteur n'en avait besoin (inventaire de #9342) : l'écriture est
 * retirée et le champ a quitté le type composite `AnonymousSessionDetails`.
 * Ce script efface les copies écrites AVANT :
 *
 *   `anonymousSession.session.ipAddress` présent  ⇒  `$unset` de ce seul champ
 *
 * Rien d'autre n'est lu ni écrit : ni le hash de jeton, ni le pays, ni
 * l'empreinte d'appareil, ni le profil, ni les droits — seule la clé
 * `ipAddress` quitte la session.
 *
 * Régime (celui de #9035, jamais `prisma db push`) :
 * - À BLANC par défaut : compte ce qui serait purgé, n'écrit rien.
 *   `APPLY=1` écrit.
 * - Lots bornés (`BATCH_SIZE`, 500 par défaut, 5000 au plus), parcourus par
 *   `_id` croissant.
 * - Idempotent : une ligne purgée ne porte plus la clé ; une seconde
 *   exécution n'en trouve aucune (attendu : 0 à purger).
 * - Aucun champ `Int` n'est écrit (pas de piège `Long`) ; les compteurs sont
 *   passés par `Number()` avant toute addition, pour qu'un résultat de pilote
 *   ne se CONCATÈNE pas en chaîne.
 * - Le journal ne cite jamais une adresse : il compte.
 *
 * Exécution — staging d'abord, production ensuite, chacune à blanc puis pour
 * de vrai, après sauvegarde de la collection (depuis la racine du dépôt).
 * La sauvegarde CONTIENT les adresses purgées : elle se détruit dès que la
 * purge est vérifiée, sinon la purge n'a rien purgé.
 *
 *   F=packages/shared/prisma/migrations/2026-10-04-anonymous-session-ip-purge.mongodb.js
 *   B=/opt/meeshy/backups/2026-10-04-anonymous-session-ip-purge
 *
 *   # staging
 *   ssh root@meeshy.me "mkdir -p $B && docker exec meeshy-database-staging mongodump --db meeshy --collection Participant --archive --gzip > $B/staging-Participant.archive.gz"
 *   ssh root@meeshy.me 'docker exec -i meeshy-database-staging mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i -e APPLY=1 meeshy-database-staging mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i meeshy-database-staging mongosh meeshy --quiet' < $F   # attendu : 0 à purger
 *
 *   # production
 *   ssh root@meeshy.me "mkdir -p $B && docker exec meeshy-database mongodump --db meeshy --collection Participant --archive --gzip > $B/production-Participant.archive.gz"
 *   ssh root@meeshy.me 'docker exec -i meeshy-database mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i -e APPLY=1 meeshy-database mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i meeshy-database mongosh meeshy --quiet' < $F           # attendu : 0 à purger
 *
 *   # une fois la purge vérifiée
 *   ssh root@meeshy.me "rm -rf $B"
 *
 * Restauration si besoin (AVANT la destruction de la sauvegarde) :
 *   ssh root@meeshy.me "docker exec -i meeshy-database mongorestore --archive --gzip --nsInclude meeshy.Participant --drop < $B/production-Participant.archive.gz"
 *
 * Témoin : `services/gateway/src/__tests__/unit/migrations/anonymous-session-ip-purge-migration.test.ts`.
 */

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 5000;
const IP_FIELD = 'anonymousSession.session.ipAddress';

const CANDIDATE_FILTER = { [IP_FIELD]: { $exists: true } };

function readOptions(env) {
  const parsed = Number.parseInt(String(env.BATCH_SIZE ?? ''), 10);
  const batchSize = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
  return { apply: env.APPLY === '1', batchSize };
}

function runAnonymousSessionIpPurge(database, options) {
  const participants = database.getCollection('Participant');
  const report = { toPurge: 0, purged: 0, batches: 0 };
  let lastId = null;

  for (;;) {
    const filter = lastId === null ? CANDIDATE_FILTER : { ...CANDIDATE_FILTER, _id: { $gt: lastId } };
    const page = participants
      .find(filter, { _id: 1 })
      .sort({ _id: 1 })
      .limit(options.batchSize)
      .toArray();
    if (page.length === 0) break;

    report.batches = Number(report.batches) + 1;
    report.toPurge = Number(report.toPurge) + page.length;

    if (options.apply) {
      const result = participants.updateMany(
        { _id: { $in: page.map((row) => row._id) }, [IP_FIELD]: { $exists: true } },
        { $unset: { [IP_FIELD]: '' } },
      );
      report.purged = Number(report.purged) + Number(result.modifiedCount);
    }

    lastId = page[page.length - 1]._id;
    if (page.length < options.batchSize) break;
  }

  return report;
}

function printPurgeReport(report, options) {
  print(options.apply
    ? '===== IP des sessions anonymes (#9342) — ÉCRITURE ====='
    : '===== IP des sessions anonymes (#9342) — À BLANC, rien n’est écrit =====');
  print(`Lots de ${options.batchSize} : ${report.batches}`);
  print(`À purger : ${report.toPurge}`);
  print(`Purgées  : ${report.purged}`);
  if (!options.apply) print('Relancer avec APPLY=1 pour écrire.');
}

const purgeOptions = readOptions(process.env);
const purgeReport = runAnonymousSessionIpPurge(db, purgeOptions);
printPurgeReport(purgeReport, purgeOptions);
