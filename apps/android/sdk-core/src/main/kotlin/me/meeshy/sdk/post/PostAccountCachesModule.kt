package me.meeshy.sdk.post

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

@Module
@InstallIn(SingletonComponent::class)
internal abstract class PostAccountCachesModule {
    @Binds
    @IntoSet
    abstract fun bindHashtagPages(repository: PostHashtagRepository): PerAccountCache

    @Binds
    @IntoSet
    abstract fun bindFeedCache(repository: PostRepository): PerAccountCache

    @Binds
    @IntoSet
    abstract fun bindComposerDrafts(store: PostComposerDraftStore): PerAccountCache
}
