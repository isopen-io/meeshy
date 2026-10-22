package me.meeshy.sdk.net

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Provider
import javax.inject.Singleton

/** Le renouvellement de session en un seul vol et l'état de transition, en singletons. */
@Module
@InstallIn(SingletonComponent::class)
internal object SessionRefresherModule {

    @Provides
    @Singleton
    fun providesSessionTransitionFlags(): SessionTransitionFlags = SessionTransitionFlags()

    @Provides
    @Singleton
    fun providesSessionRefresher(
        tokenStore: TokenStore,
        transition: SessionTransitionFlags,
        api: Provider<MeeshyApi>,
    ): SessionRefresher = MeeshyApi.sessionRefresher(tokenStore, transition) { api.get() }
}
