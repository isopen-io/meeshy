package me.meeshy.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import me.meeshy.core.database.dao.BlockedUserDao
import me.meeshy.core.database.dao.CacheEntryDao
import me.meeshy.core.database.dao.CallHistoryDao
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.core.database.dao.DirectoryContactDao
import me.meeshy.core.database.dao.EditRevisionDao
import me.meeshy.core.database.dao.EphemeralReceiptDao
import me.meeshy.core.database.dao.FriendDao
import me.meeshy.core.database.dao.FriendRequestDao
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.core.database.dao.MediaBlobDao
import me.meeshy.core.database.dao.MediaIndexDao
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.OutboxDao
import me.meeshy.core.database.dao.PendingIdDao
import me.meeshy.core.database.dao.ProfileStatsCacheDao
import me.meeshy.core.database.dao.StatusBarCacheDao
import me.meeshy.core.database.dao.StoryDao
import me.meeshy.core.database.dao.SuggestionDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.dao.TusUploadCheckpointDao
import me.meeshy.core.database.entity.BlockedUserEntity
import me.meeshy.core.database.entity.CacheEntryEntity
import me.meeshy.core.database.entity.CallHistoryEntity
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.core.database.entity.DirectoryContactEntity
import me.meeshy.core.database.entity.EditRevisionEntity
import me.meeshy.core.database.entity.EphemeralReceiptEntity
import me.meeshy.core.database.entity.FriendEntity
import me.meeshy.core.database.entity.FriendRequestEntity
import me.meeshy.core.database.entity.KeyedJsonCacheEntity
import me.meeshy.core.database.entity.MediaBlobEntity
import me.meeshy.core.database.entity.MediaIndexEntity
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.core.database.entity.PendingIdEntity
import me.meeshy.core.database.entity.ProfileStatsCacheEntity
import me.meeshy.core.database.entity.StatusBarCacheEntity
import me.meeshy.core.database.entity.StoryEntity
import me.meeshy.core.database.entity.SuggestionEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.core.database.entity.TusUploadCheckpointEntity

/**
 * The single on-device source of truth (ADR-004). Network, sockets, FCM and
 * the outbox all write here; the UI observes here.
 *
 * The schema is exported to `core/database/schemas` and every version change ships a
 * migration (see migration/Migrations.kt); SQLCipher whole-DB encryption is wired per ADR-013.
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
        SuggestionEntity::class,
        ProfileStatsCacheEntity::class,
        StatusBarCacheEntity::class,
        TusUploadCheckpointEntity::class,
        FriendRequestEntity::class,
        BlockedUserEntity::class,
        EphemeralReceiptEntity::class,
        EditRevisionEntity::class,
        DirectoryContactEntity::class,
        MediaIndexEntity::class,
        CacheEntryEntity::class,
        KeyedJsonCacheEntity::class,
        PendingIdEntity::class,
    ],
    version = 19,
    exportSchema = true,
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
    public abstract fun suggestionDao(): SuggestionDao
    public abstract fun profileStatsCacheDao(): ProfileStatsCacheDao
    public abstract fun statusBarCacheDao(): StatusBarCacheDao
    public abstract fun tusUploadCheckpointDao(): TusUploadCheckpointDao
    public abstract fun friendRequestDao(): FriendRequestDao
    public abstract fun blockedUserDao(): BlockedUserDao
    public abstract fun ephemeralReceiptDao(): EphemeralReceiptDao
    public abstract fun editRevisionDao(): EditRevisionDao
    public abstract fun directoryContactDao(): DirectoryContactDao
    public abstract fun mediaIndexDao(): MediaIndexDao
    public abstract fun cacheEntryDao(): CacheEntryDao
    public abstract fun keyedJsonCacheDao(): KeyedJsonCacheDao
    public abstract fun pendingIdDao(): PendingIdDao
}
