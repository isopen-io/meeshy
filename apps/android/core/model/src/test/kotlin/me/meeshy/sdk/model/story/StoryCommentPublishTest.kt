package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryComment
import me.meeshy.sdk.model.StoryCommentStatus
import me.meeshy.sdk.model.StoryCommentsState
import org.junit.Test

class StoryCommentPublishTest {

    private fun served(id: String, text: String = "Salut", parentId: String? = null, authorId: String? = "me") = StoryComment(
        id = id, clientId = null, authorName = "Moi", avatarUrl = null, content = text, isTranslated = false,
        createdAt = null, status = StoryCommentStatus.Sent, authorId = authorId, parentId = parentId,
    )

    private fun pending(tempId: String = "tmp1", text: String = "Salut", parentId: String? = null) =
        StoryCommentPublish.pendingRow(tempId, text, parentId, "Moi", "me", null)

    private fun withRoot() = StoryCommentsState(roots = listOf(served("root", authorId = "bob")), count = 1)

    @Test
    fun `a root comment appears instantly as pending and the count goes up`() {
        val state = StoryCommentPublish.optimistic(withRoot(), pending())
        assertThat(state.roots.map { it.id }).containsExactly("root", "tmp1").inOrder()
        assertThat(state.roots.last().status).isEqualTo(StoryCommentStatus.Pending)
        assertThat(state.count).isEqualTo(2)
    }

    @Test
    fun `a reply targets the root parent and raises both reply count and total`() {
        val state = StoryCommentPublish.optimistic(withRoot(), pending(parentId = "root"))
        assertThat(state.roots.first().replyCount).isEqualTo(1)
        assertThat(state.repliesOf("root").map { it.id }).containsExactly("tmp1")
        assertThat(state.count).isEqualTo(2)
    }

    @Test
    fun `the ack swaps the pending row for the served one without touching counters`() {
        val optimistic = StoryCommentPublish.optimistic(withRoot(), pending())
        val acked = StoryCommentPublish.acknowledged(optimistic, "tmp1", served("c9"))
        assertThat(acked.roots.map { it.id }).containsExactly("root", "c9").inOrder()
        assertThat(acked.roots.last().status).isEqualTo(StoryCommentStatus.Sent)
        assertThat(acked.count).isEqualTo(2)
    }

    @Test
    fun `an echo that beats the ack replaces the pending row once`() {
        val optimistic = StoryCommentPublish.optimistic(withRoot(), pending())
        val echoed = StoryCommentPublish.echoed(optimistic, served("c9"), serverCount = 2)
        assertThat(echoed.roots.map { it.id }).containsExactly("root", "c9").inOrder()
        assertThat(echoed.count).isEqualTo(2)
        val acked = StoryCommentPublish.acknowledged(echoed, "tmp1", served("c9"))
        assertThat(acked).isEqualTo(echoed)
    }

    @Test
    fun `the ack after an echo keeps a single row`() {
        val optimistic = StoryCommentPublish.optimistic(withRoot(), pending())
        val withEcho = optimistic.copy(roots = optimistic.roots + served("c9"))
        val acked = StoryCommentPublish.acknowledged(withEcho, "tmp1", served("c9"))
        assertThat(acked.roots.map { it.id }).containsExactly("root", "c9").inOrder()
    }

    @Test
    fun `a stranger's comment goes through the plain arrival path`() {
        val optimistic = StoryCommentPublish.optimistic(withRoot(), pending())
        val echoed = StoryCommentPublish.echoed(optimistic, served("c5", text = "Autre", authorId = "bob"), serverCount = null)
        assertThat(echoed.roots.map { it.id }).containsExactly("root", "tmp1", "c5").inOrder()
        assertThat(echoed.count).isEqualTo(3)
    }

    @Test
    fun `a failure keeps the row as Failed and a retry makes it pending again`() {
        val optimistic = StoryCommentPublish.optimistic(withRoot(), pending())
        val failed = StoryCommentPublish.failed(optimistic, "tmp1")
        assertThat(failed.find("tmp1")?.status).isEqualTo(StoryCommentStatus.Failed)
        assertThat(failed.count).isEqualTo(2)
        assertThat(StoryCommentPublish.retrying(failed, "tmp1").find("tmp1")?.status).isEqualTo(StoryCommentStatus.Pending)
    }

    @Test
    fun `a queue refusal removes the row, restores counters and hands the text back`() {
        val optimistic = StoryCommentPublish.optimistic(withRoot(), pending(text = "mon texte"))
        val refusal = StoryCommentPublish.refused(optimistic, "tmp1")!!
        assertThat(refusal.text).isEqualTo("mon texte")
        assertThat(refusal.state).isEqualTo(withRoot())
    }

    @Test
    fun `a refused reply gives its reply count back and names its parent`() {
        val optimistic = StoryCommentPublish.optimistic(withRoot(), pending(parentId = "root", text = "re"))
        val refusal = StoryCommentPublish.refused(optimistic, "tmp1")!!
        assertThat(refusal.parentId).isEqualTo("root")
        assertThat(refusal.state.roots.first().replyCount).isEqualTo(0)
        assertThat(refusal.state.repliesOf("root")).isEmpty()
        assertThat(refusal.state.count).isEqualTo(1)
    }

    @Test
    fun `refusing an unknown row is inert`() {
        assertThat(StoryCommentPublish.refused(withRoot(), "nope")).isNull()
    }

    @Test
    fun `an echo after the queue delivered still replaces the local row`() {
        val optimistic = StoryCommentPublish.optimistic(withRoot(), pending())
        val delivered = StoryCommentPublish.delivered(optimistic, "tmp1")
        assertThat(delivered.find("tmp1")?.status).isEqualTo(StoryCommentStatus.Sent)
        val echoed = StoryCommentPublish.echoed(delivered, served("c9"), serverCount = null)
        assertThat(echoed.roots.map { it.id }).containsExactly("root", "c9").inOrder()
        assertThat(echoed.count).isEqualTo(2)
    }
}
