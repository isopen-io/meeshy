/**
 * Migration MongoDB — libère une fois pour toutes les copies de photo figées
 * sur les lignes `Participant` d'un compte inscrit (#8891, suite de #8886).
 *
 * `Participant.avatar` est la surcharge LOCALE d'un membre ; la loi de lecture
 * (`resolveParticipantAvatar`, `packages/shared/utils/participant-helpers.ts`)
 * la sert AVANT la photo du compte. Deux portes d'entrée y recopiaient la photo
 * du compte à l'ajout. Depuis #8886, un changement de photo libère ces copies
 * (`releaseParticipantAvatarSnapshots`,
 * `services/gateway/src/services/participantAvatarSnapshots.ts`) — mais
 * seulement au PROCHAIN changement de chaque compte : les copies posées avant
 * restent servies. Ce script applique la MÊME règle à toute la collection :
 *
 *   `type: 'user'`, `userId` posé, `avatar` chaîne  ⇒  `avatar: null`
 *
 * La ligne retombe alors sur la photo du compte. Une ligne ANONYME
 * (`type` ≠ `'user'`, ou sans `userId`) n'est jamais touchée : sa photo n'a pas
 * de compte où retomber. Seul `avatar` est écrit.
 *
 * Régime (celui de #9035, jamais `prisma db push`) :
 * - À BLANC par défaut : compte ce qui serait libéré, n'écrit rien.
 *   `APPLY=1` écrit.
 * - Lots bornés (`BATCH_SIZE`, 500 par défaut, 5000 au plus), parcourus par
 *   `_id` croissant.
 * - Idempotent : une ligne libérée ne correspond plus au filtre ; une seconde
 *   exécution relit 0 ligne et n'écrit rien.
 * - Aucun champ `Int` n'est écrit (pas de piège `Long`) ; les compteurs sont
 *   passés par `Number()` avant toute addition, pour qu'un résultat de pilote
 *   ne se CONCATÈNE pas en chaîne.
 *
 * Exécution — staging d'abord, production ensuite, chacune à blanc puis pour
 * de vrai, après sauvegarde de la collection (depuis la racine du dépôt) :
 *
 *   F=packages/shared/prisma/migrations/2026-10-04-participant-avatar-snapshots.mongodb.js
 *   B=/opt/meeshy/backups/2026-10-04-participant-snapshots
 *
 *   # staging
 *   ssh root@meeshy.me "mkdir -p $B && docker exec meeshy-database-staging mongodump --db meeshy --collection Participant --archive --gzip > $B/staging-Participant.archive.gz"
 *   ssh root@meeshy.me 'docker exec -i meeshy-database-staging mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i -e APPLY=1 meeshy-database-staging mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i meeshy-database-staging mongosh meeshy --quiet' < $F   # attendu : 0 à libérer
 *
 *   # production
 *   ssh root@meeshy.me "mkdir -p $B && docker exec meeshy-database mongodump --db meeshy --collection Participant --archive --gzip > $B/production-Participant.archive.gz"
 *   ssh root@meeshy.me 'docker exec -i meeshy-database mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i -e APPLY=1 meeshy-database mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i meeshy-database mongosh meeshy --quiet' < $F           # attendu : 0 à libérer
 *
 * Restauration si besoin :
 *   ssh root@meeshy.me "docker exec -i meeshy-database mongorestore --archive --gzip --nsInclude meeshy.Participant --drop < $B/production-Participant.archive.gz"
 *
 * Témoin : `services/gateway/src/__tests__/unit/migrations/participant-snapshots-migration.test.ts`.
 */

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 5000;

const CANDIDATE_FILTER = { type: 'user', avatar: { $type: 'string' } };

function readOptions(env) {
  const parsed = Number.parseInt(String(env.BATCH_SIZE ?? ''), 10);
  const batchSize = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
  return { apply: env.APPLY === '1', batchSize };
}

function avatarSnapshotDecision(row) {
  if (row.type !== 'user') return { action: 'spare', reason: 'anonymous' };
  if (row.userId === null || row.userId === undefined) return { action: 'spare', reason: 'no-account' };
  if (typeof row.avatar !== 'string') return { action: 'keep' };
  return { action: 'release' };
}

function runAvatarSnapshotMigration(database, options) {
  const participants = database.getCollection('Participant');
  const report = { read: 0, toRelease: 0, released: 0, kept: 0, spared: {} };
  let lastId = null;

  for (;;) {
    const filter = lastId === null ? CANDIDATE_FILTER : { ...CANDIDATE_FILTER, _id: { $gt: lastId } };
    const page = participants
      .find(filter, { _id: 1, type: 1, userId: 1, avatar: 1 })
      .sort({ _id: 1 })
      .limit(options.batchSize)
      .toArray();
    if (page.length === 0) break;

    const releasable = page.filter((row) => {
      const decision = avatarSnapshotDecision(row);
      if (decision.action === 'spare') report.spared[decision.reason] = Number(report.spared[decision.reason] ?? 0) + 1;
      if (decision.action === 'keep') report.kept = Number(report.kept) + 1;
      return decision.action === 'release';
    });

    report.read = Number(report.read) + page.length;
    report.toRelease = Number(report.toRelease) + releasable.length;

    if (options.apply && releasable.length > 0) {
      const result = participants.updateMany(
        { ...CANDIDATE_FILTER, _id: { $in: releasable.map((row) => row._id) } },
        { $set: { avatar: null } },
      );
      report.released = Number(report.released) + Number(result.modifiedCount);
    }

    lastId = page[page.length - 1]._id;
    if (page.length < options.batchSize) break;
  }

  return report;
}

function printAvatarReport(report, options) {
  print(options.apply
    ? '===== Copies de photo des participants (#8891) — ÉCRITURE ====='
    : '===== Copies de photo des participants (#8891) — À BLANC, rien n’est écrit =====');
  print(`Lots de ${options.batchSize}`);
  print(`Lues (type user, avatar posé) : ${report.read}`);
  print(`À libérer                     : ${report.toRelease}`);
  print(`Libérées                      : ${report.released}`);
  print(`Épargnées                     : ${Object.entries(report.spared).map(([reason, n]) => `${reason}=${n}`).join(', ') || '0'}`);
  if (!options.apply) print('Relancer avec APPLY=1 pour écrire.');
}

const avatarOptions = readOptions(process.env);
const avatarReport = runAvatarSnapshotMigration(db, avatarOptions);
printAvatarReport(avatarReport, avatarOptions);
