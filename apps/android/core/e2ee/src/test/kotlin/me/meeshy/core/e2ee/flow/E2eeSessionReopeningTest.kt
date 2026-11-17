package me.meeshy.core.e2ee.flow

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.open.E2eeOpenOutcome
import me.meeshy.core.e2ee.wire.E2eeDeviceRef
import me.meeshy.core.e2ee.wire.E2eeDevicesMismatch
import me.meeshy.core.e2ee.wire.E2eeErrorCode
import me.meeshy.core.e2ee.wire.E2eeRemoteException
import me.meeshy.core.e2ee.wire.LibsignalSendRequest
import org.junit.Test

/**
 * #18979 (ANDX-02) — le scelleur n'EFFACE jamais une session avant d'en ouvrir une neuve : libsignal archive l'état
 * courant, et un message encore en vol sous l'ancienne session s'ouvre sur cet état archivé (0.106.2 : déchiffrement sur
 * un état archivé, sans le promouvoir ni réécrire l'identité). Ni le changement de téléphone du correspondant, ni un 409
 * Sesame (`stale` ou `extra`) ne perdent le dernier message reçu.
 */
class E2eeSessionReopeningTest {
    private val alice = "64f0c0ffee0000000000aaaa"
    private val bob = "64f0c0ffee0000000000bbbb"
    private val conversation = "64f0c0ffee000000000c0001"

    private fun content(text: String) = E2eeContent.compose(text, null, null, conversation, "cid_$text", 1L)

    private suspend fun send(from: E2eeTestDevice, to: String, text: String) {
        from.sealer.sealAndDeliver(content(text), to) { from.session.send(conversation, to, LibsignalSendRequest.of("cid_$text", it)) }
    }

    /** Alice et Bob ont échangé un message chacun ; Bob en a un dernier en vol vers Alice. */
    private suspend fun withBobsLastMessageInFlight(): Triple<FakeE2eeServer, E2eeTestDevice, E2eeTestDevice> {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        val b = E2eeTestDevice(server, bob).enroll()
        send(a, bob, "a1")
        b.opener.catchUp()
        send(b, alice, "b1")
        a.opener.catchUp()
        send(b, alice, "b-last")
        return Triple(server, a, b)
    }

    @Test
    fun theLastMessageFromBobsPreviousPhone_staysReadable_whenAliceWritesFirst() = runTest {
        val (server, a, _) = withBobsLastMessageInFlight()
        val inFlight = server.mailbox.single { it.first.userId == alice }.second
        server.active(bob).single().retired = true
        val newPhone = E2eeTestDevice(server, bob).enroll()

        send(a, bob, "a2")
        val outcome = a.opener.open(inFlight)

        assertThat((outcome as? E2eeOpenOutcome.Opened)?.content?.text).isEqualTo("b-last")
        assertThat(newPhone.opener.catchUp().filterIsInstance<E2eeOpenOutcome.Opened>().map { it.content.text }).containsExactly("a2")
    }

    @Test
    fun aSesameRefusalNamingBobStale_keepsTheSessionThatReadsHisMessageInFlight() = runTest {
        val (server, a, b) = withBobsLastMessageInFlight()
        val inFlight = server.mailbox.single { it.first.userId == alice }.second
        val stale = E2eeDevicesMismatch(stale = listOf(E2eeDeviceRef(bob, b.enrolled.device.deviceId)))
        var refusals = 1

        a.sealer.sealAndDeliver(content("a2"), bob) { sealed ->
            if (refusals-- > 0) throw E2eeRemoteException(E2eeErrorCode.DEVICES_MISMATCH, 409, stale)
            a.session.send(conversation, bob, LibsignalSendRequest.of("cid_a2", sealed))
        }
        val outcome = a.opener.open(inFlight)

        assertThat((outcome as? E2eeOpenOutcome.Opened)?.content?.text).isEqualTo("b-last")
        assertThat(b.opener.catchUp().filterIsInstance<E2eeOpenOutcome.Opened>().map { it.content.text }).containsExactly("a2")
    }

    @Test
    fun aSesameRefusalNamingBobExtra_archivesTheSession_insteadOfErasingWhatStillReadsHisMessageInFlight() = runTest {
        val (server, a, b) = withBobsLastMessageInFlight()
        val inFlight = server.mailbox.single { it.first.userId == alice }.second
        val extra = E2eeDevicesMismatch(extra = listOf(E2eeDeviceRef(bob, b.enrolled.device.deviceId)))
        var refusals = 1

        a.sealer.sealAndDeliver(content("a2"), bob) { sealed ->
            if (refusals-- > 0) throw E2eeRemoteException(E2eeErrorCode.DEVICES_MISMATCH, 409, extra)
            a.session.send(conversation, bob, LibsignalSendRequest.of("cid_a2", sealed))
        }
        val outcome = a.opener.open(inFlight)

        assertThat((outcome as? E2eeOpenOutcome.Opened)?.content?.text).isEqualTo("b-last")
        assertThat(b.opener.catchUp().filterIsInstance<E2eeOpenOutcome.Opened>().map { it.content.text }).containsExactly("a2")
    }
}
