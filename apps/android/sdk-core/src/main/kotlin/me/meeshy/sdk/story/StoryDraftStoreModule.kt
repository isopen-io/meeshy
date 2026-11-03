package me.meeshy.sdk.story

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.io.File
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.session.PerAccountCache

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
    @IntoSet
    fun providesStoryDraftStoreTeardown(store: StoryDraftStoring): PerAccountCache = StoryDraftStoreTeardown(store)

    @Provides
    @Singleton
    fun providesLegacyDraftMigrator(
        @ApplicationContext context: Context,
        legacy: StoryComposerDraftStore,
        store: StoryDraftStoring,
        blobStore: MediaBlobStore,
    ): LegacyDraftMigrator =
        LegacyDraftMigrator(
            legacy = legacy,
            store = store,
            media = MediaBlobDraftMediaSource(blobStore),
            staging = File(context.cacheDir, "story_drafts_migration"),
        )
}
