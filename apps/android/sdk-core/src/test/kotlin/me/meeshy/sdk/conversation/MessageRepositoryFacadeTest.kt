package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import org.junit.Test

/**
 * [MessageRepository] is a facade: each public member must reach the ONE collaborator that
 * owns its domain, with every argument and every result passed through untouched. Behaviour
 * itself is characterised by [MessageRepositoryTest] (through the facade) and by the
 * collaborators' own tests.
 */
class MessageRepositoryFacadeTest {

    private class Fixture(
        val history: MessageHistoryReader = mockk(relaxed = true),
        val sends: MessageSendCoordinator = mockk(relaxed = true),
        val mutations: MessageMutationWriter = mockk(relaxed = true),
        val enrichment: MessageEnrichmentWriter = mockk(relaxed = true),
        val receipts: MessageReceiptWriter = mockk(relaxed = true),
    ) {
        val repository = MessageRepository(history, sends, mutations, enrichment, receipts)
    }

    private val sender = MeeshyUser(id = "me", username = "atabeth", displayName = "Atabeth")

    private fun message(id: String = "m1") = ApiMessage(id = id, conversationId = "c1", content = "salut")

    @Test
    fun `messagesStream serves the history reader's stream with the caller's policy and error sink`() = runTest {
        val fixture = Fixture()
        val onSyncError: (Throwable) -> Unit = {}
        val policy = CachePolicy.Messages
        every { fixture.history.messagesStream("c1", policy, onSyncError) } returns flowOf(CacheResult.Empty)

        val first = fixture.repository.messagesStream("c1", policy, onSyncError).first()

        assertThat(first).isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `messagesStream defaults to the default cache policy`() = runTest {
        val fixture = Fixture()
        val onSyncError: (Throwable) -> Unit = {}
        every { fixture.history.messagesStream("c1", CachePolicy.Default, onSyncError) } returns
            flowOf(CacheResult.Empty)

        fixture.repository.messagesStream("c1", onSyncError = onSyncError).first()

        verify(exactly = 1) { fixture.history.messagesStream("c1", CachePolicy.Default, onSyncError) }
    }

    @Test
    fun `refresh is the history reader's refresh`() = runTest {
        val fixture = Fixture()

        fixture.repository.refresh("c1")

        coVerify(exactly = 1) { fixture.history.refresh("c1") }
    }

    @Test
    fun `recentMessages passes the limit through and returns the reader's peek`() = runTest {
        val fixture = Fixture()
        val peek = listOf(LocalMessage(message("m1")), LocalMessage(message("m2")))
        coEvery { fixture.history.recentMessages("c1", 2) } returns peek

        assertThat(fixture.repository.recentMessages("c1", 2)).isEqualTo(peek)
    }

    @Test
    fun `recentMessages and loadOlder default to the reader's own window sizes`() = runTest {
        val fixture = Fixture()

        fixture.repository.recentMessages("c1")
        fixture.repository.loadOlder("c1")

        coVerify(exactly = 1) { fixture.history.recentMessages("c1", MessageHistoryReader.PREVIEW_LIMIT) }
        coVerify(exactly = 1) { fixture.history.loadOlder("c1", MessageHistoryReader.OLDER_PAGE_SIZE) }
    }

    @Test
    fun `loadOlder reports whether more history remains as the reader does`() = runTest {
        val fixture = Fixture()
        coEvery { fixture.history.loadOlder("c1", 10) } returns true
        coEvery { fixture.history.loadOlder("c2", 10) } returns false

        assertThat(fixture.repository.loadOlder("c1", 10)).isTrue()
        assertThat(fixture.repository.loadOlder("c2", 10)).isFalse()
    }

    @Test
    fun `sendOptimistic hands every draft field to the send coordinator and returns its bubble id`() = runTest {
        val fixture = Fixture()
        val effects = MessageEffects(flags = MessageEffectFlags.BLURRED)
        val attachment = ApiMessageAttachment(id = "a1")
        coEvery {
            fixture.sends.sendOptimistic(
                conversationId = "c1",
                content = "salut",
                originalLanguage = "fr",
                sender = sender,
                replyToId = "r1",
                storyReplyToId = "s1",
                forwardedFromId = "f1",
                forwardedFromConversationId = "fc1",
                effects = effects,
                messageType = "image",
                attachmentUploadCmids = listOf("cmid_1"),
                attachments = listOf(attachment),
            )
        } returns "cid_42"

        val bubbleId = fixture.repository.sendOptimistic(
            conversationId = "c1",
            content = "salut",
            originalLanguage = "fr",
            sender = sender,
            replyToId = "r1",
            storyReplyToId = "s1",
            forwardedFromId = "f1",
            forwardedFromConversationId = "fc1",
            effects = effects,
            messageType = "image",
            attachmentUploadCmids = listOf("cmid_1"),
            attachments = listOf(attachment),
        )

        assertThat(bubbleId).isEqualTo("cid_42")
    }

    @Test
    fun `sendOptimistic keeps the text-only defaults when the caller gives only the essentials`() = runTest {
        val fixture = Fixture()
        coEvery {
            fixture.sends.sendOptimistic(
                conversationId = "c1",
                content = "salut",
                originalLanguage = "fr",
                sender = sender,
                replyToId = null,
                storyReplyToId = null,
                forwardedFromId = null,
                forwardedFromConversationId = null,
                effects = MessageEffects(),
                messageType = "text",
                attachmentUploadCmids = emptyList(),
                attachments = emptyList(),
            )
        } returns "cid_1"

        assertThat(fixture.repository.sendOptimistic("c1", "salut", "fr", sender)).isEqualTo("cid_1")
    }

    @Test
    fun `the send lifecycle - reconcile, failure and retry - belongs to the send coordinator`() = runTest {
        val fixture = Fixture()
        val server = message("srv_1")

        fixture.repository.reconcileSent("cid_1", server)
        fixture.repository.markSendFailed("cid_2")
        fixture.repository.retrySend("cid_3")

        coVerify(exactly = 1) { fixture.sends.reconcileSent("cid_1", server) }
        coVerify(exactly = 1) { fixture.sends.markSendFailed("cid_2") }
        coVerify(exactly = 1) { fixture.sends.retrySend("cid_3") }
    }

    @Test
    fun `optimistic mutations belong to the mutation writer and report its verdict`() = runTest {
        val fixture = Fixture()
        coEvery { fixture.mutations.toggleReactionOptimistic("m1", "👍", true) } returns true
        coEvery { fixture.mutations.editOptimistic("m1", "corrigé") } returns true
        coEvery { fixture.mutations.deleteOptimistic("m1") } returns true
        coEvery { fixture.mutations.setPinnedOptimistic("m1", true) } returns true
        coEvery { fixture.mutations.setPinnedOptimistic("m2", false) } returns false

        assertThat(fixture.repository.toggleReactionOptimistic("m1", "👍", true)).isTrue()
        assertThat(fixture.repository.editOptimistic("m1", "corrigé")).isTrue()
        assertThat(fixture.repository.deleteOptimistic("m1")).isTrue()
        assertThat(fixture.repository.setPinnedOptimistic("m1", true)).isTrue()
        assertThat(fixture.repository.setPinnedOptimistic("m2", false)).isFalse()
    }

    @Test
    fun `a refused optimistic mutation is refused to the caller too`() = runTest {
        val fixture = Fixture()
        coEvery { fixture.mutations.toggleReactionOptimistic("cid_1", "👍", true) } returns false

        assertThat(fixture.repository.toggleReactionOptimistic("cid_1", "👍", true)).isFalse()
    }

    @Test
    fun `a socket reaction delta goes to the mutation writer`() = runTest {
        val fixture = Fixture()

        fixture.repository.applyReactionDelta("m1", "❤️", -1)

        coVerify(exactly = 1) { fixture.mutations.applyReactionDelta("m1", "❤️", -1) }
    }

    @Test
    fun `a server edit belongs to the mutation writer and passes its verdict through`() = runTest {
        val fixture = Fixture()
        coEvery { fixture.mutations.applyServerEdit(message()) } returns true

        val applied = fixture.repository.applyServerEdit(message())

        assertThat(applied).isTrue()
    }

    @Test
    fun `inbound translations and transcriptions belong to the enrichment writer`() = runTest {
        val fixture = Fixture()

        fixture.repository.applyTranslation("m1", "fr", "Bonjour")
        fixture.repository.applyTranscription("m1", "a1", "hello", "en", 0.9, 1200L)
        fixture.repository.applyAudioTranslation(
            messageId = "m1",
            attachmentId = "a1",
            language = "fr",
            url = "https://cdn/fr.m4a",
            transcription = "bonjour",
            durationMs = 1100L,
            format = "m4a",
            cloned = true,
            quality = 0.8,
            voiceModelId = "vm1",
            ttsModel = "chatterbox",
        )

        coVerify(exactly = 1) { fixture.enrichment.applyTranslation("m1", "fr", "Bonjour") }
        coVerify(exactly = 1) { fixture.enrichment.applyTranscription("m1", "a1", "hello", "en", 0.9, 1200L) }
        coVerify(exactly = 1) {
            fixture.enrichment.applyAudioTranslation(
                "m1", "a1", "fr", "https://cdn/fr.m4a", "bonjour", 1100L, "m4a", true, 0.8, "vm1", "chatterbox",
            )
        }
    }

    @Test
    fun `on-demand translation returns the enrichment writer's verdict`() = runTest {
        val fixture = Fixture()
        coEvery { fixture.enrichment.requestTranslation("m1", "fr") } returns true
        coEvery { fixture.enrichment.requestTranslation("m1", "xx") } returns false

        assertThat(fixture.repository.requestTranslation("m1", "fr")).isTrue()
        assertThat(fixture.repository.requestTranslation("m1", "xx")).isFalse()
    }

    @Test
    fun `read receipts belong to the receipt writer`() = runTest {
        val fixture = Fixture()

        fixture.repository.applyReadReceipt("c1", "me", 3, 2, "2026-06-01T10:00:00Z")

        coVerify(exactly = 1) { fixture.receipts.applyReadReceipt("c1", "me", 3, 2, "2026-06-01T10:00:00Z") }
    }

    @Test
    fun `a call reaches only the collaborator that owns its domain`() = runTest {
        val fixture = Fixture()

        fixture.repository.applyReadReceipt("c1", "me", 1, 0, null)
        fixture.repository.markSendFailed("cid_1")

        coVerify(exactly = 0) { fixture.mutations.applyReactionDelta(any(), any(), any()) }
        coVerify(exactly = 0) { fixture.enrichment.applyTranslation(any(), any(), any()) }
        coVerify(exactly = 0) { fixture.history.refresh(any()) }
    }
}
