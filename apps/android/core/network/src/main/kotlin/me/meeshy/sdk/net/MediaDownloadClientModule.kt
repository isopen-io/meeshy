package me.meeshy.sdk.net

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import javax.inject.Qualifier
import javax.inject.Singleton

/** Le client OkHttp des téléchargements de médias — jamais le client Retrofit. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class MediaDownloadClient

@Module
@InstallIn(SingletonComponent::class)
internal object MediaDownloadClientModule {
    @Provides
    @Singleton
    @MediaDownloadClient
    fun providesMediaDownloadClient(
        shared: dagger.Lazy<OkHttpClient>,
        contributors: dagger.Lazy<Set<@JvmSuppressWildcards HttpClientContributor>>,
        tokenStore: TokenStore,
        config: MeeshyConfig,
    ): OkHttpClient = MediaHttpClient.derive(shared.get(), contributors.get(), tokenStore) { config.apiBaseUrl }
}
