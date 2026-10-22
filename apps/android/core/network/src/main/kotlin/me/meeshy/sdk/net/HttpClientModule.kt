package me.meeshy.sdk.net

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.ElementsIntoSet
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import javax.inject.Provider
import javax.inject.Singleton

/**
 * Le client HTTP et Retrofit en SINGLETONS, assemblés depuis le multibinding ordonné
 * `Set<HttpClientContributor>`. Un lot suivant contribue un intercepteur par
 * `@Provides @IntoSet HttpClientContributor` dans SON module, et déclare sa propre
 * interface Retrofit par `retrofit.create(...)` dans SON module — personne n'édite plus
 * [MeeshyApi.create].
 */
@Module
@InstallIn(SingletonComponent::class)
internal object HttpClientModule {

    @Provides
    @ElementsIntoSet
    fun providesBuiltInContributors(
        config: MeeshyConfig,
        tokenStore: TokenStore,
        sessionExpiry: SessionExpiryNotifier,
        api: Provider<MeeshyApi>,
    ): Set<HttpClientContributor> = builtInContributors(
        config = config,
        tokenStore = tokenStore,
        onSessionExpired = sessionExpiry::notifyExpired,
        refresher = MeeshyApi.tokenRefresher(tokenStore) { api.get() },
    ).toSet()

    @Provides
    @Singleton
    fun providesOkHttpClient(contributors: Set<@JvmSuppressWildcards HttpClientContributor>): OkHttpClient =
        HttpClientAssembler.build(contributors)

    @Provides
    @Singleton
    fun providesRetrofit(config: MeeshyConfig, client: OkHttpClient): Retrofit =
        MeeshyApi.buildRetrofit(config, client)
}
