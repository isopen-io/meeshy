package me.meeshy.sdk.link

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

@Module
@InstallIn(SingletonComponent::class)
internal abstract class LinkAccountCacheModule {
    @Binds
    @IntoSet
    abstract fun bindLinkCache(repository: LinkCacheRepository): PerAccountCache
}
