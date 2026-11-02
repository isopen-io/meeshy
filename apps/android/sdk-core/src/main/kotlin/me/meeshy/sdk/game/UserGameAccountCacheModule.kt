package me.meeshy.sdk.game

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

/** Le niveau et le rang des AUTRES membres ne restent pas sur l'appareil d'un compte qui s'en va. */
@Module
@InstallIn(SingletonComponent::class)
internal abstract class UserGameAccountCacheModule {
    @Binds
    @IntoSet
    abstract fun bindAccountCache(repository: UserGameRepository): PerAccountCache
}
