package me.meeshy.core.e2ee.flow

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.open.E2eeOpenOutcome
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
import me.meeshy.core.e2ee.wire.LibsignalSendRequest
import org.junit.Test

/** Ce que l'ouvreur fait d'une enveloppe que le serveur sert : croisée, réétiquetée, d'une autre génération, rejouée. */
class E2eeEnvelopeOpeningTest {
    private val alice = "64f0c0ffee0000000000aaaa"
    private val bob = "64f0c0ffee0000000000bbbb"
    private val conversation = "64f0c0ffee000000000c0001"

    private suspend fun pair(): Triple<FakeE2eeServer, E2eeTestDevice, E2eeTestDevice> {
        val server = FakeE2eeServer()
        return Triple(server, E2eeTestDevice(server, alice).enroll(), E2eeTestDevice(server, bob).enroll())
    }

    private suspend fun send(from: E2eeTestDevice, to: String, text: String, conversationInside: String = conversation) {
        val content = E2eeContent.compose(text, null, null, conversationInside, "cid_$text", 1L)
        from.sealer.sealAndDeliver(content, to) { from.session.send(conversation, to, LibsignalSendRequest.of("cid_$text", it)) }
    }

    @Test
    fun theSocketAndTheCatchUpCrossing_doNotLoseTheMessage() = runTest {
        val (server, a, b) = pair()
        send(a, bob, "croisé")
        val envelope = server.mailbox.single().second

        val first = b.opener.open(envelope)
        val second = b.opener.open(envelope)

        assertThat((first as E2eeOpenOutcome.Opened).content.text).isEqualTo("croisé")
        assertThat(second).isEqualTo(first)
    }

    @Test
    fun anEnvelopeForAnotherGenerationOfMySlot_isSetAside_unread_andNotAcknowledged() = runTest {
        val (server, a, b) = pair()
        send(a, bob, "x")
        val envelope = server.mailbox.single().second.copy(recipientRegistrationId = b.enrolled.device.registrationId xor 1)

        val outcome = b.opener.receive(envelope)

        assertThat(outcome).isEqualTo(E2eeOpenOutcome.NotForThisDevice(envelope.id))
        assertThat(server.mailbox).hasSize(1)
    }

    @Test
    fun aContentFiledByTheServerInAnotherConversation_isRefused_andNeverShown() = runTest {
        val (server, a, b) = pair()
        send(a, bob, "ailleurs", conversationInside = "64f0c0ffee000000000c0999")

        val outcome = b.opener.catchUp().single()

        assertThat(outcome).isInstanceOf(E2eeOpenOutcome.Undecryptable::class.java)
        assertThat(b.plaintexts.entry((outcome as E2eeOpenOutcome.Undecryptable).messageId)).isEqualTo(E2eePlaintextEntry.Undecryptable)
        assertThat(server.mailbox).isEmpty()
    }

    @Test
    fun anEnvelopeRelabelledAsAnotherSender_doesNotOpen() = runTest {
        val (server, a, b) = pair()
        send(a, bob, "x")
        val envelope = server.mailbox.single().second.copy(senderUserId = "64f0c0ffee0000000000cccc")

        assertThat(b.opener.open(envelope)).isInstanceOf(E2eeOpenOutcome.Undecryptable::class.java)
    }

    @Test
    fun aCiphertextThatIsNotBase64_isAVerdict_neverAPlaintextFallback() = runTest {
        val (server, a, b) = pair()
        send(a, bob, "x")
        val envelope = server.mailbox.single().second.copy(body = "%%%")

        assertThat(b.opener.open(envelope)).isInstanceOf(E2eeOpenOutcome.Undecryptable::class.java)
    }

    @Test
    fun anEnvelopeFromMyOwnUnapprovedDevice_waits_unread() = runTest {
        val (server, a, _) = pair()
        val aliceTablet = E2eeTestDevice(server, alice).enroll()
        send(a, bob, "x")
        val forged = server.mailbox.single().second.copy(
            senderUserId = alice, senderDeviceId = aliceTablet.enrolled.device.deviceId, recipientRegistrationId = a.enrolled.device.registrationId,
        )

        assertThat(a.opener.open(forged)).isEqualTo(E2eeOpenOutcome.Deferred(forged.id))
    }

    @Test
    fun aSignal_isKept_authenticated_andAcknowledged() = runTest {
        val (server, a, b) = pair()
        val signal = """{"active":true,"authorDeviceId":${a.enrolled.device.deviceId},"authorUserId":"$alice","conversationId":"$conversation","kind":"typing","s":1,"sentAt":1}"""
        a.sealer.sealAndDeliverRaw(signal.toByteArray(), bob) { a.session.send(conversation, bob, LibsignalSendRequest.of("cid_s", it)) }

        val outcome = b.opener.catchUp().single()

        assertThat(outcome).isInstanceOf(E2eeOpenOutcome.Signal::class.java)
        assertThat(server.mailbox).isEmpty()
    }
}
