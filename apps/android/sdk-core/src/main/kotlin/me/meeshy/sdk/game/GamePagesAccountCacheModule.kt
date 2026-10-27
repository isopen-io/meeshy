package me.meeshy.sdk.game

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

/** Le classement, la ligue Amis et les réglages du jeu sont vidés à la déconnexion et au changement de compte. */
@Module
@InstallIn(SingletonComponent::class)
internal abstract class GamePagesAccountCacheModule {
    @Binds
    @IntoSet
    abstract fun bindAccountCache(repository: GamePagesRepository): PerAccountCache
}
