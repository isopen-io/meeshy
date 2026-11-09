package me.meeshy.core.e2ee.flow

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.open.E2eeOpenOutcome
import me.meeshy.core.e2ee.seal.E2eeSealException
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
import me.meeshy.core.e2ee.wire.E2eeErrorCode
import me.meeshy.core.e2ee.wire.E2eeJson
import me.meeshy.core.e2ee.wire.E2eeRemoteException
import me.meeshy.core.e2ee.wire.LibsignalSendRequest
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * Deux appareils, une passerelle qui ne voit que le fil : PQXDH (libsignal 0.106.2, vrai natif), Double Ratchet,
 * admission Sesame. Le témoin de confidentialité relit TOUT ce que la passerelle a reçu ou rangé.
 */
class E2eeMessageExchangeTest {
    private val alice = "64f0c0ffee0000000000aaaa"
    private val bob = "64f0c0ffee0000000000bbbb"
    private val conversation = "64f0c0ffee000000000c0001"

    private fun content(text: String, cid: String = "cid_1") =
        E2eeContent.compose(text, "fr", replyTo = null, conversationId = conversation, clientMessageId = cid, sentAtMillis = 1_790_000_000_000L)

    private suspend fun send(from: E2eeTestDevice, to: String, content: E2eeContent): String =
        from.sealer.sealAndDeliver(content, to) { sealed ->
            from.session.send(conversation, to, LibsignalSendRequest.of(content.clientMessageId!!, sealed))
        }

    @Test
    fun aMessageSealedForBob_opensOnBob_andTheServerNeverSawTheText() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        val b = E2eeTestDevice(server, bob).enroll()
        val sentinel = "sentinelle-${System.nanoTime()}-confidentielle"

        val messageId = send(a, bob, content(sentinel))
        val outcomes = b.opener.catchUp()

        val opened = outcomes.single() as E2eeOpenOutcome.Opened
        assertThat(opened.messageId).isEqualTo(messageId)
        assertThat(opened.content.text).isEqualTo(sentinel)
        assertThat(opened.content.isAuthoredBy(alice, a.enrolled.device.deviceId)).isTrue()
        assertThat((b.plaintexts.entry(messageId) as E2eePlaintextEntry.Readable).content.text).isEqualTo(sentinel)
        assertThat(server.mailbox).isEmpty()
        val everythingTheServerSaw = server.wireLog.joinToString("\n") + server.devices.joinToString { it.identityKey }
        assertThat(everythingTheServerSaw).doesNotContain(sentinel)
        assertThat(everythingTheServerSaw).doesNotContain(sentinel.toByteArray().let { java.util.Base64.getEncoder().encodeToString(it) })
    }

    @Test
    fun theConversationGoesBothWays_andTheRatchetSurvivesManyTurns() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        val b = E2eeTestDevice(server, bob).enroll()

        repeat(5) { turn ->
            send(a, bob, content("a$turn", "cid_a$turn"))
            assertThat((b.opener.catchUp().single() as E2eeOpenOutcome.Opened).content.text).isEqualTo("a$turn")
            send(b, alice, content("b$turn", "cid_b$turn"))
            assertThat((a.opener.catchUp().single() as E2eeOpenOutcome.Opened).content.text).isEqualTo("b$turn")
        }
    }

    @Test
    fun everyEnvelopeIsAPreKeyMessage_untilBobAnswers() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        E2eeTestDevice(server, bob).enroll()

        val first = a.sealer.seal(content("1"), bob)
        val second = a.sealer.seal(content("2"), bob)

        assertThat(first.envelopes.single().type).isEqualTo(3)
        assertThat(second.envelopes.single().type).isEqualTo(3)
        assertThat(first.envelopes.single().registrationId).isEqualTo(server.active(bob).single().registrationId)
    }

    @Test
    fun aSecondBobDevice_unknownToAlice_isResolvedByTheSesameLoop() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        val bobPhone = E2eeTestDevice(server, bob).enroll()
        send(a, bob, content("avant"))
        bobPhone.opener.catchUp()
        val bobTablet = E2eeTestDevice(server, bob).enroll()

        send(a, bob, content("après", "cid_2"))

        assertThat((bobPhone.opener.catchUp().single() as E2eeOpenOutcome.Opened).content.text).isEqualTo("après")
        assertThat((bobTablet.opener.catchUp().single() as E2eeOpenOutcome.Opened).content.text).isEqualTo("après")
    }

    @Test
    fun aReinstalledBob_isStale_andAliceReopensItsSession() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        val first = E2eeTestDevice(server, bob).enroll()
        send(a, bob, content("un"))
        first.opener.catchUp()
        server.active(bob).single().retired = true
        val reinstalled = E2eeTestDevice(server, bob).enroll()

        send(a, bob, content("deux", "cid_2"))

        assertThat((reinstalled.opener.catchUp().single() as E2eeOpenOutcome.Opened).content.text).isEqualTo("deux")
    }

    @Test
    fun myOtherDevice_notApproved_receivesNothing_andIsDeclaredUnapproved() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        val aliceTablet = E2eeTestDevice(server, alice).enroll()
        E2eeTestDevice(server, bob).enroll()

        val sealed = a.sealer.seal(content("x"), bob)

        assertThat(sealed.envelopes.map { it.userId }).containsExactly(bob)
        assertThat(sealed.unapprovedOwnDevices).containsExactly(aliceTablet.enrolled.device.deviceId)
    }

    @Test
    fun aRecipientWithoutDevice_receivesNothing_andNothingLeavesInClear() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()

        val error = runCatching { a.sealer.seal(content("x"), bob) }.exceptionOrNull()

        assertThat(error).isInstanceOf(E2eeSealException.RecipientHasNoDevice::class.java)
        assertThat(server.wireLog.filter { it.contains("envelopes") }).isEmpty()
    }

    @Test
    fun anotherRefusal_isNotRetried() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        E2eeTestDevice(server, bob).enroll()
        var calls = 0

        val error = runCatching {
            a.sealer.sealAndDeliver(content("x"), bob) { calls++; throw E2eeRemoteException(E2eeErrorCode.REGIME_CHANGED, 409) }
        }.exceptionOrNull()

        assertThat((error as E2eeRemoteException).code).isEqualTo(E2eeErrorCode.REGIME_CHANGED)
        assertThat(calls).isEqualTo(1)
    }

    @Test
    fun anEndlessMismatch_stopsAfterThreeAttempts() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        E2eeTestDevice(server, bob).enroll()
        var calls = 0

        val error = runCatching {
            a.sealer.sealAndDeliver(content("x"), bob) {
                calls++
                throw E2eeRemoteException(E2eeErrorCode.DEVICES_MISMATCH, 409, me.meeshy.core.e2ee.wire.E2eeDevicesMismatch())
            }
        }.exceptionOrNull()

        assertThat(error).isInstanceOf(E2eeSealException.DevicesMismatchUnresolved::class.java)
        assertThat(calls).isEqualTo(3)
    }

    @Test
    fun theRequestOnTheWire_hasExactlyTheIosKeys_andNoContent() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        E2eeTestDevice(server, bob).enroll()
        send(a, bob, content("x"))

        val wire = E2eeJson.parseToJsonElement(server.wireLog.last()) as kotlinx.serialization.json.JsonObject

        assertThat(wire.keys).containsExactly(
            "clientMessageId", "isEncrypted", "encryptionMode", "encryptionProtocol", "encryptedContent", "encryptionMetadata", "envelopes",
        )
        assertThat(wire["encryptedContent"].toString()).isEqualTo("\"libsignal-v1\"")
        assertThat(wire["encryptionMetadata"].toString()).isEqualTo("""{"protocol":"libsignal-v1","senderDeviceId":1}""")
    }
}
