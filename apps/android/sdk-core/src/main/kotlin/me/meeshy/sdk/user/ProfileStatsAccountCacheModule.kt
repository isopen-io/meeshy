package me.meeshy.sdk.user

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ProfileStatsAccountCacheModule {
    @Binds
    @IntoSet
    abstract fun bindProfileStatsCache(repository: ProfileStatsCacheRepository): PerAccountCache
}
