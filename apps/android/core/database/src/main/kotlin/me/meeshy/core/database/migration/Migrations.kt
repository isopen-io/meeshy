package me.meeshy.core.database.migration

import androidx.room.migration.Migration

/*
 * HOW TO ADD A TABLE OR CHANGE A COLUMN (the Room schema lock: one schema lot in flight at a time)
 *  1. Take the next free version N+1 and bump `version` in MeeshyDatabase (exportSchema stays true).
 *  2. Add the entity at the END of the @Database list, with its DAO.
 *  3. Create migration/Migration_<N>_<N+1>.kt (see Migration_16_17.kt). Never edit an older migration.
 *     Rebuild a table with rebuildTable() when a key or constraint changes.
 *  4. Classify the table: a cache table goes in CacheTables (definition = the exact Room createSql);
 *     a table holding the only copy of user intent goes in DurableTables. DurableTablesGuardTest fails otherwise.
 *  5. Register the migration in [MeeshyMigrations.upgrades] (it is wrapped by GuardedMigration).
 *  6. Build once: KSP writes schemas/me.meeshy.core.database.MeeshyDatabase/<N+1>.json. Commit it.
 *  7. Add a MigrationTestHelper test that inserts durable rows at N, migrates, and reads them back.
 * scripts/check-room-schema.sh fails the CI when a version has no schema JSON or no migration.
 * No fallbackToDestructiveMigration: older-than-baseline installs (1..15) are the only wipe.
 */
internal object MeeshyMigrations {

    const val BASELINE_VERSION: Int = 16
    const val CURRENT_VERSION: Int = 19

    val upgrades: List<Migration> = listOf(Migration_16_17, Migration_17_18, Migration_18_19).map(::GuardedMigration)

    /**
     * Any downgrade empties caches only; durable rows stay for the older build to read. It never
     * targets a pre-baseline version: those are wiped by fallbackToDestructiveMigrationFrom, and Room
     * refuses to build when a migration ends on a version declared destructive.
     */
    val downgrades: List<Migration> = (BASELINE_VERSION + 1..CURRENT_VERSION).flatMap { from ->
        (BASELINE_VERSION until from).map { to -> CacheResetMigration(from, to) }
    }

    val all: Array<Migration> = (upgrades + downgrades).toTypedArray()
}
