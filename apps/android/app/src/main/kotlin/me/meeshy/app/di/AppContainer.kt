package me.meeshy.app.di

import android.content.Context
import me.meeshy.app.BuildConfig
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.net.EncryptedTokenStore
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.TokenStore

/** Manual dependency container — single source of wired SDK objects for the app. */
class AppContainer(context: Context) {

    private val config = MeeshyConfig(enableLogging = BuildConfig.DEBUG)

    val tokenStore: TokenStore = EncryptedTokenStore(context)

    private val api: MeeshyApi = MeeshyApi.create(config, tokenStore)

    val authRepository: AuthRepository = AuthRepository(api.auth, tokenStore)
    val conversationRepository: ConversationRepository = ConversationRepository(api.conversations)
    val messageRepository: MessageRepository = MessageRepository(api.messages)
}
