package me.meeshy.core.e2ee.flow

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
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
}
