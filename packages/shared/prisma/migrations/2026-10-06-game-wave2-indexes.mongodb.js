/**
 * Migration MongoDB — les index de la VAGUE 2 du Jeu Meeshy (#9384 à #9392),
 * sans `prisma db push` (#9035). Datée du 2026-10-06 ; NE SE JOUE NULLE PART
 * sans le feu vert du porteur (staging d'abord, production après sauvegarde
 * vérifiée).
 *
 * Collections NEUVES : `GameProfile`, `LeaguePseudonym`, `LeagueGroupWeek`,
 * `LeagueMembership`, `GameWeekPoints`, `GameDuo`, `GameDuoSlot`, `GameSeason`,
 * `GameTrophy`, `AtlasStamp`, `AchievementRarityStat`. Les champs ajoutés à
 * `User` (`publicLeagueConsentAt`, `publicLeagueConsentVersion`) sont
 * optionnels : AUCUN index ni backfill — un champ absent se lit « pas de
 * consentement ».
 *
 * Même forme et mêmes règles que `2026-10-05-game-indexes.mongodb.js` : un
 * index se reconnaît à sa CLÉ ; rien ne se passe s'il existe ; un unique bloqué
 * par des doublons est SIGNALÉ, jamais forcé. Idempotente — la rejouer ne
 * change rien. Aucune donnée n'est lue ni modifiée hors des index.
 *
 * Exécution (DRY_RUN=1 pour simuler) :
 *   docker exec -i meeshy-database mongosh meeshy --quiet < 2026-10-06-game-wave2-indexes.mongodb.js
 *   docker exec -i -e DRY_RUN=1 meeshy-database mongosh meeshy --quiet < 2026-10-06-game-wave2-indexes.mongodb.js
 */

const dryRun = process.env.DRY_RUN === '1';

const specs = [
  { collection: 'GameProfile', name: 'GameProfile_userId_key', key: { userId: 1 }, unique: true },
  { collection: 'LeaguePseudonym', name: 'LeaguePseudonym_userId_key', key: { userId: 1 }, unique: true },
  { collection: 'LeaguePseudonym', name: 'LeaguePseudonym_pseudonymKey_key', key: { pseudonymKey: 1 }, unique: true },
  { collection: 'LeagueGroupWeek', name: 'LeagueGroupWeek_groupId_key', key: { groupId: 1 }, unique: true },
  { collection: 'LeagueGroupWeek', name: 'LeagueGroupWeek_weekKey_idx', key: { weekKey: 1 } },
  { collection: 'LeagueGroupWeek', name: 'LeagueGroupWeek_settledAt_closeAt_idx', key: { settledAt: 1, closeAt: 1 } },
  { collection: 'LeagueMembership', name: 'LeagueMembership_userId_weekKey_key', key: { userId: 1, weekKey: 1 }, unique: true },
  { collection: 'LeagueMembership', name: 'LeagueMembership_groupId_idx', key: { groupId: 1 } },
  { collection: 'LeagueMembership', name: 'LeagueMembership_weekKey_idx', key: { weekKey: 1 } },
  { collection: 'GameWeekPoints', name: 'GameWeekPoints_userId_weekKey_dayKey_key', key: { userId: 1, weekKey: 1, dayKey: 1 }, unique: true },
  { collection: 'GameWeekPoints', name: 'GameWeekPoints_weekKey_idx', key: { weekKey: 1 } },
  { collection: 'GameDuo', name: 'GameDuo_inviterId_weekKey_idx', key: { inviterId: 1, weekKey: 1 } },
  { collection: 'GameDuo', name: 'GameDuo_inviteeId_weekKey_idx', key: { inviteeId: 1, weekKey: 1 } },
  { collection: 'GameDuo', name: 'GameDuo_status_weekKey_idx', key: { status: 1, weekKey: 1 } },
  { collection: 'GameDuoSlot', name: 'GameDuoSlot_userId_weekKey_key', key: { userId: 1, weekKey: 1 }, unique: true },
  { collection: 'GameDuoSlot', name: 'GameDuoSlot_duoId_idx', key: { duoId: 1 } },
  { collection: 'GameSeason', name: 'GameSeason_userId_number_key', key: { userId: 1, number: 1 }, unique: true },
  { collection: 'GameSeason', name: 'GameSeason_number_settledAt_idx', key: { number: 1, settledAt: 1 } },
  { collection: 'GameTrophy', name: 'GameTrophy_userId_key_key', key: { userId: 1, key: 1 }, unique: true },
  { collection: 'GameTrophy', name: 'GameTrophy_userId_awardedAt_idx', key: { userId: 1, awardedAt: 1 } },
  { collection: 'AtlasStamp', name: 'AtlasStamp_userId_language_key', key: { userId: 1, language: 1 }, unique: true },
  { collection: 'AchievementRarityStat', name: 'AchievementRarityStat_milestoneKey_key', key: { milestoneKey: 1 }, unique: true },
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

  if (spec.unique && !spec.partialFilterExpression && collections.includes(spec.collection)) {
    const groups = duplicateGroups(spec.collection, spec.key);
    if (groups > 0) {
      report.blocked.push(`${spec.collection}.${spec.name} — ${groups} groupe(s) en doublon`);
      continue;
    }
  }

  const options = { name: spec.name };
  if (spec.unique) options.unique = true;
  if (spec.partialFilterExpression) options.partialFilterExpression = spec.partialFilterExpression;

  if (!dryRun) {
    if (match) db.getCollection(spec.collection).dropIndex(match.name);
    db.getCollection(spec.collection).createIndex(spec.key, options);
  }
  report.created.push(`${spec.collection}.${spec.name}${match ? ` (remplace ${match.name}, non unique)` : ''}`);
}

print(dryRun ? '===== SIMULATION — rien n’est écrit =====' : '===== Index du Jeu Meeshy, vague 2 =====');
print(`Créés (${report.created.length}) :`);
report.created.forEach((line) => print(`  + ${line}`));
print(`Déjà présents (${report.present.length})`);
print(`Bloqués par des doublons (${report.blocked.length}) :`);
report.blocked.forEach((line) => print(`  ! ${line}`));
if (report.blocked.length > 0) quit(2);
