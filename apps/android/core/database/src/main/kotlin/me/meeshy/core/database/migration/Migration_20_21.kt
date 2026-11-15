package me.meeshy.core.database.migration

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import me.meeshy.core.database.search.SearchIndexSchema

/**
 * Adds the local full-text index (`message_fts`, `conversation_fts`, their triggers). Purely
 * additive: no Room entity changes, outbox/messages/conversations keep every row. The message
 * index is rebuilt from the cached rows; conversations are indexed by the next cache write.
 */
internal val Migration_20_21: Migration = object : Migration(20, 21) {
    override fun migrate(db: SupportSQLiteDatabase) {
        SearchIndexSchema.create(db)
        SearchIndexSchema.rebuildMessages(db)
    }
}
