package me.meeshy.core.e2ee.flow

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.e2ee.content.E2eeEnvelopeOrigin
import me.meeshy.core.e2ee.open.E2eeOpenOutcome
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
import me.meeshy.core.e2ee.store.E2eePlaintextVault
import me.meeshy.core.e2ee.vault.InMemoryRecordBackend
import me.meeshy.core.e2ee.vault.TransactionalRecordVault
import me.meeshy.core.e2ee.wire.LibsignalSendRequest
import org.junit.Test

/**
 * #18980 (AND-04, jumelle Android de #18947) — un contenu d'une version que cet appareil ne lit pas encore n'est ni
 * affiché à moitié, ni perdu : son clair reste au coffre (scellé), l'enveloppe est acquittée, et une version plus récente
 * de l'app le relira (#9223 : un ancien client ne perd jamais un message en silence).
 */
class E2eeFutureVersionTest {
    private val alice = "64f0c0ffee0000000000aaaa"
    private val bob = "64f0c0ffee0000000000bbbb"
    private val conversation = "64f0c0ffee000000000c0001"

    @Test
    fun aFutureVersionContent_isKeptOnTheDevice_andTheEnvelopeLeavesTheServer() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        val b = E2eeTestDevice(server, bob).enroll()
        val v2 = """{"authorDeviceId":${a.enrolled.device.deviceId},"authorUserId":"$alice","clientMessageId":"cid_v2","conversationId":"$conversation","sentAt":1,"text":"porte une pièce v2","v":2}"""
        val messageId = a.sealer.sealAndDeliverRaw(v2.toByteArray(), bob) { a.session.send(conversation, bob, LibsignalSendRequest.of("cid_v2", it)) }

        b.opener.catchUp()

        assertThat(server.mailbox).isEmpty()
        assertThat(b.plaintexts.entry(messageId)).isNotNull()
        assertThat(b.plaintexts.entry(messageId)).isNotEqualTo(E2eePlaintextEntry.Undecryptable)
    }

    @Test
    fun theKeptJson_isExactlyTheUnpaddedContent_atThePlaceItsEnvelopeGaveIt() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        val b = E2eeTestDevice(server, bob).enroll()
        val v2 = """{"authorDeviceId":${a.enrolled.device.deviceId},"authorUserId":"$alice","conversationId":"$conversation","sentAt":1,"text":"x","v":2}"""
        val messageId = a.sealer.sealAndDeliverRaw(v2.toByteArray(), bob) { a.session.send(conversation, bob, LibsignalSendRequest.of("cid_v2", it)) }

        val outcome = b.opener.catchUp().single()

        assertThat(outcome).isEqualTo(E2eeOpenOutcome.FutureVersion(messageId, conversation))
        val kept = b.plaintexts.entry(messageId) as E2eePlaintextEntry.FutureVersion
        assertThat(kept.version).isEqualTo(2L)
        assertThat(kept.json).isEqualTo(v2)
        assertThat(kept.origin).isEqualTo(E2eeEnvelopeOrigin(conversation, alice, a.enrolled.device.deviceId))
    }

    /** Le jour où l'app sait lire la version du JSON gardé, le MÊME enregistrement s'ouvre, confronté à la place de son enveloppe. */
    @Test
    fun aKeptJsonThatThisVersionReads_opensFromTheVault_atItsPlace() {
        val vault = E2eePlaintextVault(TransactionalRecordVault(InMemoryRecordBackend()), owner = null)
        val readable = """{"authorDeviceId":3,"authorUserId":"$alice","conversationId":"$conversation","sentAt":1,"text":"relu","v":1}"""
        val foreign = """{"authorDeviceId":3,"authorUserId":"$alice","conversationId":"64f0c0ffee000000000c0999","sentAt":1,"text":"ailleurs","v":1}"""
        val origin = E2eeEnvelopeOrigin(conversation, alice, 3)
        vault.save(E2eePlaintextEntry.FutureVersion(2, readable, origin), listOf("m-now-readable"))
        vault.save(E2eePlaintextEntry.FutureVersion(2, foreign, origin), listOf("m-misplaced"))

        assertThat((vault.entry("m-now-readable") as E2eePlaintextEntry.Readable).content.text).isEqualTo("relu")
        assertThat(vault.entry("m-misplaced")).isEqualTo(E2eePlaintextEntry.Undecryptable)
    }
}
