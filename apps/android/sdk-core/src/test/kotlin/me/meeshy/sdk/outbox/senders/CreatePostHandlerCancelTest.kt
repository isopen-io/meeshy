package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.post.PostComposerDraftStore
import me.meeshy.sdk.post.PostRepository
import org.junit.Test

class CreatePostHandlerCancelTest {

    private val postApi = mockk<PostApi>()
    private val outboxRepository = mockk<OutboxRepository>(relaxed = true)
    private val handler = CreatePostHandler(
        postApi, outboxRepository, senderJson, mockk<PostRepository>(relaxed = true), mockk<PostComposerDraftStore>(relaxed = true),
    )

    @Test
    fun `une publication dont l'annulation est demandee ne part jamais et sa ligne est retiree`() = runTest {
        val row = outboxRow(
            OutboxKind.CREATE_POST,
            targetId = "cmid_post",
            cmid = "cmid_post",
            payload = encodedPayload(CreatePostRequest(content = "bonjour")),
        ).copy(cancelRequestedAt = 1L)

        val result = handler.send(row)

        assertThat(result).isEqualTo(SendResult.Success)
        coVerify(exactly = 1) { outboxRepository.discard("cmid_post") }
        coVerify(exactly = 0) { postApi.create(any(), any()) }
    }
}
