package me.meeshy.sdk.sync

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.sdk.conversation.MessageDeltaApplier
import me.meeshy.sdk.conversation.runHarnessTest
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.model.MessageConsumedEvent
import me.meeshy.sdk.model.MessageCountdownStartedEvent
import me.meeshy.sdk.model.MessagePinChanged
import me.meeshy.sdk.model.MessageViewOncePurgedEvent
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class EphemeralApplierTest {

    private fun message(id: String = "m1", senderId: String = "author") = ApiMessage(
        id = id,
        conversationId = "c1",
        senderId = senderId,
        content = "secret",
        createdAt = "2026-10-24T09:00:00Z",
        attachments = listOf(ApiMessageAttachment(id = "a1", fileUrl = "https://cdn/a.jpg")),
    )

    private val events = MutableSharedFlow<ConversationSocketEvent>(extraBufferCapacity = 8)

    private suspend fun deliver(
        harness: me.meeshy.sdk.conversation.MessageCollaboratorHarness,
        event: ConversationSocketEvent,
        viewer: String = "me",
    ) {
        val registrar = RecordingRegistrar()
        val deltas = MessageDeltaApplier(harness.database, harness.updater, harness.clock)
        EphemeralApplier(events, deltas::apply) { viewer }.subscribe(registrar)
        registrar.deliver(events, event)
    }

    @Test
    fun `the reader who opened sees the bubble opened, the others only the counter`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        deliver(harness, MessageConsumedEvent("m1", "c1", userId = "someone", viewOnceCount = 1))
        assertThat(harness.cachedMessage("m1").viewOnceCount).isEqualTo(1)
        assertThat(harness.cachedMessage("m1").consumedByMe).isNotEqualTo(true)

        deliver(harness, MessageConsumedEvent("m1", "c1", userId = "me", viewOnceCount = 2))
        assertThat(harness.cachedMessage("m1").viewOnceCount).isEqualTo(2)
        assertThat(harness.cachedMessage("m1").consumedByMe).isTrue()
    }

    @Test
    fun `a consumption by the reader seals the stored content and attachments, the others' leaves them`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        deliver(harness, MessageConsumedEvent("m1", "c1", userId = "someone", viewOnceCount = 1))
        assertThat(harness.cachedMessage("m1").content).isEqualTo("secret")
        assertThat(harness.cachedMessage("m1").attachments.single().fileUrl).isEqualTo("https://cdn/a.jpg")

        deliver(harness, MessageConsumedEvent("m1", "c1", userId = "me", viewOnceCount = 2))
        val sealed = harness.cachedMessage("m1")
        assertThat(sealed.consumedByMe).isTrue()
        assertThat(sealed.content).isEmpty()
        assertThat(sealed.translations).isEmpty()
        assertThat(sealed.attachments.single().fileUrl).isNull()

        deliver(harness, MessageConsumedEvent("m1", "c1", userId = "me", viewOnceCount = 2))
        assertThat(harness.cachedMessage("m1")).isEqualTo(sealed)
    }

    @Test
    fun `a purge empties the content and keeps the bubble even with the conversation closed`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        deliver(harness, MessageViewOncePurgedEvent("m1", "c1"))

        val row = harness.cachedMessage("m1")
        assertThat(row.content).isEmpty()
    }

    @Test
    fun `the served countdown deadline is written for the recipient`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        deliver(harness, MessageCountdownStartedEvent("m1", "c1", "2026-10-24T12:00:00Z"))

        assertThat(harness.cachedMessage("m1").expiresAt).isEqualTo("2026-10-24T12:00:00Z")
    }

    @Test
    fun `events of other families are left to their own appliers`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        deliver(harness, MessagePinChanged("m1", "c1", pinned = true, pinnedAt = "2026-10-24T12:00:00Z", pinnedBy = "x"))

        assertThat(harness.cachedMessage("m1").pinnedAt).isNull()
    }

    @Test
    fun `applying the same event twice writes nothing more`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val event = MessageConsumedEvent("m1", "c1", userId = "me", viewOnceCount = 1)

        deliver(harness, event)
        val version = harness.database.messageDao().find("m1")!!.changeVersion
        deliver(harness, event)

        assertThat(harness.database.messageDao().find("m1")!!.changeVersion).isEqualTo(version)
    }
}
