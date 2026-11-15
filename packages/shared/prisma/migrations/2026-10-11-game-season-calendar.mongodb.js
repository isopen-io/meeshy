/**
 * Migration MongoDB — le calendrier des saisons passe en base (#10016, #10232).
 *
 * La décision du porteur du 2026-10-11 sert le calendrier des saisons depuis la passerelle
 * (`GameSeasonDefinition`), lu par la loi partagée (`packages/shared/utils/game/season-schedule.ts`).
 * Ce script :
 *
 *  1. pose les index que le schéma déclare (`number` unique, `revision` unique) sur
 *     `GameSeasonDefinition`, et ceux de `GameSeasonProposal` (`status, createdAt`, `number`) ;
 *  2. SEED la saison 1 telle que la constante la fixe : lundi 2026-12-21, programmée, thème
 *     `language:fr`, 100 points d'étape, sans texte propre, révision 1. La loi dérive EXACTEMENT
 *     le même calendrier avec ou sans cette ligne : aucun changement visible tant que l'admin
 *     n'a rien modifié ;
 *  3. ne réécrit JAMAIS une saison 1 déjà présente (un admin a pu la programmer) : `$setOnInsert` ; ne seed rien
 *     si l'admin a déjà programmé une autre saison (la révision 1 pourrait heurter une révision écrite).
 *
 * La ligne insérée est notée dans `_migration_2026_10_11_season_calendar`. `ROLLBACK=1` la retire
 * — seulement si elle est encore telle que le seed l'a posée (révision 1) ; une saison que l'admin a
 * réécrite depuis est laissée, et le journal le dit. Les index restent (inoffensifs, déclarés par le
 * schéma). Sans aucune définition, la passerelle sert la constante : le retour arrière est complet.
 *
 * Régime (celui de 2026-10-11-game-star-fragments-cleanup) :
 * - À BLANC par défaut : dit ce qu'il ferait, n'écrit rien. `APPLY=1` écrit ; `ROLLBACK=1` revient en arrière.
 * - Idempotent : une seconde exécution ne trouve rien à faire (« déjà présente »).
 * - Le journal ne cite aucun utilisateur.
 *
 * Exécution (depuis la racine du dépôt) — staging d'abord, à blanc puis pour de vrai :
 *
 *   F=packages/shared/prisma/migrations/2026-10-11-game-season-calendar.mongodb.js
 *   U='$(docker exec meeshy-gateway-staging printenv DATABASE_URL)'
 *   ssh root@meeshy.me "docker exec -i meeshy-database-staging mongosh \"$U\" --quiet" < $F
 *   ssh root@meeshy.me "docker exec -i -e APPLY=1 meeshy-database-staging mongosh \"$U\" --quiet" < $F
 *   ssh root@meeshy.me "docker exec -i meeshy-database-staging mongosh \"$U\" --quiet" < $F      # attendu : déjà présente
 *   # retour arrière :
 *   ssh root@meeshy.me "docker exec -i -e ROLLBACK=1 meeshy-database-staging mongosh \"$U\" --quiet" < $F
 *
 * Production : uniquement avec le feu vert du porteur et une sauvegarde vérifiée (#9223).
 *
 * Témoin : `services/gateway/src/__tests__/unit/migrations/game-season-calendar-migration.test.ts`.
 */

const LEDGER = '_migration_2026_10_11_season_calendar';
const SEED = {
  number: 1,
  startDay: '2026-12-21',
  status: 'scheduled',
  themeKey: 'language:fr',
  stepPoints: 100,
  copy: null,
  revision: 1,
  updatedBy: null,
};

function readOptions(env) {
  return { apply: env.APPLY === '1', rollback: env.ROLLBACK === '1' };
}

function ensureIndexes(database) {
  const definitions = database.getCollection('GameSeasonDefinition');
  definitions.createIndex({ number: 1 }, { unique: true, name: 'GameSeasonDefinition_number_key' });
  definitions.createIndex({ revision: 1 }, { unique: true, name: 'GameSeasonDefinition_revision_key' });
  const proposals = database.getCollection('GameSeasonProposal');
  proposals.createIndex({ status: 1, createdAt: 1 }, { name: 'GameSeasonProposal_status_createdAt_idx' });
  proposals.createIndex({ number: 1 }, { name: 'GameSeasonProposal_number_idx' });
}

function seed(database, options) {
  const definitions = database.getCollection('GameSeasonDefinition');
  const present = definitions.findOne({ number: 1 });
  if (present) return { seeded: false, present: true };
  // L'admin a déjà programmé (saison 2 ou plus) : le seed est inutile (la saison 1 se dérive à l'identique)
  // et sa révision 1 pourrait heurter une révision déjà écrite. On ne pose rien.
  if (definitions.findOne({})) return { seeded: false, present: false, programmed: true };
  if (!options.apply) return { seeded: false, present: false };
  const now = new Date();
  const result = definitions.updateOne(
    { number: 1 },
    { $setOnInsert: { ...SEED, createdAt: now, updatedAt: now } },
    { upsert: true },
  );
  const inserted = Number(result.upsertedCount ?? 0) > 0;
  if (inserted) {
    database.getCollection(LEDGER).updateOne({ _id: 'season-1' }, { $setOnInsert: { number: 1, revision: 1, at: now } }, { upsert: true });
  }
  return { seeded: inserted, present: !inserted };
}

function rollback(database) {
  const ledger = database.getCollection(LEDGER);
  const entry = ledger.findOne({ _id: 'season-1' });
  if (!entry) return { removed: 0, kept: 0, noted: false };
  const definitions = database.getCollection('GameSeasonDefinition');
  const removed = Number(definitions.deleteMany({ number: 1, revision: 1, startDay: SEED.startDay, status: SEED.status }).deletedCount ?? 0);
  const kept = removed === 0 && definitions.findOne({ number: 1 }) ? 1 : 0;
  ledger.deleteMany({});
  return { removed, kept, noted: true };
}

function runSeasonCalendarMigration(database, options) {
  if (options.rollback) {
    const report = rollback(database);
    print('===== Calendrier des saisons (#10016) — RETOUR ARRIÈRE =====');
    if (!report.noted) print('aucune saison posée par cette migration : rien à retirer');
    else print(`saison 1 du seed retirée : ${report.removed}${report.kept ? ' — réécrite par l’admin depuis, laissée en place' : ''}`);
    print('sans définition, la passerelle sert la constante (saison 1 au 2026-12-21).');
    return;
  }
  if (options.apply) ensureIndexes(database);
  const report = seed(database, options);
  print(options.apply
    ? '===== Calendrier des saisons (#10016) — ÉCRITURE ====='
    : '===== Calendrier des saisons (#10016) — À BLANC, rien n’est écrit =====');
  if (report.present) print('saison 1 : déjà présente — non réécrite');
  else if (report.programmed) print('calendrier déjà programmé par l’admin : seed inutile, rien n’est posé');
  else if (report.seeded) print('saison 1 : posée (2026-12-21, language:fr, 100 points, révision 1) ; index posés');
  else print('saison 1 : à poser (2026-12-21, language:fr, 100 points, révision 1) ; index à poser');
  if (!options.apply) print('Relancer avec APPLY=1 pour écrire, ROLLBACK=1 pour revenir en arrière (production : feu vert du porteur et sauvegarde vérifiée).');
}

runSeasonCalendarMigration(db, readOptions(process.env));
