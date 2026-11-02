package me.meeshy.core.database.migration

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import me.meeshy.core.database.search.SearchIndexSchema

/**
 * The only destructive path: drops and recreates CACHE tables, which the SWR layer repopulates
 * (skeleton on empty cache, never an error screen). [DurableTables] are never touched.
 */
internal object CacheReset {
    fun run(db: SupportSQLiteDatabase) {
        SearchIndexSchema.drop(db)
        CacheTables.all.forEach { db.execSQL("DROP TABLE IF EXISTS `${it.name}`") }
        CacheTables.all.forEach(db::createCacheTable)
        SearchIndexSchema.create(db)
    }
}

/** Downgrade (or pre-baseline) step that empties caches only, instead of Room's drop-everything fallback. */
internal class CacheResetMigration(from: Int, to: Int) : Migration(from, to) {
    override fun migrate(db: SupportSQLiteDatabase) = CacheReset.run(db)
}

/**
 * Runs [inner] under a savepoint. If it throws, its partial work is rolled back (durable tables
 * intact) and the caches are reset to the current shape rather than crashing the app on launch.
 */
internal class GuardedMigration(private val inner: Migration) : Migration(inner.startVersion, inner.endVersion) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("SAVEPOINT meeshy_migration")
        try {
            inner.migrate(db)
        } catch (failure: Exception) {
            // Android's SQLiteSession treats any statement starting with ROLLBACK as ending the tracked
            // transaction; the leading comment keeps this a plain SQLite savepoint rollback.
            db.execSQL("/* savepoint */ ROLLBACK TO SAVEPOINT meeshy_migration")
            CacheReset.run(db)
        } finally {
            db.execSQL("RELEASE SAVEPOINT meeshy_migration")
        }
    }
}
