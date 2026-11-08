package me.meeshy.sdk.lock

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.lock.ConversationUnlockSession
import me.meeshy.sdk.session.PerAccountCache

/**
 * Detenteur singleton de [ConversationUnlockSession] : les conversations verrouillees dont le code
 * a ete accepte pendant la session. Memoire seulement ; efface a la deconnexion (PerAccountCache).
 */
@Singleton
class ConversationUnlockSessionStore @Inject constructor() : PerAccountCache {
    private val state = MutableStateFlow(ConversationUnlockSession())
    val session: StateFlow<ConversationUnlockSession> = state.asStateFlow()

    fun admits(conversationId: String, isLocked: Boolean): Boolean =
        state.value.admits(conversationId, isLocked)

    fun unlock(conversationId: String) = state.update { it.unlock(conversationId) }

    fun revoke(conversationId: String) = state.update { it.revoke(conversationId) }

    override suspend fun clear() = state.update { it.cleared() }
}
