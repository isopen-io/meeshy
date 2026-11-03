package me.meeshy.app.widget

import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation

/** Ce que l'action « Marquer comme lu » du widget demande au cache et à l'outbox. */
internal interface WidgetReadPort {
    suspend fun snapshot(conversationId: String): ApiConversation?

    /** Le compteur du cache tombe à zéro et un `READ_RECEIPT` rejoint l'outbox ; faux si rien à lire. */
    suspend fun markReadOptimistic(conversationId: String): Boolean

    suspend fun restore(conversation: ApiConversation)
}

internal class RepositoryWidgetReadPort(private val repository: ConversationRepository) : WidgetReadPort {
    override suspend fun snapshot(conversationId: String): ApiConversation? = repository.cachedById(conversationId)

    override suspend fun markReadOptimistic(conversationId: String): Boolean = repository.markReadOptimistic(conversationId)

    override suspend fun restore(conversation: ApiConversation) = repository.remember(conversation)
}

/**
 * La coche « Marquer comme lu » du widget (miroir iOS `MarkConversationReadIntent`) : instantané,
 * application locale (la ligne est lue, le compteur baisse), lecture mise en file dans l'outbox
 * `READ_RECEIPT` — rejouée au retour du réseau, jamais une seconde file —, et retour arrière si
 * la mise en file échoue. Une ligne déjà lue, un second tap ou une session fermée sont inertes.
 */
internal class MarkReadWidgetAction(
    private val port: WidgetReadPort,
    private val isSignedIn: () -> Boolean,
) {
    enum class Outcome { MARKED, ALREADY_READ, UNKNOWN, SIGNED_OUT, FAILED }

    suspend fun run(conversationId: String): Outcome {
        if (!isSignedIn()) return Outcome.SIGNED_OUT
        if (!WidgetDeepLink.isSafeId(conversationId)) return Outcome.UNKNOWN
        val before = port.snapshot(conversationId) ?: return Outcome.UNKNOWN
        if (before.unreadCount == 0) return Outcome.ALREADY_READ
        return try {
            if (port.markReadOptimistic(conversationId)) Outcome.MARKED else Outcome.ALREADY_READ
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            runCatching { port.restore(before) }
            Outcome.FAILED
        }
    }
}
