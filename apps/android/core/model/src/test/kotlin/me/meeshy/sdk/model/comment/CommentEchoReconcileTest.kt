package me.meeshy.sdk.model.comment

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.CommentRepliesState
import me.meeshy.sdk.model.CommentThreadState
import org.junit.Test

class CommentEchoReconcileTest {

    private val server = ApiPostComment(id = "665f1c2e8b3a4d0012345678", content = "Bravo")

    @Test
    fun `l'echo remplace la ligne optimiste sans la doubler`() {
        val thread = CommentThreadState().optimistic(ApiPostComment(id = "cmid_1", content = "Bravo"))

        val next = thread.echoReconciled("cmid_1", server)

        assertThat(next.comments.map { it.id }).containsExactly(server.id)
        assertThat(next.pendingIds).isEmpty()
    }

    @Test
    fun `un echo sans cle connue est un commentaire ordinaire`() {
        val thread = CommentThreadState().optimistic(ApiPostComment(id = "cmid_1"))

        val next = thread.echoReconciled(null, server)

        assertThat(next.comments.map { it.id }).containsExactly(server.id, "cmid_1").inOrder()
    }

    @Test
    fun `l'echo d'une reponse remplace la reponse optimiste du fil`() {
        val replies = CommentRepliesState().optimisticReply("root", ApiPostComment(id = "cmid_2", parentId = "root"))

        val next = replies.echoReconciledReply("root", "cmid_2", server.copy(parentId = "root"))

        assertThat(next.repliesFor("root").map { it.id }).containsExactly(server.id)
    }

    @Test
    fun `reconnait l'echo de sa propre file`() {
        val thread = CommentThreadState().optimistic(ApiPostComment(id = "cmid_1"))
        val replies = CommentRepliesState().optimisticReply("root", ApiPostComment(id = "cmid_2"))

        assertThat(isOwnQueuedEcho(thread, replies, "cmid_1")).isTrue()
        assertThat(isOwnQueuedEcho(thread, replies, "cmid_2")).isTrue()
        assertThat(isOwnQueuedEcho(thread, replies, "cmid_x")).isFalse()
        assertThat(isOwnQueuedEcho(thread, replies, null)).isFalse()
    }
}
