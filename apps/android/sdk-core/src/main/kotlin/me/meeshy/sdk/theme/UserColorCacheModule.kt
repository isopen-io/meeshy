package me.meeshy.sdk.theme

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

@Module
@InstallIn(SingletonComponent::class)
internal abstract class UserColorCacheModule {
    @Binds
    @IntoSet
    abstract fun bindUserColorCache(cache: UserColorCache): PerAccountCache
}
