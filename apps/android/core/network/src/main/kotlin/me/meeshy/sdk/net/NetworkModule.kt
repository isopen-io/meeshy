package me.meeshy.sdk.net

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.core.network.BuildConfig
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.net.api.CommunityApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.FriendApi
import me.meeshy.sdk.net.api.MediaApi
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.NotificationApi
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.ReactionApi
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.net.api.UserApi
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

    @Provides
    fun providesReactionApi(api: MeeshyApi): ReactionApi = api.reactions

    @Provides
    fun providesPostApi(api: MeeshyApi): PostApi = api.posts

    @Provides
    fun providesUserApi(api: MeeshyApi): UserApi = api.users

    @Provides
    fun providesFriendApi(api: MeeshyApi): FriendApi = api.friends

    @Provides
    fun providesNotificationApi(api: MeeshyApi): NotificationApi = api.notifications

    @Provides
    fun providesCommunityApi(api: MeeshyApi): CommunityApi = api.communities

    @Provides
    fun providesStoryApi(api: MeeshyApi): StoryApi = api.stories

    @Provides
    fun providesTranslationApi(api: MeeshyApi): TranslationApi = api.translation

    @Provides
    fun providesMediaApi(api: MeeshyApi): MediaApi = api.media
}
