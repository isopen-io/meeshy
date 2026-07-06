package me.meeshy.core.database

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.core.database.dao.CallHistoryDao
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.core.database.dao.FriendDao
import me.meeshy.core.database.dao.MediaBlobDao
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.OutboxDao
import me.meeshy.core.database.dao.StoryDao
import me.meeshy.core.database.dao.SuggestionDao
import me.meeshy.core.database.dao.SyncMetaDao
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal object DatabaseModule {

    @Provides
    @Singleton
    fun providesDatabase(@ApplicationContext context: Context): MeeshyDatabase =
        Room.databaseBuilder(context, MeeshyDatabase::class.java, DATABASE_NAME)
            .fallbackToDestructiveMigration()
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

    private const val DATABASE_NAME = "meeshy.db"
}
