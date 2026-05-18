package me.meeshy.sdk.net

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.core.network.BuildConfig
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.MessageApi
import javax.inject.Singleton

/**
 * Hilt bindings for the networking layer (ARCHITECTURE.md §2, §10).
 * The typed API surfaces are derived from the single [MeeshyApi] instance.
 */
@Module
@InstallIn(SingletonComponent::class)
internal object NetworkModule {

    @Provides
    @Singleton
    fun providesMeeshyConfig(): MeeshyConfig =
        MeeshyConfig(enableLogging = BuildConfig.DEBUG)

    @Provides
    @Singleton
    fun providesTokenStore(@ApplicationContext context: Context): TokenStore =
        EncryptedTokenStore(context)

    @Provides
    @Singleton
    fun providesMeeshyApi(config: MeeshyConfig, tokenStore: TokenStore): MeeshyApi =
        MeeshyApi.create(config, tokenStore)

    @Provides
    fun providesAuthApi(api: MeeshyApi): AuthApi = api.auth

    @Provides
    fun providesConversationApi(api: MeeshyApi): ConversationApi = api.conversations

    @Provides
    fun providesMessageApi(api: MeeshyApi): MessageApi = api.messages
}
