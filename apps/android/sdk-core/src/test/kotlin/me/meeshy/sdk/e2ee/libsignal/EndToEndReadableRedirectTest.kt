package me.meeshy.sdk.e2ee.libsignal

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.e2ee.ConversationEncryptionProviding
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.e2ee.ConversationEncryptionStatus
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

/**
 * #20076 (jumelle de #20074, iOS) — un pair sans appareil chiffré : le texte part dans le tête-à-tête LISIBLE de la paire,
 * vérifié non chiffré et distinct, et il s'y ouvre ; toute étape qui échoue ne fait rien partir (#12949).
 */
class EndToEndReadableRedirectTest {

    private val me = MeeshyUser(id = "me", username = "me", displayName = "Moi")

    private class FakePort(var opened: NetworkResult<ApiConversation>) : ReadableDirectPort {
        val sent = mutableListOf<List<String?>>()
        val remembered = mutableListOf<String>()
        val sentEffects = mutableListOf<MessageEffects>()
        var sendFails = false
        var queues = true

        override suspend fun open(peerUserId: String): NetworkResult<ApiConversation> = opened

        override suspend fun remember(conversation: ApiConversation) {
            remembered += conversation.id
        }

        override suspend fun send(
            conversationId: String,
            text: String,
            language: String,
            sender: MeeshyUser,
            clientMessageId: String,
            effects: MessageEffects,
        ): Boolean {
            if (sendFails) error("enqueue refused")
            sent += listOf(conversationId, text, language, clientMessageId)
            sentEffects += effects
            return queues
        }
    }

    private fun conversation(id: String) = ApiConversation(
        id = id,
        type = "direct",
        participants = listOf(ApiParticipant(id = "p1", userId = "me"), ApiParticipant(id = "p2", userId = "peer", displayName = "Alice Martin")),
    )

    private fun status(mode: String?) = ConversationEncryptionStatus(
        isEncrypted = mode != null,
        mode = mode,
        enabledAt = null,
        canTranslate = mode != "e2ee",
        canToggleEncryption = true,
        pairEndToEndConversationId = null,
    )

    private class Setup(
        val redirect: EndToEndReadableRedirect,
        val port: FakePort,
        val toasts: FeedbackToastCenter,
        val ledger: InMemoryEndToEndRegimeLedger,
    )

    private fun setup(
        opened: NetworkResult<ApiConversation> = NetworkResult.Success(conversation("readable")),
        served: NetworkResult<ConversationEncryptionStatus> = NetworkResult.Success(status("server")),
        ledger: InMemoryEndToEndRegimeLedger = InMemoryEndToEndRegimeLedger(),
    ): Setup {
        val port = FakePort(opened)
        val encryption = mockk<ConversationEncryptionProviding> { coEvery { status(any()) } returns served }
        val session = mockk<SessionRepository> {
            every { currentUser } returns MutableStateFlow(me)
            every { currentUserId } returns "me"
        }
        val toasts = FeedbackToastCenter()
        val redirect = EndToEndReadableRedirect(port, encryption, ledger, session, toasts) { name -> "notice:$name" }
        return Setup(redirect, port, toasts, ledger)
    }

    @Test
    fun `the text leaves in the readable direct, opens it and says why`() = runTest {
        val s = setup()
        val events = mutableListOf<EndToEndRedirected>()
        val collector = backgroundScope.launchCollect(s.redirect, events)

        val delivered = s.redirect.deliver("sealed", "peer", "cid_1", "Bonjour", "fr")
        testScheduler.advanceUntilIdle()

        assertThat(delivered).isTrue()
        assertThat(s.port.sent).containsExactly(listOf("readable", "Bonjour", "fr", OutboxIds.derivedCid("e2ee-readable|cid_1")))
        assertThat(s.port.remembered).containsExactly("readable")
        assertThat(s.toasts.current.value?.message).isEqualTo("notice:Alice")
        assertThat(events).containsExactly(EndToEndRedirected("sealed", "readable"))
        collector.cancel()
    }

    @Test
    fun `nothing leaves when the gateway serves back the conversation we leave`() = runTest {
        val s = setup(opened = NetworkResult.Success(conversation("sealed")))

        assertThat(s.redirect.deliver("sealed", "peer", "cid_1", "Bonjour", "fr")).isFalse()
        assertThat(s.port.sent).isEmpty()
    }

    @Test
    fun `nothing leaves when the opened conversation is served end to end`() = runTest {
        val s = setup(served = NetworkResult.Success(status("e2ee")))

        assertThat(s.redirect.deliver("sealed", "peer", "cid_1", "Bonjour", "fr")).isFalse()
        assertThat(s.port.sent).isEmpty()
    }

    @Test
    fun `nothing leaves when this device has seen the opened conversation end to end`() = runTest {
        val ledger = InMemoryEndToEndRegimeLedger().apply { learn("readable") }
        val s = setup(ledger = ledger)

        assertThat(s.redirect.deliver("sealed", "peer", "cid_1", "Bonjour", "fr")).isFalse()
        assertThat(s.port.sent).isEmpty()
    }

    @Test
    fun `nothing leaves when the opening or its status read fails`() = runTest {
        val failure = NetworkResult.Failure(ApiError("x", "NETWORK"))
        assertThat(setup(opened = failure).redirect.deliver("sealed", "peer", "cid_1", "Bonjour", "fr")).isFalse()
        val unread = setup(served = failure)
        assertThat(unread.redirect.deliver("sealed", "peer", "cid_1", "Bonjour", "fr")).isFalse()
        assertThat(unread.port.sent).isEmpty()
    }

    @Test
    fun `a blank text or a refused enqueue delivers nothing`() = runTest {
        val s = setup()
        assertThat(s.redirect.deliver("sealed", "peer", "cid_1", "   ", "fr")).isFalse()
        s.port.sendFails = true
        assertThat(s.redirect.deliver("sealed", "peer", "cid_1", "Bonjour", "fr")).isFalse()
        assertThat(s.toasts.current.value).isNull()
    }

    /** #20182 (3) — une ligne que l'outbox n'a pas prise n'est pas « envoyée » : ni toast, ni ouverture, et le refus reste. */
    @Test
    fun `a send the outbox did not queue delivers nothing and says nothing`() = runTest {
        val s = setup()
        val events = mutableListOf<EndToEndRedirected>()
        val collector = backgroundScope.launchCollect(s.redirect, events)
        s.port.queues = false

        assertThat(s.redirect.deliver("sealed", "peer", "cid_1", "Bonjour", "fr")).isFalse()
        testScheduler.advanceUntilIdle()

        assertThat(s.toasts.current.value).isNull()
        assertThat(events).isEmpty()
        collector.cancel()
    }

    /** #20182 (2) — l'effet du geste (vue unique, éphémère, flou) part avec le texte redirigé. */
    @Test
    fun `the effect of the gesture travels with the redirected text`() = runTest {
        val s = setup()
        val ephemeral = MessageEffects(flags = MessageEffectFlags.EPHEMERAL, ephemeralDuration = 60)

        assertThat(s.redirect.deliver("sealed", "peer", "cid_1", "Bonjour", "fr", ephemeral)).isTrue()

        assertThat(s.port.sentEffects).containsExactly(ephemeral)
    }

    @Test
    fun `opening without sending rends the readable direct, or nothing`() = runTest {
        assertThat(setup().redirect.open("sealed", "peer")).isEqualTo("readable")
        assertThat(setup(served = NetworkResult.Success(status("e2ee"))).redirect.open("sealed", "peer")).isNull()
    }

    @Test
    fun `the reach learns a peer without device, and forgets it once a device is listed`() = runTest {
        var count = 0
        val reach = EndToEndPeerDeviceReach { count }

        reach.refresh("peer")
        assertThat(reach.lacksEncryptedDevice("peer")).isTrue()
        count = 1
        reach.refresh("peer")
        assertThat(reach.lacksEncryptedDevice("peer")).isFalse()
        reach.confirmWithoutDevice("peer")
        assertThat(reach.withoutEncryptedDevice.value).containsExactly("peer")
    }

    @Test
    fun `a failed device read changes nothing`() = runTest {
        val reach = EndToEndPeerDeviceReach { error("offline") }
        reach.confirmWithoutDevice("peer")

        reach.refresh("peer")

        assertThat(reach.lacksEncryptedDevice("peer")).isTrue()
    }

    /** #20181 — des appareils listés que rien n'ouvre : le bandeau tient malgré la liste, jusqu'à un envoi scellé réussi. */
    @Test
    fun `a peer refused at sealing keeps its banner despite a listed device, until a sealed send succeeds`() = runTest {
        val reach = EndToEndPeerDeviceReach { 1 }

        reach.confirmUnreachable("peer")
        reach.refresh("peer")
        assertThat(reach.lacksEncryptedDevice("peer")).isTrue()

        reach.confirmReachable("peer")
        assertThat(reach.lacksEncryptedDevice("peer")).isFalse()
        reach.refresh("peer")
        assertThat(reach.lacksEncryptedDevice("peer")).isFalse()
    }
}

private fun CoroutineScope.launchCollect(redirect: EndToEndReadableRedirect, into: MutableList<EndToEndRedirected>) =
    launch(UnconfinedTestDispatcher()) { redirect.redirected.collect { into += it } }
