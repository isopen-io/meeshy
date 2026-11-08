package me.meeshy.sdk.story

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.outbox.OutboxCapacity
import me.meeshy.sdk.outbox.OutboxOutcome
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.post.InMemoryUnsentCommentStore
import me.meeshy.sdk.post.PostRepository
import org.junit.Test

class StoryCommentPublisherTest {

    private class Rig(queued: String?, outcome: OutboxOutcome?) {
        val posts = mockk<PostRepository>()
        val outbox = mockk<OutboxRepository>()
        val work = mockk<WorkManager>(relaxed = true)
        val unsent = InMemoryUnsentCommentStore()
        val publisher = StoryCommentPublisher(posts, outbox, unsent, work)

        init {
            coEvery { posts.queueComment("s1", "salut", "root", "fr") } returns queued
            if (queued != null) every { outbox.outcomeFor(queued) } returns (outcome?.let { flowOf(it) } ?: emptyFlow())
        }
    }

    @Test
    fun `a delivered comment is queued under its cmid and the flusher is kicked`() = runTest {
        val rig = Rig("cm1", OutboxOutcome.Succeeded("cm1"))
        assertThat(rig.publisher.publish("s1", "salut", "root", "fr")).isEqualTo(StoryCommentPublication.Delivered)
        coVerify(exactly = 1) { rig.posts.queueComment("s1", "salut", "root", "fr") }
        verify(exactly = 1) { rig.work.enqueue(any<androidx.work.WorkRequest>()) }
    }

    @Test
    fun `a comment waits for its upload then leaves with the media ids`() = runTest {
        val rig = Rig(null, null)
        coEvery { rig.posts.queueComment("s1", "", null, "fr", listOf("srv-1"), 2, null) } returns "cm2"
        every { rig.outbox.outcomeFor("cm2") } returns flowOf(OutboxOutcome.Succeeded("cm2"))
        assertThat(rig.publisher.publish("s1", "", null, "fr", listOf("srv-1"), 2)).isEqualTo(StoryCommentPublication.Delivered)
        coVerify(exactly = 1) { rig.posts.queueComment("s1", "", null, "fr", listOf("srv-1"), 2, null) }
    }

    @Test
    fun `a queue that refuses the write hands the text back`() = runTest {
        val rig = Rig(null, null)
        assertThat(rig.publisher.publish("s1", "salut", "root", "fr")).isEqualTo(StoryCommentPublication.Refused("salut"))
    }

    @Test
    fun `a full queue hands the text back and drops the copy kept for the post field`() = runTest {
        val rig = Rig("cm1", OutboxOutcome.Exhausted("cm1", OutboxCapacity.REASON_QUEUE_FULL))
        rig.unsent.keep("s1", "salut")
        assertThat(rig.publisher.publish("s1", "salut", "root", "fr")).isEqualTo(StoryCommentPublication.Refused("salut"))
        assertThat(rig.unsent.peek("s1")).isNull()
    }

    @Test
    fun `a server that gave up leaves the row failed, not refused`() = runTest {
        val rig = Rig("cm1", OutboxOutcome.Exhausted("cm1", "Comment refused: HTTP 403 FORBIDDEN"))
        assertThat(rig.publisher.publish("s1", "salut", "root", "fr")).isEqualTo(StoryCommentPublication.Failed)
    }

    @Test
    fun `a superseded or discarded row reconciles nothing`() = runTest {
        assertThat(Rig("cm1", OutboxOutcome.Cancelled("cm1")).publisher.publish("s1", "salut", "root", "fr"))
            .isEqualTo(StoryCommentPublication.Dropped)
        assertThat(Rig("cm1", null).publisher.publish("s1", "salut", "root", "fr")).isEqualTo(StoryCommentPublication.Dropped)
    }
}
