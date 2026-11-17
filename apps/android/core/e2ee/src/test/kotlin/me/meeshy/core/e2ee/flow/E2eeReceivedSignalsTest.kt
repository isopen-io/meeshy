package me.meeshy.core.e2ee.flow

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.open.E2eeOpenOutcome
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
import me.meeshy.core.e2ee.vault.RecordKind
import me.meeshy.core.e2ee.wire.LibsignalSendRequest
import org.junit.Test

/**
 * #18981 (AND-03, minimum de #13202) — une suppression pour tous chiffrée, AUTHENTIFIÉE par libsignal comme venant de
 * l'auteur du message visé et rangée dans la même conversation, retire son clair du coffre ; et les signaux reçus partent
 * avec leur conversation (un signal `edit` porte du texte).
 */
class E2eeReceivedSignalsTest {
    private val alice = "64f0c0ffee0000000000aaaa"
    private val bob = "64f0c0ffee0000000000bbbb"
    private val conversation = "64f0c0ffee000000000c0001"

    private suspend fun pair(): Triple<FakeE2eeServer, E2eeTestDevice, E2eeTestDevice> {
        val server = FakeE2eeServer()
        return Triple(server, E2eeTestDevice(server, alice).enroll(), E2eeTestDevice(server, bob).enroll())
    }

    private suspend fun send(from: E2eeTestDevice, to: String, text: String): String {
        val content = E2eeContent.compose(text, null, null, conversation, "cid_$text", 1L)
        return from.sealer.sealAndDeliver(content, to) { from.session.send(conversation, to, LibsignalSendRequest.of("cid_$text", it)) }
    }

    private suspend fun signal(from: E2eeTestDevice, to: String, json: String, cid: String): String =
        from.sealer.sealAndDeliverRaw(json.toByteArray(), to) { from.session.send(conversation, to, LibsignalSendRequest.of(cid, it)) }

    private fun header(author: E2eeTestDevice): String =
        "\"authorDeviceId\":${author.enrolled.device.deviceId},\"authorUserId\":\"${author.userId}\",\"conversationId\":\"$conversation\""

    @Test
    fun aDeleteForEveryoneFromTheAuthor_erasesTheMessageOnTheDevice() = runTest {
        val (_, a, b) = pair()
        val target = send(a, bob, "à effacer")
        assertThat(b.opener.catchUp().single()).isInstanceOf(E2eeOpenOutcome.Opened::class.java)

        signal(a, bob, """{${header(a)},"kind":"delete-for-everyone","s":1,"sentAt":2,"target":"$target"}""", "cid_del")
        b.opener.catchUp()

        assertThat(b.plaintexts.entry(target)).isNotInstanceOf(E2eePlaintextEntry.Readable::class.java)
    }

    @Test
    fun aReceivedSignal_leavesTheVaultWithItsConversation() = runTest {
        val (_, a, b) = pair()
        signal(a, bob, """{${header(a)},"kind":"edit","s":1,"sentAt":1,"target":"m0","text":"texte modifié secret"}""", "cid_edit")
        assertThat(b.opener.catchUp().single()).isInstanceOf(E2eeOpenOutcome.Signal::class.java)

        b.plaintexts.removeConversation(conversation, Long.MAX_VALUE)

        assertThat(b.vault.read { it.keys(RecordKind.SIGNAL_RECEIVED) }).isEmpty()
    }
}
