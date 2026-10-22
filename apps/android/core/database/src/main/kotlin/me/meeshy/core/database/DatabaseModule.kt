package me.meeshy.core.database

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
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
import me.meeshy.core.database.dao.ProfileStatsCacheDao
import me.meeshy.core.database.dao.StatusBarCacheDao
import me.meeshy.core.database.dao.StoryDao
import me.meeshy.core.database.dao.SuggestionDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.dao.TusUploadCheckpointDao
import me.meeshy.core.database.migration.MeeshyMigrations
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal object DatabaseModule {

    @Provides
    @Singleton
    fun providesDatabase(@ApplicationContext context: Context): MeeshyDatabase =
        Room.databaseBuilder(context, MeeshyDatabase::class.java, DATABASE_NAME)
            .addMigrations(*MeeshyMigrations.all)
            .fallbackToDestructiveMigrationFrom(*PRE_BASELINE_VERSIONS)
            .build()

    @Provides
    fun providesConversationDao(database: MeeshyDatabase): ConversationDao =
        database.conversationDao()

    @Provides
    fun providesSyncMetaDao(database: MeeshyDatabase): SyncMetaDao =
        database.syncMetaDao()

    @Provides
    fun providesOutboxDao(database: MeeshyDatabase): OutboxDao =
        database.outboxDao()

    @Provides
    fun providesMessageDao(database: MeeshyDatabase): MessageDao =
        database.messageDao()

    @Provides
    fun providesStoryDao(database: MeeshyDatabase): StoryDao =
        database.storyDao()

    @Provides
    fun providesMediaBlobDao(database: MeeshyDatabase): MediaBlobDao =
        database.mediaBlobDao()

    @Provides
    fun providesCallHistoryDao(database: MeeshyDatabase): CallHistoryDao =
        database.callHistoryDao()

    @Provides
    fun providesFriendDao(database: MeeshyDatabase): FriendDao =
        database.friendDao()

    @Provides
    fun providesSuggestionDao(database: MeeshyDatabase): SuggestionDao =
        database.suggestionDao()

    @Provides
    fun providesProfileStatsCacheDao(database: MeeshyDatabase): ProfileStatsCacheDao =
        database.profileStatsCacheDao()

    @Provides
    fun providesStatusBarCacheDao(database: MeeshyDatabase): StatusBarCacheDao =
        database.statusBarCacheDao()

    @Provides
    fun providesTusUploadCheckpointDao(database: MeeshyDatabase): TusUploadCheckpointDao =
        database.tusUploadCheckpointDao()

    @Provides
    fun providesFriendRequestDao(database: MeeshyDatabase): FriendRequestDao =
        database.friendRequestDao()

    @Provides
    fun providesBlockedUserDao(database: MeeshyDatabase): BlockedUserDao =
        database.blockedUserDao()

    @Provides
    fun providesEphemeralReceiptDao(database: MeeshyDatabase): EphemeralReceiptDao =
        database.ephemeralReceiptDao()

    @Provides
    fun providesEditRevisionDao(database: MeeshyDatabase): EditRevisionDao =
        database.editRevisionDao()

    @Provides
    fun providesDirectoryContactDao(database: MeeshyDatabase): DirectoryContactDao =
        database.directoryContactDao()

    @Provides
    fun providesMediaIndexDao(database: MeeshyDatabase): MediaIndexDao =
        database.mediaIndexDao()

    @Provides
    fun providesCacheEntryDao(database: MeeshyDatabase): CacheEntryDao =
        database.cacheEntryDao()

    @Provides
    fun providesKeyedJsonCacheDao(database: MeeshyDatabase): KeyedJsonCacheDao =
        database.keyedJsonCacheDao()

    private const val DATABASE_NAME = "meeshy.db"

    /** Builds older than the exported v16 baseline predate the schema lock; they alone are wiped. */
    private val PRE_BASELINE_VERSIONS: IntArray = IntArray(MeeshyMigrations.BASELINE_VERSION - 1) { it + 1 }
}
