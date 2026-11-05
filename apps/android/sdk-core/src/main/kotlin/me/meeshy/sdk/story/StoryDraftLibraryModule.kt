package me.meeshy.sdk.story

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.io.File
import javax.inject.Singleton
import me.meeshy.sdk.media.MediaBlobStore

@Module
@InstallIn(SingletonComponent::class)
internal object StoryDraftLibraryModule {

    @Provides
    @Singleton
    fun providesStoryDraftLibrary(
        @ApplicationContext context: Context,
        store: StoryDraftStoring,
        slot: StoryComposerDraftStore,
        blobStore: MediaBlobStore,
    ): StoryDraftLibrary =
        StoryDraftLibrary(
            store = store,
            slot = slot,
            media = MediaBlobDraftMediaSource(blobStore),
            staging = File(context.cacheDir, "story_drafts_library"),
        )

    @Provides
    @Singleton
    fun providesStoryFailureResume(
        @ApplicationContext context: Context,
        store: StoryDraftStoring,
        blobStore: MediaBlobStore,
        repository: StoryRepository,
    ): StoryFailureResume =
        StoryFailureResume(
            store = store,
            media = MediaBlobDraftMediaSource(blobStore),
            staging = File(context.cacheDir, "story_failure_resume"),
            readFailed = repository::failedPublishRequest,
            discardFailed = repository::discardPublish,
        )
}
