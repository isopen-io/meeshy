package me.meeshy.sdk.story

import me.meeshy.sdk.outbox.OutboxRepository
import javax.inject.Inject

/**
 * The story composer's draft leaves the device only once its publication is effective (#13417):
 * a publish marks the stored draft [awaiting][me.meeshy.sdk.model.StoryComposerDraftSnapshot.awaitingPublication]
 * its outbox rows instead of erasing it, and [settle] erases it when none of those rows is left
 * — each one confirmed by the server or discarded by the author.
 */
public class StoryDraftConfirmation @Inject constructor(
    private val draftStore: StoryComposerDraftStore,
    private val outboxRepository: OutboxRepository,
) {
    /**
     * Clears the stored draft when every publication it awaits is gone. [delivered] is a row
     * being confirmed right now: still in the queue for an instant, it already counts as gone.
     */
    public suspend fun settle(delivered: String? = null) {
        val stored = draftStore.load() ?: return
        if (!stored.isAwaitingPublication) return
        val owed = stored.awaitingPublication.filter { it != delivered && outboxRepository.stateOf(it) != null }
        if (owed.isEmpty()) draftStore.clear()
    }
}
