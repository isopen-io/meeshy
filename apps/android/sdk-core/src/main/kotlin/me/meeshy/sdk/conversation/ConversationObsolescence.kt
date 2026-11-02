package me.meeshy.sdk.conversation

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.ConversationObsoleted
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationObsoleteApi
import me.meeshy.sdk.net.apiCall

/** Le geste « Rendre obsolète » (#14645), vu par un écran : la liste et les infos de la conversation. */
fun interface ConversationObsoleting {
    suspend fun makeObsolete(conversationId: String): NetworkResult<ConversationObsoleted>

    companion object {
        /** Inerte : un écran sans passerelle (aperçu, test) refuse sans rien retirer. */
        val Unavailable: ConversationObsoleting = ConversationObsoleting { NetworkResult.Failure(ApiError(message = "")) }
    }
}

/**
 * Rend une conversation obsolète. Une fois la passerelle d'accord, la ligne et le cache de ses messages
 * quittent l'appareil aussitôt ([ConversationLivePatcher.remove]) : la purge ne dépend pas d'un
 * `conversation:closed` / `conversation:obsoleted` que la socket aurait manqué. Un refus ne touche à rien,
 * l'écran qui avait retiré la ligne d'avance la rend.
 */
@Singleton
class ConversationObsolescence(
    private val api: ConversationObsoleteApi,
    private val removeLocally: suspend (String) -> Unit,
) : ConversationObsoleting {

    @Inject
    constructor(api: ConversationObsoleteApi, patcher: ConversationLivePatcher) : this(api, patcher::remove)

    override suspend fun makeObsolete(conversationId: String): NetworkResult<ConversationObsoleted> {
        val result = apiCall { api.makeObsolete(conversationId) }
        if (result is NetworkResult.Success) removeLocally(conversationId)
        return result
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ConversationObsoletingModule {
    @Binds
    abstract fun obsoleting(impl: ConversationObsolescence): ConversationObsoleting
}
