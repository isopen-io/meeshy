package me.meeshy.core.database

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.core.database.dao.ConversationDao
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

    private const val DATABASE_NAME = "meeshy.db"
}
