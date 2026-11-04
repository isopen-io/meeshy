package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
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
    private val draftStore = mockk<PostComposerDraftStore>(relaxed = true)
    private val handler = CreatePostHandler(
        postApi, outboxRepository, senderJson, mockk<PostRepository>(relaxed = true), draftStore,
    )

    private fun row(cancelRequestedAt: Long? = null) = outboxRow(
        OutboxKind.CREATE_POST,
        targetId = "cmid_post",
        cmid = "cmid_post",
        payload = encodedPayload(CreatePostRequest(content = "bonjour")),
    ).copy(cancelRequestedAt = cancelRequestedAt)

    @Test
    fun `une publication dont l'annulation est demandee ne part jamais et n'est pas une livraison`() = runTest {
        coEvery { outboxRepository.isCancelRequested("cmid_post") } returns true

        val result = handler.send(row(cancelRequestedAt = 1L))

        assertThat(result).isEqualTo(SendResult.Cancelled)
        coVerify(exactly = 0) { postApi.create(any(), any()) }
    }

    /**
     * La marque posée APRÈS que le drainer a lu la ligne (et l'a réservée) : la copie remise au sender est périmée, seule la
     * relecture en base juste avant le POST la voit (audit #15726, constat 2 ; iOS `throwIfPublicationCancelled`).
     */
    @Test
    fun `la marque posee apres la lecture du drainer est relue avant le POST`() = runTest {
        coEvery { outboxRepository.isCancelRequested("cmid_post") } returns true

        val result = handler.send(row(cancelRequestedAt = null))

        assertThat(result).isEqualTo(SendResult.Cancelled)
        coVerify(exactly = 0) { postApi.create(any(), any()) }
    }

    @Test
    fun `une publication annulee libere ses mentions j'aime retenues et son brouillon`() = runTest {
        coEvery { outboxRepository.isCancelRequested("cmid_post") } returns true

        handler.send(row(cancelRequestedAt = 1L))

        coVerify(exactly = 1) { outboxRepository.cancelHeldFor("cmid_post") }
        coVerify(exactly = 1) { draftStore.release("cmid_post") }
    }
}
