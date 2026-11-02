package me.meeshy.sdk.mediahub

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

@Module
@InstallIn(SingletonComponent::class)
abstract class ConversationMediaHubModule {
    @Binds
    @IntoSet
    abstract fun bindMediaHubIndexAccountCache(impl: ConversationMediaHubIndex): PerAccountCache

    @Binds
    @IntoSet
    abstract fun bindBackgroundPhotosAccountCache(impl: ConversationBackgroundPhotos): PerAccountCache
}
