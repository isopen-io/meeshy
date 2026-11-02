package me.meeshy.core.database.migration

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Gives every queued mutation its next retry time, last error, waiting clock, cancel request and
 * owning account. The columns are nullable and added in place, so no queued row is rebuilt or lost.
 */
internal val Migration_18_19: Migration = object : Migration(18, 19) {
    override fun migrate(db: SupportSQLiteDatabase) {
        listOf(
            "`nextAttemptAt` INTEGER",
            "`lastError` TEXT",
            "`waitingSince` INTEGER",
            "`cancelRequestedAt` INTEGER",
            "`ownerId` TEXT",
        ).forEach { db.execSQL("ALTER TABLE `outbox` ADD COLUMN $it") }
    }
}
