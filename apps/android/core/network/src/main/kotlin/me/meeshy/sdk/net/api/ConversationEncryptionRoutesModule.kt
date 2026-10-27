package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi

/** Le régime de chiffrement d'une conversation ([ConversationEncryptionApi]) sur le client authentifié partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object ConversationEncryptionRoutesModule {

    @Provides
    fun providesConversationEncryptionApi(api: MeeshyApi): ConversationEncryptionApi =
        api.service(ConversationEncryptionApi::class.java)
}
