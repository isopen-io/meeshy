package me.meeshy.core.e2ee.flow

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.open.E2eeEnvelopeOpener
import me.meeshy.core.e2ee.open.E2eeOpenOutcome
import me.meeshy.core.e2ee.session.E2eeSessionCipher
import me.meeshy.core.e2ee.vault.InMemoryRecordBackend
import me.meeshy.core.e2ee.vault.RecordBackend
import me.meeshy.core.e2ee.vault.RecordId
import me.meeshy.core.e2ee.vault.RecordKind
import me.meeshy.core.e2ee.vault.SealedRecordException
import me.meeshy.core.e2ee.vault.TransactionalRecordVault
import me.meeshy.core.e2ee.wire.LibsignalSendRequest
import org.junit.Test

/**
 * #18970 (ANDX-01) et #18972 (AND-09) — une enveloppe que l'appareil ne sait pas traiter n'arrête jamais la réception des
 * autres. Un enregistrement du coffre qui ne s'ouvre pas est un refus du COFFRE (l'enveloppe attend, jamais une `Error`
 * qui tue la file) ; un signal mal formé d'un pair authentifié est JUGÉ (illisible, acquitté), jamais différé à vie.
 */
class E2eeCatchUpResilienceTest {
    private val alice = "64f0c0ffee0000000000aaaa"
    private val bob = "64f0c0ffee0000000000bbbb"
    private val carol = "64f0c0ffee0000000000cccc"
    private val conversation = "64f0c0ffee000000000c0001"
    private val conversationWithCarol = "64f0c0ffee000000000c0002"

    private suspend fun send(from: E2eeTestDevice, to: String, text: String, inConversation: String = conversation) {
        val content = E2eeContent.compose(text, null, null, inConversation, "cid_$text", 1L)
        from.sealer.sealAndDeliver(content, to) { from.session.send(inConversation, to, LibsignalSendRequest.of("cid_$text", it)) }
    }

    /** Un stockage qui refuse d'ouvrir UN enregistrement, comme `SealedRecordBackend` sur une ligne altérée (étiquette GCM). */
    private class OneRecordDoesNotOpen(private val inner: InMemoryRecordBackend, private val poisoned: RecordId) : RecordBackend {
        override fun load(kind: RecordKind, key: String): ByteArray? {
            if (RecordId(kind, key) == poisoned) throw SealedRecordException(poisoned)
            return inner.load(kind, key)
        }

        override fun keys(kind: RecordKind): List<String> = inner.keys(kind)

        override fun commit(changes: Map<RecordId, ByteArray?>, clearFirst: Boolean) = inner.commit(changes, clearFirst)
    }

    /** Un stockage dont UN enregistrement fait lever une `Error` : une panique que le pont JNI rend en `AssertionError` sans cause. */
    private class OneRecordPanics(private val inner: InMemoryRecordBackend, private val poisoned: RecordId) : RecordBackend {
        override fun load(kind: RecordKind, key: String): ByteArray? {
            if (RecordId(kind, key) == poisoned) throw AssertionError("libsignal panic")
            return inner.load(kind, key)
        }

        override fun keys(kind: RecordKind): List<String> = inner.keys(kind)

        override fun commit(changes: Map<RecordId, ByteArray?>, clearFirst: Boolean) = inner.commit(changes, clearFirst)
    }

    private fun poisonedOpener(device: E2eeTestDevice, backend: InMemoryRecordBackend, poisoned: RecordId): E2eeEnvelopeOpener =
        openerOver(device, TransactionalRecordVault(OneRecordDoesNotOpen(backend, poisoned)))

    private fun openerOver(device: E2eeTestDevice, vault: TransactionalRecordVault): E2eeEnvelopeOpener =
        E2eeEnvelopeOpener(device.enrolled.device, E2eeSessionCipher(device.enrolled.device.address, device.enrolled.identity, vault), device.session, vault)

    @Test
    fun aSessionRecordThatDoesNotOpen_makesTheEnvelopeWait_neverEscapesAsAnError() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        val backend = InMemoryRecordBackend()
        val b = E2eeTestDevice(server, bob, backend).enroll()
        send(a, bob, "a1")
        b.opener.catchUp()
        send(a, bob, "a2")
        val envelope = server.mailbox.single { it.first.userId == bob }.second
        val opener = poisonedOpener(b, backend, RecordId(RecordKind.SESSION, "$alice.${a.enrolled.device.deviceId}"))

        val outcome = opener.receive(envelope)

        assertThat(outcome).isEqualTo(E2eeOpenOutcome.Deferred(envelope.id))
        assertThat(server.mailbox.map { it.second.id }).containsExactly(envelope.id)
    }

    @Test
    fun aPoisonedEnvelope_doesNotStopTheCatchUpOfEveryoneElse() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        val c = E2eeTestDevice(server, carol).enroll()
        val backend = InMemoryRecordBackend()
        val b = E2eeTestDevice(server, bob, backend).enroll()
        send(a, bob, "a1")
        b.opener.catchUp()
        send(a, bob, "a2")
        send(c, bob, "c1", conversationWithCarol)
        val opener = poisonedOpener(b, backend, RecordId(RecordKind.SESSION, "$alice.${a.enrolled.device.deviceId}"))

        val outcomes = opener.catchUp()

        assertThat(outcomes.filterIsInstance<E2eeOpenOutcome.Opened>().map { it.content.text }).containsExactly("c1")
        assertThat(server.mailbox.map { it.second.senderUserId }).containsExactly(alice)
    }

    /** Audit de #19077, P1 — une `Error` levée en ouvrant UNE enveloppe la fait attendre seule ; le rattrapage des autres continue. */
    @Test
    fun anErrorWhileOpeningOneEnvelope_defersItAlone_andTheCatchUpOfEveryoneElseGoesOn() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        val c = E2eeTestDevice(server, carol).enroll()
        val backend = InMemoryRecordBackend()
        val b = E2eeTestDevice(server, bob, backend).enroll()
        send(a, bob, "a1")
        b.opener.catchUp()
        send(a, bob, "a2")
        send(c, bob, "c1", conversationWithCarol)
        val panicking = RecordId(RecordKind.SESSION, "$alice.${a.enrolled.device.deviceId}")
        val opener = openerOver(b, TransactionalRecordVault(OneRecordPanics(backend, panicking)))

        val outcomes = opener.catchUp()

        assertThat(outcomes.filterIsInstance<E2eeOpenOutcome.Opened>().map { it.content.text }).containsExactly("c1")
        assertThat(outcomes.filterIsInstance<E2eeOpenOutcome.Deferred>()).hasSize(1)
        assertThat(server.mailbox.map { it.second.senderUserId }).containsExactly(alice)
    }

    @Test
    fun anUnreadableStoredPlaintext_makesOnlyItsEnvelopeWait() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        val c = E2eeTestDevice(server, carol).enroll()
        val b = E2eeTestDevice(server, bob).enroll()
        send(a, bob, "a1")
        send(c, bob, "c1", conversationWithCarol)
        val first = server.mailbox.first { it.first.userId == bob && it.second.senderUserId == alice }.second
        b.vault.write { it.save(RecordKind.PLAINTEXT, first.messageId, "{not json".toByteArray()) }

        val outcomes = b.opener.catchUp()

        assertThat(outcomes.filterIsInstance<E2eeOpenOutcome.Opened>().map { it.content.text }).containsExactly("c1")
        assertThat(outcomes).contains(E2eeOpenOutcome.Deferred(first.id))
        assertThat(server.mailbox.map { it.second.id }).containsExactly(first.id)
    }

    @Test
    fun aSenderDeviceOutOfLibsignalBounds_isSetAside_unread_andNotAcknowledged() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        val b = E2eeTestDevice(server, bob).enroll()
        send(a, bob, "a1")
        val envelope = server.mailbox.single().second.copy(senderDeviceId = 200)

        val outcome = b.opener.receive(envelope)

        assertThat(outcome).isEqualTo(E2eeOpenOutcome.Malformed(envelope.id))
        assertThat(server.mailbox).hasSize(1)
    }

    @Test
    fun aMalformedSignalFromAnAuthenticatedPeer_isJudged_acknowledged_andNeverServedAgain() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        val b = E2eeTestDevice(server, bob).enroll()
        val malformed = """{"authorDeviceId":{"x":1},"authorUserId":"$alice","conversationId":"$conversation","kind":"typing","s":1,"sentAt":1}"""
        a.sealer.sealAndDeliverRaw(malformed.toByteArray(), bob) { a.session.send(conversation, bob, LibsignalSendRequest.of("cid_bad", it)) }

        val first = b.opener.catchUp().single()

        assertThat(first).isInstanceOf(E2eeOpenOutcome.Undecryptable::class.java)
        assertThat(server.mailbox).isEmpty()
        assertThat(b.opener.catchUp()).isEmpty()
    }
}
