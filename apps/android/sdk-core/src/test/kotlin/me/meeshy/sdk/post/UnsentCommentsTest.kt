package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.friend.OutboxFlushScheduler
import me.meeshy.sdk.outbox.CommentPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.OutboxWithdrawal
import org.junit.Test

class UnsentCommentsTest {

    private val json = Json { ignoreUnknownKeys = true }

    private fun row(
        cmid: String,
        postId: String = "p1",
        owner: String? = "me",
        state: OutboxState = OutboxState.PENDING,
        text: String = "Bravo",
        lastError: String? = null,
        createdAt: Long = 1L,
    ) = OutboxEntity(
        cmid = cmid, lane = "comment", kind = OutboxKind.CREATE_COMMENT.name, targetId = postId,
        payload = json.encodeToString(CommentPayload.serializer(), CommentPayload(text)),
        dependsOn = null, attempts = 0, state = state.name, createdAt = createdAt, updatedAt = createdAt,
        lastError = lastError, ownerId = owner,
    )

    private class Fixture(rows: List<OutboxEntity>, me: String? = "me") {
        val outbox = mockk<OutboxRepository>(relaxed = true)
        val posts = mockk<PostRepository>(relaxed = true)
        var flushed = 0
        val unsent = UnsentComments(
            outbox,
            OutboxOwnerSource { me },
            posts,
            OutboxFlushScheduler { flushed++ },
            Json { ignoreUnknownKeys = true },
        )

        init {
            every { outbox.observeAll() } returns flowOf(rows)
            rows.forEach { coEvery { outbox.row(it.cmid) } returns it }
        }
    }

    @Test
    fun `liste les non envoyes du post pour son auteur seulement`() = runTest {
        val f = Fixture(listOf(row("cmid_a"), row("cmid_b", owner = "other"), row("cmid_c", postId = "p2")))

        assertThat(f.unsent.unsentComments("p1").map { it.cmid }).containsExactly("cmid_a")
    }

    @Test
    fun `sous un autre compte rien n est visible`() = runTest {
        val f = Fixture(listOf(row("cmid_a")), me = "intrus")

        assertThat(f.unsent.unsentComments("p1")).isEmpty()
    }

    @Test
    fun `une ligne epuisee est marquee echouee avec sa raison`() = runTest {
        val f = Fixture(listOf(row("cmid_a", state = OutboxState.EXHAUSTED, lastError = "Comment refused: HTTP 403 X")))

        val item = f.unsent.unsentComments("p1").single()

        assertThat(item.isFailed).isTrue()
        assertThat(item.reason).isEqualTo("Comment refused: HTTP 403 X")
    }

    @Test
    fun `annuler une ligne en attente rend le compteur au post`() = runTest {
        val pending = row("cmid_a")
        val f = Fixture(listOf(pending))
        coEvery { f.outbox.withdrawUnlessInflight("cmid_a") } returns OutboxWithdrawal.Removed(pending)

        assertThat(f.unsent.cancelCreateComment("cmid_a")).isEqualTo(UnsentCommentResult.Done)

        coVerify { f.posts.rollbackQueuedComment("p1") }
    }

    @Test
    fun `annuler une ligne epuisee ne decremente pas deux fois`() = runTest {
        val exhausted = row("cmid_a", state = OutboxState.EXHAUSTED)
        val f = Fixture(listOf(exhausted))
        coEvery { f.outbox.withdrawUnlessInflight("cmid_a") } returns OutboxWithdrawal.Removed(exhausted)

        f.unsent.cancelCreateComment("cmid_a")

        coVerify(exactly = 0) { f.posts.rollbackQueuedComment(any()) }
    }

    @Test
    fun `le commentaire d un autre n est ni annule ni relance`() = runTest {
        val f = Fixture(listOf(row("cmid_a", owner = "other")))

        assertThat(f.unsent.cancelCreateComment("cmid_a")).isEqualTo(UnsentCommentResult.NotTheAuthor)
        assertThat(f.unsent.retryCreateComment("cmid_a")).isEqualTo(UnsentCommentResult.NotTheAuthor)
        coVerify(exactly = 0) { f.outbox.withdrawUnlessInflight(any()) }
        coVerify(exactly = 0) { f.outbox.retry(any()) }
    }

    @Test
    fun `reessayer relance la ligne et reveille le drainer`() = runTest {
        val f = Fixture(listOf(row("cmid_a", state = OutboxState.EXHAUSTED)))
        coEvery { f.outbox.retry("cmid_a") } returns true

        assertThat(f.unsent.retryCreateComment("cmid_a")).isEqualTo(UnsentCommentResult.Done)
        assertThat(f.flushed).isEqualTo(1)
    }

    @Test
    fun `reprendre rend le texte et retire la ligne`() = runTest {
        val exhausted = row("cmid_a", state = OutboxState.EXHAUSTED, text = "perdu")
        val f = Fixture(listOf(exhausted))
        coEvery { f.outbox.withdrawUnlessInflight("cmid_a") } returns OutboxWithdrawal.Removed(exhausted)

        assertThat(f.unsent.resume("cmid_a")).isEqualTo("perdu")
    }

    @Test
    fun `une ligne disparue est Gone`() = runTest {
        val f = Fixture(emptyList())
        coEvery { f.outbox.row("cmid_x") } returns null

        assertThat(f.unsent.cancelCreateComment("cmid_x")).isEqualTo(UnsentCommentResult.Gone)
    }
}
