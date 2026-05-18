package me.meeshy.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.core.database.entity.SyncMetaEntity

/**
 * The single on-device source of truth (ADR-004). Network, sockets, FCM and
 * the outbox all write here; the UI observes here.
 *
 * `exportSchema` is disabled until migration tests land (ARCHITECTURE.md §17);
 * SQLCipher whole-DB encryption is wired per ADR-013.
 */
@Database(
    entities = [
        ConversationEntity::class,
        SyncMetaEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
public abstract class MeeshyDatabase : RoomDatabase() {
    public abstract fun conversationDao(): ConversationDao
    public abstract fun syncMetaDao(): SyncMetaDao
}
