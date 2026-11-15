package me.meeshy.sdk.pack

import android.content.Context
import dagger.Binds
import dagger.BindsOptionalOf
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.io.File
import java.util.Optional
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import me.meeshy.core.common.IoDispatcher

/** Le magasin adressé par contenu des packs, son index et l'élagage ; les sources de rétention des autres lots sont optionnelles. */
@Module
@InstallIn(SingletonComponent::class)
abstract class PackContentStoreBindingsModule {
    @Binds
    abstract fun bindFetcher(impl: PackAssetHttpFetcher): PackAssetFetching

    @Binds
    abstract fun bindScheduler(impl: WorkManagerPackDownloadScheduler): PackDownloadScheduler

    @BindsOptionalOf
    abstract fun optionalRetentionSources(): PackRetentionSources
}

@Module
@InstallIn(SingletonComponent::class)
object PackContentStoreProvidersModule {
    @Provides
    @Singleton
    fun provideContentAddressedStore(
        @ApplicationContext context: Context,
        fetcher: PackAssetFetching,
        @IoDispatcher io: CoroutineDispatcher,
    ): ContentAddressedStore = ContentAddressedStore(ContentAddressedStore.defaultDirectory(context), fetcher, io)

    @Provides
    @Singleton
    fun providePackFileIndex(@ApplicationContext context: Context, @IoDispatcher io: CoroutineDispatcher): PackFileIndex =
        PackFileIndex(File(context.noBackupFilesDir, "meeshy-packs-index.json"), io)

    /** Sans source de rétention, l'élagage est inerte : dans le doute, on garde. */
    @Provides
    @Singleton
    fun providePackFilePruner(
        index: PackFileIndex,
        store: ContentAddressedStore,
        sources: Optional<PackRetentionSources>,
    ): PackFilePruner = PackFilePruner(index, store, sources.orElse(UnreadableSources))

    private object UnreadableSources : PackRetentionSources {
        override suspend fun retainedPacks(): Set<String>? = null
        override suspend fun referencedFrames(): Set<String>? = null
    }
}
