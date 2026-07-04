package me.meeshy.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import me.meeshy.core.database.dao.CallHistoryDao
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.core.database.dao.FriendDao
import me.meeshy.core.database.dao.MediaBlobDao
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.OutboxDao
import me.meeshy.core.database.dao.StoryDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.CallHistoryEntity
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.core.database.entity.FriendEntity
import me.meeshy.core.database.entity.MediaBlobEntity
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.core.database.entity.StoryEntity
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
        OutboxEntity::class,
        MessageEntity::class,
        StoryEntity::class,
        MediaBlobEntity::class,
        CallHistoryEntity::class,
        FriendEntity::class,
    ],
    version = 8,
    exportSchema = false,
)
public abstract class MeeshyDatabase : RoomDatabase() {
    public abstract fun conversationDao(): ConversationDao
    public abstract fun syncMetaDao(): SyncMetaDao
    public abstract fun outboxDao(): OutboxDao
    public abstract fun messageDao(): MessageDao
    public abstract fun storyDao(): StoryDao
    public abstract fun mediaBlobDao(): MediaBlobDao
    public abstract fun callHistoryDao(): CallHistoryDao
    public abstract fun friendDao(): FriendDao
}
