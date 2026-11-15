package me.meeshy.sdk.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.game.DefaultGameService
import me.meeshy.sdk.game.GameArchiveServiceProviding
import me.meeshy.sdk.game.GameIntegrationServiceProviding
import me.meeshy.sdk.game.GameServiceProviding
import me.meeshy.sdk.game.GameWave2ServiceProviding

/** Lie les quatre contrats du service du jeu à leur unique implémentation. */
@Module
@InstallIn(SingletonComponent::class)
internal abstract class GameServiceModule {
    @Binds abstract fun bindsGameService(impl: DefaultGameService): GameServiceProviding

    @Binds abstract fun bindsGameWave2Service(impl: DefaultGameService): GameWave2ServiceProviding

    @Binds abstract fun bindsGameIntegrationService(impl: DefaultGameService): GameIntegrationServiceProviding

    @Binds abstract fun bindsGameArchiveService(impl: DefaultGameService): GameArchiveServiceProviding
}
