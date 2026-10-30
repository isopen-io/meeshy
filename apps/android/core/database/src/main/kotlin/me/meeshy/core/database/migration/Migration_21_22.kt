package me.meeshy.core.database.migration

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * #13821 — indexe `messages` sur `(conversationId, createdAt)` : la fenêtre récente d'un fil (garde e2ee de l'outbox,
 * aperçu, fenêtre bornée du fil) se lit sans trier toute la conversation. Purement additif : aucune ligne n'est touchée.
 */
internal val Migration_21_22: Migration = object : Migration(21, 22) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(CacheTables.messagesTimelineIndex)
    }
}
