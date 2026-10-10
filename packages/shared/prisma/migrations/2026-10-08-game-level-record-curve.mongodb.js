/**
 * Migration MongoDB — le niveau RECORD recalculé sur la courbe 100 × N² et ses étapes (#9706).
 *
 * Le porteur (2026-10-08) : « tout le monde est recalculé sur la nouvelle courbe, niveau record compris ».
 * Le seuil du niveau N passe de 10 × N² à 100 × N², et de 10 à 100 chaque dizaine demande une étape
 * (`packages/shared/utils/game/level-steps.ts`). Le niveau EN POCHE se relit tout seul sur le score ; le
 * niveau RECORD, lui, est une colonne gravée sous l'ancienne loi (`User.levelRecord`) : c'est elle que ce
 * script réécrit.
 *
 * Le record d'après est le plus haut de deux lectures, chacune sous le plafond servi (le rang de Gloire,
 * #9688, et le palier des étapes, #9706) :
 *   - le niveau que le score EN POCHE porte aujourd'hui ;
 *   - le niveau que portait le record d'hier, relu sur la nouvelle courbe — un record R prouvait un score
 *     d'au moins 10 × R² : c'est ce score qui se relit (96 → 30 pour le meilleur compte de production).
 * Il ne remonte jamais au-dessus de l'ancien record. La Gloire déjà gagnée au premier passage reste acquise :
 * ses lignes `level:<n>` sont idempotentes, repasser un niveau ne la paie pas deux fois (rien n'est effacé).
 *
 * Ce qui est lu, par lots de comptes (`_id` croissant) : `User.engagementScore`, `levelRecord`,
 * `meeshMintedLifetime`, `longestStreakDays` ; la Gloire (`Σ GloryLedger.delta`) ; les missions du jour
 * accomplies (`DailyMission.completedAt` non nul, comptées jusqu'à 10) ; la place du Mythe (`MythicSeat`).
 * Ce qui est écrit : `User.levelRecord`, et une ligne de journal par compte converti dans la collection
 * `GameLevelRecordCurve` (`userId`, ancien et nouveau record, date) — l'IDEMPOTENCE et le retour arrière :
 * un compte journalisé n'est plus jamais relu, et l'ancien record se relit dans le journal.
 *
 * ⚠️  NE PAS JOUER sans le coordinateur : staging d'abord ; production avec le feu vert du porteur (#9223),
 *     après une sauvegarde VÉRIFIÉE de `User` (le journal garde l'ancien record, la sauvegarde garde tout).
 *     Le script n'a été exécuté NULLE PART à sa livraison.
 *
 * Régime (celui des migrations `2026-10-0*-game-*`) :
 * - DRY_RUN=1 simule : compte, n'écrit rien. Sans DRY_RUN, écrit.
 * - Lots bornés (`BATCH_SIZE`, 200 par défaut, 1000 au plus).
 * - Idempotent : une seconde exécution ne trouve plus rien à convertir (attendu : 0 converti).
 * - L'écriture du record est conditionnelle à l'ancienne valeur : un crédit arrivé entre la lecture et
 *   l'écriture (déjà sous la nouvelle loi) n'est jamais écrasé — le compte est alors laissé et compté.
 * - Les entiers passent par `Number()` (un `Long` mongosh additionné CONCATÈNE).
 *
 * Exécution, depuis la racine du dépôt :
 *   F=packages/shared/prisma/migrations/2026-10-08-game-level-record-curve.mongodb.js
 *   # staging
 *   ssh root@meeshy.me 'docker exec -i -e DRY_RUN=1 meeshy-database-staging mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i meeshy-database-staging mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i -e DRY_RUN=1 meeshy-database-staging mongosh meeshy --quiet' < $F   # attendu : 0 à convertir
 *   # production (feu vert du porteur, sauvegarde vérifiée de User)
 *   ssh root@meeshy.me 'docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i meeshy-database mongosh meeshy --quiet' < $F
 *
 * Témoin : `services/gateway/src/__tests__/unit/migrations/game-level-record-curve-migration.test.ts`,
 * qui exécute CE fichier et confronte chaque record à la loi partagée TypeScript.
 */

const JOURNAL = 'GameLevelRecordCurve';
const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 1000;

/** La loi, recopiée de `levels.ts`, `glory.ts` et `level-steps.ts` — le témoin la confronte au TypeScript. */
const OLD_CURVE = 10;
const NEW_CURVE = 100;
const LEVEL_MIN = 1;
const CAP_BASE = 499;
const CAP_AMBASSADOR = 1000;
const RANKS = [
  ['murmure', 0],
  ['echo', 2000],
  ['voix', 6000],
  ['conteur', 15000],
  ['passeur', 35000],
  ['polyglotte', 70000],
  ['ambassadeur', 130000],
  ['orateur', 230000],
  ['oracle', 380000],
  ['legende', 600000],
];
const MYTHE = RANKS.length;
const STEPS = [
  { level: 10, kind: 'mint', target: 1 },
  { level: 20, kind: 'missions', target: 1 },
  { level: 30, kind: 'rank', rank: 1 },
  { level: 40, kind: 'flame', target: 7 },
  { level: 50, kind: 'missions', target: 10 },
  { level: 60, kind: 'rank', rank: 2 },
  { level: 70, kind: 'mint', target: 5 },
  { level: 80, kind: 'rank', rank: 3 },
  { level: 90, kind: 'flame', target: 30 },
  { level: 100, kind: 'rank', rank: 4 },
];
const MISSIONS_COUNTED = 10;

const int = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
};

function rankIndexOf(glory, mythic) {
  if (mythic) return MYTHE;
  return RANKS.reduce((found, [, min], index) => (glory >= min ? index : found), 0);
}

function rankCapOf(rankIndex) {
  if (rankIndex >= 8) return null;
  return rankIndex >= 6 ? CAP_AMBASSADOR : CAP_BASE;
}

function stepGateOf(facts) {
  const met = (step) => {
    if (step.kind === 'rank') return facts.rankIndex >= step.rank;
    if (step.kind === 'mint') return facts.minted >= step.target;
    if (step.kind === 'missions') return facts.missionsDone >= step.target;
    return facts.flameRecord >= step.target;
  };
  const missing = STEPS.find((step) => !met(step));
  return missing === undefined ? null : missing.level - 1;
}

function tighter(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function levelFromScore(score, curve, cap) {
  const s = int(score);
  const guess = Math.floor(Math.sqrt(s / curve));
  const exact = [guess - 1, guess, guess + 1].filter((n) => n >= 0 && curve * n * n <= s).reduce((best, n) => Math.max(best, n), 0);
  return Math.max(LEVEL_MIN, cap === null ? exact : Math.min(cap, exact));
}

/** Le record d'après — exposé au témoin, qui le confronte à la loi TypeScript. */
function convertedRecord(account) {
  const rankIndex = rankIndexOf(int(account.glory), account.mythic === true);
  const cap = tighter(rankCapOf(rankIndex), stepGateOf({ ...account, rankIndex }));
  const previous = Math.max(LEVEL_MIN, int(account.levelRecord));
  const now = levelFromScore(account.score, NEW_CURVE, cap);
  const before = levelFromScore(OLD_CURVE * previous * previous, NEW_CURVE, cap);
  return Math.min(previous, Math.max(now, before));
}

function readOptions(env) {
  const parsed = Number.parseInt(String(env.BATCH_SIZE ?? ''), 10);
  const batchSize = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
  return { dryRun: env.DRY_RUN === '1', batchSize };
}

const key = (id) => String(id);

function tally(rows, field, step) {
  return rows.reduce((totals, row) => totals.set(key(row.userId), Number(totals.get(key(row.userId)) ?? 0) + step(row[field])), new Map());
}

function convertBatch(database, users, options, report) {
  const ids = users.map((user) => user._id);
  const journaled = new Set(database.getCollection(JOURNAL).find({ userId: { $in: ids } }, { userId: 1 }).toArray().map((row) => key(row.userId)));
  const glory = tally(database.getCollection('GloryLedger').find({ userId: { $in: ids } }, { userId: 1, delta: 1 }).toArray(), 'delta', (delta) => Number(delta));
  const missions = tally(database.getCollection('DailyMission').find({ userId: { $in: ids }, completedAt: { $ne: null } }, { userId: 1 }).toArray(), 'userId', () => 1);
  const mythic = new Set(database.getCollection('MythicSeat').find({ userId: { $in: ids } }, { userId: 1 }).toArray().map((row) => key(row.userId)));
  const entries = [];

  users.forEach((user) => {
    if (journaled.has(key(user._id))) {
      report.alreadyConverted = Number(report.alreadyConverted) + 1;
      return;
    }
    const previous = int(user.levelRecord);
    const record = convertedRecord({
      score: user.engagementScore,
      levelRecord: previous,
      minted: int(user.meeshMintedLifetime),
      flameRecord: int(user.longestStreakDays),
      missionsDone: Math.min(MISSIONS_COUNTED, int(missions.get(key(user._id)))),
      glory: Number(glory.get(key(user._id)) ?? 0),
      mythic: mythic.has(key(user._id)),
    });
    report.examined = Number(report.examined) + 1;
    report.highestBefore = Math.max(Number(report.highestBefore), previous);
    report.highestAfter = Math.max(Number(report.highestAfter), record);
    if (record === previous) report.unchanged = Number(report.unchanged) + 1;
    else report.lowered = Number(report.lowered) + 1;
    if (options.dryRun) return;

    if (record !== previous) {
      const written = database.getCollection('User').updateOne({ _id: user._id, levelRecord: user.levelRecord }, { $set: { levelRecord: record } });
      if (Number(written.modifiedCount) === 0) {
        report.movedMeanwhile = Number(report.movedMeanwhile) + 1;
        return;
      }
    }
    entries.push({ userId: user._id, previousRecord: previous, record, convertedAt: new Date() });
  });

  if (entries.length > 0) database.getCollection(JOURNAL).insertMany(entries);
  report.journaled = Number(report.journaled) + entries.length;
}

function runLevelRecordCurve(database, options) {
  const report = { batches: 0, examined: 0, lowered: 0, unchanged: 0, alreadyConverted: 0, movedMeanwhile: 0, journaled: 0, highestBefore: 0, highestAfter: 0 };
  const filter = { levelRecord: { $gt: LEVEL_MIN } };
  const projection = { _id: 1, engagementScore: 1, levelRecord: 1, meeshMintedLifetime: 1, longestStreakDays: 1 };
  let lastId = null;

  for (;;) {
    const page = database
      .getCollection('User')
      .find(lastId === null ? filter : { $and: [filter, { _id: { $gt: lastId } }] }, projection)
      .sort({ _id: 1 })
      .limit(options.batchSize)
      .toArray();
    if (page.length === 0) break;
    report.batches = Number(report.batches) + 1;
    convertBatch(database, page, options, report);
    lastId = page[page.length - 1]._id;
    if (page.length < options.batchSize) break;
  }
  return report;
}

function printLevelRecordReport(report, options) {
  print(options.dryRun
    ? '===== Niveau record sur la courbe 100 × N² et ses étapes (#9706) — SIMULATION, rien n’est écrit ====='
    : '===== Niveau record sur la courbe 100 × N² et ses étapes (#9706) — ÉCRITURE =====');
  print(`Lots de ${options.batchSize} : ${report.batches}`);
  print(`Records examinés : ${report.examined} — abaissés : ${report.lowered}, inchangés : ${report.unchanged}`);
  print(`Déjà convertis (journal ${JOURNAL}) : ${report.alreadyConverted}`);
  print(`Plus haut record : ${report.highestBefore} avant, ${report.highestAfter} après`);
  if (!options.dryRun) print(`Écrits au journal : ${report.journaled} — laissés (record bougé entre-temps) : ${report.movedMeanwhile}`);
}

const levelRecordOptions = readOptions(process.env);
printLevelRecordReport(runLevelRecordCurve(db, levelRecordOptions), levelRecordOptions);
