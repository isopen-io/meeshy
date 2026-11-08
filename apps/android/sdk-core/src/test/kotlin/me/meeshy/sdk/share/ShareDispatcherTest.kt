package me.meeshy.sdk.share

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.MessageForwardService
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.share.OutgoingShare
import me.meeshy.sdk.model.share.ShareFailure
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import me.meeshy.sdk.outbox.OutOfThreadAdmission
import me.meeshy.sdk.outbox.OutOfThreadSendGate
import org.junit.Test

class ShareDispatcherTest {

    private val me = MeeshyUser(id = "me", username = "atabeth")

    private fun group(id: String) = ShareRecipient.conversation(id, "Groupe $id", ShareRecipient.Detail.Group(3), null, null, null)

    private fun post(text: String) = OutgoingShare(
        content = text, originalLanguage = null, forwardedFromId = null, forwardedFromConversationId = null,
        effectFlags = 0L, ephemeralDuration = null,
    )

    private fun request(vararg texts: String, shareId: String = "s1") = ShareDispatchRequest(shareId, texts.map(::post), me)

    private class Rig(
        val forwards: MessageForwardService,
        val network: InMemoryNetworkMonitor,
        val dispatcher: ShareDispatcher,
        val posted: MutableList<Triple<String, String, String?>>,
    )

    private fun rig(
        admissions: Map<String, OutOfThreadAdmission> = emptyMap(),
        targets: Map<String, ShareTarget> = emptyMap(),
        failOn: (conversationId: String, text: String) -> Boolean = { _, _ -> false },
        online: Boolean = true,
    ): Rig {
        val posted = mutableListOf<Triple<String, String, String?>>()
        val forwards = mockk<MessageForwardService>()
        coEvery { forwards.post(any(), any(), any(), any()) } coAnswers {
            val share = firstArg<OutgoingShare>()
            val conversation = secondArg<String>()
            if (failOn(conversation, share.content)) error("boom")
            posted += Triple(conversation, share.content, arg<String?>(3))
            arg<String?>(3).orEmpty()
        }
        val network = InMemoryNetworkMonitor(initialOnline = online)
        val gate = OutOfThreadSendGate { id -> admissions[id] ?: OutOfThreadAdmission.SEND }
        val resolver = ShareTargetResolver { recipient, _ ->
            targets[recipient.id] ?: ShareTarget.Ready(recipient.conversationId.orEmpty())
        }
        return Rig(forwards, network, ShareDispatcher(resolver, gate, forwards, network), posted)
    }

    @Test
    fun `every recipient gets its own outcome and one failure stops nobody else`() = runTest {
        val r = rig(failOn = { conversation, _ -> conversation == "b" })

        val outcomes = r.dispatcher.dispatch(request("salut"), listOf(group("a"), group("b"), group("c")))

        assertThat(outcomes["conv:a"]).isEqualTo(ShareDeliveryOutcome.Sent("a"))
        assertThat(outcomes["conv:b"]).isEqualTo(ShareDeliveryOutcome.Failed(ShareFailure.GENERIC))
        assertThat(outcomes["conv:c"]).isEqualTo(ShareDeliveryOutcome.Sent("c"))
    }

    @Test
    fun `the first failure stops the series of that recipient only`() = runTest {
        val r = rig(failOn = { conversation, text -> conversation == "a" && text == "deux" })

        val outcomes = r.dispatcher.dispatch(request("un", "deux", "trois"), listOf(group("a"), group("b")))

        assertThat(outcomes["conv:a"]).isEqualTo(ShareDeliveryOutcome.Failed(ShareFailure.GENERIC))
        assertThat(r.posted.filter { it.first == "a" }.map { it.second }).containsExactly("un")
        assertThat(r.posted.filter { it.first == "b" }.map { it.second }).containsExactly("un", "deux", "trois").inOrder()
    }

    @Test
    fun `messages leave in order and each target has its own stable client id`() = runTest {
        val r = rig()

        r.dispatcher.dispatch(request("un", "deux"), listOf(group("a"), group("b")))
        val first = r.posted.map { it.third }
        r.posted.clear()
        r.dispatcher.dispatch(request("un", "deux"), listOf(group("a"), group("b")))

        assertThat(first.toSet()).hasSize(4)
        assertThat(r.posted.map { it.third }).isEqualTo(first)
        assertThat(first.all { it!!.startsWith("cid_") }).isTrue()
    }

    @Test
    fun `another share gesture never reuses a client id`() = runTest {
        val r = rig()

        r.dispatcher.dispatch(request("un", shareId = "s1"), listOf(group("a")))
        r.dispatcher.dispatch(request("un", shareId = "s2"), listOf(group("a")))

        assertThat(r.posted.map { it.third }.toSet()).hasSize(2)
    }

    @Test
    fun `offline the copy is durably Queued, online it is Sent`() = runTest {
        val offline = rig(online = false)
        val online = rig()

        assertThat(offline.dispatcher.dispatch(request("x"), listOf(group("a")))["conv:a"]).isEqualTo(ShareDeliveryOutcome.Queued("a"))
        assertThat(online.dispatcher.dispatch(request("x"), listOf(group("a")))["conv:a"]).isEqualTo(ShareDeliveryOutcome.Sent("a"))
    }

    @Test
    fun `a conversation whose mode is unknown waits in the queue`() = runTest {
        val r = rig(admissions = mapOf("a" to OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN))

        assertThat(r.dispatcher.dispatch(request("x"), listOf(group("a")))["conv:a"]).isEqualTo(ShareDeliveryOutcome.Queued("a"))
    }

    @Test
    fun `an end-to-end conversation is refused on its row, never posted nor queued`() = runTest {
        val r = rig(admissions = mapOf("e" to OutOfThreadAdmission.END_TO_END))

        val outcomes = r.dispatcher.dispatch(request("secret"), listOf(group("e"), group("a")))

        assertThat(outcomes["conv:e"]).isEqualTo(ShareDeliveryOutcome.Failed(ShareFailure.SEALED_DESTINATION))
        assertThat(outcomes["conv:a"]).isEqualTo(ShareDeliveryOutcome.Sent("a"))
        assertThat(r.posted.map { it.first }).containsExactly("a")
        coVerify(exactly = 0) { r.forwards.post(any(), "e", any(), any()) }
    }

    @Test
    fun `an unreadable mode is refused fail-closed`() = runTest {
        val gate = OutOfThreadSendGate { error("network") }
        val forwards = mockk<MessageForwardService>(relaxed = true)
        val dispatcher = ShareDispatcher({ r, _ -> ShareTarget.Ready(r.conversationId.orEmpty()) }, gate, forwards, InMemoryNetworkMonitor())

        val outcomes = dispatcher.dispatch(request("x"), listOf(group("a")))

        assertThat(outcomes["conv:a"]).isEqualTo(ShareDeliveryOutcome.Failed(ShareFailure.GENERIC))
        coVerify(exactly = 0) { forwards.post(any(), any(), any(), any()) }
    }

    @Test
    fun `a refused target carries its own reason and the outcomes are reported as they come`() = runTest {
        val r = rig(targets = mapOf("conv:a" to ShareTarget.Refused(ShareFailure.UNREACHABLE)))
        val seen = mutableListOf<String>()

        r.dispatcher.dispatch(request("x"), listOf(group("a"), group("b"))) { recipient, _ -> seen += recipient.id }

        assertThat(seen).containsExactly("conv:a", "conv:b").inOrder()
        assertThat(r.posted.map { it.first }).containsExactly("b")
    }
}
