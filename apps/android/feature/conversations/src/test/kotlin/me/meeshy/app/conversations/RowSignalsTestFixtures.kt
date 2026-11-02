package me.meeshy.app.conversations

import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import me.meeshy.sdk.model.presence.ConversationViewers
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.socket.ConversationViewingBinding

/** Une source de signaux de ligne inerte : aucune mutation en attente, personne ici. */
internal fun idleRowSignalsSource(): ConversationListRowSignals = rowSignalsSource(
    pending = flowOf(emptySet()),
    viewers = MutableStateFlow(ConversationViewers()),
)

internal fun rowSignalsSource(
    pending: kotlinx.coroutines.flow.Flow<Set<String>>,
    viewers: kotlinx.coroutines.flow.StateFlow<ConversationViewers>,
): ConversationListRowSignals {
    val outbox = mockk<OutboxRepository> {
        every { observePendingTargets(OutboxKind.UPDATE_CONVERSATION_PREFS) } returns pending
    }
    val binding = mockk<ConversationViewingBinding> { every { this@mockk.viewers } returns viewers }
    return ConversationListRowSignals(outbox, binding)
}
