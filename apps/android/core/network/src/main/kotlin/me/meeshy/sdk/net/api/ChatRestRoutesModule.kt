package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi

/** Les interfaces REST du chat ([MessageChatRestApi], [ConversationChatRestApi]) sur le client authentifié partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object ChatRestRoutesModule {

    @Provides
    fun providesMessageChatRestApi(api: MeeshyApi): MessageChatRestApi = api.service(MessageChatRestApi::class.java)

    @Provides
    fun providesConversationChatRestApi(api: MeeshyApi): ConversationChatRestApi =
        api.service(ConversationChatRestApi::class.java)
}
