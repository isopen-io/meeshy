/**
 * Migration MongoDB — réaligne une fois pour toutes les noms figés sur les
 * lignes `Participant` d'un compte inscrit (#9308, jumelle de #8891).
 *
 * `Participant.displayName` est une COPIE du nom du compte posée à l'ajout, et
 * la loi de lecture (`resolveParticipantDisplayName`) la sert AVANT le nom du
 * compte — titre d'un direct, membres, expéditeurs. Depuis #8890, un renommage
 * réécrit toutes les lignes du compte (`refreshParticipantNameSnapshots`,
 * `services/gateway/src/services/participantNameSnapshots.ts`) ; les lignes
 * copiées AVANT, par un compte renommé depuis, restent sur l'ancien nom. Ce
 * script applique la MÊME règle à toute la collection :
 *
 *   `type: 'user'`, `userId` posé, compte vivant, `displayName` ≠ nom composé
 *   du compte  ⇒  `displayName` = nom composé
 *
 * Le nom composé est celui de `accountDisplayName` :
 * `displayName > « Prénom Nom » > username`, chaque part rognée. La copie ici
 * est tenue égale à celle du gateway par le témoin (cas par cas).
 *
 * ÉPARGNÉES, jamais écrites :
 * - les lignes `Compte supprimé` (`DELETED_ACCOUNT_DISPLAY_NAME`, écrites par
 *   l'anonymisation d'un compte en fin de grâce) ;
 * - les lignes dont le compte n'existe plus ou porte `deletedAt` ;
 * - les lignes dont le compte ne compose aucun nom (la colonne est requise :
 *   on n'y écrit jamais une chaîne vide).
 * `nickname` (le surnom par conversation) n'est ni lu ni écrit : seul
 * `displayName` part dans la mise à jour, et chaque écriture est conditionnée
 * au nom LU — un renommage survenu entre la lecture et l'écriture gagne.
 *
 * Régime (celui de #9035, jamais `prisma db push`) :
 * - À BLANC par défaut : compte ce qui serait réécrit, n'écrit rien.
 *   `APPLY=1` écrit.
 * - Lots bornés (`BATCH_SIZE`, 500 par défaut, 5000 au plus), parcourus par
 *   `_id` croissant ; les comptes d'un lot sont lus en une requête.
 * - Idempotent : une ligne réalignée porte le nom du compte ; une seconde
 *   exécution n'en réécrit aucune.
 * - Aucun champ `Int` n'est écrit (pas de piège `Long`) ; les compteurs sont
 *   passés par `Number()` avant toute addition, pour qu'un résultat de pilote
 *   ne se CONCATÈNE pas en chaîne.
 *
 * Exécution — staging d'abord, production ensuite, chacune à blanc puis pour
 * de vrai, après sauvegarde de la collection (depuis la racine du dépôt ; la
 * sauvegarde est commune avec #8891, la prendre UNE fois avant le premier des
 * deux scripts) :
 *
 *   F=packages/shared/prisma/migrations/2026-10-04-participant-name-snapshots.mongodb.js
 *   B=/opt/meeshy/backups/2026-10-04-participant-snapshots
 *
 *   # staging
 *   ssh root@meeshy.me "mkdir -p $B && docker exec meeshy-database-staging mongodump --db meeshy --collection Participant --archive --gzip > $B/staging-Participant.archive.gz"
 *   ssh root@meeshy.me 'docker exec -i meeshy-database-staging mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i -e APPLY=1 meeshy-database-staging mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i meeshy-database-staging mongosh meeshy --quiet' < $F   # attendu : 0 à réécrire
 *
 *   # production
 *   ssh root@meeshy.me "mkdir -p $B && docker exec meeshy-database mongodump --db meeshy --collection Participant --archive --gzip > $B/production-Participant.archive.gz"
 *   ssh root@meeshy.me 'docker exec -i meeshy-database mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i -e APPLY=1 meeshy-database mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i meeshy-database mongosh meeshy --quiet' < $F           # attendu : 0 à réécrire
 *
 * Restauration si besoin :
 *   ssh root@meeshy.me "docker exec -i meeshy-database mongorestore --archive --gzip --nsInclude meeshy.Participant --drop < $B/production-Participant.archive.gz"
 *
 * Témoin : `services/gateway/src/__tests__/unit/migrations/participant-snapshots-migration.test.ts`.
 */

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 5000;
const DELETED_ACCOUNT_DISPLAY_NAME = 'Compte supprimé';

const CANDIDATE_FILTER = { type: 'user', userId: { $ne: null } };

function readOptions(env) {
  const parsed = Number.parseInt(String(env.BATCH_SIZE ?? ''), 10);
  const batchSize = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
  return { apply: env.APPLY === '1', batchSize };
}

function nonBlank(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed === '' ? undefined : trimmed;
}

function accountDisplayName(account) {
  const fullName = nonBlank([account.firstName, account.lastName].map((part) => nonBlank(part) ?? '').filter(Boolean).join(' '));
  return nonBlank(account.displayName) ?? fullName ?? account.username;
}

function nameSnapshotDecision(row, account) {
  if (row.type !== 'user') return { action: 'spare', reason: 'anonymous' };
  if (row.userId === null || row.userId === undefined) return { action: 'spare', reason: 'no-account' };
  if (row.displayName === DELETED_ACCOUNT_DISPLAY_NAME) return { action: 'spare', reason: 'deleted-account-row' };
  if (!account) return { action: 'spare', reason: 'missing-account' };
  if (account.deletedAt !== null && account.deletedAt !== undefined) return { action: 'spare', reason: 'deleted-account' };
  const displayName = accountDisplayName(account);
  if (typeof displayName !== 'string' || displayName.trim() === '') return { action: 'spare', reason: 'unnamed-account' };
  if (row.displayName === displayName) return { action: 'keep' };
  return { action: 'rewrite', displayName };
}

function idKey(id) {
  return id !== null && typeof id === 'object' && typeof id.toHexString === 'function' ? id.toHexString() : String(id);
}

function runNameSnapshotMigration(database, options) {
  const participants = database.getCollection('Participant');
  const users = database.getCollection('User');
  const report = { read: 0, toRewrite: 0, rewritten: 0, kept: 0, spared: {} };
  let lastId = null;

  for (;;) {
    const filter = lastId === null ? CANDIDATE_FILTER : { ...CANDIDATE_FILTER, _id: { $gt: lastId } };
    const page = participants
      .find(filter, { _id: 1, type: 1, userId: 1, displayName: 1 })
      .sort({ _id: 1 })
      .limit(options.batchSize)
      .toArray();
    if (page.length === 0) break;

    const accounts = new Map(
      users
        .find(
          { _id: { $in: page.map((row) => row.userId) } },
          { _id: 1, displayName: 1, firstName: 1, lastName: 1, username: 1, deletedAt: 1 },
        )
        .toArray()
        .map((account) => [idKey(account._id), account]),
    );

    const rewrites = page.flatMap((row) => {
      const decision = nameSnapshotDecision(row, accounts.get(idKey(row.userId)));
      if (decision.action === 'spare') report.spared[decision.reason] = Number(report.spared[decision.reason] ?? 0) + 1;
      if (decision.action === 'keep') report.kept = Number(report.kept) + 1;
      return decision.action === 'rewrite' ? [{ row, displayName: decision.displayName }] : [];
    });

    report.read = Number(report.read) + page.length;
    report.toRewrite = Number(report.toRewrite) + rewrites.length;

    if (options.apply && rewrites.length > 0) {
      const result = participants.bulkWrite(
        rewrites.map(({ row, displayName }) => ({
          updateOne: {
            filter: { _id: row._id, type: 'user', displayName: row.displayName },
            update: { $set: { displayName } },
          },
        })),
        { ordered: false },
      );
      report.rewritten = Number(report.rewritten) + Number(result.modifiedCount);
    }

    lastId = page[page.length - 1]._id;
    if (page.length < options.batchSize) break;
  }

  return report;
}

function printNameReport(report, options) {
  print(options.apply
    ? '===== Noms des participants (#9308) — ÉCRITURE ====='
    : '===== Noms des participants (#9308) — À BLANC, rien n’est écrit =====');
  print(`Lots de ${options.batchSize}`);
  print(`Lues (type user, compte lié) : ${report.read}`);
  print(`Déjà alignées                : ${report.kept}`);
  print(`À réécrire                   : ${report.toRewrite}`);
  print(`Réécrites                    : ${report.rewritten}`);
  print(`Épargnées                    : ${Object.entries(report.spared).map(([reason, n]) => `${reason}=${n}`).join(', ') || '0'}`);
  if (!options.apply) print('Relancer avec APPLY=1 pour écrire.');
}

const nameOptions = readOptions(process.env);
const nameReport = runNameSnapshotMigration(db, nameOptions);
printNameReport(nameReport, nameOptions);
