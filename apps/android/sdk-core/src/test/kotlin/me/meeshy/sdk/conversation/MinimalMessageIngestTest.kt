package me.meeshy.sdk.conversation

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MinimalMessageSeed
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** La donnée minimale d'un data-message FCM : insérée si absente, jamais destructrice. */
@RunWith(RobolectricTestRunner::class)
class MinimalMessageIngestTest {

    private val seed = MinimalMessageSeed("m1", "c1", "u1", "salut", IngestFixtures.CREATED_AT)

    private suspend fun MessageCollaboratorHarness.cached(): ApiMessage =
        MeeshyApi.json.decodeFromString<ApiMessage>(database.messageDao().find("m1")!!.payload)

    @Test
    fun `an absent pushed message is inserted and its conversation notified`() = runHarnessTest { harness ->
        val signal = ConversationRefreshSignal()
        val ingest = MinimalMessageIngest(harness.database, harness.clock, signal)

        signal.changes.test {
            assertThat(ingest.ingest(seed)).isTrue()
            assertThat(awaitItem()).containsExactly("c1")
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(harness.cached().content).isEqualTo("salut")
    }

    @Test
    fun `minimal data never destroys a rich payload already cached`() = runHarnessTest { harness ->
        MessageIngestPipeline(harness.database).ingest(listOf(IngestFixtures.rest()), harness.clock.now)
        val before = harness.database.messageDao().find("m1")

        val inserted = MinimalMessageIngest(harness.database, harness.clock, ConversationRefreshSignal())
            .ingest(seed.copy(content = ""))

        assertThat(inserted).isFalse()
        assertThat(harness.database.messageDao().find("m1")).isEqualTo(before)
        assertThat(harness.cached().attachments).hasSize(1)
    }

    @Test
    fun `the next REST snapshot completes the minimal row`() = runHarnessTest { harness ->
        MinimalMessageIngest(harness.database, harness.clock, ConversationRefreshSignal()).ingest(seed.copy(content = ""))

        MessageIngestPipeline(harness.database).ingest(listOf(IngestFixtures.rest()), harness.clock.now)

        val message = harness.cached()
        assertThat(message.content).isEqualTo("salut")
        assertThat(message.sender?.displayName).isEqualTo("Ana")
        assertThat(message.messageType).isEqualTo("image")
        assertThat(harness.database.messageDao().listForConversation("c1")).hasSize(1)
    }
}
