package me.meeshy.sdk.story

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.io.File
import javax.inject.Singleton
import kotlinx.serialization.json.Json

@Module
@InstallIn(SingletonComponent::class)
internal object StoryDraftStoreModule {

    @Provides
    @Singleton
    fun providesStoryDraftStore(@ApplicationContext context: Context, json: Json): StoryDraftStoring =
        StoryDraftDiskStore(
            filesDir = context.filesDir,
            sessionRoot = File(context.cacheDir, "story_drafts_sessions"),
            json = json,
        )

    @Provides
    @Singleton
    fun providesLegacyDraftMigrator(legacy: StoryComposerDraftStore, store: StoryDraftStoring): LegacyDraftMigrator =
        LegacyDraftMigrator(legacy, store)
}
