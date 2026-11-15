package me.meeshy.core.database.migration

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * #14655 — la file durable des clairs E2EE à retirer du coffre (`e2ee_plaintext_erasures`). Purement additive : aucune
 * ligne existante n'est touchée.
 */
internal val Migration_22_23: Migration = object : Migration(22, 23) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(DurableTables.plaintextErasuresSql)
        db.execSQL(DurableTables.plaintextErasuresIndexSql)
    }
}
