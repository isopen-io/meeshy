package me.meeshy.sdk.net

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet

/** Contribue [GameVersionInterceptor] au client HTTP partagé, après l'identité et les capacités. */
@Module
@InstallIn(SingletonComponent::class)
internal object GameVersionModule {

    @Provides
    @IntoSet
    fun providesGameVersionContributor(): HttpClientContributor =
        HttpClientContributor.of("game-version", HttpPriority.GAME_VERSION) { it.addInterceptor(GameVersionInterceptor()) }
}
