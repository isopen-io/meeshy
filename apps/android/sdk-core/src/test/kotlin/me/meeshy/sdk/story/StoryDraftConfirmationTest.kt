package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.withOutbox
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class StoryDraftConfirmationTest {

    private fun awaiting(vararg cmids: String) = StoryComposerDraftSnapshot(
        slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "ma story")),
        selectedId = "s1",
        awaitingPublication = cmids.toList(),
    )

    private fun publish(cmid: String) =
        OutboxMutation(OutboxKind.PUBLISH_STORY, OutboxLanes.STORY, "pending_$cmid", "{}", cmid = cmid)

    @Test
    fun `the draft stays while one of its slides is still owed a confirmation`() = withOutbox { outbox ->
        val store = InMemoryStoryComposerDraftStore(awaiting("a", "b"))
        outbox.enqueue(publish("a"))
        outbox.enqueue(publish("b"))
        outbox.markExhausted("b", "HTTP 500")

        StoryDraftConfirmation(store, outbox).settle(delivered = "a")

        assertThat(store.load()).isEqualTo(awaiting("a", "b"))
    }

    @Test
    fun `the draft leaves once its last publication is confirmed`() = withOutbox { outbox ->
        val store = InMemoryStoryComposerDraftStore(awaiting("a", "b"))
        outbox.enqueue(publish("b"))

        StoryDraftConfirmation(store, outbox).settle(delivered = "b")

        assertThat(store.load()).isNull()
    }

    @Test
    fun `a draft the author is still composing is never touched`() = withOutbox { outbox ->
        val editing = awaiting()
        val store = InMemoryStoryComposerDraftStore(editing)

        StoryDraftConfirmation(store, outbox).settle()

        assertThat(store.load()).isEqualTo(editing)
    }
}
